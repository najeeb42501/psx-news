"""RSS news source. Keeps headline, link and the feed's own short description only."""
from __future__ import annotations

import calendar
import hashlib
import re
from datetime import UTC, datetime

import feedparser
from bs4 import BeautifulSoup

from pipeline.adapters.http import PoliteClient
from pipeline.core.models import RawItem

SUMMARY_MAX_CHARS = 600


def _clean(html: str) -> str:
    return " ".join(BeautifulSoup(html or "", "html.parser").get_text(" ").split())


def parse_feed(xml: bytes | str, source_id: str, keywords: list[str] | None = None) -> list[RawItem]:
    feed = feedparser.parse(xml)
    pattern = (
        re.compile(r"\b(" + "|".join(re.escape(k) for k in keywords) + r")\b", re.IGNORECASE)
        if keywords
        else None
    )
    items: list[RawItem] = []
    for e in feed.entries:
        link = e.get("link")
        title = _clean(e.get("title", ""))
        if not link or not title:
            continue
        summary = _clean(e.get("summary", ""))[:SUMMARY_MAX_CHARS] or None
        if pattern and not pattern.search(f"{title} {summary or ''}"):
            continue
        parsed = e.get("published_parsed") or e.get("updated_parsed")
        published = datetime.fromtimestamp(calendar.timegm(parsed), UTC) if parsed else None
        guid = e.get("id") or link
        items.append(
            RawItem(
                source_id=source_id,
                external_id=hashlib.sha1(guid.encode()).hexdigest(),
                url=link,
                title=title,
                published_at=published,
                summary=summary,
            )
        )
    return items


class RssSource:
    def __init__(self, id: str, url: str, http: PoliteClient, keywords: list[str] | None = None) -> None:
        self.id = id
        self.url = url
        self.http = http
        self.keywords = keywords

    def fetch_new(self, since: datetime, until: datetime | None = None) -> list[RawItem]:
        items = parse_feed(self.http.get(self.url).content, self.id, self.keywords)
        return [
            i for i in items
            if i.published_at is None or (i.published_at >= since and (until is None or i.published_at <= until))
        ]

    def fetch_content(self, raw: RawItem) -> RawItem:
        return raw  # news: headline + link + feed description only, never the article
