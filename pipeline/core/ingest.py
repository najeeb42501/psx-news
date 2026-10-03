"""Ingest: fetch new items from a source, extract text, store documents.

Idempotent: every item is keyed by a hash of its stable source id, so re-running
never stores it twice, and items already stored are never downloaded again.
An item whose download or text extraction fails is not stored, so the next run
retries it.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime

from pipeline.core.interfaces import DocumentParser, Repository, Source
from pipeline.core.models import Document, ParsedDoc, RawItem


def content_hash(raw: RawItem) -> str:
    return hashlib.sha256(raw.external_id.encode()).hexdigest()


@dataclass
class IngestResult:
    source_id: str
    fetched: int = 0
    new: int = 0
    already_known: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def source_error(self) -> str | None:
        """Set when the source itself could not be read (not just one item)."""
        return self.errors[0] if self.fetched == 0 and self.errors else None


def _extract(source: Source, parser: DocumentParser, raw: RawItem) -> tuple[RawItem, ParsedDoc]:
    """Try each attachment in order (PDF first, then the image) until one gives text."""
    if not raw.attachments:
        return raw, parser.extract_text(source.fetch_content(raw))
    last_error: Exception | None = None
    fallback: tuple[RawItem, ParsedDoc] | None = None
    for i in range(len(raw.attachments)):
        candidate = raw.model_copy(update={"attachments": raw.attachments[i:]})
        try:
            parsed = parser.extract_text(source.fetch_content(candidate))
        except Exception as e:  # noqa: BLE001 - any adapter error means "try the next file"
            last_error = e
            continue
        if parsed.text.strip():
            return raw, parsed
        fallback = fallback or (raw, parsed)
    if fallback:
        return fallback
    assert last_error is not None
    raise last_error


def ingest_source(
    source: Source,
    repo: Repository,
    parser: DocumentParser,
    since: datetime,
    until: datetime | None = None,
) -> IngestResult:
    result = IngestResult(source_id=source.id)
    try:
        raws = source.fetch_new(since, until)
    except Exception as e:  # noqa: BLE001
        result.errors.append(f"{type(e).__name__}: {e}")
        repo.record_source_run(source.id, result.errors[0])
        return result

    by_hash: dict[str, RawItem] = {}
    for raw in raws:
        by_hash.setdefault(content_hash(raw), raw)
    result.fetched = len(by_hash)
    known = repo.known_hashes(list(by_hash))
    result.already_known = len(known)
    symbols = repo.known_symbols()

    for h, raw in by_hash.items():
        if h in known:
            continue
        symbol = raw.symbol
        if symbol and symbol not in symbols:
            if raw.symbol_guessed:
                symbol = None  # a bracketed word in a notice title that isn't a listed company
            else:
                repo.ensure_company(symbol, raw.company_name or symbol)
                symbols.add(symbol)
        try:
            _, parsed = _extract(source, parser, raw)
        except Exception as e:  # noqa: BLE001
            result.failed += 1
            result.errors.append(f"{raw.external_id}: {type(e).__name__}: {e}")
            continue
        saved = repo.save_document(
            Document(
                source_id=raw.source_id,
                url=raw.url,
                content_hash=h,
                title=raw.title,
                symbol=symbol,
                published_at=raw.published_at,
                text=parsed.text.replace("\x00", ""),  # Postgres text cannot hold NUL bytes
                used_ocr=parsed.used_ocr,
            )
        )
        if saved is not None:
            result.new += 1

    repo.record_source_run(source.id, "; ".join(result.errors[:3]) or None)
    return result
