"""Runtime settings, read from environment variables (or a local .env file).

Swapping a vendor should only ever need a change here or in .env.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

BRAND_NAME = "ShareKhabar"
DEFAULT_CONTACT_EMAIL = "najeeb08089@gmail.com"


def _load_dotenv(path: Path = ROOT / ".env") -> None:
    """Minimal .env loader; real environment variables always win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    contact_email: str
    repo_adapter: str
    publishers: tuple[str, ...]

    @property
    def user_agent(self) -> str:
        return f"{BRAND_NAME}Bot/0.1 (+mailto:{self.contact_email})"


def load_settings() -> Settings:
    _load_dotenv()
    return Settings(
        database_url=os.environ.get("DATABASE_URL"),
        contact_email=os.environ.get("CONTACT_EMAIL") or DEFAULT_CONTACT_EMAIL,
        repo_adapter=os.environ.get("REPO_ADAPTER", "postgres"),
        publishers=tuple(
            p.strip() for p in os.environ.get("PUBLISHERS", "whatsapp_queue").split(",") if p.strip()
        ),
    )
