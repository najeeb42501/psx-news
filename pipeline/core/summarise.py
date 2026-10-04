"""EN + UR summaries, always written from verified facts (Part 2.6).

Three ways, chosen by the item's category (see classify.py):
  llm      - the model writes from the verified facts JSON (never from raw text)
  dates    - code fills fixed sentences with verified dates
  template - code fills fixed sentences from the title
Fixed sentences carry no numbers of their own, so they cannot be wrong.
"""
from __future__ import annotations

import json
import re
from datetime import date

from pydantic import BaseModel, Field

from pipeline.core.facts import Facts
from pipeline.core.interfaces import LLMProvider

TEMPLATE_VERSION = "template_v2"  # v2: modern Urdu with English terms (reviewer, 2026-10-04)

MONTHS_UR = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"]
PERIOD_EN = {"year": "year", "half_year": "half year", "quarter": "quarter", "nine_months": "nine months"}
PERIOD_UR = {"year": "سال", "half_year": "ہاف ایئر", "quarter": "کوارٹر", "nine_months": "نو ماہ"}
# Urdu grammatical gender of each period word: "ختم ہونے والے سال", "ختم ہونے والے کوارٹر".
PERIOD_UR_ENDING = {"year": "والے", "half_year": "والے", "quarter": "والے", "nine_months": "والے"}
MEETING_EN = {"board": "board meeting", "agm": "annual general meeting", "eogm": "extraordinary general meeting",
              "briefing": "corporate briefing session"}
MEETING_UR = {"board": "بورڈ میٹنگ", "agm": "AGM", "eogm": "EOGM", "briefing": "کارپوریٹ بریفنگ"}  # all feminine
CATEGORY_MEETING = {"board_meeting": "board", "agm": "agm", "corporate_briefing": "briefing"}


class LangSummary(BaseModel):
    headline: str = Field(min_length=1)
    body: str = Field(min_length=1)


class BilingualSummary(BaseModel):
    en: LangSummary
    ur: LangSummary

    def as_pairs(self) -> dict[str, tuple[str, str]]:
        return {"en": (self.en.headline, self.en.body), "ur": (self.ur.headline, self.ur.body)}


def d_en(d: date) -> str:
    return f"{d.day} {d.strftime('%b')} {d.year}"


def d_ur(d: date) -> str:
    return f"{d.day} {MONTHS_UR[d.month - 1]} {d.year}"


def _clip(text: str, limit: int = 90) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


# --- LLM summaries ------------------------------------------------------------

def facts_for_prompt(facts: Facts) -> str:
    """Verified facts without the quotes (saves tokens; quotes were already checked)."""
    data = facts.model_dump(mode="json", exclude_none=True, exclude_defaults=True)

    def strip(v):
        if isinstance(v, dict):
            return {k: strip(x) for k, x in v.items() if k not in ("quote", "computed")}
        if isinstance(v, list):
            return [strip(x) for x in v]
        return v

    return json.dumps(strip(data), ensure_ascii=False, indent=1)


FEEDBACK = """
Your previous answer was rejected by our fact checker. Problems found:
{problems}
How to fix it: rewrite only what is wrong. Every number must appear in the facts above, written with
the same precision: if the facts say "December 2027", write "December 2027", never a full date.
"170k" may be written "170,000". If a number cannot be supported by the facts, leave it out.
"""


def build_summarise_prompt(template: str, *, company: str, category: str, facts: Facts,
                           glossary: dict[str, str], feedback: str = "") -> str:
    terms = "\n".join(f"  {en} = {ur}" for en, ur in glossary.items())
    return (
        template.replace("{{company}}", company)
        .replace("{{category}}", category)
        .replace("{{facts}}", facts_for_prompt(facts))
        .replace("{{glossary}}", terms)
        .replace("{{feedback}}", FEEDBACK.format(problems=feedback) if feedback else "")
    )


def summarise_llm(llm: LLMProvider, template: str, *, company: str, category: str, facts: Facts,
                  glossary: dict[str, str], feedback: str = "", document_id: int | None = None) -> BilingualSummary:
    prompt = build_summarise_prompt(template, company=company, category=category, facts=facts,
                                    glossary=glossary, feedback=feedback)
    result = llm.complete_json(prompt, BilingualSummary, purpose="summarise", document_id=document_id)
    assert isinstance(result, BilingualSummary)
    return tidy(result)


