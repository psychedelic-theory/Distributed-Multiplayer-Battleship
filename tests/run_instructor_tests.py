#!/usr/bin/env python3
"""
run_instructor_tests.py
Runs all instructor tests from pool_instructor.json against your live server.

Usage:
    python run_instructor_tests.py --json pool_instructor.json [--base-url URL]

Default server: https://p01--backend--zm8jxh5c8bph.code.run

Scoring (matches autograder):
  Full credit    = 2 pts  (correct status code + correct body)
  Partial credit = 1 pt   (correct status code only)
  No credit      = 0 pts
  Raw score out of 182  (91 tests x 2 pts each)
  Scaled score  = raw / 182 * 100
"""

import json
import sys
import time
import argparse
import requests

# ─────────────────────────────────────────────
# COLORS (ANSI escape codes)
# ─────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def green(s):  return f"{GREEN}{s}{RESET}"
def red(s):    return f"{RED}{s}{RESET}"
def yellow(s): return f"{YELLOW}{s}{RESET}"
def cyan(s):   return f"{CYAN}{s}{RESET}"
def bold(s):   return f"{BOLD}{s}{RESET}"
def dim(s):    return f"{DIM}{s}{RESET}"

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
DEFAULT_BASE = "https://p01--backend--zm8jxh5c8bph.code.run"
TEST_HEADER  = {"X-Test-Password": "clemson-test-2026"}
TIMEOUT      = 10  # seconds per request
MAX_RAW      = 182  # 91 tests * 2 pts each

# Ship layouts used in setup helpers
P1_SHIPS = [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}]
P2_SHIPS = [{"row": 5, "col": 5}, {"row": 6, "col": 6}, {"row": 7, "col": 7}]


# ─────────────────────────────────────────────
# SETUP HELPERS
# ─────────────────────────────────────────────

def reset(base):
    try:
        r = requests.post(f"{base}/api/reset", timeout=TIMEOUT)
        return r.status_code == 200
    except Exception:
        return False


def create_player(base, username):
    r = requests.post(f"{base}/api/players", json={"username": username}, timeout=TIMEOUT)
    if r.status_code == 201:
        return r.json().get("player_id")
    return None


def create_game(base, creator_id, grid_size=8, max_players=2):
    r = requests.post(f"{base}/api/games",
                      json={"creator_id": creator_id, "grid_size": grid_size, "max_players": max_players},
                      timeout=TIMEOUT)
    if r.status_code == 201:
        return r.json().get("game_id")
    return None


def join_game(base, game_id, player_id):
    r = requests.post(f"{base}/api/games/{game_id}/join",
                      json={"player_id": player_id}, timeout=TIMEOUT)
    return r.status_code == 200


def place_ships(base, game_id, player_id, ships):
    r = requests.post(f"{base}/api/games/{game_id}/place",
                      json={"player_id": player_id, "ships": ships}, timeout=TIMEOUT)
    return r.status_code == 200


def setup_game_state(base, state):
    p1_id = create_player(base, f"p1_{int(time.time()*1000)%999999}")
    if p1_id is None:
        return None

    game_id = create_game(base, p1_id, grid_size=8, max_players=2)
    if game_id is None:
        return None

    if state == "game_created":
        return {"player_id": p1_id, "game_id": game_id, "player2_id": None}

    p2_id = create_player(base, f"p2_{int(time.time()*1000)%999999}")
    if p2_id is None:
        return None

    ok = join_game(base, game_id, p2_id)
    if not ok:
        return None

    if state == "game_joined":
        return {"player_id": p1_id, "game_id": game_id, "player2_id": p2_id}

    if state == "game_playing":
        ok1 = place_ships(base, game_id, p1_id, P1_SHIPS)
        ok2 = place_ships(base, game_id, p2_id, P2_SHIPS)
        if not (ok1 and ok2):
            return None
        return {"player_id": p1_id, "game_id": game_id, "player2_id": p2_id}

    return None


# ─────────────────────────────────────────────
# ASSERTION HELPERS
# ─────────────────────────────────────────────

