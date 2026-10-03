"""Composition root: picks one adapter per interface from settings.

Only this module may import concrete adapters. Adapters are registered here as
they are built in later phases.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from pipeline.config.settings import Settings, load_settings
from pipeline.core.interfaces import Publisher, Repository, Source


@dataclass
class Container:
    settings: Settings
    sources: list[Source] = field(default_factory=list)
    publishers: list[Publisher] = field(default_factory=list)
    repo: Repository | None = None


def build_container(settings: Settings | None = None) -> Container:
    return Container(settings=settings or load_settings())