# "325.0 million" -> "325 million", "Rs 2.00" -> "Rs 2": the same value, written as an editor would.
_POINT_ZERO = re.compile(r"(?<![\d.])(\d[\d,]*)\.0+(?!\d)")


def _tidy(text: str) -> str:
    return re.sub(r"[ \t]{2,}", " ", _POINT_ZERO.sub(r"\1", text)).strip()


def tidy(s: BilingualSummary) -> BilingualSummary:
    """Mechanical copy-editing that never changes a value."""
    return BilingualSummary(
        en=LangSummary(headline=_tidy(s.en.headline), body=_tidy(s.en.body)),
        ur=LangSummary(headline=_tidy(s.ur.headline), body=_tidy(s.ur.body)),
    )


# --- fixed-sentence summaries -------------------------------------------------

def _co(symbol: str | None, name: str | None) -> tuple[str, str]:
    """(short label for headlines, full label for bodies)."""
    if symbol and name and name != symbol:
        return symbol, f"{name} ({symbol})"
    return (symbol or name or "Company"), (symbol or name or "The company")


def summarise_dates(category: str, facts: Facts, *, symbol: str | None, name: str | None,
                    title: str) -> BilingualSummary | None:
    """Board meetings, AGMs, briefings, book closures. None if the needed date is missing."""
    short, full = _co(symbol, name)
    bc_from, bc_to = facts.book_closure_from, facts.book_closure_to
    closure_en = closure_ur = span_en = span_ur = ""
    if bc_from and bc_to:
        if bc_from.value == bc_to.value:  # one-day closure
            span_en, span_ur = f"on {d_en(bc_from.value)}", f"{d_ur(bc_from.value)} کو"
            closure_en = f" Share transfer books will be closed {span_en}."
            closure_ur = f" بک کلوژر {span_ur} ہوگی۔"
        else:
            span_en = f"{d_en(bc_from.value)} to {d_en(bc_to.value)}"
            span_ur = f"{d_ur(bc_from.value)} سے {d_ur(bc_to.value)} تک"
            closure_en = f" Share transfer books will be closed from {span_en}."
            closure_ur = f" بک کلوژر {span_ur} ہوگی۔"

    if category == "book_closure":
        if not (bc_from and bc_to):
            return None
        return BilingualSummary(
            en=LangSummary(headline=_clip(f"{short}: book closure {span_en}"),
                           body=f"{full} has announced book closure.{closure_en}"),
            ur=LangSummary(headline=_clip(f"{short}: بک کلوژر {span_ur}"),
                           body=f"{full} نے بک کلوژر کا اعلان کیا ہے۔{closure_ur}"),
        )

    kind = facts.meeting_kind or CATEGORY_MEETING.get(category)
    md = facts.meeting_date
    if not (kind and md):
        return None
    time = (facts.meeting_time or "").strip().rstrip(".")  # "11.30 A.M." -> no double full stop
    at_en = f" at {time}" if time else ""
    purpose_en = purpose_ur = ""
    if kind == "board" and facts.period_kind and facts.period_end:
        pe, pk = facts.period_end.value, facts.period_kind
        purpose_en = f" to consider the financial results for the {PERIOD_EN[pk]} ended {d_en(pe)}"
        purpose_ur = (f"، جس میں {d_ur(pe)} کو ختم ہونے {PERIOD_UR_ENDING[pk]} {PERIOD_UR[pk]}"
                      " کے فنانشل رزلٹس پر غور کیا جائے گا")
    meeting_en, meeting_ur = MEETING_EN[kind], MEETING_UR[kind]
    return BilingualSummary(
        en=LangSummary(headline=_clip(f"{short}: {meeting_en} on {d_en(md.value)}"),
                       body=f"{full} will hold its {meeting_en} on {d_en(md.value)}{at_en}{purpose_en}.{closure_en}"),
        ur=LangSummary(headline=_clip(f"{short}: {meeting_ur} {d_ur(md.value)} کو"),
                       body=f"{full} کی {meeting_ur} {d_ur(md.value)} کو ہوگی{purpose_ur}۔{closure_ur}"),
    )


