"""Phase 0 smoke tests: the skeleton imports, and core/ stays vendor-free."""
from __future__ import annotations

import ast
import importlib
from pathlib import Path

import pytest

from pipeline.container import build_container
from pipeline.core import interfaces
from pipeline.core.models import Post

CORE_DIR = Path(__file__).resolve().parents[1] / "core"

# core/ may only import the standard library, pydantic and itself (Part 2.2, rule 1).
ALLOWED_THIRD_PARTY = {"pydantic"}


def _imported_roots(path: Path) -> set[str]:
    roots: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            roots.add(node.module.split(".")[0])
    return roots


@pytest.mark.parametrize("path", sorted(CORE_DIR.glob("*.py")), ids=lambda p: p.name)
def test_core_imports_no_vendor_sdk(path: Path) -> None:
    import sys

    stdlib = set(sys.stdlib_module_names) | {"__future__"}
    bad = _imported_roots(path) - stdlib - ALLOWED_THIRD_PARTY - {"pipeline"}
    assert not bad, f"{path.name} imports non-core modules: {bad}"


@pytest.mark.parametrize("job", ["ingest", "process", "compose", "publish"])
def test_jobs_run(job: str) -> None:
    module = importlib.import_module(f"pipeline.jobs.{job}")
    assert module.main() == 0


def test_container_builds() -> None:
    container = build_container()
    assert container.settings.user_agent.startswith("PSXAlertsBot/")


def test_interfaces_exist() -> None:
    for name in ["Source", "DocumentParser", "LLMProvider", "Repository", "Publisher", "SearchIndex"]:
        assert hasattr(interfaces, name)


def test_post_defaults() -> None:
    post = Post(kind="alert", item_id=1, platform="whatsapp_queue", text_en="a", text_ur="b")
    assert post.status == "queued"
