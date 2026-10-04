"""Fixes from the v1.1 audit (2026-10-04): Urdu style, news attribution, long filings,
duplicate news, off-topic news, review meetings, results without profit, rewrites."""
from __future__ import annotations

from datetime import date

import pytest

from pipeline.core.classify import classify_by_rules
from pipeline.core.facts import DateFact, Facts, Figure, KeyPoint
from pipeline.core.models import Document, SourceRecord
from pipeline.core.process import ProcessConfig, process_documents, resummarise_items
from pipeline.core.quality import check_summary
from pipeline.core.summarise import BilingualSummary, LangSummary, summarise_dates
from pipeline.tests.test_process_llm import BWHL_TEXT, CFG, DIVIDEND_FACTS, GOOD, ScriptedLLM, _item, _repo_with

# --- Urdu style ----------------------------------------------------------------------------


@pytest.mark.parametrize(("text", "problem"), [
    ("بورڈ نے نل کیش ڈیویڈنڈ کی سفارش کی۔", "water tap"),
    ("آئی ایم ایف نے مطالبہ کیا ہے۔", "short codes in English letters"),
    ("AGM 28 اکتوبر 2026 کو ہوگی، جبکہ بک کلوژر 22 اکتوبر 2026 سے شروع ہوگا۔", "feminine"),
    ("بک کلوژر 21 اکتوبر 2026 سے 28 اکتوبر 2026 تک رہے گا۔", "feminine"),
])
def test_urdu_style_checks(text: str, problem: str) -> None:
    allowed = {21.0, 22.0, 28.0, 2026.0}
    assert any(problem in p for p in check_summary("ur", "سرخی", text, allowed))


def test_urdu_style_checks_pass_good_text() -> None:
    good = ("بورڈ نے کوئی کیش ڈیویڈنڈ تجویز نہیں کیا اور IMF کا ذکر کیا۔ "
            "بک کلوژر 22 اکتوبر 2026 سے شروع ہوگی۔ AGM کا انعقاد 28 اکتوبر 2026 کو ہوگا۔")
    assert check_summary("ur", "سرخی", good, {22.0, 28.0, 2026.0}) == []


# --- news attribution ----------------------------------------------------------------------

def test_news_forecasts_must_be_attributed() -> None:
    bare = check_summary("en", "Mobile Package Prices May Rise Soon", "Mobile package prices may rise soon.", set(),
                         news_source="ProPakistani")
    assert any("must say whose it is" in p for p in bare)
    headline = "Mobile package prices may rise, ProPakistani reports"
    body = "ProPakistani reports that mobile package prices may rise soon. The PTA could get new powers, officials said."
    assert check_summary("en", headline, body, set(), news_source="ProPakistani") == []
    ur_ok = "ProPakistani کے مطابق موبائل پیکجز کی قیمتیں بڑھ سکتی ہیں۔"
    assert check_summary("ur", "موبائل پیکجز ProPakistani کے مطابق", ur_ok, set(), news_source="ProPakistani") == []
    # Company filings are the company's own statements: the rule is for news only.
    assert check_summary("en", "h", "The company may hold its AGM in Lahore.", set()) == []


def test_news_prompt_names_the_source() -> None:
    cfg = ProcessConfig(prompts={**CFG.prompts, "summarise": "{{source}} {{facts}} {{feedback}}"},
                        versions=CFG.versions, glossary=CFG.glossary, source_names={"dawn_business": "Dawn"})
    repo = _repo_with(("dawn_business", "SBP expected to keep rates on hold", None, "Analysts expect the SBP to hold."))
    facts = Facts(key_points=[KeyPoint(text="Analysts expect the SBP to hold the policy rate.",
                                       quote="Analysts expect the SBP to hold.")])
    good = BilingualSummary(
        en=LangSummary(headline="SBP seen holding rates, Dawn reports",
                       body="Analysts expect the SBP to hold the policy rate, Dawn reports."),
        ur=LangSummary(headline="پالیسی ریٹ", body="Dawn کے مطابق تجزیہ کاروں کو توقع ہے کہ SBP پالیسی ریٹ برقرار رکھے گا۔"),
    )
    llm = ScriptedLLM({"classify": [{"categories": {"1": "macro"}}], "extract": [facts], "summarise": [good]})
    process_documents(repo.documents_to_process(10), repo, llm, cfg)
    assert next(p for k, p in llm.prompts if k == "summarise").startswith("Dawn (news story)")
    assert _item(repo).review_status == "auto"


# --- long filings --------------------------------------------------------------------------

def test_select_text_keeps_results_rows_of_long_filings() -> None:
    from pipeline.core.extract import select_text
    cover = "FINANCIAL RESULTS FOR THE YEAR ENDED JUNE 30, 2026. Dividend: nil. " * 40
    notes = "Note 12. Property, plant and equipment depreciation schedule. " * 300
    table = ("Sales - net 7,685,659,530 7,247,000,329\nProfit after taxation 627,241,605 741,686,669\n"
             "Earnings per share 2.02 3.68")
    text = cover + notes + table + notes
    sent = select_text(text, "llm")
    assert len(text) > 20_000 and len(sent) <= 8_100
    assert "Profit after taxation 627,241,605" in sent and "Earnings per share 2.02" in sent
    assert sent.startswith("FINANCIAL RESULTS")
    assert select_text("short filing", "llm") == "short filing"


# --- duplicates and off-topic news ----------------------------------------------------------

def test_same_story_from_two_outlets() -> None:
    from pipeline.core.dedupe import same_story
    assert same_story("Capital Blockade Chokes Karachi Port Ahead of Protests",
                      "Capital blockade ahead of Oct 4 PTI protest chokes Karachi Port")
    assert not same_story("PSX closes higher", "PSX closes lower")
    assert not same_story("KSE-100 gains 500 points on rate cut hopes", "KSE-100 loses 300 points as rate cut hopes fade")


