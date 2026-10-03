"""Interfaces the core depends on (Part 2.2).

The core never imports a vendor SDK; adapters implement these protocols and are
wired up in pipeline/container.py.
"""
from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel

from pipeline.core.models import (
    Company,
    Document,
    Item,
    ItemRef,
    ParsedDoc,
    Post,
    PublishResult,
    RawItem,
    SourceRecord,
    Summary,
)


@runtime_checkable
class Source(Protocol):
    id: str

    def fetch_new(self, since: datetime, until: datetime | None = None) -> list[RawItem]: ...

    def fetch_content(self, raw: RawItem) -> RawItem: ...  # download attachments[0], if any


@runtime_checkable
class DocumentParser(Protocol):
    def extract_text(self, raw: RawItem) -> ParsedDoc: ...


@runtime_checkable
class LLMProvider(Protocol):
    def complete_json(self, prompt: str, schema: type[BaseModel]) -> BaseModel: ...

    def complete_text(self, prompt: str, max_tokens: int) -> str: ...


@runtime_checkable
class Repository(Protocol):
    """Storage. Every write is idempotent: re-running a job never duplicates rows."""

    def upsert_company(self, company: Company) -> None: ...

    def upsert_companies(self, companies: list[Company]) -> None: ...

    def ensure_company(self, symbol: str, name: str) -> None: ...  # insert if missing, never overwrite

    def known_symbols(self) -> set[str]: ...

    def upsert_source(self, source: SourceRecord) -> None: ...

    def get_source(self, source_id: str) -> SourceRecord | None: ...

    def record_source_run(self, source_id: str, error: str | None) -> None: ...

    def known_hashes(self, hashes: list[str]) -> set[str]: ...  # which content_hashes are stored

    def save_document(self, doc: Document) -> int | None: ...  # None if already stored

    def save_item(self, item: Item) -> int: ...  # upsert on document_id

    def save_summary(self, summary: Summary) -> int: ...  # upsert on (item_id, lang, prompt_version)

    def queue_post(self, post: Post) -> int | None: ...  # None if duplicate

    def get_document(self, doc_id: int) -> Document | None: ...

    def get_item(self, item_id: int) -> Item | None: ...

    def get_summaries(self, item_id: int) -> list[Summary]: ...

    def get_post(self, post_id: int) -> Post | None: ...


@runtime_checkable
class Publisher(Protocol):
    platform: str  # 'facebook' | 'x' | 'whatsapp_queue'

    def publish(self, post: Post) -> PublishResult: ...  # whatsapp_queue marks it ready


@runtime_checkable
class SearchIndex(Protocol):
    def search(self, query: str, symbol: str | None, limit: int) -> list[ItemRef]: ...
