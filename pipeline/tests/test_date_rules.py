"""Rule-based dates, on wording copied from real PSX notices (2026-10-02)."""
from __future__ import annotations

from datetime import date

import pytest

from pipeline.core.date_rules import find_dates, rule_dates, sufficient
from pipeline.core.extract import verify


@pytest.mark.parametrize("text, expected", [
    ("October 21, 2026", date(2026, 10, 21)),
    ("October 28. 2026", date(2026, 10, 28)),
    ("23rd October, 2026", date(2026, 10, 23)),
    ('27" October 2026', date(2026, 10, 27)),
    ("20-10-2026", date(2026, 10, 20)),
    ("2026-10-09", date(2026, 10, 9)),
    ("Sept 30, 2026", date(2026, 9, 30)),
])
def test_date_formats(text: str, expected: date) -> None:
    assert [d for d, _, _ in find_dates(text)] == [expected]


def test_invalid_dates_ignored() -> None:
    assert find_dates("31-02-2026 and 2026-13-01") == []


AGM = ("Notice is hereby given that the 43rd Annual General Meeting )AGM( of CENTURY PAPER & BOARD MILLS LIMITED "
       "will be held on Monday, October 26, 2026 at 03:00 p.m. at Dr. Shamshad Akhtar Auditorium. "
       "The share transfer books of the Company will remain closed from Friday, October 16, 2026, to Monday,\n"
       "October 26, 2026 (both days inclusive).")


def _read(text: str, category: str, title: str = ""):
    out = verify(rule_dates(text, category, title), text)
    assert not out.problems, out.problems
    return out.facts


def test_agm_meeting_time_and_book_closure() -> None:
    f = _read(AGM, "agm")
    assert (f.meeting_kind, f.meeting_date.value, f.meeting_time) == ("agm", date(2026, 10, 26), "03:00 p.m.")
    assert (f.book_closure_from.value, f.book_closure_to.value) == (date(2026, 10, 16), date(2026, 10, 26))
    assert sufficient(f, "agm")


def test_board_meeting_with_period_ignores_closed_period() -> None:
    text = ("a meeting of the Board of Directors of the Company will be held on October 07, 2026 at 3:00 pm "
            "to consider the Annual Accounts for the quarter ended September 30, 2026. The Company has declared "
            "the “Closed Period” from October 01, 2026 to October 07, 2026.")
    f = _read(text, "board_meeting")
    assert f.meeting_date.value == date(2026, 10, 7) and f.meeting_time == "3:00 pm"
    assert (f.period_kind, f.period_end.value) == ("quarter", date(2026, 9, 30))
    assert f.book_closure_from is None


def test_close_of_business_is_not_book_closure() -> None:
    text = "members whose names appear in the register of members of the Company by the close of business on October 14, 2026."
    assert _read(text, "agm").book_closure_from is None


def test_one_day_closure_needs_the_word_on() -> None:
    good = "the Share Transfer Books of the Company will remain closed on October 09, 2026, for determining entitlement"
    f = _read(good, "book_closure")
    assert f.book_closure_from.value == f.book_closure_to.value == date(2026, 10, 9)
    garbled = "share transfer books will remain closed from-21°'-October to 28\" October 2026 (both days"
    assert _read(garbled, "book_closure").book_closure_from is None


def test_eogm_detected_from_title() -> None:
    text = "an Extraordinary General Meeting of the members will be held on Friday, October 30, 2026 at 11:00 AM"
    assert _read(text, "agm", "Notice of Extraordinary General Meeting").meeting_kind == "eogm"


def test_nothing_found_means_not_sufficient() -> None:
    assert not sufficient(rule_dates("Board meeting notice (scanned image unreadable)", "board_meeting"), "board_meeting")
