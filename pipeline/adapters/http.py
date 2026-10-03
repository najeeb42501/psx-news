"""Polite HTTP client shared by all source adapters.

Identifies us in the User-Agent, spaces requests out, and backs off on errors.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}


class PoliteClient:
    def __init__(
        self,
        user_agent: str,
        min_interval: float = 1.0,
        retries: int = 3,
        backoff: float = 2.0,
        timeout: float = 30.0,
    ) -> None:
        self._client = httpx.Client(
            headers={"User-Agent": user_agent}, timeout=timeout, follow_redirects=True
        )
        self.min_interval = min_interval
        self.retries = retries
        self.backoff = backoff
        self._last = 0.0

    def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        for attempt in range(self.retries + 1):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                resp = self._client.request(method, url, **kwargs)
            except httpx.TransportError:
                if attempt == self.retries:
                    raise
            else:
                if resp.status_code not in RETRY_STATUS or attempt == self.retries:
                    resp.raise_for_status()
                    return resp
            time.sleep(self.backoff * 2**attempt)
        raise AssertionError("unreachable")

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("POST", url, **kwargs)

    def close(self) -> None:
        self._client.close()
