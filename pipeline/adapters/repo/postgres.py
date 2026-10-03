"""Postgres Repository adapter (works on Supabase, Neon or any Postgres 15+).

The connection runs in autocommit mode and every method opens its own
transaction block, so each save is committed on its own. If the caller already
has a transaction open, the blocks nest as savepoints (the tests use this to
roll everything back).
"""
from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from pipeline.core.models import Company, Document, Item, Post, SourceRecord, Summary


def connect(database_url: str) -> psycopg.Connection[dict[str, Any]]:
    return psycopg.connect(database_url, autocommit=True, row_factory=dict_row)


class PostgresRepository:
    def __init__(self, conn: psycopg.Connection[dict[str, Any]]) -> None:
        self.conn = conn

    @classmethod
    def from_url(cls, database_url: str) -> PostgresRepository:
        return cls(connect(database_url))

    def close(self) -> None:
        self.conn.close()

    # --- writes -------------------------------------------------------------

    def upsert_company(self, company: Company) -> None:
        with self.conn.transaction():
            self.conn.execute(
                """
                insert into companies (symbol, name, sector, face_value, aliases)
                values (%(symbol)s, %(name)s, %(sector)s, %(face_value)s, %(aliases)s)
                on conflict (symbol) do update set
                  name = excluded.name, sector = excluded.sector,
                  face_value = excluded.face_value, aliases = excluded.aliases,
                  updated_at = now()
                """,
                company.model_dump(),
            )

    def upsert_companies(self, companies: list[Company]) -> None:
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.executemany(
                """
                insert into companies (symbol, name, sector, face_value, aliases)
                values (%(symbol)s, %(name)s, %(sector)s, %(face_value)s, %(aliases)s)
                on conflict (symbol) do update set
                  -- a bare symbol as name is a placeholder; never replace a real name with it
                  name = case when excluded.name = excluded.symbol then companies.name else excluded.name end,
                  sector = coalesce(excluded.sector, companies.sector), updated_at = now()
                """,
                [c.model_dump() for c in companies],
            )

    def ensure_company(self, symbol: str, name: str) -> None:
        with self.conn.transaction():
            self.conn.execute(
                "insert into companies (symbol, name) values (%s, %s) on conflict (symbol) do nothing",
                (symbol, name),
            )

    def known_symbols(self) -> set[str]:
        return {r["symbol"] for r in self.conn.execute("select symbol from companies").fetchall()}

    def get_source(self, source_id: str) -> SourceRecord | None:
        row = self.conn.execute("select * from sources where id = %s", (source_id,)).fetchone()
        return SourceRecord(**row) if row else None

    def record_source_run(self, source_id: str, error: str | None) -> None:
        with self.conn.transaction():
            self.conn.execute(
                "update sources set last_run_at = now(), last_error = %s where id = %s",
                (error, source_id),
            )

    def known_hashes(self, hashes: list[str]) -> set[str]:
        if not hashes:
            return set()
        rows = self.conn.execute(
            "select content_hash from documents where content_hash = any(%s)", (hashes,)
        ).fetchall()
        return {r["content_hash"] for r in rows}

    def upsert_source(self, source: SourceRecord) -> None:
        with self.conn.transaction():
            self.conn.execute(
                """
                insert into sources (id, kind, url, enabled)
                values (%(id)s, %(kind)s, %(url)s, %(enabled)s)
                on conflict (id) do update set
                  kind = excluded.kind, url = excluded.url, enabled = excluded.enabled
                """,
                source.model_dump(include={"id", "kind", "url", "enabled"}),
            )

    def save_document(self, doc: Document) -> int | None:
        with self.conn.transaction():
            row = self.conn.execute(
                """
                insert into documents
                  (source_id, url, content_hash, title, symbol, published_at, text, used_ocr, status)
                values
                  (%(source_id)s, %(url)s, %(content_hash)s, %(title)s, %(symbol)s,
                   %(published_at)s, %(text)s, %(used_ocr)s, %(status)s)
                on conflict (content_hash) do nothing
                returning id
                """,
                doc.model_dump(exclude={"id", "first_seen_at"}),
            ).fetchone()
        return row["id"] if row else None

    def save_item(self, item: Item) -> int:
        params = item.model_dump(exclude={"id", "created_at"})
        params["facts"] = Jsonb(params["facts"])
        with self.conn.transaction():
            row = self.conn.execute(
                """
                insert into items (document_id, symbol, category, importance, facts, confidence, review_status)
                values (%(document_id)s, %(symbol)s, %(category)s, %(importance)s, %(facts)s,
                        %(confidence)s, %(review_status)s)
                on conflict (document_id) do update set
                  symbol = excluded.symbol, category = excluded.category,
                  importance = excluded.importance, facts = excluded.facts,
                  confidence = excluded.confidence, review_status = excluded.review_status
                returning id
                """,
                params,
            ).fetchone()
        assert row is not None
        return row["id"]

    def save_summary(self, summary: Summary) -> int:
        with self.conn.transaction():
            row = self.conn.execute(
                """
                insert into summaries (item_id, lang, headline, body, model, prompt_version)
                values (%(item_id)s, %(lang)s, %(headline)s, %(body)s, %(model)s, %(prompt_version)s)
                on conflict (item_id, lang, prompt_version) do update set
                  headline = excluded.headline, body = excluded.body,
                  model = excluded.model, created_at = now()
                returning id
                """,
                summary.model_dump(exclude={"id", "created_at"}),
            ).fetchone()
        assert row is not None
        return row["id"]

    def queue_post(self, post: Post) -> int | None:
        with self.conn.transaction():
            row = self.conn.execute(
                """
                insert into posts
                  (kind, item_id, platform, text_en, text_ur, image_url, link_url, status, scheduled_for)
                values
                  (%(kind)s, %(item_id)s, %(platform)s, %(text_en)s, %(text_ur)s, %(image_url)s,
                   %(link_url)s, %(status)s, %(scheduled_for)s)
                on conflict (kind, item_id, platform, scheduled_for) do nothing
                returning id
                """,
                post.model_dump(exclude={"id", "posted_at", "external_id", "error"}),
            ).fetchone()
        return row["id"] if row else None

    # --- reads --------------------------------------------------------------

    def get_document(self, doc_id: int) -> Document | None:
        row = self.conn.execute("select * from documents where id = %s", (doc_id,)).fetchone()
        return Document(**row) if row else None

    def get_item(self, item_id: int) -> Item | None:
        row = self.conn.execute(
            "select id, document_id, symbol, category, importance, facts, confidence,"
            " review_status, created_at from items where id = %s",
            (item_id,),
        ).fetchone()
        if not row:
            return None
        if row["confidence"] is not None:
            row["confidence"] = float(row["confidence"])
        return Item(**row)

    def get_summaries(self, item_id: int) -> list[Summary]:
        rows = self.conn.execute(
            "select * from summaries where item_id = %s order by lang, created_at", (item_id,)
        ).fetchall()
        return [Summary(**r) for r in rows]

    def get_post(self, post_id: int) -> Post | None:
        row = self.conn.execute("select * from posts where id = %s", (post_id,)).fetchone()
        return Post(**row) if row else None