# category -> (EN headline, EN body, UR headline, UR body); {short}/{full}/{title} are filled in.
TEMPLATES: dict[str, tuple[str, str, str, str]] = {
    "board_meeting_in_progress": (
        "{short}: board meeting in progress",
        "{full} has informed PSX that its board meeting is in progress.",
        "{short}: بورڈ میٹنگ جاری",
        "{full} نے PSX کو بتایا ہے کہ اس کی بورڈ میٹنگ جاری ہے۔"),
    "dividend_payment": (
        "{short}: cash dividend paid to shareholders",
        "{full} has informed PSX about the payment of its cash dividend to shareholders.",
        "{short}: شیئر ہولڈرز کو کیش ڈیویڈنڈ کی ادائیگی",
        "{full} نے شیئر ہولڈرز کو کیش ڈیویڈنڈ کی ادائیگی کے بارے میں PSX کو آگاہ کیا ہے۔"),
    "annual_report": (
        "{short}: annual report published",
        "{full} has sent its annual report to PSX.",
        "{short}: سالانہ رپورٹ جاری",
        "{full} نے اپنی سالانہ رپورٹ PSX کو بھیج دی ہے۔"),
    "progress_report": (
        "{short}: quarterly progress report",
        "{full} has sent its quarterly progress report to PSX.",
        "{short}: کوارٹرلی پروگریس رپورٹ",
        "{full} نے اپنی کوارٹرلی پروگریس رپورٹ PSX کو بھیج دی ہے۔"),
    "agm_extension": (
        "{short}: applied for more time to hold AGM",
        "{full} has applied for an extension of time to hold its annual general meeting.",
        "{short}: AGM کے لیے مزید وقت کی درخواست",
        "{full} نے AGM کے لیے مزید وقت کی درخواست دی ہے۔"),
    "resolutions": (
        "{short}: shareholder resolutions filed",
        "{full} has filed resolutions passed by its shareholders with PSX.",
        "{short}: شیئر ہولڈرز کی منظور کردہ ریزولوشنز",
        "{full} نے شیئر ہولڈرز کی منظور کردہ ریزولوشنز PSX کو بھیجی ہیں۔"),
    "revoked": (
        "{short}: earlier notice withdrawn",
        "{full} has withdrawn an earlier notice: “{title}”.",
        "{short}: سابقہ نوٹس واپس",
        "{full} نے ایک سابقہ نوٹس واپس لے لیا ہے۔"),
    "disclosure_of_interest": (
        "{short}: director or major shareholder share dealing",
        "{full} has disclosed a change in shareholding by a director, executive or major shareholder.",
        "{short}: ڈائریکٹر یا بڑے شیئر ہولڈر کے شیئرز میں تبدیلی",
        "{full} نے کسی ڈائریکٹر، ایگزیکٹو یا بڑے شیئر ہولڈر کے شیئرز میں تبدیلی کی اطلاع دی ہے۔"),
    "director_change": (
        "{short}: change in board or management",
        "{full} has announced: “{title}”.",
        "{short}: بورڈ یا انتظامیہ میں تبدیلی",
        "{full} نے بورڈ یا انتظامیہ میں تبدیلی کا اعلان کیا ہے۔"),
    "shariah": (
        "{short}: Shariah compliance update",
        "{full} has shared an update on its Shariah compliance: “{title}”.",
        "{short}: شریعہ کمپلائنس سے متعلق اطلاع",
        "{full} نے شریعہ کمپلائنس سے متعلق اطلاع دی ہے۔"),
    "buyback": (
        "{short}: share buy-back update",
        "{full} has reported on shares bought back under its buy-back programme.",
        "{short}: شیئرز بائی بیک کی رپورٹ",
        "{full} نے بائی بیک پروگرام کے تحت واپس خریدے گئے شیئرز کی رپورٹ دی ہے۔"),
    "clarification": (
        "{short} issues a clarification",
        "{full} has issued a clarification: “{title}”.",
        "{short} کی وضاحت",
        "{full} نے ایک وضاحت جاری کی ہے۔"),
    "other_corporate": (
        "{short}: {title}",
        "{full} has made an announcement on PSX: “{title}”.",
        "{short}: PSX پر اعلان",
        "{full} نے PSX پر ایک اعلان کیا ہے۔"),
    "fund_distribution": (
        "{short}: daily dividend distribution",
        "{title}.",
        "{short}: روزانہ منافع کی تقسیم",
        "{full} نے روزانہ منافع کی تقسیم کا اعلان کیا ہے۔"),
    "share_certificate_loss": (
        "PSX notice: lost share certificates",
        "{title}.",
        "PSX: گمشدہ شیئر سرٹیفکیٹس کا نوٹس",
        "PSX نے گمشدہ شیئر سرٹیفکیٹس سے متعلق نوٹس جاری کیا ہے۔"),
    "psx_unusual_movement": (
        "PSX notice on unusual {what} movement in {short}",
        "Pakistan Stock Exchange has issued a notice about unusual movement in the {what} of {full} shares.",
        "{short}: شیئرز کی {what_ur} میں غیر معمولی تبدیلی پر نوٹس",
        "PSX نے {full} کے شیئرز کی {what_ur} میں غیر معمولی تبدیلی پر نوٹس جاری کیا ہے۔"),
    "psx_risk_warning": (
        "PSX issues a risk warning alert",
        "Pakistan Stock Exchange has issued a risk warning alert: “{title}”.",
        "PSX کا رسک وارننگ الرٹ",
        "PSX نے رسک وارننگ الرٹ جاری کیا ہے۔"),
    "psx_listing_action": (
        "PSX notice: {title}",
        "Pakistan Stock Exchange has issued a notice: “{title}”.",
        "PSX کا نوٹس",
        "PSX نے لسٹنگ سے متعلق نوٹس جاری کیا ہے۔"),
    "psx_trading_suspension": (
        "PSX notice: {title}",
        "Pakistan Stock Exchange has issued a notice: “{title}”.",
        "PSX: ٹریڈنگ سے متعلق نوٹس",
        "PSX نے ٹریڈنگ کی معطلی یا بحالی سے متعلق نوٹس جاری کیا ہے۔"),
    "psx_notice": (
        "PSX notice: {title}",
        "Pakistan Stock Exchange has issued a notice: “{title}”.",
        "PSX کا نوٹس",
        "PSX نے ایک نوٹس جاری کیا ہے۔"),
    "secp_notice": (
        "SECP notice: {title}",
        "The Securities and Exchange Commission of Pakistan has issued a notice: “{title}”.",
        "SECP کا نوٹس",
        "SECP نے ایک نوٹس جاری کیا ہے۔"),
    "other_news": (
        "{title}",
        "Read the full story at the source.",
        "کاروباری خبر",
        "مکمل خبر اصل ذریعے پر پڑھیں۔"),
    # Fallbacks for "dates" categories when the date could not be verified.
    "board_meeting": (
        "{short}: board meeting notice",
        "{full} has announced a board meeting: “{title}”.",
        "{short}: بورڈ میٹنگ کا نوٹس",
        "{full} نے بورڈ میٹنگ کا اعلان کیا ہے۔"),
    "agm": (
        "{short}: general meeting notice",
        "{full} has issued a notice for a general meeting of shareholders.",
        "{short}: جنرل میٹنگ کا نوٹس",
        "{full} نے شیئر ہولڈرز کی جنرل میٹنگ کا نوٹس جاری کیا ہے۔"),
    "book_closure": (
        "{short}: book closure notice",
        "{full} has issued a book closure notice: “{title}”.",
        "{short}: بک کلوژر کا نوٹس",
        "{full} نے بک کلوژر کا نوٹس جاری کیا ہے۔"),
    "corporate_briefing": (
        "{short}: corporate briefing session",
        "{full} has announced a corporate briefing session for investors.",
        "{short}: کارپوریٹ بریفنگ",
        "{full} نے انویسٹرز کے لیے کارپوریٹ بریفنگ کا اعلان کیا ہے۔"),
}


def summarise_template(category: str, *, symbol: str | None, name: str | None, title: str) -> BilingualSummary:
    short, full = _co(symbol, name)
    tpl = TEMPLATES.get(category, TEMPLATES["other_corporate"])
    price = "price" in title.lower()
    fill = {
        "short": short, "full": full, "title": title.strip().rstrip("."),
        "what": "price" if price else "trading volume",
        "what_ur": "قیمت" if price else "ٹریڈنگ والیوم",
    }
    en_h, en_b, ur_h, ur_b = (t.format(**fill) for t in tpl)
    return BilingualSummary(en=LangSummary(headline=_clip(en_h), body=en_b),
                            ur=LangSummary(headline=_clip(ur_h), body=ur_b))
