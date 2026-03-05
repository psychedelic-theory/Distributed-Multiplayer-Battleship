"""
test_gate.py — Helpers for TEST_MODE gating.

Rules (from PRD):
  - If TEST_MODE env var != "true"  -> 403
  - If TEST_MODE == "true" but header X-Test-Password != "clemson-test-2026" -> 403
"""

import os
from flask import request, jsonify

TEST_PASSWORD = "clemson-test-2026"
TEST_HEADER   = "X-Test-Password"


def require_test_mode():
    """
    Call at the start of every test endpoint.
    Returns None if allowed, or a (response, 403) tuple to return immediately.
    """
    if os.environ.get("TEST_MODE", "false").lower() != "true":
        return jsonify({"error": "Test mode is disabled"}), 403

    provided = request.headers.get(TEST_HEADER, "")
    if provided != TEST_PASSWORD:
        return jsonify({"error": "Invalid or missing test password header"}), 403

    return None  # all checks passed
