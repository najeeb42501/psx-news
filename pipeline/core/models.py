"""Domain models shared by the core and all adapters.

Fields mirror db/migrations/001_init.sql (Part 2.4). Source-specific fields are
filled in by adapters once the real PSX formats have been inspected (Phase 2).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Lang = Literal["en", "ur"]
Platform = Literal["facebook", "x", "whatsapp_queue"]
PostKind = Literal["alert", "morning_brief", "evening_digest"]
PostStatus = Literal["queued", "ready", "posted", "failed", "skipped"]
DocumentStatus = Literal["new", "processed", "failed", "skipped"]
ReviewStatus = Literal["auto", "needs_review", "approved", "hidden", "duplicate"]


class Company(BaseModel):
    symbol: str
    name: str
    sector: str | None = None
    face_value: float = 10
    aliases: list[str] = Field(default_factory=list)
    face_value_confirmed: bool = False  # True only once a filing has confirmed it


class SourceRecord(BaseModel):
    """A row in the sources table (configured in config/sources.yaml)."""

    id: str
    kind: str
    url: str
    enabled: bool = True
    last_run_at: datetime | None = None
    last_error: str | None = None
    # Everything this source published before this time has been captured (no failed downloads).
    # The next run starts here, so a failed run or a failed download is never skipped.
    last_success_at: datetime | None = None


class RawItem(BaseModel):
    """Something a Source found, before it is stored."""

    source_id: str
    external_id: str  # stable id at the source (PSX announcement id, RSS guid/link)
    url: str  # link users are sent to (the original filing or article)
    title: str
    symbol: str | None = None
    symbol_guessed: bool = False  # symbol read from the title, keep only if it is a known company
    company_name: str | None = None
    published_at: datetime | None = None
    attachments: list[str] = Field(default_factory=list)  # files to download, best first
    summary: str | None = None  # feed description (RSS); never the full article
    content: bytes | None = None  # downloaded attachment, if any
    content_type: str | None = None  # 'application/pdf', 'image/gif', ...
    extra: dict[str, Any] = Field(default_factory=dict)


class ParsedDoc(BaseModel):
    text: str
    used_ocr: bool = False


class Document(BaseModel):
    id: int | None = None
    source_id: str
    url: str
    content_hash: str
    title: str
    symbol: str | None = None
    published_at: datetime | None = None
    text: str | None = None
    used_ocr: bool = False
    status: DocumentStatus = "new"
    first_seen_at: datetime | None = None


class Item(BaseModel):
    id: int | None = None
    document_id: int
    symbol: str | None = None
    category: str
    importance: int = 1  # 3 = post-worthy
    facts: dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = None
    review_status: ReviewStatus = "auto"
    created_at: datetime | None = None


class Summary(BaseModel):
    id: int | None = None
    item_id: int
    lang: Lang
    headline: str
    body: str
    model: str
    prompt_version: str
    created_at: datetime | None = None


class Post(BaseModel):
    id: int | None = None
    kind: PostKind
    item_id: int | None = None  # None for briefs and digests
    platform: Platform
    text_en: str
    text_ur: str
    image_url: str | None = None
    link_url: str | None = None
    status: PostStatus = "queued"
    scheduled_for: datetime | None = None
    posted_at: datetime | None = None
    external_id: str | None = None
    error: str | None = None


class PublishResult(BaseModel):
    ok: bool
    external_id: str | None = None
    error: str | None = None


class LLMCall(BaseModel):
    provider: str
    model: str
    purpose: str
    document_id: int | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    ok: bool
    error: str | None = None


class ItemRef(BaseModel):
    item_id: int
    symbol: str | None = None
    headline: str
    created_at: datetime
