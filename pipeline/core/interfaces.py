"""Interfaces the core depends on (Part 2.2).

The core never imports a vendor SDK; adapters implement these protocols and are
wired up in pipeline/container.py.
"""
from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel

from pipeline.core.models import (
    Document,
    Item,
    ItemRef,
    ParsedDoc,
    Post,
    PublishResult,
    RawItem,
)


@runtime_checkable
class Source(Protocol):
    id: str

    def fetch_new(self, since: datetime) -> list[RawItem]: ...


@runtime_checkable
class DocumentParser(Protocol):
    def extract_text(self, raw: RawItem) -> ParsedDoc: ...


@runtime_checkable
class LLMProvider(Protocol):
    def complete_json(self, prompt: str, schema: type[BaseModel]) -> BaseModel: ...

    def complete_text(self, prompt: str, max_tokens: int) -> str: ...


@runtime_checkable
class Repository(Protocol):
    def save_document(self, doc: Document) -> int | None: ...  # None if already stored

    def save_item(self, item: Item) -> int: ...

    def queue_post(self, post: Post) -> int | None: ...  # None if duplicate


@runtime_checkable
class Publisher(Protocol):
    platform: str  # 'facebook' | 'x' | 'whatsapp_queue'

    def publish(self, post: Post) -> PublishResult: ...  # whatsapp_queue marks it ready


@runtime_checkable
class SearchIndex(Protocol):
    def search(self, query: str, symbol: str | None, limit: int) -> list[ItemRef]: ...
