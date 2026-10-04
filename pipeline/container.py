"""Composition root: picks one adapter per interface from settings.

Only this module may import concrete adapters. To add a source kind, write the
adapter and add one line to SOURCE_FACTORIES.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Any

import yaml

from pipeline.config.settings import Settings, load_settings
from pipeline.core.interfaces import DocumentParser, LLMProvider, Publisher, Repository, Source
from pipeline.core.models import SourceRecord
from pipeline.core.process import ProcessConfig

CONFIG_DIR = Path(__file__).resolve().parent / "config"
SOURCES_YAML = CONFIG_DIR / "sources.yaml"
PROMPTS_DIR = CONFIG_DIR / "prompts"
GLOSSARY = CONFIG_DIR / "glossary_ur.yaml"
# Bump a version by adding e.g. prompts/summarise_v2.md and changing it here; the
# version is stored with every summary.
PROMPT_VERSIONS = {"classify": "classify_v1", "extract": "extract_v3", "summarise": "summarise_v5"}


def load_source_configs(path: Path = SOURCES_YAML) -> list[dict[str, Any]]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))["sources"]


def _psx_announcements(c: Container, cfg: dict[str, Any]) -> Source:
    from pipeline.adapters.sources.psx import PsxAnnouncementsSource

    return PsxAnnouncementsSource(cfg["id"], c.psx_client, cfg.get("type", "C"))


def _rss(c: Container, cfg: dict[str, Any]) -> Source:
    from pipeline.adapters.sources.rss import RssSource

    return RssSource(cfg["id"], cfg["url"], c.http, cfg.get("keywords"))


SOURCE_FACTORIES: dict[str, Callable[[Container, dict[str, Any]], Source]] = {
    "psx_announcements": _psx_announcements,
    "rss": _rss,
}


@dataclass
class Container:
    settings: Settings
    source_configs: list[dict[str, Any]] = field(default_factory=load_source_configs)
    publishers: list[Publisher] = field(default_factory=list)

    @cached_property
    def repo(self) -> Repository:
        """Connects on first use, so jobs that never touch the DB never connect."""
        return build_repository(self.settings)

    @cached_property
    def http(self):
        from pipeline.adapters.http import PoliteClient

        return PoliteClient(self.settings.user_agent)

    @cached_property
    def psx_client(self):
        from pipeline.adapters.sources.psx import PsxClient

        return PsxClient(self.http)

    @cached_property
    def parser(self) -> DocumentParser:
        from pipeline.adapters.parsers.pdf_ocr import PdfOcrParser

        return PdfOcrParser()

    def _llm_from_chain(self, chain: str) -> LLMProvider:
        from pipeline.adapters.llm.openai_compat import FallbackLLM, OpenAICompatClient, parse_chain

        specs = parse_chain(chain, {"gemini": self.settings.gemini_api_key, "groq": self.settings.groq_api_key})
        if not specs:
            raise RuntimeError("No AI model configured: set GEMINI_API_KEY and/or GROQ_API_KEY (see .env.example)")
        return FallbackLLM([OpenAICompatClient(s) for s in specs], log=self.repo.log_llm_call)

    @cached_property
    def llm(self) -> LLMProvider:
        """Classification and EN/UR summaries."""
        return self._llm_from_chain(self.settings.llm_chain)

    @cached_property
    def extract_llm(self) -> LLMProvider:
        """Fact extraction (English; every number is verified by code)."""
        return self._llm_from_chain(self.settings.llm_extract_chain)

    def process_config(self, max_ai_docs: int = 25) -> ProcessConfig:
        return ProcessConfig(
            prompts={k: (PROMPTS_DIR / f"{v}.md").read_text(encoding="utf-8") for k, v in PROMPT_VERSIONS.items()},
            versions=dict(PROMPT_VERSIONS),
            glossary=yaml.safe_load(GLOSSARY.read_text(encoding="utf-8")),
            max_ai_docs=max_ai_docs,
        )

    def source_records(self) -> list[SourceRecord]:
        return [
            SourceRecord(id=c["id"], kind=c["kind"], url=c["url"], enabled=c.get("enabled", True))
            for c in self.source_configs
        ]

    def sources(self, only: str | None = None) -> list[Source]:
        out = []
        for cfg in self.source_configs:
            if not cfg.get("enabled", True) or (only and cfg["id"] != only):
                continue
            if cfg["kind"] not in SOURCE_FACTORIES:
                raise ValueError(f"No adapter for source kind {cfg['kind']!r} ({cfg['id']})")
            out.append(SOURCE_FACTORIES[cfg["kind"]](self, cfg))
        return out


def build_repository(settings: Settings) -> Repository:
    if settings.repo_adapter == "postgres":
        from pipeline.adapters.repo.postgres import PostgresRepository

        if not settings.database_url:
            raise RuntimeError("DATABASE_URL is not set (see .env.example)")
        return PostgresRepository.from_url(settings.database_url)
    raise ValueError(f"Unknown REPO_ADAPTER: {settings.repo_adapter!r}")


def build_container(settings: Settings | None = None) -> Container:
    return Container(settings=settings or load_settings())
