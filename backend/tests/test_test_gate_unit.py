import os

from flask import Flask

from app.test_gate import _is_test_mode_enabled, require_test_mode


def test_is_test_mode_enabled_accepts_common_truthy_values(monkeypatch):
    for value in ("true", "TRUE", "  true  ", "1", "yes", "on"):
        monkeypatch.setenv("TEST_MODE", value)
        assert _is_test_mode_enabled() is True


def test_is_test_mode_enabled_rejects_non_truthy_values(monkeypatch):
    for value in ("false", "0", "no", "off", "", " true-ish "):
        monkeypatch.setenv("TEST_MODE", value)
        assert _is_test_mode_enabled() is False


def test_require_test_mode_reports_disabled(monkeypatch):
    monkeypatch.setenv("TEST_MODE", "false")
    app = Flask(__name__)

    with app.test_request_context(headers={"X-Test-Password": "clemson-test-2026"}):
        response, status = require_test_mode()

    assert status == 403
    assert response.get_json()["error"] == "Test mode is disabled"


def test_require_test_mode_accepts_legacy_header_with_whitespace_env(monkeypatch):
    monkeypatch.setenv("TEST_MODE", " true ")
    app = Flask(__name__)

    with app.test_request_context(headers={"X-Test-Password": "clemson-test-2026"}):
        assert require_test_mode() is None