def check_response_contains(body, expected):
    failures = []
    if not expected:
        return failures
    if not isinstance(body, dict):
        failures.append(f"Response body is not a JSON object: {type(body).__name__}")
        return failures
    for key, expected_val in expected.items():
        if key not in body:
            failures.append(f"Missing key '{key}' in response")
            continue
        actual_val = body[key]
        if expected_val == "__any_integer__":
            if not isinstance(actual_val, int):
                failures.append(f"Key '{key}': expected integer, got {type(actual_val).__name__} ({actual_val!r})")
        elif expected_val == "__any_string__":
            if not isinstance(actual_val, str):
                failures.append(f"Key '{key}': expected string, got {type(actual_val).__name__} ({actual_val!r})")
        elif expected_val is None:
            if actual_val is not None:
                failures.append(f"Key '{key}': expected null, got {actual_val!r}")
        elif isinstance(expected_val, dict):
            failures.extend(check_response_contains(actual_val, expected_val))
        else:
            if actual_val != expected_val:
                failures.append(f"Key '{key}': expected {expected_val!r}, got {actual_val!r}")
    return failures


# ─────────────────────────────────────────────
# TEST RUNNER
# ─────────────────────────────────────────────

def interpolate_endpoint(endpoint, ctx):
    if ctx is None:
        return endpoint
    ep = endpoint
    if "{id}" in ep:
        ep = ep.replace("{id}", str(ctx.get("game_id", "MISSING_GAME_ID")))
    if "{player_id}" in ep:
        ep = ep.replace("{player_id}", str(ctx.get("player_id", "MISSING_PLAYER_ID")))
    return ep


def interpolate_body(body, ctx):
    if body is None or ctx is None:
        return body
    p1 = ctx.get("player_id")
    p2 = ctx.get("player2_id")

    def replace_val(v):
        if isinstance(v, dict):
            return {k: replace_val(vv) for k, vv in v.items()}
        if isinstance(v, list):
            return [replace_val(i) for i in v]
        return v

    result = {}
    for k, v in body.items():
        if k == "player_id":
            if v == 1 and p1:
                result[k] = p1
            elif v == 2 and p2:
                result[k] = p2
            else:
                result[k] = v
        else:
            result[k] = replace_val(v)
    return result


def run_test(base, test, ctx):
    endpoint = interpolate_endpoint(test["endpoint"], ctx)
    url = base + endpoint
    method = test["method"].upper()
    headers = dict(test.get("headers", {}))
    headers["Content-Type"] = "application/json"
    body = test.get("body")
    if body is not None:
        body = interpolate_body(body, ctx)

    expected_status = test["expected_status"]
    expected_contains = test.get("expected_response_contains", {})

    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=TIMEOUT)
        elif method == "POST":
            resp = requests.post(url, json=body, headers=headers, timeout=TIMEOUT)
        elif method == "PUT":
            resp = requests.put(url, json=body, headers=headers, timeout=TIMEOUT)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=TIMEOUT)
        else:
            return {"credit": "none", "test_id": test["test_id"], "name": test["name"],
                    "error": f"Unknown method {method}"}

        actual_status = resp.status_code
        try:
            resp_body = resp.json()
        except Exception:
            resp_body = resp.text

        status_ok = (actual_status == expected_status)

        body_failures = []
        if expected_contains and isinstance(resp_body, dict):
            body_failures = check_response_contains(resp_body, expected_contains)

        # Determine credit level
        if status_ok and len(body_failures) == 0:
            credit = "full"
        elif status_ok:
            credit = "partial"
        else:
            credit = "none"

        passed = (credit == "full")

        return {
            "passed": passed,
            "credit": credit,
            "test_id": test["test_id"],
            "name": test["name"],
            "url": url,
            "method": method,
            "request_body": body,
            "actual_status": actual_status,
            "expected_status": expected_status,
            "status_ok": status_ok,
            "body_failures": body_failures,
            "response_body": resp_body,
            "error": None,
        }

    except requests.exceptions.Timeout:
        return {"passed": False, "credit": "none", "test_id": test["test_id"], "name": test["name"],
                "url": url, "error": "TIMEOUT", "actual_status": None,
                "expected_status": expected_status, "body_failures": [], "response_body": None,
                "status_ok": False}
    except Exception as e:
        return {"passed": False, "credit": "none", "test_id": test["test_id"], "name": test["name"],
                "url": url, "error": str(e), "actual_status": None,
                "expected_status": expected_status, "body_failures": [], "response_body": None,
                "status_ok": False}


# ─────────────────────────────────────────────
# PRINT HELPERS
# ─────────────────────────────────────────────

