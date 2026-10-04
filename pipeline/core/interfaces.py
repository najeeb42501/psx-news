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
    LLMCall,
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


class LLMUnavailableError(RuntimeError):
    """Every configured model is rate-limited or down; try again on a later run."""


@runtime_checkable
class LLMProvider(Protocol):
    last_model: str  # "provider:model" that answered the most recent call (stored with summaries)

    def complete_json(
        self, prompt: str, schema: type[BaseModel], purpose: str = "", document_id: int | None = None
    ) -> BaseModel: ...

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

    # --- processing ---

    def documents_to_process(self, limit: int) -> list[Document]: ...  # status 'new', oldest first

    def set_document_status(self, doc_id: int, status: str) -> None: ...

    def reset_for_reprocessing(self, categories: list[str]) -> int: ...  # docs of these item categories -> 'new'

    def get_company(self, symbol: str) -> Company | None: ...

    def confirm_face_value(self, symbol: str, face_value: float) -> None: ...

    def log_llm_call(self, call: LLMCall) -> None: ...

    # --- job runs (admin Jobs & health page) ---

    def start_job_run(self, job: str, params: dict, triggered_by: str) -> int: ...

    def finish_job_run(self, run_id: int, status: str, summary: dict, log: str) -> None: ...

    def running_job_run(self, stale_after_minutes: int = 90) -> int | None: ...  # id of a run still in progress


@runtime_checkable
class Publisher(Protocol):
    platform: str  # 'facebook' | 'x' | 'whatsapp_queue'

    def publish(self, post: Post) -> PublishResult: ...  # whatsapp_queue marks it ready


@runtime_checkable
class SearchIndex(Protocol):
    def search(self, query: str, symbol: str | None, limit: int) -> list[ItemRef]: ...
