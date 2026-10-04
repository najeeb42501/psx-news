"""Quality gate (Part 2.6 / 2.7): numbers, banned phrases, length, Urdu digits.

A summary is published only if every number in it comes from the verified facts
(or the item's own title), and it contains no advice or prediction language in
either language.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from pipeline.core.facts import Facts
from pipeline.core.numbers import NON_WESTERN_DIGITS, bare_numbers, parse_numbers, same, source_numbers, variants

HEADLINE_MAX = 90
EXACT_FIELDS = ("eps", "cash_dividend_rs", "right_price_rs", "face_value_rs")
MAX_SENTENCES = 3

# Advice / prediction language. Context-aware so facts like "buy-back", "hold its AGM",
# "sell-off" or "SBP inflation target" are not blocked.
BANNED_EN = [
    r"\b(buy|sell|accumulate)\b(?!-?\s?back|-off|ing)",
    r"\bhold\b(?!\s+(its|the|an|a|their|annual|extraordinary|board|meeting|meetings|agm|eogm))",
    r"\btarget price\b|\bprice target\b|\btarget of rs\b",
    r"\b(shares?|stocks?|share price|stock price|price)\s+(will|may|could|should|is expected to|are expected to)\s+"
    r"(rise|fall|go up|go down|increase|decrease|rally|crash|jump|surge|drop)",
    r"\bshould (buy|sell|invest|consider)\b|\bgood time to (buy|sell|invest)\b",
    r"\b(recommend|recommended|recommendation)s?\b(?!.*\b(dividend|bonus|board)\b)",
    r"\b(undervalued|overvalued|multibagger|guaranteed return|sure profit|must buy)\b",
    r"\btop stocks?\b|\bbest stocks?\b",
]
BANNED_UR = [
    "خریدیں", "بیچیں", "خرید لیں", "بیچ دیں", "فروخت کریں", "سرمایہ کاری کریں",
    "ٹارگٹ پرائس", "ہدف قیمت", "بڑھ جائے گا", "گر جائے گا", "بڑھے گی", "گرے گی",
    "یقینی منافع", "بہترین شیئر",
]
_BANNED_EN_RE = [re.compile(p, re.IGNORECASE) for p in BANNED_EN]
# A sentence ends at . ! ? or ۔ followed by a space or the end, except after initials
# ("D.G. Khan"), common abbreviations (Rs., Ltd., Co., Pvt., No.) or inside numbers (1.25).
_SENTENCE_END = re.compile(
    r"(?<!\b[A-Z])(?<!\bRs)(?<!\bLtd)(?<!\bCo)(?<!\bPvt)(?<!\bNo)[.!?](?=\s|$)|۔"
)


@dataclass
class GateResult:
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def allowed_numbers(facts: Facts, extra_sources: list[str]) -> set[float]:
    """Every number a summary may contain: fact values (exact/rounded, and unit-converted
    thousand/million/billion), date parts, meeting time, and numbers in the title/name."""
    allowed: set[float] = set()
    for name, fig in facts.figures():
        v = abs(fig.value)
        if name in EXACT_FIELDS:  # per-share amounts: EPS 0.113 must not become "0.1"
            allowed |= {v, round(v, 2)}
            continue
        allowed |= variants(v)
        unit = (fig.unit or "").lower().replace("‘", "'").replace("’", "'")
        if "'000" in unit or "000s" in unit or "thousand" in unit:
            allowed |= variants(v / 1_000) | variants(v / 1_000_000)
        elif "million" in unit or "mn" in unit:
            allowed |= variants(v / 1_000) | variants(v * 1_000_000)
        elif "billion" in unit or "bn" in unit:
            allowed |= variants(v * 1_000)
        elif v >= 100_000:  # plain rupees: "Rs 277,527,847" may be written "Rs 277.5 million"
            allowed |= variants(v / 1_000_000) | variants(v / 1_000_000_000)
    for _, d in facts.dates():
        allowed |= {float(d.value.day), float(d.value.month), float(d.value.year), float(d.value.year % 100)}
    if facts.meeting_time:
        allowed |= bare_numbers(facts.meeting_time)
    for kp in facts.key_points:  # numbers inside a verified quote are proven to be in the source
        allowed |= source_numbers(kp.quote)
    for src in extra_sources:
        allowed |= source_numbers(src)
    return allowed


def check_summary(lang: str, headline: str, body: str, allowed: set[float], news_source: str | None = None) -> list[str]:
    """news_source: the outlet's name for a news story; its forecasts and claims must be attributed."""
    problems: list[str] = []
    text = f"{headline}\n{body}"
    if not headline.strip() or not body.strip():
        problems.append(f"{lang}: headline and body must not be empty")
    if len(headline) > HEADLINE_MAX:
        problems.append(f"{lang}: headline is {len(headline)} characters (max {HEADLINE_MAX})")
    sentences = [s for s in _SENTENCE_END.split(body) if s.strip()]
    if len(sentences) > MAX_SENTENCES:
        problems.append(f"{lang}: body has {len(sentences)} sentences (max {MAX_SENTENCES})")
    if NON_WESTERN_DIGITS.search(text):
        problems.append(f"{lang}: uses Urdu/Arabic digits; use Western digits 0-9")
    for sentence in re.split(r"(?<=[.!?۔])\s+|\n", text):  # report the sentence, so the fix is obvious
        for n in parse_numbers(_NAME_WITH_DIGITS.sub(" ", sentence)):
            if not any(same(abs(n), a) for a in allowed):
                snippet = sentence.strip() if len(sentence.strip()) <= 120 else sentence.strip()[:119] + "…"
                problem = f"{lang}: number {abs(n):g} is not in the verified facts (in: “{snippet}”)"
                if problem not in problems:
                    problems.append(problem)
    for pattern in _BANNED_EN_RE:
        m = pattern.search(text)
        if m:
            problems.append(f"{lang}: advice/prediction wording not allowed: {m.group(0)!r}")
    for phrase in BANNED_UR:
        if phrase in text:
            problems.append(f"{lang}: advice/prediction wording not allowed: {phrase!r}")
    if lang == "ur":
        mixed = _MIXED_SCRIPT.search(text)
        if mixed:
            problems.append(f"ur: word mixes English and Urdu letters: {mixed.group(0)!r}")
        if re.search(r"\bRs\.?(?=[\s\d])", text):
            problems.append("ur: write روپے instead of 'Rs' in Urdu")
        if _UR_NIL.search(text):
            problems.append("ur: 'نل' means a water tap; write e.g. 'کوئی کیش ڈیویڈنڈ … تجویز نہیں کیے'")
        code = _UR_CODES.search(text)
        if code:
            problems.append(f"ur: write short codes in English letters, not {code.group(0)!r}")
        if _UR_CLOSURE_MASC.search(text):
            problems.append("ur: بک کلوژر is feminine: write 'ہوگی' / 'رہے گی', not 'ہوگا' / 'رہے گا'")
    if news_source:
        for sentence in _sentences(text):
            pattern, attrib = (_FORECAST_UR, _ATTRIB_UR) if lang == "ur" else (_FORECAST_EN, _ATTRIB_EN)
            m = pattern.search(sentence)
            if m and not attrib.search(sentence) and news_source.lower() not in sentence.lower():
                problems.append(f"{lang}: forecast or claim {m.group(0)!r} must say whose it is "
                                f"(e.g. '{news_source} reports…') in: “{sentence.strip()[:100]}”")
    return problems


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?۔])\s+|\n", text) if s.strip()]


