"""In-memory fakes of the core interfaces, for fast tests without a database."""
from __future__ import annotations

from datetime import UTC, datetime

from pipeline.core.models import Company, Document, Item, LLMCall, Post, SourceRecord, Summary


class InMemoryRepository:
    def __init__(self) -> None:
        self.companies: dict[str, Company] = {}
        self.sources: dict[str, SourceRecord] = {}
        self.documents: dict[int, Document] = {}
        self.items: dict[int, Item] = {}
        self.summaries: dict[int, Summary] = {}
        self.posts: dict[int, Post] = {}
        self.llm_calls: list[LLMCall] = []
        self.job_runs: dict[int, dict] = {}
        self._next_id = 0

    def _id(self) -> int:
        self._next_id += 1
        return self._next_id

    def upsert_company(self, company: Company) -> None:
        self.companies[company.symbol] = company

    def upsert_companies(self, companies: list[Company]) -> None:
        for c in companies:
            old = self.companies.get(c.symbol)
            self.companies[c.symbol] = c if not old else old.model_copy(update={
                "name": old.name if c.name == c.symbol else c.name,
                "sector": c.sector or old.sector,
            })

    def ensure_company(self, symbol: str, name: str) -> None:
        self.companies.setdefault(symbol, Company(symbol=symbol, name=name))

    def known_symbols(self) -> set[str]:
        return set(self.companies)

    def upsert_source(self, source: SourceRecord) -> None:
        old = self.sources.get(source.id)
        self.sources[source.id] = source if not old else old.model_copy(
            update={"kind": source.kind, "url": source.url, "enabled": source.enabled}
        )

    def get_source(self, source_id: str) -> SourceRecord | None:
        return self.sources.get(source_id)

    def record_source_run(self, source_id: str, error: str | None, captured_until: datetime | None = None) -> None:
        old = self.sources[source_id]
        self.sources[source_id] = old.model_copy(update={
            "last_run_at": datetime.now(UTC), "last_error": error,
            "last_success_at": captured_until or old.last_success_at,
        })

    def known_hashes(self, hashes: list[str]) -> set[str]:
        stored = {d.content_hash for d in self.documents.values()}
        return {h for h in hashes if h in stored}

    def save_document(self, doc: Document) -> int | None:
        if any(d.content_hash == doc.content_hash for d in self.documents.values()):
            return None
        new_id = self._id()
        self.documents[new_id] = doc.model_copy(
            update={"id": new_id, "first_seen_at": datetime.now(UTC)}
        )
        return new_id

    def save_item(self, item: Item) -> int:
        for existing in self.items.values():
            if existing.document_id == item.document_id:
                assert existing.id is not None
                self.items[existing.id] = item.model_copy(
                    update={"id": existing.id, "created_at": existing.created_at}
                )
                return existing.id
        new_id = self._id()
        self.items[new_id] = item.model_copy(update={"id": new_id, "created_at": datetime.now(UTC)})
        return new_id

    def save_summary(self, summary: Summary) -> int:
        key = (summary.item_id, summary.lang, summary.prompt_version)
        for existing in self.summaries.values():
            if (existing.item_id, existing.lang, existing.prompt_version) == key:
                assert existing.id is not None
                self.summaries[existing.id] = summary.model_copy(
                    update={"id": existing.id, "created_at": datetime.now(UTC)}
                )
                return existing.id
        new_id = self._id()
        self.summaries[new_id] = summary.model_copy(
            update={"id": new_id, "created_at": datetime.now(UTC)}
        )
        return new_id

    def queue_post(self, post: Post) -> int | None:
        key = (post.kind, post.item_id, post.platform, post.scheduled_for)
        if any((p.kind, p.item_id, p.platform, p.scheduled_for) == key for p in self.posts.values()):
            return None
        new_id = self._id()
        self.posts[new_id] = post.model_copy(update={"id": new_id})
        return new_id

    def get_document(self, doc_id: int) -> Document | None:
        return self.documents.get(doc_id)

    def get_item(self, item_id: int) -> Item | None:
        return self.items.get(item_id)

    def get_summaries(self, item_id: int) -> list[Summary]:
        return sorted(
            (s for s in self.summaries.values() if s.item_id == item_id), key=lambda s: s.lang
        )

    def get_post(self, post_id: int) -> Post | None:
        return self.posts.get(post_id)

    # --- processing ---

    def documents_to_process(self, limit: int) -> list[Document]:
        new = [d for d in self.documents.values() if d.status == "new"]
        return sorted(new, key=lambda d: d.id or 0)[:limit]

    def set_document_status(self, doc_id: int, status: str) -> None:
        self.documents[doc_id] = self.documents[doc_id].model_copy(update={"status": status})

    def reset_for_reprocessing(self, categories: list[str]) -> int:
        ids = {i.document_id for i in self.items.values() if i.category in categories}
        for doc_id in ids:
            self.set_document_status(doc_id, "new")
        return len(ids)

    def recent_news_items(self, since: datetime) -> list[tuple[int, str, str, str]]:
        out = []
        for item_id, item in sorted(self.items.items()):
            doc = self.documents[item.document_id]
            when = doc.published_at or doc.first_seen_at or datetime.now(UTC)
            if (doc.source_id not in ("psx_companies", "psx_notices", "secp_notices")
                    and item.review_status in ("auto", "approved") and when >= since):
                out.append((item_id, doc.source_id, doc.title, doc.url))
        return out

    def add_also_reported(self, item_id: int, entry: dict) -> None:
        item = self.items[item_id]
        facts = dict(item.facts)
        facts["also_reported"] = [*facts.get("also_reported", []), entry]
        self.items[item_id] = item.model_copy(update={"facts": facts})

    def get_company(self, symbol: str) -> Company | None:
        return self.companies.get(symbol)

    def confirm_face_value(self, symbol: str, face_value: float) -> None:
        self.companies[symbol] = self.companies[symbol].model_copy(
            update={"face_value": face_value, "face_value_confirmed": True}
        )

    def log_llm_call(self, call: LLMCall) -> None:
        self.llm_calls.append(call)

    def start_job_run(self, job: str, params: dict, triggered_by: str) -> int:
        run_id = self._id()
        self.job_runs[run_id] = {"job": job, "params": params, "triggered_by": triggered_by, "status": "running"}
        return run_id

    def finish_job_run(self, run_id: int, status: str, summary: dict, log: str) -> None:
        self.job_runs[run_id].update(status=status, summary=summary, log=log)

    def running_job_run(self, stale_after_minutes: int = 90) -> int | None:
        running = [i for i, r in self.job_runs.items() if r["status"] == "running"]
        return running[-1] if running else None
