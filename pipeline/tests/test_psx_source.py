"""PSX portal parsing, tested on real responses saved on 2026-10-03."""
from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

import pytest

from pipeline.adapters.sources.psx import (
    PKT,
    PsxAnnouncementsSource,
    PsxBlockedError,
    extract_token,
    parse_symbols,
    parse_table,
    parse_total,
)

FIX = Path(__file__).parent / "fixtures"
COMPANIES = (FIX / "psx_companies_2026-10-02.html").read_text(encoding="utf-8")
NOTICES = (FIX / "psx_notices.html").read_text(encoding="utf-8")


def test_extract_token() -> None:
    assert extract_token((FIX / "psx_page_token.html").read_text(encoding="utf-8")) == "TESTTOKEN123"
    with pytest.raises(PsxBlockedError):
        extract_token("<html>no token here</html>")


def test_company_announcements_table() -> None:
    items = parse_table(COMPANIES, "psx_companies", "C")
    assert len(items) == 100
    assert parse_total(COMPANIES) == 125
    assert len({i.external_id for i in items}) == 100

    by_id = {i.external_id: i for i in items}
    dsl = by_id["C:284353"]
    assert dsl.symbol == "DSL"
    assert dsl.company_name == "Dost Steels Limited"
    assert dsl.title == "Financial Results for the Year Ended 30-06-2026"
    assert dsl.published_at == datetime(2026, 10, 2, 16, 10, tzinfo=PKT)
    assert dsl.url == "https://dps.psx.com.pk/download/document/284353.pdf"
    assert dsl.attachments == [
        "https://dps.psx.com.pk/download/document/284353.pdf",
        "https://dps.psx.com.pk/download/image/284353-1.gif",
    ]
    assert not dsl.symbol_guessed


def test_image_only_announcement() -> None:
    sel = {i.external_id: i for i in parse_table(COMPANIES, "psx_companies", "C")}["C:284362"]
    assert sel.title == "Board Meeting In Progress"
    assert sel.url == "https://dps.psx.com.pk/download/image/284362-1.gif"
    assert sel.attachments == [sel.url]


def test_html_entities_decoded() -> None:
    names = {i.company_name for i in parse_table(COMPANIES, "psx_companies", "C")}
    assert "The National Silk & Rayon Mills Limited" in names


def test_notices_table_guesses_symbol_from_title() -> None:
    items = parse_table(NOTICES, "psx_notices", "E")
    assert len(items) == 50
    quice = {i.external_id: i for i in items}["E:284375"]
    assert quice.symbol == "QUICE" and quice.symbol_guessed
    assert quice.company_name is None
    assert quice.url == "https://dps.psx.com.pk/download/attachment/284375-1.pdf"
    assert quice.published_at == datetime(2026, 10, 2, 18, 11, tzinfo=PKT)


def test_parse_symbols() -> None:
    companies = parse_symbols([
        {"symbol": "DGKC", "name": "D.G. Khan Cement Company Limited", "sectorName": "CEMENT",
         "isETF": False, "isDebt": False, "isGEM": False},
        {"symbol": "EPCLR1", "name": "", "sectorName": "CHEMICAL", "isETF": False, "isDebt": False, "isGEM": False},
        {"symbol": "GAILR1", "name": "", "sectorName": "", "isETF": False, "isDebt": False, "isGEM": False},
        {"symbol": "", "name": "blank"},
    ])
    assert [(c.symbol, c.name, c.sector) for c in companies] == [
        ("DGKC", "D.G. Khan Cement Company Limited", "CEMENT"),
        ("EPCLR1", "EPCLR1", "CHEMICAL"),
        ("GAILR1", "GAILR1", None),
    ]


class _FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.last_total = 0

    def announcements(self, type_code, date_from, date_to, source_id):
        self.calls.append((type_code, date_from, date_to))
        self.last_total = parse_total(COMPANIES)
        return parse_table(COMPANIES, source_id, type_code)

    def download(self, url):
        return b"%PDF-fake", "application/pdf"


def test_source_filters_by_time_window() -> None:
    client = _FakeClient()
    src = PsxAnnouncementsSource("psx_companies", client, "C")  # type: ignore[arg-type]
    items = src.fetch_new(datetime(2026, 10, 2, 16, 0, tzinfo=PKT), datetime(2026, 10, 2, 16, 20, tzinfo=PKT))
    assert client.calls == [("C", date(2026, 10, 2), date(2026, 10, 2))]
    assert items and all(
        datetime(2026, 10, 2, 16, 0, tzinfo=PKT) <= i.published_at <= datetime(2026, 10, 2, 16, 20, tzinfo=PKT)
        for i in items
    )
    assert src.last_listed == {"date_from": "2026-10-02", "date_to": "2026-10-02", "listed": 125, "read": 100}  # fixture holds page 1
    fetched = src.fetch_content(items[0])
    assert fetched.content == b"%PDF-fake" and fetched.content_type == "application/pdf"


class _FakeHttp:
    """Token page + one announcements response."""

    def __init__(self, table_html: str) -> None:
        self.table_html = table_html

    def get(self, url, **kw):
        return type("R", (), {"text": 'window.__ps = {"_k":"tok"}'})()

    def post(self, url, **kw):
        return type("R", (), {"text": self.table_html})()


def test_layout_change_fails_loudly() -> None:
    """The portal lists rows (data-total) but none can be read: raise, never report 'nothing new'."""
    from pipeline.adapters.sources.psx import PsxClient, PsxLayoutError
    changed = COMPANIES.replace("<td", "<div").replace("</td>", "</div>")  # a redesign we can't read
    client = PsxClient(_FakeHttp(changed))  # type: ignore[arg-type]
    with pytest.raises(PsxLayoutError, match="lists 125 announcements but none could be read"):
        client.announcements("C", date(2026, 10, 2), date(2026, 10, 2), "psx_companies")
    ok = PsxClient(_FakeHttp(COMPANIES))  # type: ignore[arg-type]
    assert len(ok.announcements("C", date(2026, 10, 2), date(2026, 10, 2), "psx_companies")) == 200  # 2 pages (fake repeats page 1)
