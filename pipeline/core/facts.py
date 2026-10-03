"""Facts JSON extracted from a filing or news item (Part 2.6).

Every number and date carries the exact quote it came from, so code can check it
against the source text before anything is published.
"""
from __future__ import annotations

from datetime import date
from typing import ClassVar, Literal

from pydantic import BaseModel, Field


class Figure(BaseModel):
    value: float  # negative for losses
    unit: str | None = None  # e.g. "Rs", "Rs million", "Rs billion", "%", "per share"
    quote: str  # exact words from the source containing this number
    computed: bool = False  # set by code (e.g. Rs/share from % x face value), never by the model


class DateFact(BaseModel):
    value: date
    quote: str


class NamedFigure(Figure):
    label: str


class KeyPoint(BaseModel):
    text: str  # short factual statement in plain English
    quote: str  # exact words from the source that say it


PeriodKind = Literal["year", "half_year", "quarter", "nine_months"]


class Facts(BaseModel):
    period: str | None = None  # e.g. "year ended June 30, 2026", as written
    period_kind: PeriodKind | None = None
    period_end: DateFact | None = None
    revenue: Figure | None = None
    profit_after_tax: Figure | None = None
    profit_change_pct: Figure | None = None  # only if the source states it
    eps: Figure | None = None  # Rs per share; negative = loss per share
    dividend_kind: Literal["interim", "final", "special"] | None = None
    cash_dividend_pct: Figure | None = None
    cash_dividend_rs: Figure | None = None  # Rs per share
    bonus_pct: Figure | None = None
    right_pct: Figure | None = None
    right_price_rs: Figure | None = None
    face_value_rs: Figure | None = None  # only if the source states it
    book_closure_from: DateFact | None = None
    book_closure_to: DateFact | None = None
    meeting_kind: Literal["board", "agm", "eogm", "briefing"] | None = None
    meeting_date: DateFact | None = None
    meeting_time: str | None = None
    key_points: list[KeyPoint] = Field(default_factory=list, max_length=3)
    other_figures: list[NamedFigure] = Field(default_factory=list, max_length=6)

    FIGURE_FIELDS: ClassVar[tuple[str, ...]] = (
        "revenue", "profit_after_tax", "profit_change_pct", "eps", "cash_dividend_pct",
        "cash_dividend_rs", "bonus_pct", "right_pct", "right_price_rs", "face_value_rs",
    )
    DATE_FIELDS: ClassVar[tuple[str, ...]] = ("period_end", "book_closure_from", "book_closure_to", "meeting_date")

    def figures(self) -> list[tuple[str, Figure]]:
        out: list[tuple[str, Figure]] = [
            (name, getattr(self, name)) for name in self.FIGURE_FIELDS if getattr(self, name) is not None
        ]
        out += [(f"other:{f.label}", f) for f in self.other_figures]
        return out

    def dates(self) -> list[tuple[str, DateFact]]:
        return [(name, getattr(self, name)) for name in self.DATE_FIELDS if getattr(self, name) is not None]

    def is_empty(self) -> bool:
        return not (self.figures() or self.dates() or self.key_points or self.period)
