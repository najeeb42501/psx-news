"""RSS parsing, tested on real feeds saved on 2026-10-03."""
from __future__ import annotations

from pathlib import Path

from pipeline.adapters.sources.rss import SUMMARY_MAX_CHARS, parse_feed

FIX = Path(__file__).parent / "fixtures"


def test_tribune_feed_two_digit_year() -> None:
    items = parse_feed((FIX / "rss_tribune.xml").read_bytes(), "tribune_business")
    assert len(items) == 3
    for i in items:
        assert i.published_at is not None and i.published_at.year == 2026  # feed writes "02 Oct 26"
        assert i.url.startswith("https://tribune.com.pk/")
        assert i.title and "<" not in i.title
        assert i.summary is None or len(i.summary) <= SUMMARY_MAX_CHARS
    assert len({i.external_id for i in items}) == 3


def test_keyword_filter() -> None:
    xml = (FIX / "rss_brecorder.xml").read_bytes()
    everything = parse_feed(xml, "brecorder_latest")
    assert len(everything) == 8
    filtered = parse_feed(xml, "brecorder_latest", keywords=["IEA", "Oscar"])
    assert {i.title for i in filtered} == {
        "325 million barrels of oil from strategic reserves released: IEA",
        "‘Hanging by a Wire’ selected as Pakistan’s Oscar entry",
    }


def test_summary_is_short_plain_text() -> None:
    items = parse_feed((FIX / "rss_brecorder.xml").read_bytes(), "brecorder_latest")
    assert all(i.summary and len(i.summary) <= SUMMARY_MAX_CHARS and "<p>" not in i.summary for i in items)
    assert all(i.content is None for i in items)  # never the full article
