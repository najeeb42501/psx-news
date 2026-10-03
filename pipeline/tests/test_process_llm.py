"""Process orchestration and the LLM fallback chain, with scripted fake models."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from pydantic import BaseModel

from pipeline.adapters.llm.openai_compat import FallbackLLM, ModelSpec, ProviderBusyError
from pipeline.core.facts import DateFact, Facts, Figure, KeyPoint
from pipeline.core.interfaces import LLMUnavailableError
from pipeline.core.models import Company, Document, SourceRecord
from pipeline.core.process import ProcessConfig, process_documents
from pipeline.core.summarise import BilingualSummary, LangSummary
from pipeline.tests.fakes import InMemoryRepository

FIX = Path(__file__).parent / "fixtures"
BWHL_TEXT = (FIX / "psx_284352_dividend_ocr.txt").read_text(encoding="utf-8")
CFG = ProcessConfig(
    prompts={"classify": "{{items}}", "extract": "{{title}} {{text}}", "summarise": "{{facts}} {{feedback}}"},
    versions={"classify": "classify_v1", "extract": "extract_v1", "summarise": "summarise_v1"},
    glossary={"dividend": "ڈویڈنڈ"},
)


class ScriptedLLM:
    """Returns queued answers per purpose; records prompts."""

    def __init__(self, answers: dict[str, list]) -> None:
        self.answers = answers
        self.prompts: list[tuple[str, str]] = []
        self.last_model = "fake:model-1"

    def complete_json(self, prompt, schema, purpose="", document_id=None):
        self.prompts.append((purpose, prompt))
        queue = self.answers.get(purpose) or []
        if not queue:
            raise LLMUnavailableError("no scripted answer")
        answer = queue.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer.model_dump() if isinstance(answer, BaseModel) else answer)

    def complete_text(self, prompt, max_tokens):
        raise NotImplementedError


def _repo_with(*docs: tuple[str, str, str | None, str]) -> InMemoryRepository:
    repo = InMemoryRepository()
    repo.upsert_source(SourceRecord(id="psx_companies", kind="psx", url="x"))
    repo.upsert_source(SourceRecord(id="dawn_business", kind="rss", url="x"))
    repo.upsert_company(Company(symbol="BWHL", name="Baluchistan Wheels Limited"))
    repo.upsert_company(Company(symbol="DGKC", name="D.G. Khan Cement Company Limited"))
    for i, (source, title, symbol, text) in enumerate(docs):
        repo.save_document(Document(source_id=source, url=f"https://x/{i}", content_hash=f"h{i}",
                                    title=title, symbol=symbol, text=text))
    return repo


DIVIDEND_FACTS = Facts(
    dividend_kind="final",
    cash_dividend_rs=Figure(value=10, unit="Rs per share", quote="final cash dividend @ Rs. 10/- per share"),
    cash_dividend_pct=Figure(value=100, unit="%", quote="Rs. 10/- per share i.e. 100% for"),
    key_points=[KeyPoint(text="The final cash dividend was credited to shareholders.",
                         quote="has been credited electronically into the designated bank")],
)
GOOD = BilingualSummary(
    en=LangSummary(headline="BWHL: final cash dividend of Rs 10 per share", body="Baluchistan Wheels paid a final cash dividend of Rs 10 per share (100%)."),
    ur=LangSummary(headline="BWHL: فی شیئر 10 روپے حتمی نقد ڈویڈنڈ", body="بلوچستان وہیلز نے فی شیئر 10 روپے (100%) حتمی نقد ڈویڈنڈ ادا کیا۔"),
)
BAD_NUMBER = GOOD.model_copy(update={"en": LangSummary(headline="BWHL dividend", body="Dividend of Rs 12 per share.")})
ADVICE = GOOD.model_copy(update={"en": LangSummary(headline="BWHL dividend", body="Rs 10 dividend: investors should buy.")})


def _item(repo: InMemoryRepository):
    return next(iter(repo.items.values()))


def test_llm_item_published_when_gate_passes() -> None:
    repo = _repo_with(("psx_companies", "Final Cash Dividend Announcement", "BWHL", BWHL_TEXT))
    llm = ScriptedLLM({"extract": [DIVIDEND_FACTS], "summarise": [GOOD]})
    stats = process_documents(repo.documents_to_process(10), repo, llm, CFG)
    assert (stats.processed, stats.needs_review) == (1, 0)
    item = _item(repo)
    assert item.category == "dividend" and item.importance == 3 and item.review_status == "auto"
    assert item.facts["cash_dividend_rs"]["value"] == 10
    sums = {s.lang: s for s in repo.get_summaries(item.id)}
    assert sums["en"].model == "fake:model-1" and sums["en"].prompt_version == "summarise_v1"
    assert repo.companies["BWHL"].face_value_confirmed  # learned from "Rs. 10/- per share i.e. 100%"
    assert next(iter(repo.documents.values())).status == "processed"
    # Rule 5: the summary prompt is built from facts, never from the raw document text.
    summarise_prompt = next(p for purpose, p in llm.prompts if purpose == "summarise")
    assert "designated bank" not in summarise_prompt


def test_retry_fixes_a_bad_number() -> None:
    repo = _repo_with(("psx_companies", "Final Cash Dividend Announcement", "BWHL", BWHL_TEXT))
    llm = ScriptedLLM({"extract": [DIVIDEND_FACTS], "summarise": [BAD_NUMBER, GOOD]})
    process_documents(repo.documents_to_process(10), repo, llm, CFG)
    assert _item(repo).review_status == "auto"
    retry_prompt = [p for purpose, p in llm.prompts if purpose == "summarise"][1]
    assert "number 12 is not in the verified facts" in retry_prompt


@pytest.mark.parametrize("second", [BAD_NUMBER, ADVICE])
def test_two_failures_go_to_needs_review(second) -> None:
    repo = _repo_with(("psx_companies", "Final Cash Dividend Announcement", "BWHL", BWHL_TEXT))
    llm = ScriptedLLM({"extract": [DIVIDEND_FACTS], "summarise": [ADVICE, second]})
    stats = process_documents(repo.documents_to_process(10), repo, llm, CFG)
    assert stats.needs_review == 1
    assert _item(repo).review_status == "needs_review"
    assert _item(repo).facts["review_notes"]


def test_unverifiable_facts_go_to_needs_review() -> None:
    invented = Facts(eps=Figure(value=3.5, unit="Rs", quote="EPS Rs 3.50 for the year"))
    repo = _repo_with(("psx_companies", "Financial Results for the Year Ended June 30, 2026", "BWHL", BWHL_TEXT))
    llm = ScriptedLLM({"extract": [invented, invented]})  # retried once, still invented
    process_documents(repo.documents_to_process(10), repo, llm, CFG)
    item = _item(repo)
    assert item.review_status == "needs_review" and "eps" not in item.facts
    assert not any(purpose == "summarise" for purpose, _ in llm.prompts)  # nothing to summarise


def test_template_and_dates_paths_need_no_summary_model() -> None:
    agm_text = "Notice is hereby given that the AGM will be held on Wednesday, October 21, 2026 at 11:00 AM"
    repo = _repo_with(
        ("psx_companies", "Transmission of Annual Report for the Year Ended June 30, 2026", "DGKC", "x"),
        ("psx_companies", "Notice of Annual General Meeting", "DGKC", agm_text),
    )
    agm = Facts(meeting_kind="agm", meeting_time="11:00 AM",
                meeting_date=DateFact(value=date(2026, 10, 21), quote="held on Wednesday, October 21, 2026"))
    llm = ScriptedLLM({"extract": [agm]})
    stats = process_documents(repo.documents_to_process(10), repo, llm, CFG)
    assert (stats.processed, stats.needs_review) == (2, 0)
    by_cat = {i.category: i for i in repo.items.values()}
    en = {s.lang: s for s in repo.get_summaries(by_cat["agm"].id)}["en"]
    assert en.headline == "DGKC: annual general meeting on 21 Oct 2026"
    assert en.model == "template; facts by fake:model-1"
    assert [p for p, _ in llm.prompts] == ["extract"]


def test_ai_unavailable_defers_without_losing_documents() -> None:
    repo = _repo_with(
        ("psx_companies", "Financial Results for the Year Ended June 30, 2026", "BWHL", BWHL_TEXT),
        ("psx_companies", "Disclosure of Interest by a Director", "BWHL", "x"),
    )
    stats = process_documents(repo.documents_to_process(10), repo, ScriptedLLM({}), CFG)
    assert (stats.processed, stats.deferred) == (1, 1)  # the template item still goes through
    assert [d.status for d in repo.documents.values()] == ["new", "processed"]


def test_ai_budget_per_run() -> None:
    repo = _repo_with(*[("psx_companies", "Notice of Annual General Meeting", "DGKC", "no date") for _ in range(3)])
    cfg = ProcessConfig(**{**CFG.__dict__, "max_ai_docs": 2})
    stats = process_documents(repo.documents_to_process(10), repo, ScriptedLLM({"extract": [Facts()] * 3}), cfg)
    assert (stats.processed, stats.deferred) == (2, 1)


def test_leftovers_classified_in_one_batched_call() -> None:
    repo = _repo_with(
        ("psx_companies", "Notice Under Section 159(4) of the Companies Act, 2017", "DGKC", "x"),
        ("dawn_business", "Bureaucrats given last chance to declare dual nationality", None, "x"),
    )
    llm = ScriptedLLM({"classify": [{"categories": {"1": "other_corporate", "2": "made_up_category"}}]})
    process_documents(repo.documents_to_process(10), repo, llm, CFG)
    assert sorted(i.category for i in repo.items.values()) == ["other_corporate", "other_news"]
    assert [p for p, _ in llm.prompts] == ["classify"]


# --- FallbackLLM -----------------------------------------------------------------

class FakeClient:
    def __init__(self, name: str, replies: list) -> None:
        self.spec = ModelSpec("fake", name, "k", "http://x")
        self.replies = replies

    def chat(self, prompt, *, json_mode, max_tokens=None):
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply, {"prompt_tokens": 10, "completion_tokens": 5}


class Answer(BaseModel):
    eps: float


def test_fallback_switches_model_on_rate_limit_and_logs_tokens() -> None:
    calls = []
    primary = FakeClient("primary", [ProviderBusyError("HTTP 429: tokens per minute")] * 3)
    backup = FakeClient("backup", ['```json\n{"eps": -1.25}\n```'])
    llm = FallbackLLM([primary, backup], log=calls.append, sleep=lambda s: None)
    assert llm.complete_json("p", Answer, purpose="extract").eps == -1.25
    assert llm.last_model == "fake:backup"
    assert [(c.model, c.ok) for c in calls] == [("primary", False)] * 3 + [("backup", True)]
    assert calls[-1].prompt_tokens == 10


def test_bad_json_is_retried_then_next_model() -> None:
    llm = FallbackLLM([FakeClient("a", ["not json", '{"wrong": 1}', "{}"]), FakeClient("b", ['{"eps": 2}'])],
                      sleep=lambda s: None)
    assert llm.complete_json("p", Answer).eps == 2


def test_all_models_down_raises_unavailable() -> None:
    llm = FallbackLLM([FakeClient("a", [ProviderBusyError("HTTP 503: high demand")])], sleep=lambda s: None)
    with pytest.raises(LLMUnavailableError):
        llm.complete_json("p", Answer)


def test_daily_quota_skips_model_for_rest_of_run() -> None:
    quota = ProviderBusyError("HTTP 429: You exceeded your current quota")
    a = FakeClient("a", [quota])
    llm = FallbackLLM([a, FakeClient("b", ['{"eps": 1}', '{"eps": 2}'])], sleep=lambda s: None)
    assert llm.complete_json("p", Answer).eps == 1
    assert llm.complete_json("p", Answer).eps == 2  # "a" is not called again (it has no replies left)


def test_stale_ai_items_get_title_summary() -> None:
    from datetime import UTC, datetime, timedelta
    repo = _repo_with(("psx_companies", "Financial Results for the Year Ended June 30, 2026", "BWHL", BWHL_TEXT))
    doc = next(iter(repo.documents.values()))
    later = doc.first_seen_at + timedelta(hours=25)
    stats = process_documents(repo.documents_to_process(10), repo, ScriptedLLM({}),
                              ProcessConfig(**{**CFG.__dict__, "max_ai_docs": 0}), now=later)
    assert stats.processed == 1
    item = _item(repo)
    assert item.category == "results" and item.importance == 3 and item.review_status == "auto"
    en = {s.lang: s for s in repo.get_summaries(item.id)}["en"]
    assert "Financial Results for the Year Ended June 30, 2026" in en.body and en.model == "template"


def test_reprocess_marks_documents_new() -> None:
    repo = _repo_with(("psx_companies", "Disclosure of Interest by a Director", "BWHL", "x"))
    process_documents(repo.documents_to_process(10), repo, ScriptedLLM({}), CFG)
    assert repo.documents_to_process(10) == []
    assert repo.reset_for_reprocessing(["disclosure_of_interest"]) == 1
    assert len(repo.documents_to_process(10)) == 1
