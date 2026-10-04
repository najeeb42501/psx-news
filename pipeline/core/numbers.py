"""Number helpers shared by fact verification and the quality gate.

Handles the ways numbers appear in PSX filings and OCR text: thousands commas,
accounting negatives in brackets "(1.25)", "Rs. 10/-", percentages.
"""
from __future__ import annotations

import re

# Eastern Arabic / Urdu digits. Summaries must use Western digits only.
NON_WESTERN_DIGITS = re.compile(r"[٠-٩۰-۹]")

# Optional "(" or a minus sign that is not part of a range like "10-12" or "D-79".
_NUM = re.compile(r"(\()?\s*((?<![\w.])-)?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(\))?")


def parse_numbers(text: str) -> list[float]:
    """All numbers in text. "(1.25)" and "-1.25" count as negative (accounting style)."""
    out: list[float] = []
    for m in _NUM.finditer(text):
        value = float(m.group(3).replace(",", ""))
        if (m.group(1) and m.group(4)) or m.group(2):
            value = -value
        out.append(value)
    return out


def bare_numbers(text: str) -> set[float]:
    """Absolute values of all numbers in text (for 'does this number appear?' checks)."""
    return {abs(v) for v in parse_numbers(text)}


# "170k", "Rs1.5bn", "2.3 million", "Rs5tr": a number with a scale word or suffix.
_SCALED = re.compile(
    r"(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k|thousand|m|mn|million|b|bn|billion|tr|trillion|crore|lakh)\b",
    re.IGNORECASE,
)
_SCALE = {"k": 1e3, "thousand": 1e3, "m": 1e6, "mn": 1e6, "million": 1e6, "b": 1e9, "bn": 1e9,
          "billion": 1e9, "tr": 1e12, "trillion": 1e12, "crore": 1e7, "lakh": 1e5}


def source_numbers(text: str) -> set[float]:
    """Numbers a summary may take from this source text: as written, and for scaled ones
    ("170k", "Rs1.5bn") the full value and its thousand/million/billion forms, so
    "170k" may be written "170,000" and "Rs1.5bn" may be written "Rs 1,500 million"."""
    out = bare_numbers(text)
    for m in _SCALED.finditer(text):
        full = float(m.group(1).replace(",", "")) * _SCALE[m.group(2).lower()]
        for div in (1, 1e3, 1e6, 1e9, 1e12):
            out |= variants(full / div)
    return out


def squash(text: str) -> str:
    """Lowercase, drop all whitespace and normalise quotes/dashes, so OCR spacing
    ('C ordoba', 'P SX') does not break exact-quote matching."""
    table = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", " ": " "})
    return re.sub(r"\s+", "", text.translate(table).lower())


def same(a: float, b: float) -> bool:
    return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b))


def variants(value: float) -> set[float]:
    """Ways a summary may legitimately write a fact value: exact or rounded to 0-2 decimals."""
    v = abs(value)
    return {v, round(v), round(v, 1), round(v, 2)}