# Word edges for Urdu: letters only, so "۔" or "،" right after a word still ends it.
_UR_WORD = "A-Za-z0-9ء-يٱ-ۓەۺ-ۿ"
_UR_NIL = re.compile(rf"(?<![{_UR_WORD}])(نل|NIL|Nil)(?![{_UR_WORD}])")
_UR_CODES = re.compile(r"آئی ایم ایف|ایف بی آر|ایس بی پی|ایس ای سی پی|پی ایس ایکس|ای پی ایس|اے جی ایم|ای او جی ایم|کے ایس ای")
_UR_CLOSURE_MASC = re.compile(rf"بک کلوژر[^۔]*?(ہوگا|ہو گا|رہے گا|شروع ہوگا|کیا جائے گا)(?![{_UR_WORD}])")
# A news summary may report forecasts and claims, but only as someone's words.
_FORECAST_EN = re.compile(
    r"\b(may|might|could|likely|unlikely|expected to|is set to|are set to|poised to|threaten\w*|forecast\w*"
    r"|projected|predict\w*|will (rise|fall|increase|decrease|go up|go down|jump|drop|surge|decline))\b",
    re.IGNORECASE,
)
_ATTRIB_EN = re.compile(
    r"\b(said|says|say|stated|states|told|according to|reports?|reported|warned|warns|expects?|estimates?"
    r"|projects?|believes?|believe|noted|claims?|claimed|announced|analysts?|officials?|sources?)\b",
    re.IGNORECASE,
)
_FORECAST_UR = re.compile(r"امکان|توقع|متوقع|خدشہ|سکتی ہے|سکتی ہیں|سکتا ہے|سکتے ہیں|پیش گوئی")
_ATTRIB_UR = re.compile(r"کے مطابق|نے کہا|کا کہنا|نے بتایا|رپورٹ|خیال ظاہر|کی جانب سے")


# A single word containing both Latin and Arabic-script letters, e.g. "Shaفی".
# Letters only: Urdu punctuation such as "۔" or "،" right after an English name is fine.
_UR_LETTER = "ء-يٱ-ۓەۺ-ۿ"
_MIXED_SCRIPT = re.compile(rf"[A-Za-z]+[{_UR_LETTER}]+|[{_UR_LETTER}]+[A-Za-z]+")

# Digits that are part of a name, not an amount: KSE-100, KMI-30, G7, Q1, H1, FY26.
# Amounts glued to a currency (Rs10, PKR500, USD5) are still checked.
_NAME_WITH_DIGITS = re.compile(r"\b(?!Rs|PKR|USD|US)[A-Z][A-Za-z]{0,3}-?\d{1,3}\b")


def gate(summaries: dict[str, tuple[str, str]], facts: Facts, extra_sources: list[str],
         news_source: str | None = None) -> GateResult:
    """summaries: {"en": (headline, body), "ur": (headline, body)}."""
    allowed = allowed_numbers(facts, extra_sources)
    result = GateResult()
    for lang, (headline, body) in summaries.items():
        result.problems += check_summary(lang, headline, body, allowed, news_source)
    return result
