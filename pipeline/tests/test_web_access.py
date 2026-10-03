"""The public website role (Supabase 'anon') sees only what it should."""
from __future__ import annotations

import uuid

import psycopg
import pytest

from pipeline.adapters.repo.postgres import PostgresRepository
from pipeline.core.models import Company, Document, Item, Post, SourceRecord, Summary


@pytest.fixture
def seeded(pg_tx):
    if not pg_tx.execute("select 1 from pg_roles where rolname = 'anon'").fetchone():
        pytest.skip("no 'anon' role on this Postgres host (not Supabase)")
    repo = PostgresRepository(pg_tx)
    repo.upsert_company(Company(symbol="TESTCO", name="Test Company Ltd"))
    repo.upsert_source(SourceRecord(id="test_source", kind="test", url="https://example.com"))

    def make_item(review_status: str) -> int:
        doc_id = repo.save_document(Document(
            source_id="test_source", url="https://example.com/doc.pdf",
            content_hash=f"test-{uuid.uuid4()}", title="t", symbol="TESTCO", text="secret full text",
        ))
        assert doc_id is not None
        item_id = repo.save_item(Item(document_id=doc_id, symbol="TESTCO", category="dividend",
                                      review_status=review_status))
        for lang in ("en", "ur"):
            repo.save_summary(Summary(item_id=item_id, lang=lang, headline=f"h-{lang}-{review_status}",
                                      body="b", model="m", prompt_version="v1"))
        return item_id

    visible = make_item("auto")
    approved = make_item("approved")
    hidden = make_item("hidden")
    review = make_item("needs_review")
    repo.queue_post(Post(kind="alert", item_id=visible, platform="facebook", text_en="e", text_ur="u"))
    pg_tx.execute("set local role anon")
    return pg_tx, {"visible": visible, "approved": approved, "hidden": hidden, "review": review}


def _denied(conn, sql: str) -> bool:
    try:
        with conn.transaction():
            conn.execute(sql).fetchall()
    except psycopg.errors.InsufficientPrivilege:
        return True
    return False


def test_anon_sees_only_published_items(seeded) -> None:
    conn, ids = seeded
    rows = conn.execute("select id, headline_en, headline_ur, company_name, source_url from web_items"
                        " where symbol = 'TESTCO'").fetchall()
    seen = {r["id"] for r in rows}
    assert seen == {ids["visible"], ids["approved"]}
    row = next(r for r in rows if r["id"] == ids["visible"])
    assert row["headline_en"] == "h-en-auto"
    assert row["headline_ur"] == "h-ur-auto"
    assert row["company_name"] == "Test Company Ltd"
    assert row["source_url"] == "https://example.com/doc.pdf"


def test_anon_cannot_read_private_data(seeded) -> None:
    conn, _ = seeded
    assert _denied(conn, "select * from posts")
    assert _denied(conn, "select * from sources")
    assert _denied(conn, "select text from documents")
    assert _denied(conn, "select * from schema_migrations")


def test_anon_cannot_write(seeded) -> None:
    conn, ids = seeded
    assert _denied(conn, f"update items set review_status = 'auto' where id = {ids['hidden']}")
    assert _denied(conn, "insert into companies (symbol, name) values ('X', 'x')")
    assert _denied(conn, "delete from web_companies")
