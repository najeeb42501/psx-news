"""Read meeting and book-closure dates with rules, before asking the AI.

PSX notices use fixed wording ("will be held on Monday, October 26, 2026 at 03:00 p.m.",
"Share Transfer Books ... will remain closed from October 21, 2026 to October 27, 2026"),
so most dates can be read without any AI call. The quotes are exact text from the
document and go through the same verification as AI-extracted facts.
"""
from __future__ import annotations

import re
from datetime import date

from pipeline.core.facts import DateFact, Facts

RULES_VERSION = "rules_v1"

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
     "november", "december"])}
_MONTHS.update({m[:3]: i for m, i in list(_MONTHS.items())})
_MON = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_SUFFIX = r"(?:st|nd|rd|th|\"|”|™|'')?"

_DATE = re.compile(
    rf"(?P<m1>{_MON})\.?\s+(?P<d1>\d{{1,2}}){_SUFFIX}[,.]?\s+(?P<y1>20\d\d)"  # October 21, 2026 / October 28. 2026
    rf"|(?P<d2>\d{{1,2}}){_SUFFIX}\s+(?:of\s+)?(?P<m2>{_MON})\.?,?\s+(?P<y2>20\d\d)"  # 21st October, 2026
    r"|(?P<y3>20\d\d)-(?P<mo3>\d{1,2})-(?P<d3>\d{1,2})"  # 2026-10-21
    r"|(?P<d4>\d{1,2})[-./](?P<mo4>\d{1,2})[-./](?P<y4>20\d\d)",  # 21-10-2026, 21.10.2026
    re.IGNORECASE,
)
_TIME = re.compile(r"\b\d{1,2}[:.]\d{2}\s*(?:[ap]\.?\s?m\.?|hrs|hours)?|\b\d{1,2}\s*[ap]\.?\s?m\.?", re.IGNORECASE)
_HELD = re.compile(r"\b(?:will|shall|is|are)\s+(?:be\s+)?(?:scheduled\s+to\s+be\s+)?held\b|\bto\s+be\s+held\b"
                   r"|\bscheduled\s+(?:to\s+be\s+held\s+)?on\b", re.IGNORECASE)
_BOOKS = re.compile(r"(?:share\s+)?transfer\s+books?|register\s+of\s+members|book\s+closure", re.IGNORECASE)
_PERIOD = re.compile(r"\b(quarter|half[- ]year|six\s+months|nine\s+months|year)\s+ended\s+(?:on\s+)?", re.IGNORECASE)
_PERIOD_KIND = {"quarter": "quarter", "half-year": "half_year", "half year": "half_year",
                "six months": "half_year", "nine months": "nine_months", "year": "year"}


def _month(name: str) -> int:
    return _MONTHS[name.lower().rstrip(".")[:3]]


def find_dates(text: str) -> list[tuple[date, int, int]]:
    """(date, start, end) for every valid date written in text."""
    out = []
    for m in _DATE.finditer(text):
        g = m.groupdict()
        try:
            if g["m1"]:
                d = date(int(g["y1"]), _month(g["m1"]), int(g["d1"]))
            elif g["m2"]:
                d = date(int(g["y2"]), _month(g["m2"]), int(g["d2"]))
            elif g["y3"]:
                d = date(int(g["y3"]), int(g["mo3"]), int(g["d3"]))
            else:
                d = date(int(g["y4"]), int(g["mo4"]), int(g["d4"]))
        except (ValueError, KeyError):
            continue
        out.append((d, m.start(), m.end()))
    return out


def _first_date_after(text: str, pos: int, within: int) -> tuple[date, int, int] | None:
    for d, s, e in find_dates(text[pos : pos + within]):
        return d, pos + s, pos + e
    return None


def _meeting(text: str) -> tuple[DateFact | None, str | None]:
    for m in _HELD.finditer(text):
        hit = _first_date_after(text, m.start(), 160)
        if hit:
            d, _, end = hit
            quote = text[m.start() : end]
            t = _TIME.search(text[end : end + 60])
            return DateFact(value=d, quote=quote), (t.group(0).strip() if t else None)
    return None, None


# Between the two dates of a range: "to", "till", "-", optionally followed by a weekday.
_RANGE_GAP = re.compile(r"^\s*,?\s*(?:to|till|until|upto|up\s+to|-|–)\s*(?:[a-z]+day,?\s*)?$", re.IGNORECASE)


_ONE_DAY = re.compile(r"^\s*on\s*(?:[a-z]+day,?\s*)?$", re.IGNORECASE)


def _book_closure(text: str) -> tuple[DateFact | None, DateFact | None]:
    for m in _BOOKS.finditer(text):
        window = text[m.start() : m.start() + 260]
        closed = re.search(r"\bclosed\b", window, re.IGNORECASE)  # not "closure" or "close of business"
        if not closed or re.search(r"closed\s*period", window, re.IGNORECASE):
            continue
        dates = [(d, s, e) for d, s, e in find_dates(window) if s > closed.start()]
        if not dates:
            continue
        first, s1, e1 = dates[0]
        quote1 = window[:e1]
        if len(dates) > 1 and _RANGE_GAP.match(window[e1 : dates[1][1]]):
            second, _, e2 = dates[1]
            return DateFact(value=first, quote=quote1), DateFact(value=second, quote=window[:e2])
        if _ONE_DAY.match(window[closed.end() : s1]):  # "closed on October 09, 2026"
            return DateFact(value=first, quote=quote1), DateFact(value=first, quote=quote1)
        # Anything else (e.g. OCR-garbled "from-21°'-October to 28 October") is left to the AI.
    return None, None


def _period(text: str) -> tuple[str | None, DateFact | None]:
    for m in _PERIOD.finditer(text):
        hit = _first_date_after(text, m.end(), 40)
        if hit:
            d, _, end = hit
            kind = _PERIOD_KIND.get(re.sub(r"\s+", " ", m.group(1).lower()))
            return kind, DateFact(value=d, quote=text[m.start() : end])
    return None, None


MEETING_KIND = {"board_meeting": "board", "agm": "agm", "corporate_briefing": "briefing"}


def rule_dates(text: str, category: str, title: str = "") -> Facts:
    """Facts with whatever dates the fixed wording gives; empty Facts if none found."""
    kind = MEETING_KIND.get(category)
    if category == "agm" and re.search(r"extraordinary|\beogm\b", f"{title} {text[:400]}", re.IGNORECASE):
        kind = "eogm"
    meeting, time = _meeting(text) if kind else (None, None)
    bc_from, bc_to = _book_closure(text)
    period_kind, period_end = _period(text) if kind == "board" else (None, None)
    return Facts(
        meeting_kind=kind if meeting else None, meeting_date=meeting, meeting_time=time,
        book_closure_from=bc_from, book_closure_to=bc_to,
        period_kind=period_kind if period_end else None, period_end=period_end,
    )


def sufficient(facts: Facts, category: str) -> bool:
    """Enough for the dates summary: the meeting date, or both closure dates for a book closure."""
    if category == "book_closure":
        return bool(facts.book_closure_from and facts.book_closure_to)
    return facts.meeting_date is not None
