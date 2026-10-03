"""Core ingest logic with fake adapters: idempotency, symbols, failures, fallbacks."""
from __future__ import annotations

from datetime import UTC, datetime

from pipeline.core.ingest import content_hash, ingest_source
from pipeline.core.models import Company, ParsedDoc, RawItem, SourceRecord
from pipeline.tests.fakes import InMemoryRepository

SINCE = datetime(2026, 10, 2, tzinfo=UTC)


def _raw(ext: str, **kw) -> RawItem:
    base = dict(source_id="src", external_id=ext, url=f"https://x/{ext}.pdf", title=f"title {ext}",
                attachments=[f"https://x/{ext}.pdf", f"https://x/{ext}.gif"])
    return RawItem(**(base | kw))


class FakeSource:
    id = "src"

    def __init__(self, items: list[RawItem], broken: set[str] | None = None, error: Exception | None = None):
        self.items = items
        self.broken = broken or set()  # attachment urls that fail to download
        self.error = error
        self.downloads: list[str] = []

    def fetch_new(self, since, until=None):
        if self.error:
            raise self.error
        return list(self.items)

    def fetch_content(self, raw: RawItem) -> RawItem:
        url = raw.attachments[0]
        self.downloads.append(url)
        if url in self.broken:
            raise ConnectionError(f"cannot download {url}")
        return raw.model_copy(update={"content": url.encode(), "content_type": "application/pdf"})


class FakeParser:
    def extract_text(self, raw: RawItem) -> ParsedDoc:
        return ParsedDoc(text=f"text of {raw.content.decode() if raw.content else raw.title}\x00")


def _repo() -> InMemoryRepository:
    repo = InMemoryRepository()
    repo.upsert_source(SourceRecord(id="src", kind="test", url="https://x"))
    repo.upsert_company(Company(symbol="DSL", name="Dost Steels Limited"))
    return repo


def test_three_runs_no_duplicates_and_no_redownloads() -> None:
    repo, parser = _repo(), FakeParser()
    source = FakeSource([_raw("C:1", symbol="DSL"), _raw("C:2", symbol="DSL"), _raw("C:2", symbol="DSL")])
    first = ingest_source(source, repo, parser, SINCE)
    assert (first.fetched, first.new, first.already_known) == (2, 2, 0)
    for _ in range(2):
        again = ingest_source(source, repo, parser, SINCE)
        assert (again.new, again.already_known) == (0, 2)
    assert len(repo.documents) == 2
    assert len(source.downloads) == 2  # known items are never downloaded again
    doc = next(iter(repo.documents.values()))
    assert "\x00" not in doc.text
    assert doc.content_hash == content_hash(_raw("C:1"))
    assert repo.sources["src"].last_run_at is not None and repo.sources["src"].last_error is None


def test_unknown_symbol_from_table_is_added() -> None:
    repo = _repo()
    ingest_source(FakeSource([_raw("C:9", symbol="MCBIM-FUNDS", company_name="MCBIM-FUNDS")]), repo, FakeParser(), SINCE)
    assert repo.companies["MCBIM-FUNDS"].name == "MCBIM-FUNDS"
    assert next(iter(repo.documents.values())).symbol == "MCBIM-FUNDS"


def test_guessed_symbol_kept_only_if_listed() -> None:
    repo = _repo()
    items = [_raw("E:1", symbol="DSL", symbol_guessed=True), _raw("E:2", symbol="SECP", symbol_guessed=True)]
    ingest_source(FakeSource(items), repo, FakeParser(), SINCE)
    symbols = {d.title: d.symbol for d in repo.documents.values()}
    assert symbols == {"title E:1": "DSL", "title E:2": None}
    assert "SECP" not in repo.companies


def test_pdf_failure_falls_back_to_image() -> None:
    repo = _repo()
    source = FakeSource([_raw("C:5")], broken={"https://x/C:5.pdf"})
    result = ingest_source(source, repo, FakeParser(), SINCE)
    assert result.new == 1 and result.failed == 0
    doc = next(iter(repo.documents.values()))
    assert doc.text.startswith("text of https://x/C:5.gif")
    assert doc.url == "https://x/C:5.pdf"  # users still get the original filing link


def test_failed_item_is_retried_next_run() -> None:
    repo = _repo()
    source = FakeSource([_raw("C:7")], broken={"https://x/C:7.pdf", "https://x/C:7.gif"})
    result = ingest_source(source, repo, FakeParser(), SINCE)
    assert (result.new, result.failed) == (0, 1)
    assert repo.sources["src"].last_error and "C:7" in repo.sources["src"].last_error
    source.broken.clear()
    result = ingest_source(source, repo, FakeParser(), SINCE)
    assert (result.new, result.failed) == (1, 0)
    assert repo.sources["src"].last_error is None


def test_source_error_is_recorded() -> None:
    repo = _repo()
    result = ingest_source(FakeSource([], error=RuntimeError("PSX down")), repo, FakeParser(), SINCE)
    assert result.source_error == "RuntimeError: PSX down"
    assert repo.sources["src"].last_error == "RuntimeError: PSX down"
