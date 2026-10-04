"""Process: classify -> extract facts -> summarise EN + UR -> quality gate -> store.

Anything that still fails the gate after the retries is stored as needs_review: not shown
on the website and never posted, until an admin approves or fixes it.
"""
from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel

from pipeline.core.classify import (
    CATEGORIES,
    LLM_CHOICES,
    Category,
    build_classify_prompt,
    classify_by_rules,
    fallback_category,
    source_kind,
)
from pipeline.core.date_rules import RULES_VERSION, rule_dates, sufficient
from pipeline.core.dedupe import same_story
from pipeline.core.extract import Extraction, extract, verify
from pipeline.core.facts import Facts
from pipeline.core.interfaces import LLMProvider, LLMUnavailableError, Repository
from pipeline.core.models import Document, Item, Summary
from pipeline.core.quality import gate
from pipeline.core.summarise import (
    TEMPLATE_VERSION,
    TEMPLATES,
    BilingualSummary,
    summarise_dates,
    summarise_llm,
    summarise_template,
)


SUMMARY_RETRIES = 2  # rewrites after a failed fact check, each told what was wrong


@dataclass
class ProcessConfig:
    prompts: dict[str, str]  # "classify" | "extract" | "summarise" -> template text
    versions: dict[str, str]  # same keys -> e.g. "extract_v1"
    glossary: dict[str, str]
    max_ai_docs: int = 25  # per run, to stay inside free-tier limits; the rest wait for the next run
    stale_after: timedelta = timedelta(hours=24)  # then publish a title-based summary instead of waiting
    source_names: dict[str, str] = field(default_factory=dict)  # source id -> "Dawn", for attribution
    duplicate_window: timedelta = timedelta(hours=36)  # same story from another outlet within this window


@dataclass
class ProcessStats:
    processed: int = 0
    needs_review: int = 0
    failed: int = 0
    deferred: int = 0  # left for the next run (AI budget or AI unavailable)
    duplicates: int = 0  # news stories already published from another outlet
    by_category: Counter = field(default_factory=Counter)
    notes: list[str] = field(default_factory=list)
    seconds: dict[str, float] = field(default_factory=lambda: {"classify": 0.0, "no_ai": 0.0, "ai": 0.0})


class _ClassifyAnswer(BaseModel):
    categories: dict[str, str]


def classify_all(docs: list[Document], llm: LLMProvider, cfg: ProcessConfig) -> dict[int, Category]:
    """Title rules first; one batched LLM call for whatever is left."""
    result: dict[int, Category] = {}
    leftovers: list[Document] = []
    for d in docs:
        assert d.id is not None
        cat = classify_by_rules(d.title, d.source_id)
        if cat:
            result[d.id] = cat
        else:
            leftovers.append(d)
    if not leftovers:
        return result
    try:
        prompt = build_classify_prompt(cfg.prompts["classify"], [(d.id, d.title, d.source_id) for d in leftovers])
        answer = llm.complete_json(prompt, _ClassifyAnswer, purpose="classify")
        assert isinstance(answer, _ClassifyAnswer)
        chosen = answer.categories
    except LLMUnavailableError:
        chosen = {}
    for d in leftovers:
        name = chosen.get(str(d.id))
        allowed = LLM_CHOICES.get(source_kind(d.source_id), [])
        result[d.id] = CATEGORIES[name] if name in allowed else fallback_category(d.source_id)
    return result


# Keys stored next to the facts in items.facts that are not facts themselves.
EXTRA_KEYS = ("review_notes", "also_reported", "duplicate_of")


def _facts_json(facts: Facts, notes: list[str], extra: dict | None = None) -> dict:
    data = facts.model_dump(mode="json", exclude_none=True, exclude_defaults=True)
    if notes:
        data["review_notes"] = notes
    return data | {k: v for k, v in (extra or {}).items() if k != "review_notes"}


def stored_facts(item_facts: dict) -> tuple[Facts, dict]:
    """An item's stored facts, split into the verified Facts and the extra keys."""
    extra = {k: item_facts[k] for k in EXTRA_KEYS if k in item_facts}
    return Facts.model_validate({k: v for k, v in item_facts.items() if k not in EXTRA_KEYS}), extra


def source_label(doc: Document, cfg: ProcessConfig) -> tuple[str, str | None]:
    """(how the prompt names the source, the outlet name if this is a news story)."""
    kind = source_kind(doc.source_id)
    name = cfg.source_names.get(doc.source_id, doc.source_id)
    if kind == "news":
        return f"{name} (news story)", name
    return ("PSX filing by the company" if kind == "company" else f"{name} notice"), None


def rule_extraction(doc: Document, cat: Category) -> Extraction | None:
    """Dates read by rules (no AI), if they are enough for this category's summary."""
    if cat.handling != "dates":
        return None
    text = doc.text or doc.title
    ext = verify(rule_dates(text, cat.name, doc.title), text)
    return ext if sufficient(ext.facts, cat.name) else None


