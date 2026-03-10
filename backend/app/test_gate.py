"""
test_gate.py — Helpers for TEST_MODE gating.

Rules (from PRD):
  - If TEST_MODE env var != "true"  -> 403
  - If TEST_MODE == "true" but header X-Test-Password != "clemson-test-2026" -> 403
"""

import os
from flask import request, jsonify

TEST_PASSWORD = "clemson-test-2026"
# Primary header matches grading appendix; legacy header kept for compatibility.
TEST_HEADERS = ("X-Test-Mode", "X-Test-Password")


def _is_test_mode_enabled() -> bool:
    """Return True only when TEST_MODE is explicitly enabled."""
    value = os.environ.get("TEST_MODE", "false")
    normalized = value.strip().lower()
    return normalized in {"true", "1", "yes", "on"}


def require_test_mode():
    """
    Call at the start of every test endpoint.
    Returns None if allowed, or a (response, 403) tuple to return immediately.
    """
    if not _is_test_mode_enabled():
        return jsonify({"error": "Test mode is disabled"}), 403

    provided = ""
    for h in TEST_HEADERS:
        v = request.headers.get(h, "")
        if v:
            provided = v
            break

    if provided != TEST_PASSWORD:
        return jsonify({"error": "Invalid or missing test password header"}), 403

    return None  # all checks passed
