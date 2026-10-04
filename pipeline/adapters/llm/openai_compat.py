"""LLM adapter for any OpenAI-compatible chat API (Gemini, Groq, OpenRouter, local servers...).

FallbackLLM tries each configured model in order: on a rate limit or server error it
backs off once, then moves to the next model. Every call is logged with its tokens.
"""
from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx
from pydantic import BaseModel, ValidationError

from pipeline.core.interfaces import LLMUnavailableError
from pipeline.core.models import LLMCall

PROVIDER_URLS = {
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "groq": "https://api.groq.com/openai/v1",
}
RETRYABLE = {429, 500, 502, 503, 504}


class LLMOutputError(ValueError):
    """The model answered, but not with valid JSON for the schema."""


class ProviderBusyError(RuntimeError):
    """Rate limit, overload or network failure: worth trying another model."""


@dataclass
class ModelSpec:
    provider: str
    model: str
    api_key: str
    base_url: str
    reasoning_effort: str | None = None  # "none"/"low" saves tokens on thinking models

    @property
    def name(self) -> str:
        return f"{self.provider}:{self.model}"


def _json_from(text: str) -> dict:
    text = text.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S)
    if fenced:
        text = fenced.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


class OpenAICompatClient:
    def __init__(self, spec: ModelSpec, timeout: float = 60.0) -> None:
        self.spec = spec
        self._http = httpx.Client(timeout=timeout, headers={"Authorization": f"Bearer {spec.api_key}"})

    def chat(self, prompt: str, *, json_mode: bool, max_tokens: int | None = None) -> tuple[str, dict]:
        body: dict = {"model": self.spec.model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.1}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if max_tokens:
            body["max_tokens"] = max_tokens
        if self.spec.reasoning_effort:
            body["reasoning_effort"] = self.spec.reasoning_effort
        try:
            resp = self._http.post(f"{self.spec.base_url}/chat/completions", json=body)
        except httpx.TransportError as e:
            raise ProviderBusyError(f"{type(e).__name__}: {e}") from e
        if resp.status_code in RETRYABLE:
            retry_after = resp.headers.get("retry-after")
            err = ProviderBusyError(f"HTTP {resp.status_code}: {resp.text[:200]}")
            err.retry_after = float(retry_after) if retry_after and retry_after.replace(".", "").isdigit() else None  # type: ignore[attr-defined]
            raise err
        if resp.status_code == 400 and self.spec.reasoning_effort and "invalid argument" in resp.text.lower():
            # Some models (e.g. Gemini Lite) reject reasoning_effort; drop it for good and retry.
            self.spec.reasoning_effort = None
            return self.chat(prompt, json_mode=json_mode, max_tokens=max_tokens)
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code} from {self.spec.name}: {resp.text[:300]}")
        data = resp.json()
        content = data["choices"][0]["message"].get("content") or ""
        return content, data.get("usage") or {}


class FallbackLLM:
    """Implements core LLMProvider over an ordered list of models."""

    def __init__(
        self,
        clients: list[OpenAICompatClient],
        log: Callable[[LLMCall], None] | None = None,
        max_wait: float = 65.0,  # Groq's per-minute token limit resets within a minute
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not clients:
            raise ValueError("no LLM models configured")
        self.clients = clients
        self.log = log or (lambda call: None)
        self.max_wait = max_wait
        self.sleep = sleep
        self.last_model = ""
        self._exhausted: set[str] = set()  # models that hit their daily quota during this run

    def _record(self, client: OpenAICompatClient, purpose: str, document_id: int | None,
                usage: dict, ok: bool, error: str | None = None) -> None:
        self.log(LLMCall(provider=client.spec.provider, model=client.spec.model, purpose=purpose,
                         document_id=document_id, prompt_tokens=usage.get("prompt_tokens"),
                         completion_tokens=usage.get("completion_tokens"), ok=ok, error=error))

    def _run(self, prompt: str, purpose: str, document_id: int | None, json_mode: bool,
             parse: Callable[[str], object], max_tokens: int | None = None):
        errors: list[str] = []
        for client in self.clients:
            if client.spec.name in self._exhausted:
                continue
            for attempt in range(3):  # short back-offs on a busy model, then the next model
                try:
                    content, usage = client.chat(prompt, json_mode=json_mode, max_tokens=max_tokens)
                except ProviderBusyError as e:
                    self._record(client, purpose, document_id, {}, False, str(e)[:300])
                    errors.append(f"{client.spec.name}: {e}")
                    if "quota" in str(e).lower() or "per day" in str(e).lower():
                        self._exhausted.add(client.spec.name)  # daily limit: skip it for the rest of the run
                        break
                    if "HTTP 503" in str(e) or "HTTP 500" in str(e):
                        break  # overloaded: waiting rarely helps, try the next model now
                    wait = getattr(e, "retry_after", None) or 5.0
                    if attempt < 2 and wait <= self.max_wait:
                        self.sleep(wait)
                        continue
                    break
                except RuntimeError as e:  # e.g. model retired or bad request: skip this model
                    self._record(client, purpose, document_id, {}, False, str(e)[:300])
                    errors.append(f"{client.spec.name}: {e}")
                    break
                try:
                    result = parse(content)
                except (LLMOutputError, ValidationError, json.JSONDecodeError) as e:
                    self._record(client, purpose, document_id, usage, False, f"bad output: {str(e)[:250]}")
                    errors.append(f"{client.spec.name}: bad output")
                    continue  # ask the same model once more, then move on
                self._record(client, purpose, document_id, usage, True)
                self.last_model = client.spec.name
                return result
        raise LLMUnavailableError("; ".join(errors[-4:]) or "no model answered")

    def complete_json(self, prompt: str, schema: type[BaseModel], purpose: str = "",
                      document_id: int | None = None) -> BaseModel:
        def parse(content: str) -> BaseModel:
            try:
                return schema.model_validate(_json_from(content))
            except (json.JSONDecodeError, ValidationError) as e:
                raise LLMOutputError(str(e)) from e

        return self._run(prompt, purpose, document_id, True, parse)

    def complete_text(self, prompt: str, max_tokens: int) -> str:
        return self._run(prompt, "text", None, False, lambda c: c, max_tokens=max_tokens)


def parse_chain(chain: str, keys: dict[str, str | None]) -> list[ModelSpec]:
    """'gemini:gemini-3.6-flash, groq:openai/gpt-oss-120b' -> specs (skips providers without a key)."""
    specs = []
    for entry in (e.strip() for e in chain.split(",") if e.strip()):
        provider, _, model = entry.partition(":")
        key = keys.get(provider)
        if not key or provider not in PROVIDER_URLS:
            continue
        effort = "none" if provider == "gemini" else "low"
        specs.append(ModelSpec(provider, model, key, PROVIDER_URLS[provider], effort))
    return specs
