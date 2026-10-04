"""The same news story from two outlets: compare headlines by their content words.

"Capital Blockade Chokes Karachi Port Ahead of Protests" (ProPakistani) and
"Capital blockade ahead of Oct 4 PTI protest chokes Karachi Port" (Dawn) share 7 of
their 10 content words. "PSX closes higher" and "PSX closes lower" share 2 of 4, and
are different stories, so both a high overlap and several shared words are required.
"""
from __future__ import annotations

import re

STOPWORDS = {
    "a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "at", "by", "with", "from", "as", "is",
    "are", "was", "were", "be", "its", "it", "after", "ahead", "amid", "over", "into", "says", "say",
}
MIN_SHARED = 4
MIN_OVERLAP = 0.6


def content_words(title: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", title.lower())
    return {w[:-1] if len(w) > 4 and w.endswith("s") else w for w in words if w not in STOPWORDS}


def same_story(a: str, b: str) -> bool:
    wa, wb = content_words(a), content_words(b)
    shared = wa & wb
    return len(shared) >= MIN_SHARED and len(shared) / len(wa | wb) >= MIN_OVERLAP