def process_one(doc: Document, cat: Category, repo: Repository, llm: LLMProvider, cfg: ProcessConfig,
                extract_llm: LLMProvider | None = None, force_template: bool = False,
                rules: Extraction | None = None, known: tuple[Facts, dict] | None = None) -> str:
    """Returns the review_status given to the item. force_template: no AI (used for stale items).
    rules: dates already read by rules, so no AI call is needed.
    known: facts verified earlier (with their extra keys): rewrite the summary without re-extracting."""
    extract_llm = extract_llm or llm
    assert doc.id is not None
    company = repo.get_company(doc.symbol) if doc.symbol else None
    name = company.name if company else None
    label = f"{name} ({doc.symbol})" if name else (doc.symbol or "none (general news)")
    face_value = company.face_value if company and company.face_value_confirmed else None
    text = doc.text or doc.title
    if doc.text and doc.title and doc.title not in doc.text[:1000]:
        # PSX titles often carry the key terms ("58.89% Right Issue Rs.1/- Per Share") when the PDF
        # itself is mostly a scanned table; the title is from the portal, so facts may be quoted from it.
        text = f"{doc.title}\n\n{doc.text}"
    facts, notes, confidence = Facts(), [], None
    extra: dict = known[1] if known else {}
    summary: BilingualSummary
    model, version = "template", TEMPLATE_VERSION
    is_company = source_kind(doc.source_id) == "company"
    fallback = "other_corporate" if is_company else "other_news"
    source, news_source = source_label(doc, cfg)
    if known and cat.handling == "dates":
        rules = Extraction(facts=known[0])

    if rules is not None:
        facts, confidence = rules.facts, rules.confidence
        summary = summarise_dates(cat.name, facts, symbol=doc.symbol, name=name, title=doc.title) \
            or summarise_template(cat.name, symbol=doc.symbol, name=name, title=doc.title)
        model, version = "template; facts by rules", f"{TEMPLATE_VERSION}+{RULES_VERSION}"
    elif cat.handling == "template" or force_template:
        summary = summarise_template(cat.name if cat.name in TEMPLATES else fallback,
                                     symbol=doc.symbol, name=name, title=doc.title, source=news_source)
    else:
        ext: Extraction = Extraction(facts=known[0]) if known else extract(
            extract_llm, cfg.prompts["extract"], title=doc.title, company=label, category=cat.name, text=text,
            handling=cat.handling, face_value=face_value, document_id=doc.id,
        )
        facts, confidence = ext.facts, ext.confidence
        notes += [p for p in ext.problems if p.startswith("dividend:")]  # inconsistencies need a human
        if ext.confirm_face_value and doc.symbol:
            repo.confirm_face_value(doc.symbol, ext.confirm_face_value)
        facts_model = "earlier extraction" if known else extract_llm.last_model
        if cat.name == "results" and not (facts.profit_after_tax or facts.eps):
            notes.append("results filing, but neither profit nor EPS could be verified: check the filing")
        if cat.handling == "dates":
            summary = summarise_dates(cat.name, facts, symbol=doc.symbol, name=name, title=doc.title) \
                or summarise_template(cat.name, symbol=doc.symbol, name=name, title=doc.title)
            model, version = f"template; facts by {facts_model}", f"{TEMPLATE_VERSION}+{cfg.versions['extract']}"
        elif not facts.figures() and not facts.key_points:
            # A filing we could not read needs a human. A news story is fine as its headline plus the link,
            # the way an editor would share it.
            if is_company:
                notes.append("no facts could be verified against the document")
            summary = summarise_template(fallback, symbol=doc.symbol, name=name, title=doc.title, source=news_source)
            model, version = f"template; facts by {facts_model}", f"{TEMPLATE_VERSION}+{cfg.versions['extract']}"
        else:
            sources = [doc.title, name or ""]
            summary = summarise_llm(llm, cfg.prompts["summarise"], company=label, category=cat.name, facts=facts,
                                    glossary=cfg.glossary, document_id=doc.id, source=source)
            check = gate(summary.as_pairs(), facts, sources, news_source)
            for _ in range(SUMMARY_RETRIES):  # retry, telling the model exactly what was wrong and where
                if check.ok:
                    break
                try:
                    summary = summarise_llm(llm, cfg.prompts["summarise"], company=label, category=cat.name,
                                            facts=facts, glossary=cfg.glossary, document_id=doc.id, source=source,
                                            feedback="\n".join(f"- {p}" for p in check.problems))
                except LLMUnavailableError:
                    break  # keep the last answer; it goes to review below
                check = gate(summary.as_pairs(), facts, sources, news_source)
            notes += check.problems
            model, version = llm.last_model, cfg.versions["summarise"]

    final = gate(summary.as_pairs(), facts, [doc.title, name or ""], news_source)
    notes += [p for p in final.problems if p not in notes]
    review_status = "needs_review" if notes else "auto"

    item_id = repo.save_item(Item(
        document_id=doc.id, symbol=doc.symbol, category=cat.name, importance=cat.importance,
        facts=_facts_json(facts, notes, extra), confidence=confidence, review_status=review_status,
    ))
    for lang, (headline, body) in summary.as_pairs().items():
        repo.save_summary(Summary(item_id=item_id, lang=lang, headline=headline, body=body,
                                  model=model, prompt_version=version))
    repo.set_document_status(doc.id, "processed")
    return review_status


