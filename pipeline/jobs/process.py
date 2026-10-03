"""process job: classify -> extract facts -> summarise EN + UR -> quality gate, for new documents.

Run with:
  uv run python -m pipeline.jobs.process                 # all new documents (AI work capped per run)
  uv run python -m pipeline.jobs.process --limit 30 --max-ai 30
  uv run python -m pipeline.jobs.process --reprocess results dividend   # e.g. after a prompt change
"""
from __future__ import annotations

import argparse
import sys

from pipeline.container import build_container
from pipeline.core.process import process_documents


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=500, help="max documents to look at")
    ap.add_argument("--max-ai", type=int, default=25, help="max documents needing AI per run (free-tier budget)")
    ap.add_argument("--reprocess", nargs="+", metavar="CATEGORY",
                    help="mark documents of these item categories as new again (e.g. after a prompt change)")
    args = ap.parse_args(argv)

    c = build_container()
    if args.reprocess:
        n = c.repo.reset_for_reprocessing(args.reprocess)
        print(f"process: {n} documents marked for reprocessing")
    docs = c.repo.documents_to_process(args.limit)
    stats = process_documents(docs, c.repo, c.llm, c.process_config(args.max_ai), extract_llm=c.extract_llm)
    print(
        f"process: processed={stats.processed} needs_review={stats.needs_review} "
        f"failed={stats.failed} deferred={stats.deferred}"
    )
    for name, n in stats.by_category.most_common():
        print(f"    {name:28} {n}")
    for note in stats.notes[:10]:
        print(f"    ! {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
