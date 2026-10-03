"""Repository contract tests, run against the in-memory fake and real Postgres."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from pipeline.core.interfaces import Repository
from pipeline.core.models import Company, Document, Item, Post, SourceRecord, Summary
from pipeline.tests.fakes import InMemoryRepository


@pytest.fixture(params=["memory", "postgres"])
def repo(request) -> Repository:
    if request.param == "memory":
        return InMemoryRepository()
    from pipeline.adapters.repo.postgres import PostgresRepository

    return PostgresRepository(request.getfixturevalue("pg_tx"))


def _seed(repo: Repository) -> int:
    repo.upsert_company(Company(symbol="TESTCO", name="Test Company Ltd", sector="Test"))
    repo.upsert_source(SourceRecord(id="test_source", kind="test", url="https://example.com"))
    doc_id = repo.save_document(_doc())
    assert doc_id is not None
    return doc_id


def _doc(content_hash: str | None = None) -> Document:
    return Document(
        source_id="test_source",
        url="https://dps.psx.com.pk/download/document/000000.pdf",
        content_hash=content_hash or f"test-{uuid.uuid4()}",
        title="Financial Results for the Quarter Ended September 30, 2026",
        symbol="TESTCO",
        published_at=datetime(2026, 10, 3, 10, 30, tzinfo=UTC),
        text="Profit after tax Rs 1,234 million. EPS Rs 5.67.",
    )


def test_implements_interface(repo: Repository) -> None:
    assert isinstance(repo, Repository)


def test_document_roundtrip_and_no_duplicate(repo: Repository) -> None:
    _seed(repo)
    doc = _doc("same-hash-" + uuid.uuid4().hex)
    first = repo.save_document(doc)
    assert first is not None
    assert repo.save_document(doc) is None  # same content_hash -> not stored again
    assert repo.save_document(doc.model_copy(update={"title": "changed"})) is None

    stored = repo.get_document(first)
    assert stored is not None
    assert stored.title == doc.title
    assert stored.symbol == "TESTCO"
    assert stored.status == "new"
    assert stored.published_at == doc.published_at
    assert stored.first_seen_at is not None


def test_item_upsert_by_document(repo: Repository) -> None:
    doc_id = _seed(repo)
    facts = {"eps": 5.67, "source_quotes": {"eps": "EPS Rs 5.67"}}
    item_id = repo.save_item(
        Item(document_id=doc_id, symbol="TESTCO", category="results", importance=3, facts=facts)
    )
    again = repo.save_item(
        Item(document_id=doc_id, symbol="TESTCO", category="results", importance=3,
             facts=facts, review_status="needs_review", confidence=0.5)
    )
    assert again == item_id  # re-processing updates, never duplicates

    item = repo.get_item(item_id)
    assert item is not None
    assert item.facts == facts
    assert item.review_status == "needs_review"
    assert item.confidence == 0.5


def test_summary_both_languages(repo: Repository) -> None:
    doc_id = _seed(repo)
    item_id = repo.save_item(Item(document_id=doc_id, symbol="TESTCO", category="results"))
    common = {"item_id": item_id, "model": "test-model", "prompt_version": "v1"}
    repo.save_summary(Summary(lang="en", headline="TESTCO profit Rs 1,234m", body="EPS Rs 5.67.", **common))
    ur_id = repo.save_summary(Summary(lang="ur", headline="ٹیسٹ کمپنی کا منافع", body="فی حصہ آمدن 5.67 روپے۔", **common))
    # Same (item, lang, prompt_version) replaces instead of duplicating.
    assert repo.save_summary(Summary(lang="ur", headline="نیا عنوان", body="فی حصہ آمدن 5.67 روپے۔", **common)) == ur_id

    summaries = repo.get_summaries(item_id)
    assert [s.lang for s in summaries] == ["en", "ur"]
    assert summaries[1].headline == "نیا عنوان"
    assert all(s.model == "test-model" and s.prompt_version == "v1" for s in summaries)


def test_post_queue_no_duplicates(repo: Repository) -> None:
    doc_id = _seed(repo)
    item_id = repo.save_item(Item(document_id=doc_id, symbol="TESTCO", category="results", importance=3))
    alert = Post(kind="alert", item_id=item_id, platform="facebook", text_en="en", text_ur="ur",
                 link_url="https://dps.psx.com.pk/download/document/000000.pdf")
    post_id = repo.queue_post(alert)
    assert post_id is not None
    assert repo.queue_post(alert) is None
    assert repo.queue_post(alert.model_copy(update={"platform": "whatsapp_queue"})) is not None

    stored = repo.get_post(post_id)
    assert stored is not None
    assert stored.status == "queued"
    assert stored.link_url == alert.link_url

    # Briefs have no item; a second brief for the same slot is still a duplicate.
    slot = datetime(2026, 10, 5, 4, 0, tzinfo=UTC)
    brief = Post(kind="morning_brief", platform="facebook", text_en="en", text_ur="ur", scheduled_for=slot)
    assert repo.queue_post(brief) is not None
    assert repo.queue_post(brief) is None


def test_ingest_helpers(repo: Repository) -> None:
    _seed(repo)
    repo.upsert_companies([Company(symbol="TESTCO", name="Renamed Ltd", sector="New"),
                           Company(symbol="TESTC2", name="Second Ltd")])
    repo.ensure_company("TESTC2", "should not overwrite")
    repo.ensure_company("TESTC3", "Auto Added")
    assert {"TESTCO", "TESTC2", "TESTC3"} <= repo.known_symbols()

    doc = _doc()
    repo.save_document(doc)
    assert repo.known_hashes([doc.content_hash, "missing-hash"]) == {doc.content_hash}
    assert repo.known_hashes([]) == set()

    repo.record_source_run("test_source", "boom")
    src = repo.get_source("test_source")
    assert src is not None and src.last_error == "boom" and src.last_run_at is not None
    repo.record_source_run("test_source", None)
    assert repo.get_source("test_source").last_error is None
    assert repo.get_source("nope") is None


def test_reseeding_keeps_real_names(repo: Repository) -> None:
    repo.ensure_company("TESTR1", "Test Rights Issue Ltd")  # added from an announcement row
    repo.upsert_companies([Company(symbol="TESTR1", name="TESTR1", sector="CHEMICAL")])  # blank name in PSX list
    if isinstance(repo, InMemoryRepository):
        assert repo.companies["TESTR1"].name == "Test Rights Issue Ltd"
    else:
        assert repo.conn.execute("select name from companies where symbol = 'TESTR1'").fetchone()["name"] == "Test Rights Issue Ltd"
    repo.upsert_companies([Company(symbol="TESTR1", name="Proper Name Ltd")])
    if isinstance(repo, InMemoryRepository):
        name, sector = repo.companies["TESTR1"].name, repo.companies["TESTR1"].sector
    else:
        row = repo.conn.execute("select name, sector from companies where symbol = 'TESTR1'").fetchone()
        name, sector = row["name"], row["sector"]
    assert (name, sector) == ("Proper Name Ltd", "CHEMICAL")
