"""Classify documents: title rules first, LLM only for leftovers (Part 2.6).

Each category fixes the item's importance and how its summary is written:
  template - fixed EN/UR sentences from the title (routine items; no AI)
  dates    - AI extracts dates only; code writes the summary from those dates
  llm      - AI extracts facts; AI writes the summary from the verified facts
Importance: 0 = stored but kept out of the main feed, 1 = routine, 2 = notable,
3 = post-worthy (results, dividends, bonus/right shares, material information,
policy rate, petrol price, budget).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

Handling = Literal["template", "dates", "llm"]


@dataclass(frozen=True)
class Category:
    name: str
    importance: int
    handling: Handling


CATEGORIES: dict[str, Category] = {c.name: c for c in [
    # company announcements
    Category("results", 3, "llm"),
    Category("dividend", 3, "llm"),
    Category("bonus", 3, "llm"),
    Category("right_shares", 3, "llm"),
    Category("material_info", 3, "llm"),
    Category("board_meeting", 2, "dates"),
    Category("book_closure", 2, "dates"),
    Category("agm", 2, "dates"),
    Category("corporate_briefing", 1, "dates"),
    Category("buyback", 2, "template"),
    Category("clarification", 2, "template"),
    Category("board_meeting_in_progress", 1, "template"),
    Category("dividend_payment", 1, "template"),
    Category("annual_report", 1, "template"),
    Category("progress_report", 1, "template"),
    Category("agm_extension", 1, "template"),
    Category("resolutions", 1, "template"),
    Category("revoked", 1, "template"),
    Category("disclosure_of_interest", 1, "template"),
    Category("director_change", 1, "template"),
    Category("shariah", 1, "template"),
    Category("other_corporate", 1, "template"),
    Category("fund_distribution", 0, "template"),  # mutual-fund daily dividends: fund page only
    Category("share_certificate_loss", 0, "template"),
    # PSX / SECP notices: the title is the content
    Category("psx_unusual_movement", 2, "template"),
    Category("psx_risk_warning", 2, "template"),
    Category("psx_listing_action", 2, "template"),
    Category("psx_trading_suspension", 1, "template"),
    Category("psx_notice", 1, "template"),
    Category("secp_notice", 1, "template"),
    # news
    Category("macro_key", 3, "llm"),  # policy rate, petrol price, budget
    Category("macro", 2, "llm"),
    Category("sector", 2, "llm"),
    Category("other_news", 0, "template"),  # not market-relevant: kept out of the feed
]}

# Categories the LLM may choose for leftovers, by source kind.
LLM_CHOICES = {
    "company": ["results", "dividend", "bonus", "right_shares", "material_info", "board_meeting",
                "book_closure", "agm", "corporate_briefing", "buyback", "clarification",
                "director_change", "other_corporate"],
    "news": ["macro", "sector", "other_news"],
}


def _rules(pairs: list[tuple[str, str]]) -> list[tuple[re.Pattern[str], str]]:
    return [(re.compile(p, re.IGNORECASE), c) for p, c in pairs]


# Order matters: first match wins.
COMPANY_RULES = _rules([
    (r"daily dividend distribution", "fund_distribution"),
    (r"loss of share certificate", "share_certificate_loss"),
    (r"\brevoked\b", "revoked"),
    (r"board meeting in progress", "board_meeting_in_progress"),
    (r"board meeting|closed period", "board_meeting"),
    (r"transmission of annual|annual report|annual (financial statements|accounts)", "annual_report"),
    (r"progress report", "progress_report"),
    (r"financial results|(quarterly|half[- ]yearly|interim) (results|accounts)", "results"),
    (r"(credit|payment|disbursement|dispatch) of .*dividend", "dividend_payment"),
    (r"book closure", "book_closure"),
    (r"\bbonus\b", "bonus"),
    (r"\bright[s]?\b.*\b(issue|shares?|offer|subscription)\b|unpaid rights", "right_shares"),
    (r"\bdividend\b", "dividend"),
    (r"material information|price[- ]sensitive", "material_info"),
    (r"extension.*(\bagm\b|annual general meeting)", "agm_extension"),
    (r"resolution", "resolutions"),
    (r"annual general meeting|extraordinary general meeting|\b(agm|eogm)\b|general meetings?", "agm"),
    (r"briefing session|corporate briefing", "corporate_briefing"),
    (r"disclosure of interest|substantial shareholder", "disclosure_of_interest"),
    (r"appointment|resignation|change in the board|election of directors|chief (executive|financial)"
     r"|\bc[ef]o\b|company secretary|independent director", "director_change"),
    (r"buy-?back", "buyback"),
    (r"shariah", "shariah"),
    (r"clarification", "clarification"),
])

NOTICE_RULES = _rules([
    (r"loss of share certificate", "share_certificate_loss"),
    (r"unusual movement", "psx_unusual_movement"),
    (r"risk warning alert|\brwa\b", "psx_risk_warning"),
    (r"defaulter|default segment|delist|non-compliant segment", "psx_listing_action"),
    (r"(suspension|resumption) of trading", "psx_trading_suspension"),
])

NEWS_RULES = _rules([
    # Foreign markets with no PSX link ("Bond yields, AI spending threaten US stocks"): not for this feed.
    (r"\b(us|u\.s\.|american|wall street|dow|nasdaq|s&p|european|asian|chinese|japanese|indian|global|world)"
     r"\s+(stocks?|shares|equities|stock markets?|bourses?|indices)\b|\bwall street\b", "other_news"),
    (r"policy rate|interest rate|monetary policy", "macro_key"),
    (r"(petrol|petroleum|diesel|fuel|hsd)\b.*\bprices?|prices? of (petrol|petroleum|diesel|fuel)", "macro_key"),
    (r"\bbudget\b", "macro_key"),
    (r"\b(sbp|state bank|imf|inflation|cpi|spi|rupee|dollar|exchange rate|reserves|remittances"
     r"|current account|trade deficit|exports?|imports?|fbr|tax(es|ation)?|gdp|growth|t-bills?|pibs?"
     r"|sukuk|eurobond|external debt|fiscal|circular debt|ogra|nepra)\b", "macro"),
    (r"\b(psx|kse|kse-100|stocks?|shares|equities|bourse|index|cement|banks?|banking|fertili[sz]ers?"
     r"|autos?|automobiles?|cars?|textiles?|steel|oil|gas|power|electricity|ipps?|pharma\w*"
     r"|refiner(y|ies)|telecom|ipo|listed|earnings|dividend)\b", "sector"),
])


def source_kind(source_id: str) -> Literal["company", "notice", "news"]:
    if source_id == "psx_companies":
        return "company"
    if source_id in ("psx_notices", "secp_notices"):
        return "notice"
    return "news"


def classify_by_rules(title: str, source_id: str) -> Category | None:
    """Category from title rules, or None if the LLM should decide."""
    kind = source_kind(source_id)
    if kind == "notice":
        for pattern, name in NOTICE_RULES:
            if pattern.search(title):
                return CATEGORIES[name]
        return CATEGORIES["secp_notice" if source_id == "secp_notices" else "psx_notice"]
    rules = COMPANY_RULES if kind == "company" else NEWS_RULES
    for pattern, name in rules:
        if pattern.search(title):
            return CATEGORIES[name]
    return None


def fallback_category(source_id: str) -> Category:
    """Used when the LLM is unavailable or answers with something unknown."""
    return CATEGORIES["other_corporate" if source_kind(source_id) == "company" else "other_news"]


def build_classify_prompt(template: str, leftovers: list[tuple[int, str, str]]) -> str:
    """leftovers: (document id, title, source_id)."""
    lines = [
        f'- id {doc_id} ({source_kind(src)}): "{title}"  choices: {", ".join(LLM_CHOICES[source_kind(src)])}'
        for doc_id, title, src in leftovers
    ]
    return template.replace("{{items}}", "\n".join(lines))
