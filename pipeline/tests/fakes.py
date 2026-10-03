"""In-memory fakes of the core interfaces, for fast tests without a database."""
from __future__ import annotations

from datetime import UTC, datetime

from pipeline.core.models import Company, Document, Item, Post, SourceRecord, Summary


class InMemoryRepository:
    def __init__(self) -> None:
        self.companies: dict[str, Company] = {}
        self.sources: dict[str, SourceRecord] = {}
        self.documents: dict[int, Document] = {}
        self.items: dict[int, Item] = {}
        self.summaries: dict[int, Summary] = {}
        self.posts: dict[int, Post] = {}
        self._next_id = 0

    def _id(self) -> int:
        self._next_id += 1
        return self._next_id

    def upsert_company(self, company: Company) -> None:
        self.companies[company.symbol] = company

    def upsert_source(self, source: SourceRecord) -> None:
        self.sources[source.id] = source

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