def mark_duplicate(doc: Document, cat: Category, repo: Repository, cfg: ProcessConfig, now: datetime) -> bool:
    """A news story another outlet already covered is not summarised again (no AI call): it is
    stored as a duplicate (never shown) and listed on the first story as "also reported by"."""
    assert doc.id is not None
    for item_id, source_id, title, url in repo.recent_news_items(now - cfg.duplicate_window):
        if source_id != doc.source_id and same_story(doc.title, title):
            repo.save_item(Item(document_id=doc.id, symbol=doc.symbol, category=cat.name, importance=cat.importance,
                                facts={"duplicate_of": item_id}, review_status="duplicate"))
            repo.add_also_reported(item_id, {"source_id": doc.source_id, "url": doc.url, "title": doc.title})
            repo.set_document_status(doc.id, "processed")
            return True
    return False


def process_documents(docs: list[Document], repo: Repository, llm: LLMProvider, cfg: ProcessConfig,
                      extract_llm: LLMProvider | None = None, now: datetime | None = None) -> ProcessStats:
    stats = ProcessStats()
    now = now or datetime.now(UTC)
    if not docs:
        return stats
    t0 = time.monotonic()
    categories = classify_all(docs, llm, cfg)
    stats.seconds["classify"] = round(time.monotonic() - t0, 1)
    # Fixed-sentence items first (free), then AI items, most important first.
    ordered = sorted(docs, key=lambda d: (categories[d.id].handling != "template", -categories[d.id].importance))
    ai_used = 0
    ai_down = False
    for doc in ordered:
        cat = categories[doc.id]
        if source_kind(doc.source_id) == "news" and mark_duplicate(doc, cat, repo, cfg, now):
            stats.duplicates += 1
            stats.processed += 1
            continue
        rules = rule_extraction(doc, cat)
        needs_ai = cat.handling != "template" and rules is None
        force_template = False
        if needs_ai and (ai_down or ai_used >= cfg.max_ai_docs):
            if doc.first_seen_at and now - doc.first_seen_at > cfg.stale_after:
                force_template, needs_ai = True, False  # waited too long for AI: publish from the title
                stats.notes.append(f"doc {doc.id}: no AI capacity for {cfg.stale_after}, title-based summary")
            else:
                stats.deferred += 1
                continue
        t0 = time.monotonic()
        try:
            status = process_one(doc, cat, repo, llm, cfg, extract_llm, force_template, rules)
        except LLMUnavailableError as e:
            ai_down = True
            stats.deferred += 1
            stats.notes.append(f"AI unavailable, stopping AI work for this run: {e}")
            continue
        except Exception as e:  # noqa: BLE001 - one bad document must not stop the run
            repo.set_document_status(doc.id, "failed")
            stats.failed += 1
            stats.notes.append(f"doc {doc.id} ({doc.title[:60]}): {type(e).__name__}: {e}")
            continue
        stats.seconds["ai" if needs_ai else "no_ai"] += round(time.monotonic() - t0, 1)
        ai_used += needs_ai
        stats.processed += 1
        stats.needs_review += status == "needs_review"
        stats.by_category[cat.name] += 1
    return stats


def resummarise_items(item_ids: list[int], repo: Repository, llm: LLMProvider, cfg: ProcessConfig) -> ProcessStats:
    """Rewrite the summaries of these items from their stored, already verified facts (no new
    extraction): used after a summary prompt or style change. Hidden and duplicate items are
    left alone, so a rewrite never brings back something an admin hid."""
    stats = ProcessStats()
    for item_id in item_ids:
        item = repo.get_item(item_id)
        doc = repo.get_document(item.document_id) if item else None
        if not item or not doc or item.category not in CATEGORIES:
            stats.notes.append(f"item {item_id}: not found")
            continue
        if item.review_status in ("hidden", "duplicate"):
            stats.notes.append(f"item {item_id}: {item.review_status}, left alone")
            continue
        t0 = time.monotonic()
        try:
            status = process_one(doc, CATEGORIES[item.category], repo, llm, cfg, known=stored_facts(item.facts))
        except LLMUnavailableError as e:
            stats.deferred += 1
            stats.notes.append(f"AI unavailable, stopped: {e}")
            break
        stats.seconds["ai"] += round(time.monotonic() - t0, 1)
        stats.processed += 1
        stats.needs_review += status == "needs_review"
        stats.by_category[item.category] += 1
    return stats