def _print_result(r):
    tid      = r["test_id"]
    name     = r["name"][:52].ljust(52)
    actual   = r.get("actual_status")
    expected = r.get("expected_status")
    status   = f"{str(actual):>3} / {str(expected):<3}"
    credit   = r.get("credit", "none")

    if credit == "full":
        tag  = green("  [FULL]  ")
        icon = green("✓")
        print(green(f"  {icon} [{tid}] {name}  {status}{tag}"))
    elif credit == "partial":
        tag  = yellow("  [PART]  ")
        icon = yellow("~")
        print(yellow(f"  {icon} [{tid}] {name}  {status}{tag}"))
        for bf in r.get("body_failures", []):
            print(yellow(f"         -> body: {bf}"))
    else:
        tag  = red("  [NONE]  ")
        icon = red("✗")
        print(red(f"  {icon} [{tid}] {name}  {status}{tag}<- FAIL"))
        err = r.get("error")
        if err:
            print(red(f"         -> {err}"))
        for bf in r.get("body_failures", []):
            print(red(f"         -> body: {bf}"))
        body = r.get("response_body")
        if body is not None:
            body_str = json.dumps(body) if isinstance(body, (dict, list)) else str(body)
            if len(body_str) > 160:
                body_str = body_str[:160] + "..."
            print(red(f"         -> resp: {body_str}"))


def _loading_bar(score_pct, width=40):
    """Render a color-coded loading bar for the score."""
    filled = int(round(score_pct / 100 * width))
    empty  = width - filled
    bar    = "█" * filled + "░" * empty

    if score_pct >= 75:
        bar_colored = green(bar)
    elif score_pct >= 40:
        bar_colored = yellow(bar)
    else:
        bar_colored = red(bar)

    return f"[{bar_colored}] {score_pct:.2f}%"


