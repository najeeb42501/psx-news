"""Fact verification, the quality gate, classification rules and fixed-sentence summaries."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from pipeline.core.classify import classify_by_rules
from pipeline.core.extract import verify
from pipeline.core.facts import DateFact, Facts, Figure
from pipeline.core.numbers import parse_numbers
from pipeline.core.quality import allowed_numbers, check_summary, gate
from pipeline.core.summarise import summarise_dates, summarise_template

FIX = Path(__file__).parent / "fixtures"
BWHL = (FIX / "psx_284352_dividend_ocr.txt").read_text(encoding="utf-8")  # real OCR of a PSX filing

RESULTS_TEXT = """FINANCIAL RESULTS FOR THE YEAR ENDED JUNE 30, 2026
Net sales 12,345,678 10,987,654
Loss after taxation (1,234,567) 456,789
Loss per share - basic and diluted (Rupees) (1.25) 0.46
(Rupees in thousand)"""


# --- numbers ------------------------------------------------------------------

def test_parse_numbers_handles_commas_and_brackets() -> None:
    assert parse_numbers("Net sales 12,345,678 and loss (1.25), Rs. 10/- i.e. 100%") == [12345678, -1.25, 10, 100]


# --- verification against the source text -------------------------------------

def test_verified_dividend_facts_are_kept_and_face_value_learned() -> None:
    facts = Facts(
        dividend_kind="final",
        cash_dividend_rs=Figure(value=10, unit="Rs per share", quote="final cash dividend @ Rs. 10/- per share"),
        cash_dividend_pct=Figure(value=100, unit="%", quote="Rs. 10/- per share i.e. 100% for"),
    )
    out = verify(facts, BWHL)
    assert out.problems == [] and out.kept == 2
    assert out.confirm_face_value == 10  # Rs 10 = 100% -> face value Rs 10


def test_invented_quote_or_value_is_dropped() -> None:
    facts = Facts(
        cash_dividend_rs=Figure(value=12, unit="Rs", quote="final cash dividend @ Rs. 10/- per share"),  # wrong value
        eps=Figure(value=3.5, unit="Rs", quote="earnings per share Rs 3.50"),  # not in the document
    )
    out = verify(facts, BWHL)
    assert out.facts.cash_dividend_rs is None and out.facts.eps is None
    assert out.dropped == 2 and out.confidence == 0.0


def test_ocr_spacing_does_not_break_quotes() -> None:
    quote = "final cash dividend @ Rs. 10/-  per share i.e. 100%"  # extra space vs the OCR text
    out = verify(Facts(cash_dividend_pct=Figure(value=100, unit="%", quote=quote)), BWHL)
    assert out.problems == []


def test_loss_sign_comes_from_source_not_model() -> None:
    facts = Facts(  # the model wrongly gave positive values (Groq did this in testing)
        eps=Figure(value=1.25, unit="Rs", quote="Loss per share - basic and diluted (Rupees) (1.25)"),
        profit_after_tax=Figure(value=1234567, unit="Rs in thousand", quote="Loss after taxation (1,234,567)"),
    )
    out = verify(facts, RESULTS_TEXT)
    assert out.facts.eps.value == -1.25
    assert out.facts.profit_after_tax.value == -1234567


def test_dates_must_match_their_quote() -> None:
    text = "the Annual General Meeting will be held on Wednesday, October 21, 2026 at 11:00 AM"
    good = Facts(meeting_kind="agm", meeting_date=DateFact(value=date(2026, 10, 21), quote="held on Wednesday, October 21, 2026"))
    bad = Facts(meeting_kind="agm", meeting_date=DateFact(value=date(2026, 10, 12), quote="held on Wednesday, October 21, 2026"))
    assert verify(good, text).facts.meeting_date is not None
    assert verify(bad, text).facts.meeting_date is None


def test_dividend_rs_computed_only_with_known_face_value() -> None:
    text = "The Board recommended a final cash dividend of 50% for the year"
    facts = Facts(cash_dividend_pct=Figure(value=50, unit="%", quote="final cash dividend of 50% for the year"))
    assert verify(facts, text).facts.cash_dividend_rs is None  # face value unknown: never assume Rs 10
    computed = verify(facts, text, face_value=10).facts.cash_dividend_rs
    assert computed.value == 5 and computed.computed


# --- quality gate -------------------------------------------------------------

def _facts_dsl() -> Facts:
    return Facts(eps=Figure(value=-1.25, unit="Rs", quote="(1.25)"),
                 profit_after_tax=Figure(value=-1234567, unit="Rs in thousand", quote="(1,234,567)"),
                 period_end=DateFact(value=date(2026, 6, 30), quote="JUNE 30, 2026"))


def test_gate_passes_clean_summary() -> None:
    result = gate({
        "en": ("DSL posts loss per share of Rs 1.25", "Dost Steels reported a loss after tax of Rs 1,234.6 million "
                                                      "for the year ended 30 Jun 2026."),
        "ur": ("DSL کو فی شیئر 1.25 روپے نقصان", "30 جون 2026 کو ختم ہونے والے سال میں بعد از ٹیکس نقصان 1,234.6 ملین روپے رہا۔"),
    }, _facts_dsl(), ["Financial Results for the Year Ended 30-06-2026"])
    assert result.ok, result.problems


@pytest.mark.parametrize("text, problem", [
    ("Investors should buy DSL now.", "advice"),
    ("DSL share price will rise after results.", "advice"),
    ("Target price Rs 50.", "advice"),
    ("EPS was Rs 1.35.", "not in the verified facts"),
    ("EPS was Rs ۱.25.", "Urdu/Arabic digits"),
])
def test_gate_blocks_bad_english(text: str, problem: str) -> None:
    problems = check_summary("en", "DSL results", text, allowed_numbers(_facts_dsl(), []))
    assert any(problem in p for p in problems), problems


@pytest.mark.parametrize("text", [
    "ENGRO reported shares purchased under its buy-back programme.",
    "DGKC will hold its annual general meeting on 21 Oct 2026.",
    "Selling pressure continued at the PSX.",
])
def test_gate_allows_factual_wording(text: str) -> None:
    allowed = allowed_numbers(Facts(meeting_date=DateFact(value=date(2026, 10, 21), quote="x")), [])
    assert check_summary("en", "headline", text, allowed) == []


def test_gate_blocks_urdu_advice_and_long_headlines() -> None:
    problems = check_summary("ur", "x" * 95, "یہ شیئر ابھی خریدیں۔", set())
    assert any("advice" in p for p in problems) and any("characters" in p for p in problems)


def test_gate_limits_sentences_but_not_decimal_points() -> None:
    allowed = {1.25, 2.5, 3.75}
    assert check_summary("en", "h", "EPS was Rs 1.25. Dividend Rs 2.5. Bonus 3.75%.", allowed) == []
    assert any("sentences" in p for p in check_summary("en", "h", "One. Two. Three. Four.", allowed))


# --- classification rules (real PSX titles from 2026-10-02) ------------------------

@pytest.mark.parametrize("title, source, expected", [
    ("Financial Results for the Year Ended 30-06-2026", "psx_companies", "results"),
    ("BOARD MEETING FOR THE ANNOUNCEMENT OF THE FINANCIAL RESULTS FOR THE NINE MONTHS ENDED SEPTEMBER 30, 2026",
     "psx_companies", "board_meeting"),
    ("Board Meeting In Progress", "psx_companies", "board_meeting_in_progress"),
    ("Credit of Final Cash Dividend (D-79) for the year ended June 30, 2026", "psx_companies", "dividend_payment"),
    ("ALHAMRA DAILY DIVIDEND FUND (ALHDDF) Daily Dividend Distribution for 01-OCT-26", "psx_companies", "fund_distribution"),
    ("Transmission of Annual Accounts for the Year ended 2026-06-30", "psx_companies", "annual_report"),
    ("Notice of Annual General Meeting (Pre-Publication)", "psx_companies", "agm"),
    ("Applied for extension in holding AGM under section 132(1) of the Companies Act, 2017", "psx_companies", "agm_extension"),
    ("Clarification of Book Closure Dates Relating to Bonus Share Entitlements Announced Through PUCARS",
     "psx_companies", "book_closure"),
    ("LSEFSL | LSE Financial Services Limited - 58.89% Right Issue Rs.1/- Per Share (LSEFSL)", "psx_companies", "right_shares"),
    ("Reporting of shares purchased (buy-back) by Engro Holdings Limited", "psx_companies", "buyback"),
    ("UNUSUAL MOVEMENT IN PRICE OF THE SHARES OF ELAHI COTTON MILLS LIMITED (ELCM)", "psx_notices", "psx_unusual_movement"),
    ("Notice No. R-628 regarding Loss of Share Certificate(s) by CDC Share Registrar Services Limited", "psx_notices",
     "share_certificate_loss"),
    ("Weekly inflation surges 11.53pc", "dawn_business", "macro"),
    ("SBP keeps policy rate unchanged at 11pc", "dawn_business", "macro_key"),
    ("Equities extend losses amid low volume", "dawn_business", "sector"),
])
def test_title_rules(title: str, source: str, expected: str) -> None:
    cat = classify_by_rules(title, source)
    assert cat is not None and cat.name == expected


def test_unclear_titles_left_for_the_llm() -> None:
    assert classify_by_rules("Notice Under Section 159(4) of the Companies Act, 2017", "psx_companies") is None
    assert classify_by_rules("Bureaucrats Given Last Chance to Declare Dual Nationality", "propakistani_business") is None


# --- fixed-sentence summaries -------------------------------------------------

def test_agm_summary_from_verified_dates_passes_gate() -> None:
    facts = Facts(
        meeting_kind="agm", meeting_time="11:00 AM",
        meeting_date=DateFact(value=date(2026, 10, 21), quote="October 21, 2026"),
        book_closure_from=DateFact(value=date(2026, 10, 14), quote="October 14, 2026"),
        book_closure_to=DateFact(value=date(2026, 10, 21), quote="October 21, 2026"),
    )
    s = summarise_dates("agm", facts, symbol="DGKC", name="D.G. Khan Cement Company Limited", title="Notice of AGM")
    assert s is not None
    assert s.en.body == ("D.G. Khan Cement Company Limited (DGKC) will hold its annual general meeting on 21 Oct 2026 "
                         "at 11:00 AM. Share transfer books will be closed from 14 Oct 2026 to 21 Oct 2026.")
    assert "21 اکتوبر 2026" in s.ur.body and "بک کلوژر" in s.ur.body
    assert gate(s.as_pairs(), facts, ["Notice of AGM"]).ok


def test_missing_date_falls_back_to_none() -> None:
    assert summarise_dates("board_meeting", Facts(), symbol="X", name="X Ltd", title="Board Meeting") is None


def test_every_template_passes_the_gate() -> None:
    from pipeline.core.summarise import TEMPLATES
    title = "UNUSUAL MOVEMENT IN PRICE OF THE SHARES OF ELAHI COTTON MILLS LIMITED (ELCM)"
    for category in TEMPLATES:
        s = summarise_template(category, symbol="ELCM", name="Elahi Cotton Mills Limited", title=title)
        result = gate(s.as_pairs(), Facts(), [title, "Elahi Cotton Mills Limited"])
        assert result.ok, (category, result.problems)


# --- regressions found on real filings (2026-10-04) ----------------------------

DIIL_TEXT = """Soles - an ” 693,871,185 1,100,040
Profit/ (loss) for the year 34,264,073 (153,761,366)
Earning / (loss) per Share 29 4.25 (17.08)"""


def test_profit_loss_label_does_not_flip_sign() -> None:
    """DIIL made a profit; the label 'Profit/(loss)' must not turn it into a loss."""
    facts = Facts(
        profit_after_tax=Figure(value=-34264073, unit="Rupees", quote="Profit/ (loss) for the year 34,264,073 (153,761,366)"),
        eps=Figure(value=-4.25, unit="Rs", quote="Earning / (loss) per Share 29 4.25 (17.08)"),
    )
    out = verify(facts, DIIL_TEXT)
    assert out.facts.profit_after_tax.value == 34264073
    assert out.facts.eps.value == 4.25


def test_previous_year_column_is_rejected() -> None:
    """Qwen picked -17.08 (last year's column) in testing."""
    facts = Facts(eps=Figure(value=-17.08, unit="Rs", quote="Earning / (loss) per Share 29 4.25 (17.08)"))
    out = verify(facts, DIIL_TEXT)
    assert out.facts.eps is None and "previous-period" in out.problems[0]


def test_bare_number_without_label_is_rejected() -> None:
    """SHCI: OCR split labels from numbers, so '48,908,890' alone proves nothing."""
    text = "Revenue 20 | Cost Of Sales 21 | Gross Profit\n48,908,890\n70,655,145"
    out = verify(Facts(revenue=Figure(value=48908890, unit="Rs", quote="48,908,890")), text)
    assert out.facts.revenue is None and "row label" in out.problems[0]


def test_minus_sign_and_ranges() -> None:
    assert parse_numbers("EPS Rs -0.37") == [-0.37]
    assert parse_numbers("dated 30-06-2026, D-79") == [30, 6, 2026, 79]


def test_plain_rupees_may_be_written_in_millions() -> None:
    facts = Facts(profit_after_tax=Figure(value=-277527847, unit="Rs", quote="x"))
    assert check_summary("en", "Loss of Rs 277.5 million", "Loss after tax of Rs 277.5 million.",
                         allowed_numbers(facts, [])) == []


def test_urdu_mixed_script_and_rs_rejected() -> None:
    problems = check_summary("ur", "Shaفی کیمیکل", "آمدنی Rs 48,908,890 تھی۔", {48908890})
    assert any("mixes English and Urdu" in p for p in problems)
    assert any("روپے" in p for p in problems)


# --- regressions from the manual review of 34 real filings (2026-10-04) ---------

def test_closed_period_is_not_book_closure() -> None:
    """SPL/DAAG/MARI: an insider 'Closed Period' was published as book closure."""
    text = "The Board has declared Closed Period from 2026-10-03 to 2026-10-09 for directors."
    facts = Facts(book_closure_from=DateFact(value=date(2026, 10, 3), quote="Closed Period from 2026-10-03 to 2026-10-09"),
                  book_closure_to=DateFact(value=date(2026, 10, 9), quote="Closed Period from 2026-10-03 to 2026-10-09"))
    out = verify(facts, text)
    assert out.facts.book_closure_from is None and out.facts.book_closure_to is None


def test_ocr_garbled_profit_loss_label_keeps_sign() -> None:
    """FTSM: "Pr'ofit / (loss) after taxation 4,907,056" is a profit."""
    text = "Pr'ofit / (loss) after taxation 4,907,056 (15 029 Be1)"
    out = verify(Facts(profit_after_tax=Figure(value=-4907056, unit="Rs", quote=text)), text)
    assert out.facts.profit_after_tax.value == 4907056


def test_pure_loss_label_is_negative() -> None:
    text = "(Loss) after taxation 32,134 63,807"
    out = verify(Facts(profit_after_tax=Figure(value=32134, unit="Rs '000", quote=text)), text)
    assert out.facts.profit_after_tax.value == -32134


def test_per_share_amounts_must_not_be_rounded() -> None:
    facts = Facts(eps=Figure(value=0.113, unit="Rs", quote="x"))
    allowed = allowed_numbers(facts, [])
    assert check_summary("en", "h", "EPS was Rs 0.113.", allowed) == []
    assert check_summary("en", "h", "EPS was Rs 0.11.", allowed) == []  # 2 decimals is fine
    assert any("0.1 is not" in p for p in check_summary("en", "h", "EPS was Rs 0.1.", allowed))


def test_curly_quote_thousand_unit() -> None:
    facts = Facts(profit_after_tax=Figure(value=-32134, unit="Rupees in ‘000", quote="x"))
    assert check_summary("en", "h", "Loss of Rs 32.1 million.", allowed_numbers(facts, [])) == []


def test_key_points_need_a_real_quote() -> None:
    from pipeline.core.facts import KeyPoint
    text = "(ix) CASH DIVIDEND NIL\n(x) BONUS SHARES NIL"
    facts = Facts(key_points=[KeyPoint(text="No cash dividend was announced.", quote="CASH DIVIDEND NIL"),
                              KeyPoint(text="A special dividend is planned.", quote="special dividend planned for 2027")])
    out = verify(facts, text)
    assert [k.text for k in out.facts.key_points] == ["No cash dividend was announced."]


def test_one_day_book_closure_and_urdu_gender_and_time() -> None:
    one_day = Facts(book_closure_from=DateFact(value=date(2026, 10, 9), quote="x"),
                    book_closure_to=DateFact(value=date(2026, 10, 9), quote="x"))
    s = summarise_dates("book_closure", one_day, symbol="CLOV", name="Clover Pakistan Limited", title="t")
    assert s.en.headline == "CLOV: book closure on 9 Oct 2026"
    board = Facts(meeting_kind="board", meeting_time="11.30 A.M.", period_kind="year",
                  meeting_date=DateFact(value=date(2026, 10, 9), quote="x"),
                  period_end=DateFact(value=date(2026, 6, 30), quote="x"))
    s = summarise_dates("board_meeting", board, symbol="GUTM", name="Gulistan Textile Mills Limited", title="t")
    assert "at 11.30 A.M to consider" in s.en.body and ".." not in s.en.body
    assert "ختم ہونے والے سال" in s.ur.body


def test_meeting_time_needs_verified_date_and_source() -> None:
    text = "The AGM will be held on October 28, 2026 at 12:00 PM at the registered office."
    no_date = Facts(meeting_kind="agm", meeting_time="12:00 PM")
    assert verify(no_date, text).facts.meeting_time is None  # IML: time without a date was published
    good = Facts(meeting_kind="agm", meeting_time="12:00 PM",
                 meeting_date=DateFact(value=date(2026, 10, 28), quote="held on October 28, 2026"))
    assert verify(good, text).facts.meeting_time == "12:00 PM"
    invented = good.model_copy(update={"meeting_time": "3:00 PM"})
    assert verify(invented, text).facts.meeting_time is None


def test_other_figures_need_label_and_current_column() -> None:
    from pipeline.core.facts import NamedFigure
    text = "Total'assets 21,592,323,199 20,162,636,017\nShare capital 207,000,000"
    facts = Facts(other_figures=[
        NamedFigure(label="Total assets", value=21592323199, unit="Rupees", quote="Total'assets 21,592,323,199 20,162,636,017"),
        NamedFigure(label="Total assets last year", value=20162636017, unit="Rupees", quote="Total'assets 21,592,323,199 20,162,636,017"),
        NamedFigure(label="Net revenue", value=207000000, unit="Rupees", quote="Share capital 207,000,000"),
    ])
    kept = verify(facts, text).facts.other_figures
    assert [f.label for f in kept] == ["Total assets"]


@pytest.mark.parametrize("text", [
    "The benchmark KSE-100 index closed lower.",
    "G7 countries agreed to a release.",
    "Exports grew in Q1 of FY26.",
])
def test_digits_in_names_are_not_amounts(text: str) -> None:
    assert check_summary("en", "h", text, set()) == []


def test_currency_glued_amounts_still_checked() -> None:
    assert any("10 is not" in p for p in check_summary("en", "h", "A dividend of Rs10 per share.", set()))


def test_numbers_in_verified_key_point_quotes_allowed() -> None:
    from pipeline.core.facts import KeyPoint
    facts = Facts(key_points=[KeyPoint(text="SPI rose in the week.", quote="for the week ending Oct 1, mainly due to")])
    assert check_summary("en", "h", "For the week ending 1 Oct, prices rose.", allowed_numbers(facts, [])) == []


def test_urdu_full_stop_after_english_name_is_fine() -> None:
    assert check_summary("ur", "سرخی", "یہ کمپنی Islamic Republic۔", set()) == []
