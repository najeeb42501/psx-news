"""Extract facts with the LLM, then verify every number and date against the source text.

The model is never trusted on its own: a figure survives only if its quote is
found in the document and the number (with the right sign) is inside the quote.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field

from pipeline.core.facts import DateFact, Facts, Figure
from pipeline.core.interfaces import LLMProvider
from pipeline.core.numbers import parse_numbers, same, squash

TEXT_LIMIT = {"llm": 8000, "dates": 3500}  # characters sent to the model; key facts are on the first pages
STANDARD_FACE_VALUES = (1.0, 2.0, 2.5, 5.0, 10.0, 100.0)
LOSS_FIELDS = ("profit_after_tax", "eps")

DATES_FOCUS = (
    "Only fill: period, period_kind, period_end, meeting_kind, meeting_date, meeting_time, "
    "book_closure_from, book_closure_to, key_points. Leave every other field null."
)


@dataclass
class Extraction:
    facts: Facts
    problems: list[str] = field(default_factory=list)  # what was dropped and why
    dropped: int = 0
    kept: int = 0
    confirm_face_value: float | None = None  # learned from this filing; caller stores it

    @property
    def confidence(self) -> float:
        total = self.kept + self.dropped
        return 1.0 if total == 0 else round(self.kept / total, 2)


HEAD_CHARS = {"llm": 2500, "dates": 1500}  # the cover letter: title, dividend, AGM and closure dates
# Rows a reader looks for in a long filing, most important first. Windows around these are sent
# to the model in place of the middle of the document (notes, auditor's report, balance sheet).
KEY_ROWS = [
    re.compile(p, re.IGNORECASE) for p in (
        r"profit(\s*/?\s*\(?\s*loss\)?)?\s*(after\s*tax\w*|for\s*the\s*(year|period))|loss\s*after\s*tax|net\s*profit",
        r"(earnings?|loss)\s*/?\s*\(?\s*(loss|earnings?)?\)?\s*per\s*share",
        r"\b(net\s*)?(sales|revenue|turnover)\b",
        r"dividend|bonus|right\s*shares?",
        r"book\s*closure|share\s*transfer\s*books|annual\s*general\s*meeting|will\s*be\s*held",
    )
]
WINDOW = (600, 900)  # characters before / after a key row


def select_text(text: str, handling: str) -> str:
    """What the model reads. Short filings are sent whole. For long ones (scanned annual
    accounts run to 40,000 characters), send the cover letter plus the passages around the
    key rows, so a results table on page 6 is not cut off. Every passage is verbatim, so
    quotes are still checked against the full text."""
    limit = TEXT_LIMIT.get(handling, 8000)
    if len(text) <= limit:
        return text
    head = HEAD_CHARS.get(handling, 2500)
    spans: list[tuple[int, int, int]] = []  # (priority, start, end)
    for rank, pattern in enumerate(KEY_ROWS):
        for m in pattern.finditer(text, head):
            spans.append((rank, max(head, m.start() - WINDOW[0]), min(len(text), m.end() + WINDOW[1])))
    chosen: list[tuple[int, int]] = []
    budget = limit - head
    for _, start, end in sorted(spans):
        if any(start < e and end > s for s, e in chosen):  # overlaps a passage already chosen
            continue
        if end - start <= budget:
            chosen.append((start, end))
            budget -= end - start
    # Whatever budget is left extends the opening pages; overlapping passages are joined.
    merged: list[list[int]] = []
    for start, end in sorted([(0, head + budget), *chosen]):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return "\n[...]\n".join(text[s:e] for s, e in merged)


def build_extract_prompt(
    template: str, *, title: str, company: str, category: str, text: str, handling: str, feedback: str = ""
) -> str:
    return (
        template.replace("{{title}}", title)
        .replace("{{company}}", company)
        .replace("{{category}}", category)
        .replace("{{focus}}", DATES_FOCUS if handling == "dates" else "")
        .replace("{{feedback}}", f"\nYour previous answer had problems; fix them:\n{feedback}\n" if feedback else "")
        .replace("{{text}}", select_text(text, handling))
    )


def _quote_in_text(quote: str, text_sq: str) -> bool:
    """Exact match after squashing whitespace; else a close match (OCR noise) of >= 85%."""
    q = squash(quote)
    if len(q) < 4:
        return False
    if q in text_sq:
        return True
    # Near-identical window: anchor on each place the quote's first number occurs in the
    # text, then slide a quote-sized window a few characters either way.
    anchor = re.search(r"\d[\d,.]*", q)
    if not anchor:
        return False
    for m in list(re.finditer(re.escape(anchor.group(0)), text_sq))[:50]:
        base = m.start() - anchor.start()
        for shift in range(-6, 7, 2):
            lo = max(0, base + shift)
            if difflib.SequenceMatcher(None, text_sq[lo : lo + len(q)], q).ratio() >= 0.85:
                return True
    return False


# A quote must show what its number is: the row label has to be in it.
LABELS = {
    "revenue": r"revenue|sales|turnover|soles|income",
    "profit_after_tax": r"profit|loss|after tax",
    "eps": r"per share|eps|earning|loss",
    "profit_change_pct": r"profit|earning|increase|decrease|growth|up|down|%",
    "cash_dividend_pct": r"dividend|per share",
    "cash_dividend_rs": r"dividend|per share",
    "bonus_pct": r"bonus",
    "right_pct": r"right",
    "right_price_rs": r"right|price|premium|par",
    "face_value_rs": r"face|par|each|nominal",
}
# Financial-statement rows show the current period first, then the previous one.
STATEMENT_FIELDS = ("revenue", "profit_after_tax", "eps")


# "Profit/(loss)", "(Loss) / Profit", OCR'd "Pr'ofit / (loss)": the label offers both, so it says
# nothing about the sign. Only a label that is purely a loss ("(Loss) after taxation") does.
_PROFIT_WORD = re.compile(r"p\W?r\W?o\W?f\W?i\W?t|earn", re.IGNORECASE)
_LOSS_SLASH = re.compile(r"/\s*\(?\s*loss|loss\s*\)?\s*/", re.IGNORECASE)


def _label_says_only_loss(quote: str) -> bool:
    if not re.search(r"\bloss\b", quote, re.IGNORECASE):
        return False
    return not (_PROFIT_WORD.search(quote) or _LOSS_SLASH.search(quote))


def _is_note_ref(n: float) -> bool:
    return n == int(n) and 0 < n < 100  # "Earnings per share 29 4.25 (17.08)": 29 is a note number


def _check_figure(name: str, fig: Figure, text_sq: str) -> tuple[Figure | None, str | None]:
    if not _quote_in_text(fig.quote, text_sq):
        return None, f"{name}: quote not found in the document: {fig.quote[:80]!r}"
    numbers = parse_numbers(fig.quote)
    matches = [i for i, n in enumerate(numbers) if same(abs(fig.value), abs(n))]
    if not matches:
        return None, f"{name}: value {fig.value} is not in its quote {fig.quote[:80]!r}"
    if name in LABELS and not re.search(LABELS[name], fig.quote, re.IGNORECASE):
        return None, f"{name}: quote {fig.quote[:80]!r} does not show what the number is (no row label)"
    statement_row = name in STATEMENT_FIELDS
    if name.startswith("other:"):
        label_words = [w for w in re.findall(r"[a-z]{4,}", name[6:].lower())]
        if label_words and not any(w in fig.quote.lower() for w in label_words):
            return None, f"{name}: quote {fig.quote[:80]!r} does not show what the number is (no row label)"
        statement_row = bool(re.search(r"rs|rupee|pkr|'000|‘000|thousand|million", (fig.unit or "").lower()))
    i = matches[0]
    if statement_row and any(not _is_note_ref(abs(n)) for n in numbers[:i]):
        return None, f"{name}: {fig.value} looks like the previous-period column in {fig.quote[:80]!r}"
    # Sign comes from the source, not the model: "(1.25)" or "-1.25" around the number itself,
    # or a label that only says loss. "Profit/(loss)" alone says nothing about the sign.
    negative = numbers[i] < 0
    is_loss = negative or (name in LOSS_FIELDS and _label_says_only_loss(fig.quote))
    value = -abs(fig.value) if is_loss else abs(fig.value)
    return fig.model_copy(update={"value": value}), None


def _check_date(name: str, d: DateFact, text_sq: str) -> str | None:
    if not _quote_in_text(d.quote, text_sq):
        return f"{name}: quote not found in the document: {d.quote[:80]!r}"
    if name.startswith("book_closure") and (
        re.search(r"closed\s*period", d.quote, re.IGNORECASE)  # insiders may not trade: not a book closure
        or not re.search(r"book|transfer|register|closure", d.quote, re.IGNORECASE)
    ):
        return f"{name}: quote is not about share transfer book closure: {d.quote[:80]!r}"
    numbers = {abs(n) for n in parse_numbers(d.quote)}
    year_ok = d.value.year in numbers or (d.value.year % 100) in numbers
    if not (d.value.day in numbers and year_ok):
        return f"{name}: date {d.value} does not match its quote {d.quote[:80]!r}"
    return None


def verify(facts: Facts, text: str, face_value: float | None = None) -> Extraction:
    """Drop every figure/date whose quote or value cannot be found in the source text,
    then work out Rs/share for dividends when the face value is known for sure."""
    text_sq = squash(text)
    out = Extraction(facts=facts)
    updates: dict = {}
    for name, fig in facts.figures():
        checked, problem = _check_figure(name, fig, text_sq)
        if problem:
            out.problems.append(problem)
            out.dropped += 1
            if name.startswith("other:"):
                updates.setdefault("other_figures", list(facts.other_figures))
                updates["other_figures"] = [f for f in updates["other_figures"] if f.label != name[6:]]
            else:
                updates[name] = None
        else:
            out.kept += 1
            if checked is not fig and not name.startswith("other:"):
                updates[name] = checked
    for name, d in facts.dates():
        problem = _check_date(name, d, text_sq)
        if problem:
            out.problems.append(problem)
            out.dropped += 1
            updates[name] = None
        else:
            out.kept += 1
    kept_points = []
    for kp in facts.key_points:  # statements need evidence too, not just numbers
        if _quote_in_text(kp.quote, text_sq):
            kept_points.append(kp)
            out.kept += 1
        else:
            out.problems.append(f"key point: quote not found in the document: {kp.quote[:80]!r}")
            out.dropped += 1
    if len(kept_points) != len(facts.key_points):
        updates["key_points"] = kept_points
    # A meeting time is only kept with a verified meeting date, and must appear in the text.
    if facts.meeting_time and ("meeting_date" in updates or not facts.meeting_date
                               or squash(facts.meeting_time) not in text_sq):
        updates["meeting_time"] = None
    clean = facts.model_copy(update=updates)
    out.facts, out.confirm_face_value = _dividend_rs(clean, face_value, out.problems)
    return out


def _dividend_rs(facts: Facts, known_fv: float | None, problems: list[str]) -> tuple[Facts, float | None]:
    pct, rs = facts.cash_dividend_pct, facts.cash_dividend_rs
    fv = facts.face_value_rs.value if facts.face_value_rs else known_fv
    learned = facts.face_value_rs.value if facts.face_value_rs else None
    if pct and rs and not fv:
        inferred = round(rs.value * 100 / pct.value, 4) if pct.value else None
        if inferred and any(same(inferred, s) for s in STANDARD_FACE_VALUES):
            fv = learned = inferred
    if pct and fv and not rs:
        value = round(pct.value * fv / 100, 4)
        computed = Figure(value=value, unit="Rs per share", computed=True,
                          quote=f"computed: {pct.value:g}% of face value Rs {fv:g}")
        return facts.model_copy(update={"cash_dividend_rs": computed}), learned
    if pct and rs and fv and not same(round(pct.value * fv / 100, 4), rs.value):
        problems.append(f"dividend: {pct.value:g}% of face value Rs {fv:g} is not Rs {rs.value:g} per share")
    return facts, learned


def extract(
    llm: LLMProvider, template: str, *, title: str, company: str, category: str, text: str,
    handling: str, face_value: float | None = None, document_id: int | None = None,
) -> Extraction:
    """One extraction; if anything had to be dropped, one retry with the problems listed."""
    def run(feedback: str = "") -> Extraction:
        prompt = build_extract_prompt(template, title=title, company=company, category=category,
                                      text=text, handling=handling, feedback=feedback)
        facts = llm.complete_json(prompt, Facts, purpose="extract", document_id=document_id)
        assert isinstance(facts, Facts)
        return verify(facts, text, face_value)

    first = run()
    if not first.problems:
        return first
    second = run("\n".join(f"- {p}" for p in first.problems))
    return second if (second.kept, -second.dropped) >= (first.kept, -first.dropped) else first
