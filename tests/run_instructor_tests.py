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

ISOLATION: Every test gets its own freshly created game and players.
           No state is shared between tests, so scores are stable and
           match the autograder on every machine and every rerun.
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
TEST_PASSWORD = "clemson-test-2026"
TEST_HEADER   = {"X-Test-Password": TEST_PASSWORD}
TIMEOUT       = 15   # seconds per request
MAX_RAW       = 182  # 91 tests * 2 pts each

# Canonical ship layouts — same every time so tests are deterministic.
# P1 ships: rows 0,1,2 col 0,1,2
# P2 ships: rows 5,6,7 col 5,6,7  (well away from P1)
P1_SHIPS = [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}]
P2_SHIPS = [{"row": 5, "col": 5}, {"row": 6, "col": 6}, {"row": 7, "col": 7}]

# Unique suffix counter so usernames never collide across tests
_uid_counter = 0
def _uid():
    global _uid_counter
    _uid_counter += 1
    return _uid_counter


# ─────────────────────────────────────────────
# LOW-LEVEL HTTP HELPERS
# ─────────────────────────────────────────────

def _post(base, path, body=None, headers=None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    return requests.post(f"{base}{path}", json=body, headers=h, timeout=TIMEOUT)

def _get(base, path, headers=None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    return requests.get(f"{base}{path}", headers=h, timeout=TIMEOUT)


# ─────────────────────────────────────────────
# SETUP HELPERS  (one fresh game per test)
# ─────────────────────────────────────────────

def global_reset(base):
    """Hard-reset all server state (only called once at startup)."""
    try:
        r = _post(base, "/api/reset")
        return r.status_code == 200
    except Exception:
        return False


def create_player(base, username):
    try:
        r = _post(base, "/api/players", {"username": username})
        if r.status_code == 201:
            return r.json().get("player_id")
    except Exception:
        pass
    return None


def create_game(base, creator_id, grid_size=8, max_players=2):
    try:
        r = _post(base, "/api/games",
                  {"creator_id": creator_id,
                   "grid_size": grid_size,
                   "max_players": max_players})
        if r.status_code == 201:
            return r.json().get("game_id")
    except Exception:
        pass
    return None


def join_game(base, game_id, player_id):
    try:
        r = _post(base, f"/api/games/{game_id}/join", {"player_id": player_id})
        return r.status_code == 200
    except Exception:
        return False


def place_ships(base, game_id, player_id, ships):
    try:
        r = _post(base, f"/api/games/{game_id}/place",
                  {"player_id": player_id, "ships": ships})
        return r.status_code == 200
    except Exception:
        return False


def restart_game(base, game_id):
    """Use the test restart endpoint to wipe game state cleanly."""
    try:
        r = _post(base, f"/api/test/games/{game_id}/restart",
                  body={}, headers=TEST_HEADER)
        return r.status_code == 200
    except Exception:
        return False


def fresh_context(base, state):
    """
    Build a BRAND NEW isolated game context for a single test.
    Every call creates unique players and a unique game — nothing is reused.

    Returns dict:
        player_id   — p1's ID
        player2_id  — p2's ID (or None for game_created)
        game_id     — the new game's ID
    or None if setup failed.

    States
    ------
    game_created  : p1 exists + game exists (p2 not yet joined)
    game_joined   : p1 + p2 joined, NO ships placed
    game_playing  : p1 + p2 joined, both placed ships, game is active
    """
    uid = _uid()
    p1_id = create_player(base, f"p1t{uid}")
    if p1_id is None:
        return None

    game_id = create_game(base, p1_id, grid_size=8, max_players=2)
    if game_id is None:
        return None

    if state == "game_created":
        return {"player_id": p1_id, "game_id": game_id, "player2_id": None}

    # Need p2 for joined / playing states
    p2_id = create_player(base, f"p2t{uid}")
    if p2_id is None:
        return None

    if not join_game(base, game_id, p2_id):
        return None

    if state == "game_joined":
        return {"player_id": p1_id, "game_id": game_id, "player2_id": p2_id}

    if state == "game_playing":
        if not place_ships(base, game_id, p1_id, P1_SHIPS):
            return None
        if not place_ships(base, game_id, p2_id, P2_SHIPS):
            return None
        return {"player_id": p1_id, "game_id": game_id, "player2_id": p2_id}

    return None


# ─────────────────────────────────────────────
# ASSERTION HELPERS
# ─────────────────────────────────────────────

def check_response_contains(body, expected):
    """
    Recursively verify every key/value in `expected` exists in `body`.
    Sentinels: __any_integer__  __any_string__
    Returns list of failure strings (empty = all pass).
    """
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
                failures.append(
                    f"Key '{key}': expected integer, "
                    f"got {type(actual_val).__name__} ({actual_val!r})")
        elif expected_val == "__any_string__":
            if not isinstance(actual_val, str):
                failures.append(
                    f"Key '{key}': expected string, "
                    f"got {type(actual_val).__name__} ({actual_val!r})")
        elif expected_val is None:
            if actual_val is not None:
                failures.append(f"Key '{key}': expected null, got {actual_val!r}")
        elif isinstance(expected_val, dict):
            failures.extend(check_response_contains(actual_val, expected_val))
        else:
            if actual_val != expected_val:
                failures.append(
                    f"Key '{key}': expected {expected_val!r}, got {actual_val!r}")
    return failures


# ─────────────────────────────────────────────
# INTERPOLATION
# ─────────────────────────────────────────────

def interpolate_endpoint(endpoint, ctx):
    """Replace {id} / {player_id} placeholders with real IDs."""
    if ctx is None:
        return endpoint
    ep = endpoint
    if "{id}" in ep:
        ep = ep.replace("{id}", str(ctx.get("game_id", "MISSING_GAME_ID")))
    if "{player_id}" in ep:
        ep = ep.replace("{player_id}", str(ctx.get("player_id", "MISSING_PLAYER_ID")))
    return ep


def interpolate_body(body, ctx):
    """
    Replace placeholder player IDs (1 → p1, 2 → p2) with real IDs from ctx.
    Also replace placeholder creator_id: 1 in game-creation bodies.
    """
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
        if k in ("player_id", "creator_id"):
            if v == 1 and p1:
                result[k] = p1
            elif v == 2 and p2:
                result[k] = p2
            else:
                result[k] = v
        else:
            result[k] = replace_val(v)
    return result


# ─────────────────────────────────────────────
# TEST RUNNER
# ─────────────────────────────────────────────

def run_test(base, test, ctx):
    """Execute a single test and return a result dict."""
    endpoint = interpolate_endpoint(test["endpoint"], ctx)
    url      = base + endpoint
    method   = test["method"].upper()

    # Merge test-defined headers; always set Content-Type
    headers = {"Content-Type": "application/json"}
    headers.update(test.get("headers", {}))

    body = test.get("body")
    if body is not None:
        body = interpolate_body(body, ctx)

    expected_status   = test["expected_status"]
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
            return _error_result(test, f"Unknown HTTP method: {method}")

        actual_status = resp.status_code
        try:
            resp_body = resp.json()
        except Exception:
            resp_body = resp.text

        status_ok     = (actual_status == expected_status)
        body_failures = []
        if expected_contains and isinstance(resp_body, dict):
            body_failures = check_response_contains(resp_body, expected_contains)

        if status_ok and not body_failures:
            credit = "full"
        elif status_ok:
            credit = "partial"
        else:
            credit = "none"

        return {
            "passed":          credit == "full",
            "credit":          credit,
            "test_id":         test["test_id"],
            "name":            test["name"],
            "url":             url,
            "method":          method,
            "actual_status":   actual_status,
            "expected_status": expected_status,
            "status_ok":       status_ok,
            "body_failures":   body_failures,
            "response_body":   resp_body,
            "error":           None,
        }

    except requests.exceptions.Timeout:
        return _error_result(test, "TIMEOUT", url=url,
                             expected_status=expected_status)
    except Exception as e:
        return _error_result(test, str(e), url=url,
                             expected_status=expected_status)


def _error_result(test, error_msg, url="", expected_status=None):
    return {
        "passed":          False,
        "credit":          "none",
        "test_id":         test["test_id"],
        "name":            test["name"],
        "url":             url,
        "method":          test.get("method", "?").upper(),
        "actual_status":   None,
        "expected_status": expected_status or test.get("expected_status"),
        "status_ok":       False,
        "body_failures":   [],
        "response_body":   None,
        "error":           error_msg,
    }


# ─────────────────────────────────────────────
# PRINT HELPERS
# ─────────────────────────────────────────────

def _print_result(r, index, total):
    tid      = r["test_id"]
    name     = r["name"][:50].ljust(50)
    actual   = r.get("actual_status")
    expected = r.get("expected_status")
    status   = f"{str(actual):>3} / {str(expected):<3}"
    credit   = r.get("credit", "none")
    progress = f"({index}/{total})"

    if credit == "full":
        print(green(f"  ✓ [{tid}] {name}  {status}  [FULL]   {progress}"))
    elif credit == "partial":
        print(yellow(f"  ~ [{tid}] {name}  {status}  [PART]   {progress}"))
        for bf in r.get("body_failures", []):
            print(yellow(f"         -> body: {bf}"))
    else:
        print(red(f"  ✗ [{tid}] {name}  {status}  [NONE]   {progress} <- FAIL"))
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


def _print_executive_summary(results):
    total        = len(results)
    full_credit  = sum(1 for r in results if r.get("credit") == "full")
    partial_cred = sum(1 for r in results if r.get("credit") == "partial")
    no_credit    = sum(1 for r in results if r.get("credit") == "none")

    setup_failures   = sum(1 for r in results
                           if (r.get("error") or "").startswith("SETUP FAILED"))
    restart_failures = sum(1 for r in results
                           if "restart" in (r.get("url") or "")
                           and not r.get("status_ok", False))

    raw_score    = (full_credit * 2) + (partial_cred * 1)
    scaled_score = (raw_score / MAX_RAW) * 100
    bar          = _loading_bar(scaled_score)

    W = 70
    print(bold(f"\n{'═'*W}"))
    print(bold(f"  EXECUTIVE SUMMARY"))
    print(bold(f"{'═'*W}"))
    print()
    print(f"  {'Score':20s}  {bar}")
    print()

    print(bold(f"  {'─'*66}"))
    print(bold(f"  TEST BREAKDOWN"))
    print(bold(f"  {'─'*66}"))
    print(f"  {'Pool tests total':<32s}  {total}")
    print(f"  {'Scoreable tests':<32s}  {total}")
    print(green( f"  {'Full credit (status + body)':<32s}  {full_credit}"))
    print(yellow(f"  {'Partial credit (status only)':<32s}  {partial_cred}"))
    print(red(   f"  {'No credit':<32s}  {no_credit}"))
    print()

    print(bold(f"  {'─'*66}"))
    print(bold(f"  FAILURE DETAILS"))
    print(bold(f"  {'─'*66}"))
    rf_str = green(str(restart_failures)) if restart_failures == 0 else red(str(restart_failures))
    sf_str = green(str(setup_failures))   if setup_failures   == 0 else red(str(setup_failures))
    print(f"  {'Restart failures':<32s}  {rf_str}  (POST /api/test/games/{{id}}/restart)")
    print(f"  {'Setup failures':<32s}  {sf_str}  (create/join/place broken)")
    print()

    print(bold(f"  {'─'*66}"))
    print(bold(f"  SCORE"))
    print(bold(f"  {'─'*66}"))

    raw_str    = f"{raw_score} / {MAX_RAW}"
    scaled_str = f"{scaled_score:.2f} / 100"

    def score_color(pct, s):
        if pct >= 75:   return green(s)
        elif pct >= 40: return yellow(s)
        else:           return red(s)

    print(f"  {'Raw score':<32s}  {score_color(scaled_score, raw_str)}")
    print(f"  {'Scaled score':<32s}  {score_color(scaled_score, scaled_str)}")
    print()
    print(bold(f"{'═'*W}"))
    print()

    if restart_failures > 0:
        print(yellow("  ⚠  Restart failures detected — fix POST /api/test/games/{id}/restart first."))
        print()
    if setup_failures > 0:
        print(yellow(f"  ⚠  {setup_failures} setup failure(s) — create/join/place endpoints may be broken."))
        print()


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Instructor test runner")
    parser.add_argument("--base-url", default=DEFAULT_BASE, help="Backend base URL")
    parser.add_argument("--json", default="pool_instructor.json",
                        help="Path to instructor test JSON")
    parser.add_argument("--filter", default=None,
                        help="Only run tests whose ID contains this string (e.g. REF001)")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")

    print(bold(f"\n{'='*70}"))
    print(bold(f"  BATTLESHIP INSTRUCTOR TEST RUNNER"))
    print(bold(f"  Server : {base}"))
    print(bold(f"  Mode   : ISOLATED — fresh game per test (stable scores)"))
    print(bold(f"{'='*70}\n"))

    with open(args.json) as f:
        tests = json.load(f)

    if args.filter:
        tests = [t for t in tests if args.filter in t["test_id"]]
        print(cyan(f"  Filtered to {len(tests)} tests matching '{args.filter}'\n"))

    total_tests = len(tests)

    # One global reset at the very start to clear stale data
    print(f"  {cyan('[SETUP]')} Resetting server state... ", end="", flush=True)
    ok = global_reset(base)
    print(green("OK") if ok else yellow("FAILED (continuing anyway)"))

    # Pre-seed the duplicate username needed by REF0010
    print(f"  {cyan('[SETUP]')} Pre-seeding duplicate username... ", end="", flush=True)
    dup_id = create_player(base, "duplicate_test")
    print(green("OK") if dup_id else yellow("FAILED (REF0010 may not pass)"))
    print()

    # Column header
    print(dim(f"  {'':2} {'ID':<9} {'Test Name':<50}  {'Got/Exp':<9} {'Credit':<8} {'#'}"))
    print(dim(f"  {'─'*72}"))

    results = []

    for i, test in enumerate(tests, 1):
        test_id = test["test_id"]
        state   = test.get("requires")

        # ── Build a fresh isolated context for every test that needs one ──
        ctx = None
        if state:
            ctx = fresh_context(base, state)
            if ctx is None:
                result = _error_result(
                    test,
                    f"SETUP FAILED: could not build '{state}' state",
                    url=base + test["endpoint"],
                    expected_status=test["expected_status"],
                )
                results.append(result)
                _print_result(result, i, total_tests)
                continue

        result = run_test(base, test, ctx)
        results.append(result)
        _print_result(result, i, total_tests)

    # ── Failed / partial recap ──
    not_full = [r for r in results if r.get("credit") != "full"]
    if not_full:
        print(bold(f"\n  {'─'*68}"))
        print(bold(red(f"  FAILED / PARTIAL RECAP")))
        print(bold(f"  {'─'*68}"))
        for r in not_full:
            credit = r.get("credit", "none")
            label  = yellow("[PART]") if credit == "partial" else red("[NONE]")
            col    = yellow if credit == "partial" else red
            print(f"\n  {label} [{r['test_id']}] {r['name']}")
            if r.get("error"):
                print(red(f"      Error   : {r['error']}"))
            else:
                print(col(f"      Status  : got {r.get('actual_status','?')}, "
                          f"want {r.get('expected_status','?')}"))
            for bf in r.get("body_failures", []):
                print(col(f"      Body    : {bf}"))
            if r.get("response_body") is not None and credit == "none":
                body_str = json.dumps(r["response_body"], indent=None)
                if len(body_str) > 200:
                    body_str = body_str[:200] + "..."
                print(red(f"      Response: {body_str}"))

    # ── Executive summary ──
    _print_executive_summary(results)

    return 0 if all(r.get("credit") == "full" for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())