def test_duplicate_news_story_is_merged_without_ai() -> None:
    repo = _repo_with(("dawn_business", "Capital blockade ahead of Oct 4 PTI protest chokes Karachi Port", None,
                       "A blockade choked Karachi Port on Saturday."))
    first = Facts(key_points=[KeyPoint(text="A blockade choked Karachi Port.", quote="A blockade choked Karachi Port")])
    summary = BilingualSummary(
        en=LangSummary(headline="Karachi Port choked by blockade", body="A blockade choked Karachi Port, Dawn reports."),
        ur=LangSummary(headline="کراچی پورٹ", body="Dawn کے مطابق کراچی پورٹ متاثر ہوئی۔"),
    )
    llm = ScriptedLLM({"classify": [{"categories": {"1": "macro"}}], "extract": [first], "summarise": [summary]})
    process_documents(repo.documents_to_process(10), repo, llm, CFG)
    assert _item(repo).review_status == "auto"
    repo.upsert_source(SourceRecord(id="propakistani_business", kind="rss", url="x"))
    repo.save_document(Document(source_id="propakistani_business", url="https://pp/1", content_hash="pp1",
                                title="Capital Blockade Chokes Karachi Port Ahead of Protests", text="y"))
    second = ScriptedLLM({"classify": [{"categories": {"2": "macro"}}]})  # no extract/summarise answers
    stats = process_documents(repo.documents_to_process(10), repo, second, CFG)
    assert stats.duplicates == 1 and [p for p, _ in second.prompts if p != "classify"] == []
    items = sorted(repo.items.values(), key=lambda i: i.id)
    assert items[1].review_status == "duplicate" and items[1].facts == {"duplicate_of": items[0].id}
    assert items[0].facts["also_reported"][0]["source_id"] == "propakistani_business"


def test_foreign_markets_news_is_off_topic() -> None:
    cat = classify_by_rules("Bond yields, AI spending threaten US stocks", "tribune_business")
    assert cat is not None and cat.name == "other_news" and cat.importance == 0
    psx = classify_by_rules("PSX stocks extend gains", "dawn_business")
    assert psx is not None and psx.name == "sector"


# --- filings ---------------------------------------------------------------------------------

def test_modaraba_review_meeting_is_not_called_an_agm() -> None:
    facts = Facts(meeting_kind="agm", meeting_date=DateFact(value=date(2026, 10, 23), quote="x"))
    s = summarise_dates("agm", facts, symbol="PIM", name="Popular Islamic Modaraba",
                        title="Notice of Annual Review Meeting")
    assert s is not None
    assert "annual review meeting" in s.en.body and "سالانہ ریویو میٹنگ" in s.ur.body
    assert "annual general meeting" not in s.en.body


def test_results_without_profit_or_eps_go_to_review() -> None:
    repo = _repo_with(("psx_companies", "Financial Results for the Year Ended June 30, 2026", "BWHL", BWHL_TEXT))
    only_dividend = Facts(cash_dividend_rs=Figure(value=10, unit="Rs per share",
                                                  quote="final cash dividend @ Rs. 10/- per share"))
    llm = ScriptedLLM({"extract": [only_dividend], "summarise": [GOOD]})
    process_documents(repo.documents_to_process(10), repo, llm, CFG)
    assert _item(repo).review_status == "needs_review"
    assert any("neither profit nor EPS" in n for n in _item(repo).facts["review_notes"])


def test_resummarise_uses_stored_facts_and_keeps_hidden_items_hidden() -> None:
    repo = _repo_with(("psx_companies", "Final Cash Dividend Announcement", "BWHL", BWHL_TEXT))
    process_documents(repo.documents_to_process(10), repo,
                      ScriptedLLM({"extract": [DIVIDEND_FACTS], "summarise": [GOOD]}), CFG)
    item = _item(repo)
    assert item.id is not None
    rewrite = ScriptedLLM({"summarise": [GOOD]})  # no "extract" answer: a re-extraction would fail
    stats = resummarise_items([item.id], repo, rewrite, CFG)
    assert stats.processed == 1 and [p for p, _ in rewrite.prompts] == ["summarise"]
    assert _item(repo).facts["cash_dividend_rs"]["value"] == 10
    repo.items[item.id] = _item(repo).model_copy(update={"review_status": "hidden"})
    assert resummarise_items([item.id], repo, ScriptedLLM({}), CFG).processed == 0
    assert _item(repo).review_status == "hidden"


def test_pages_that_are_mostly_a_picture_get_ocr() -> None:
    from pipeline.adapters.parsers.pdf_ocr import PdfOcrParser
    parser = PdfOcrParser.__new__(PdfOcrParser)
    parser.min_page_chars = 200
    assert parser.needs_ocr(90, 0.0)  # only "NOTICE ... Trading & TREC Affairs Department" as text
    assert parser.needs_ocr(450, 0.7)  # header + footer around a scanned table
    assert not parser.needs_ocr(3000, 0.7)  # real text with a logo
    assert not parser.needs_ocr(450, 0.05)


def test_off_topic_news_headline_names_the_outlet() -> None:
    from pipeline.core.summarise import summarise_template
    s = summarise_template("other_news", symbol=None, name=None, title="Bond yields, AI spending threaten US stocks",
                           source="Express Tribune")
    assert s.en.headline == "Express Tribune: Bond yields, AI spending threaten US stocks"
    assert check_summary("en", s.en.headline, s.en.body, set(), news_source="Express Tribune") == []
