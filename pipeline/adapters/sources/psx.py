"""PSX data portal sources (dps.psx.com.pk).

Real request flow, as the portal's own page does it (inspected 2026-10-03):
  1. GET /announcements/<page>  -> HTML embedding window.__ps = {"_k": "<token>", ...}
  2. POST /announcements with header X-Req-Id: <token> and form fields
     type (C companies | E PSX notices | B SECP notices), symbol, query,
     count (max 100), offset, date_from, date_to (YYYY-MM-DD), page=annc
     -> HTML table rows: DATE | TIME | [SYMBOL | NAME |] TITLE | links
  3. Files: /download/document/<id>.pdf (companies), /download/attachment/<id>-1.pdf
     (notices), /download/image/<id>-1.gif (image of the notice; sometimes the only file).
  4. GET /symbols (same X-Req-Id header) -> JSON list of {symbol, name, sectorName, isETF, isDebt, isGEM}.
Dates and times on the portal are Pakistan time.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from pipeline.adapters.http import PoliteClient
from pipeline.core.models import Company, RawItem

BASE = "https://dps.psx.com.pk"
PKT = ZoneInfo("Asia/Karachi")
PAGE_SIZE = 100  # the portal returns at most 100 rows per request
MAX_PAGES = 10

TYPE_PAGES = {"C": "companies", "E": "psx", "B": "secp"}

_TOKEN_RE = re.compile(r'"_k"\s*:\s*"([^"]+)"')
_TOTAL_RE = re.compile(r'data-total="(\d+)"')
_ID_RE = re.compile(r"/(\d+)(?:-\d+)?\.(?:pdf|gif)$")
_TITLE_SYMBOL_RE = re.compile(r"\(([A-Z][A-Z0-9-]{1,14})\)\s*$")


class PsxBlockedError(RuntimeError):
    """The portal refused us, most likely because its request-token scheme changed."""


def extract_token(page_html: str) -> str:
    m = _TOKEN_RE.search(page_html)
    if not m:
        raise PsxBlockedError("request token (window.__ps._k) not found on the PSX page")
    return m.group(1)


def parse_datetime(day: str, clock: str) -> datetime:
    """'Oct 2, 2026' + '4:25 PM' (Pakistan time) -> aware datetime."""
    return datetime.strptime(f"{day.strip()} {clock.strip()}", "%b %d, %Y %I:%M %p").replace(tzinfo=PKT)


def parse_total(table_html: str) -> int:
    m = _TOTAL_RE.search(table_html)
    return int(m.group(1)) if m else 0


def parse_table(table_html: str, source_id: str, type_code: str) -> list[RawItem]:
    """Parse one page of the /announcements HTML table into RawItems."""
    soup = BeautifulSoup(table_html, "html.parser")
    items: list[RawItem] = []
    for tr in soup.select("tbody tr"):
        tds = tr.find_all("td")
        has_symbol = len(tds) == 6
        if len(tds) not in (4, 6):
            continue
        title = " ".join(tds[-2].get_text(" ", strip=True).split())
        links = tds[-1]
        pdfs = [a["href"] for a in links.find_all("a", href=True) if a["href"].endswith(".pdf")]
        images = [f"/download/image/{a['data-images']}" for a in links.find_all("a", attrs={"data-images": True})]
        files = [BASE + p for p in pdfs + images]
        if not files:
            continue  # nothing to link to; never seen on the portal, skip rather than guess
        m = _ID_RE.search(files[0])
        if not m:
            continue
        ext_id = f"{type_code}:{m.group(1)}"
        symbol = name = None
        guessed = False
        if has_symbol:
            symbol = tds[2].get_text(strip=True) or None
            name = " ".join(tds[3].get_text(" ", strip=True).split()) or None
        else:
            sm = _TITLE_SYMBOL_RE.search(title)
            if sm:
                symbol, guessed = sm.group(1), True
        items.append(
            RawItem(
                source_id=source_id,
                external_id=ext_id,
                url=files[0],
                title=title,
                symbol=symbol,
                symbol_guessed=guessed,
                company_name=name,
                published_at=parse_datetime(tds[0].get_text(), tds[1].get_text()),
                attachments=files,
            )
        )
    return items


def parse_symbols(payload: list[dict]) -> list[Company]:
    """Some entries (e.g. rights issues like EPCLR1) have a blank name; use the symbol."""
    return [
        Company(
            symbol=r["symbol"].strip(),
            name=(r.get("name") or "").strip() or r["symbol"].strip(),
            sector=(r.get("sectorName") or "").strip() or None,
        )
        for r in payload
        if (r.get("symbol") or "").strip()
    ]


class PsxClient:
    """Talks to the portal: gets a fresh request token, then asks for data."""

    def __init__(self, http: PoliteClient) -> None:
        self.http = http
        self.last_total = 0

    def _token(self, page: str) -> str:
        return extract_token(self.http.get(f"{BASE}/announcements/{page}").text)

    def _headers(self, token: str, page: str) -> dict[str, str]:
        return {
            "X-Req-Id": token,
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE}/announcements/{page}",
        }

    def announcements(self, type_code: str, date_from: date, date_to: date, source_id: str) -> list[RawItem]:
        page = TYPE_PAGES[type_code]
        token = self._token(page)
        out: list[RawItem] = []
        self.last_total = 0
        for n in range(MAX_PAGES):
            resp = self.http.post(
                f"{BASE}/announcements",
                headers=self._headers(token, page),
                data={
                    "type": type_code, "symbol": "", "query": "", "count": PAGE_SIZE,
                    "offset": n * PAGE_SIZE, "date_from": date_from.isoformat(),
                    "date_to": date_to.isoformat(), "page": "annc",
                },
            )
            html = resp.text
            if "<table" not in html:
                raise PsxBlockedError("PSX returned no announcements table")
            out.extend(parse_table(html, source_id, type_code))
            self.last_total = parse_total(html)  # how many the portal lists for these dates
            if (n + 1) * PAGE_SIZE >= self.last_total:
                break
        return out

    def symbols(self) -> list[Company]:
        token = self._token("companies")
        resp = self.http.get(f"{BASE}/symbols", headers=self._headers(token, "companies"))
        return parse_symbols(json.loads(resp.text))

    def download(self, url: str) -> tuple[bytes, str]:
        resp = self.http.get(url)
        return resp.content, resp.headers.get("content-type", "").split(";")[0].strip()


class PsxAnnouncementsSource:
    """Company announcements (type C) or PSX/SECP notices (type E/B)."""

    def __init__(self, id: str, client: PsxClient, type_code: str = "C") -> None:
        if type_code not in TYPE_PAGES:
            raise ValueError(f"unknown PSX announcement type {type_code!r}")
        self.id = id
        self.client = client
        self.type_code = type_code
        self.last_listed: dict | None = None  # portal's own count for the last date range fetched

    def fetch_new(self, since: datetime, until: datetime | None = None) -> list[RawItem]:
        until = until or datetime.now(PKT)
        start, end = since.astimezone(PKT), until.astimezone(PKT)
        items = self.client.announcements(self.type_code, start.date(), end.date(), self.id)
        self.last_listed = {"date_from": start.date().isoformat(), "date_to": end.date().isoformat(),
                            "listed": self.client.last_total}
        return [i for i in items if i.published_at is None or start <= i.published_at <= end]

    def fetch_content(self, raw: RawItem) -> RawItem:
        if not raw.attachments:
            return raw
        content, ctype = self.client.download(raw.attachments[0])
        return raw.model_copy(update={"content": content, "content_type": ctype})


# Kept for readability in config: notices are the same adapter with another type code.
def PsxNoticesSource(id: str, client: PsxClient, type_code: str = "E") -> PsxAnnouncementsSource:  # noqa: N802
    return PsxAnnouncementsSource(id, client, type_code)


__all__ = ["PsxAnnouncementsSource", "PsxNoticesSource", "PsxClient", "PsxBlockedError"]