def _print_executive_summary(results, base):
    total        = len(results)
    full_credit  = sum(1 for r in results if r.get("credit") == "full")
    partial_cred = sum(1 for r in results if r.get("credit") == "partial")
    no_credit    = sum(1 for r in results if r.get("credit") == "none")

    # Setup failures = tests that errored during state setup
    setup_failures   = sum(1 for r in results if (r.get("error") or "").startswith("SETUP FAILED"))
    # Restart failures = tests involving /restart that got wrong status
    restart_failures = sum(1 for r in results
                           if "restart" in r.get("url", "") and not r.get("status_ok", False))

    raw_score    = (full_credit * 2) + (partial_cred * 1)
    scaled_score = (raw_score / MAX_RAW) * 100

    bar = _loading_bar(scaled_score)

    W = 70
    print(bold(f"\n{'═'*W}"))
    print(bold(f"  EXECUTIVE SUMMARY"))
    print(bold(f"{'═'*W}"))
    print()

    # Score bar
    print(f"  {'Score':20s}  {bar}")
    print()

    # Test breakdown
    print(bold(f"  {'─'*66}"))
    print(bold(f"  TEST BREAKDOWN"))
    print(bold(f"  {'─'*66}"))
    print(f"  {'Pool tests total':<30s}  {total}")
    print(f"  {'Scoreable tests':<30s}  {total}")
    print(green( f"  {'Full credit (status + body)':<30s}  {full_credit}"))
    print(yellow(f"  {'Partial credit (status only)':<30s}  {partial_cred}"))
    print(red(   f"  {'No credit':<30s}  {no_credit}"))
    print()

    # Failure details
    print(bold(f"  {'─'*66}"))
    print(bold(f"  FAILURE DETAILS"))
    print(bold(f"  {'─'*66}"))
    rf_str = green(str(restart_failures)) if restart_failures == 0 else red(str(restart_failures))
    sf_str = green(str(setup_failures))   if setup_failures   == 0 else red(str(setup_failures))
    print(f"  {'Restart failures':<30s}  {rf_str}  (POST /api/test/games/{{id}}/restart)")
    print(f"  {'Setup failures':<30s}  {sf_str}  (create/join/place broken)")
    print()

    # Score
    print(bold(f"  {'─'*66}"))
    print(bold(f"  SCORE"))
    print(bold(f"  {'─'*66}"))

    raw_str = f"{raw_score} / {MAX_RAW}"
    if raw_score >= MAX_RAW * 0.75:
        raw_colored = green(raw_str)
    elif raw_score >= MAX_RAW * 0.40:
        raw_colored = yellow(raw_str)
    else:
        raw_colored = red(raw_str)

    scaled_str = f"{scaled_score:.2f} / 100"
    if scaled_score >= 75:
        scaled_colored = green(scaled_str)
    elif scaled_score >= 40:
        scaled_colored = yellow(scaled_str)
    else:
        scaled_colored = red(scaled_str)

    print(f"  {'Raw score':<30s}  {raw_colored}")
    print(f"  {'Scaled score':<30s}  {scaled_colored}")
    print()
    print(bold(f"{'═'*W}"))
    print()

    if restart_failures > 0:
        print(yellow("  ⚠  Restart failures detected — fix POST /api/test/games/{id}/restart first."))
        print()


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Instructor test runner")
    parser.add_argument("--base-url", default=DEFAULT_BASE, help="Backend base URL")
    parser.add_argument("--json", default="pool_instructor.json",
                        help="Path to instructor test JSON")
    parser.add_argument("--filter", default=None, help="Only run tests whose ID contains this string")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")

    print(bold(f"\n{'='*70}"))
    print(bold(f"  BATTLESHIP INSTRUCTOR TEST RUNNER"))
    print(bold(f"  Server: {base}"))
    print(bold(f"{'='*70}\n"))

    with open(args.json) as f:
        tests = json.load(f)

    if args.filter:
        tests = [t for t in tests if args.filter in t["test_id"]]
        print(cyan(f"  Filtered to {len(tests)} tests matching '{args.filter}'\n"))

    ctx_cache = {}

    def get_ctx(state):
        if state not in ctx_cache:
            ctx = setup_game_state(base, state)
            ctx_cache[state] = ctx
        return ctx_cache[state]

    print(f"  {cyan('[SETUP]')} Resetting server state... ", end="", flush=True)
    ok = reset(base)
    print(green("OK") if ok else yellow("FAILED (continuing anyway)"))
    print()

    # Column headers
    print(dim(f"  {'':2} {'ID':<9} {'Test Name':<52}  {'Got/Exp':<9} {'Credit'}"))
    print(dim(f"  {'─'*68}"))

    results = []

    for test in tests:
        test_id = test["test_id"]
        state   = test.get("requires")

        ctx = None
        if state:
            ctx = get_ctx(state)
            if ctx is None:
                result = {
                    "passed":    False,
                    "credit":    "none",
                    "test_id":   test_id,
                    "name":      test["name"],
                    "url":       base + test["endpoint"],
                    "error":     f"SETUP FAILED: could not create '{state}' state",
                    "actual_status":   None,
                    "expected_status": test["expected_status"],
                    "body_failures":   [],
                    "response_body":   None,
                    "status_ok":       False,
                }
                results.append(result)
                _print_result(result)
                continue

        if test_id == "REF0010":
            create_player(base, "duplicate_test")

        result = run_test(base, test, ctx)
        results.append(result)
        _print_result(result)

    # ── Failed tests recap ──
    failed = [r for r in results if r.get("credit") != "full"]
    if failed:
        print(bold(red(f"\n  FAILED / PARTIAL TESTS RECAP")))
        print(red(f"  {'─'*66}"))
        for r in failed:
            credit = r.get("credit", "none")
            label  = yellow("[PART]") if credit == "partial" else red("[NONE]")
            eid    = r["test_id"]
            name   = r["name"]
            err    = r.get("error") or ""
            got    = r.get("actual_status", "?")
            want   = r.get("expected_status", "?")
            bfail  = r.get("body_failures", [])

            print(f"\n  {label} [{eid}] {name}")
            if err:
                print(red(f"      Error   : {err}"))
            else:
                col = yellow if credit == "partial" else red
                print(col(f"      Status  : got {got}, want {want}"))
            for bf in bfail:
                col = yellow if credit == "partial" else red
                print(col(f"      Body    : {bf}"))
            if r.get("response_body") is not None and credit != "partial":
                body_str = json.dumps(r["response_body"], indent=None)
                if len(body_str) > 200:
                    body_str = body_str[:200] + "..."
                print(red(f"      Response: {body_str}"))

    # ── Executive summary ──
    _print_executive_summary(results, base)

    full_credit = sum(1 for r in results if r.get("credit") == "full")
    return 0 if full_credit == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())