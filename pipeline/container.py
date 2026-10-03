"""Composition root: picks one adapter per interface from settings.

Only this module may import concrete adapters. Adapters are registered here as
they are built in later phases.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property

from pipeline.config.settings import Settings, load_settings
from pipeline.core.interfaces import Publisher, Repository, Source


@dataclass
class Container:
    settings: Settings
    sources: list[Source] = field(default_factory=list)
    publishers: list[Publisher] = field(default_factory=list)

    @cached_property
    def repo(self) -> Repository:
        """Connects on first use, so jobs that never touch the DB never connect."""
        return build_repository(self.settings)


def build_repository(settings: Settings) -> Repository:
    if settings.repo_adapter == "postgres":
        from pipeline.adapters.repo.postgres import PostgresRepository

        if not settings.database_url:
            raise RuntimeError("DATABASE_URL is not set (see .env.example)")
        return PostgresRepository.from_url(settings.database_url)
    raise ValueError(f"Unknown REPO_ADAPTER: {settings.repo_adapter!r}")


def build_container(settings: Settings | None = None) -> Container:
    return Container(settings=settings or load_settings())
