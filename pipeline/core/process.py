"""Process: classify -> extract facts -> summarise EN + UR -> quality gate -> store.

Anything that fails the gate after one retry is stored as needs_review: not shown
on the website and never posted, until an admin approves or fixes it.
"""
from __future__ import annotations

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
from pipeline.core.extract import Extraction, extract
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


@dataclass
class ProcessConfig:
    prompts: dict[str, str]  # "classify" | "extract" | "summarise" -> template text
    versions: dict[str, str]  # same keys -> e.g. "extract_v1"
    glossary: dict[str, str]
    max_ai_docs: int = 25  # per run, to stay inside free-tier limits; the rest wait for the next run
    stale_after: timedelta = timedelta(hours=24)  # then publish a title-based summary instead of waiting


@dataclass
class ProcessStats:
    processed: int = 0
    needs_review: int = 0
    failed: int = 0
    deferred: int = 0  # left for the next run (AI budget or AI unavailable)
    by_category: Counter = field(default_factory=Counter)
    notes: list[str] = field(default_factory=list)


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


def _facts_json(facts: Facts, notes: list[str]) -> dict:
    data = facts.model_dump(mode="json", exclude_none=True, exclude_defaults=True)
    if notes:
        data["review_notes"] = notes
    return data


def process_one(doc: Document, cat: Category, repo: Repository, llm: LLMProvider, cfg: ProcessConfig,
                extract_llm: LLMProvider | None = None, force_template: bool = False) -> str:
    """Returns the review_status given to the item. force_template: no AI (used for stale items)."""
    extract_llm = extract_llm or llm
    assert doc.id is not None
    company = repo.get_company(doc.symbol) if doc.symbol else None
    name = company.name if company else None
    label = f"{name} ({doc.symbol})" if name else (doc.symbol or "none (general news)")
    face_value = company.face_value if company and company.face_value_confirmed else None
    text = doc.text or doc.title
    facts, notes, confidence = Facts(), [], None
    summary: BilingualSummary
    model, version = "template", TEMPLATE_VERSION

    if cat.handling == "template" or force_template:
        fallback = "other_corporate" if source_kind(doc.source_id) == "company" else "other_news"
        summary = summarise_template(cat.name if cat.name in TEMPLATES else fallback,
                                     symbol=doc.symbol, name=name, title=doc.title)
    else:
        ext: Extraction = extract(
            extract_llm, cfg.prompts["extract"], title=doc.title, company=label, category=cat.name, text=text,
            handling=cat.handling, face_value=face_value, document_id=doc.id,
        )
        facts, confidence = ext.facts, ext.confidence
        notes += [p for p in ext.problems if p.startswith("dividend:")]  # inconsistencies need a human
        if ext.confirm_face_value and doc.symbol:
            repo.confirm_face_value(doc.symbol, ext.confirm_face_value)
        facts_model = extract_llm.last_model
        if cat.handling == "dates":
            summary = summarise_dates(cat.name, facts, symbol=doc.symbol, name=name, title=doc.title) \
                or summarise_template(cat.name, symbol=doc.symbol, name=name, title=doc.title)
            model, version = f"template; facts by {facts_model}", f"{TEMPLATE_VERSION}+{cfg.versions['extract']}"
        elif not facts.figures() and not facts.key_points:
            notes.append("no facts could be verified against the document")
            summary = summarise_template("other_corporate", symbol=doc.symbol, name=name, title=doc.title)
            model, version = f"template; facts by {facts_model}", f"{TEMPLATE_VERSION}+{cfg.versions['extract']}"
        else:
            sources = [doc.title, name or ""]
            summary = summarise_llm(llm, cfg.prompts["summarise"], company=label, category=cat.name, facts=facts,
                                    glossary=cfg.glossary, document_id=doc.id)
            check = gate(summary.as_pairs(), facts, sources)
            if not check.ok:  # one retry, telling the model exactly what was wrong
                summary = summarise_llm(llm, cfg.prompts["summarise"], company=label, category=cat.name,
                                        facts=facts, glossary=cfg.glossary, document_id=doc.id,
                                        feedback="\n".join(f"- {p}" for p in check.problems))
                check = gate(summary.as_pairs(), facts, sources)
                notes += check.problems
            model, version = llm.last_model, cfg.versions["summarise"]

    final = gate(summary.as_pairs(), facts, [doc.title, name or ""])
    notes += [p for p in final.problems if p not in notes]
    review_status = "needs_review" if notes else "auto"

    item_id = repo.save_item(Item(
        document_id=doc.id, symbol=doc.symbol, category=cat.name, importance=cat.importance,
        facts=_facts_json(facts, notes), confidence=confidence, review_status=review_status,
    ))
    for lang, (headline, body) in summary.as_pairs().items():
        repo.save_summary(Summary(item_id=item_id, lang=lang, headline=headline, body=body,
                                  model=model, prompt_version=version))
    repo.set_document_status(doc.id, "processed")
    return review_status


def process_documents(docs: list[Document], repo: Repository, llm: LLMProvider, cfg: ProcessConfig,
                      extract_llm: LLMProvider | None = None, now: datetime | None = None) -> ProcessStats:
    stats = ProcessStats()
    now = now or datetime.now(UTC)
    if not docs:
        return stats
    categories = classify_all(docs, llm, cfg)
    # Fixed-sentence items first (free), then AI items, most important first.
    ordered = sorted(docs, key=lambda d: (categories[d.id].handling != "template", -categories[d.id].importance))
    ai_used = 0
    ai_down = False
    for doc in ordered:
        cat = categories[doc.id]
        needs_ai = cat.handling != "template"
        force_template = False
        if needs_ai and (ai_down or ai_used >= cfg.max_ai_docs):
            if doc.first_seen_at and now - doc.first_seen_at > cfg.stale_after:
                force_template, needs_ai = True, False  # waited too long for AI: publish from the title
                stats.notes.append(f"doc {doc.id}: no AI capacity for {cfg.stale_after}, title-based summary")
            else:
                stats.deferred += 1
                continue
        try:
            status = process_one(doc, cat, repo, llm, cfg, extract_llm, force_template)
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
        ai_used += needs_ai
        stats.processed += 1
        stats.needs_review += status == "needs_review"
        stats.by_category[cat.name] += 1
    return stats
