#!/usr/bin/env python3
"""
run_instructor_tests.py
Runs all instructor tests from pool_instructor.json against your live server.

Usage:
    python run_instructor_tests.py [--base-url URL]

Default server: https://p01--backend--zm8jxh5c8bph.code.run
"""

import json
import sys
import time
import argparse
import requests

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
DEFAULT_BASE = "https://p01--backend--zm8jxh5c8bph.code.run"
TEST_HEADER  = {"X-Test-Password": "clemson-test-2026"}
TIMEOUT      = 10  # seconds per request

# Ship layouts used in setup helpers
P1_SHIPS = [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}]
P2_SHIPS = [{"row": 5, "col": 5}, {"row": 6, "col": 6}, {"row": 7, "col": 7}]


# ─────────────────────────────────────────────
# SETUP HELPERS
# ─────────────────────────────────────────────

def reset(base):
    """Hard-reset all server state."""
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
    """
    Build the required game state before running a test.
    Returns dict with player_id, game_id, player2_id as applicable.

    States:
      game_created  → p1 created game (but p2 hasn't joined)
      game_joined   → p1 + p2 joined, NO ships placed
      game_playing  → both placed ships; game is active (p1 goes first)
    """
    p1_id = create_player(base, f"p1_{int(time.time()*1000)%999999}")
    if p1_id is None:
        return None

    game_id = create_game(base, p1_id, grid_size=8, max_players=2)
    if game_id is None:
        return None

    if state == "game_created":
        # creator already joined automatically
        return {"player_id": p1_id, "game_id": game_id, "player2_id": None}

    # game_joined and game_playing both need p2
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
    """
    Recursively check that every key/value in `expected` is present in `body`.
    Supports special sentinels: __any_integer__, __any_string__
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
                failures.append(f"Key '{key}': expected integer, got {type(actual_val).__name__} ({actual_val!r})")
        elif expected_val == "__any_string__":
            if not isinstance(actual_val, str):
                failures.append(f"Key '{key}': expected string, got {type(actual_val).__name__} ({actual_val!r})")
        elif expected_val is None:
            if actual_val is not None:
                failures.append(f"Key '{key}': expected null, got {actual_val!r}")
        elif isinstance(expected_val, dict):
            sub = check_response_contains(actual_val, expected_val)
            failures.extend(sub)
        else:
            if actual_val != expected_val:
                failures.append(f"Key '{key}': expected {expected_val!r}, got {actual_val!r}")

    return failures


# ─────────────────────────────────────────────
# TEST RUNNER
# ─────────────────────────────────────────────

def interpolate_endpoint(endpoint, ctx):
    """Replace {id} placeholders with actual IDs from context."""
    if ctx is None:
        return endpoint
    ep = endpoint
    if "{id}" in ep:
        ep = ep.replace("{id}", str(ctx.get("game_id", "MISSING_GAME_ID")))
    if "{player_id}" in ep:
        ep = ep.replace("{player_id}", str(ctx.get("player_id", "MISSING_PLAYER_ID")))
    return ep


def interpolate_body(body, ctx):
    """Replace player_id=1 and player_id=2 with actual IDs in test bodies."""
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

    # For fire/join/place bodies that reference player_id=1 → p1, player_id=2 → p2
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
    """
    Execute a single test.  Returns dict:
      passed, test_id, name, actual_status, expected_status,
      body_failures, response_body, error
    """
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
            return {"passed": False, "test_id": test["test_id"], "name": test["name"],
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

        passed = status_ok and len(body_failures) == 0

        return {
            "passed": passed,
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
        return {"passed": False, "test_id": test["test_id"], "name": test["name"],
                "url": url, "error": "TIMEOUT", "actual_status": None,
                "expected_status": expected_status, "body_failures": [], "response_body": None}
    except Exception as e:
        return {"passed": False, "test_id": test["test_id"], "name": test["name"],
                "url": url, "error": str(e), "actual_status": None,
                "expected_status": expected_status, "body_failures": [], "response_body": None}


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Instructor test runner")
    parser.add_argument("--base-url", default=DEFAULT_BASE, help="Backend base URL")
    parser.add_argument("--json", default="/mnt/user-data/uploads/pool_instructor.json",
                        help="Path to instructor test JSON")
    parser.add_argument("--filter", default=None, help="Only run tests whose ID contains this string")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")

    print(f"\n{'='*70}")
    print(f"  BATTLESHIP INSTRUCTOR TEST RUNNER")
    print(f"  Server: {base}")
    print(f"{'='*70}\n")

    # Load tests
    with open(args.json) as f:
        tests = json.load(f)

    if args.filter:
        tests = [t for t in tests if args.filter in t["test_id"]]
        print(f"  Filtered to {len(tests)} tests matching '{args.filter}'\n")

    # ── Group tests by their `requires` field ──
    # We'll reset once, then build contexts lazily as needed
    # Context cache keyed by state name
    ctx_cache = {}

    def get_ctx(state):
        if state not in ctx_cache:
            ctx = setup_game_state(base, state)
            ctx_cache[state] = ctx
        return ctx_cache[state]

    # ── Reset server before running ──
    print("  [SETUP] Resetting server state... ", end="", flush=True)
    ok = reset(base)
    print("OK" if ok else "FAILED (continuing anyway)")
    print()

    # ── Special: REF0010 (duplicate username) needs a pre-existing player ──
    # We'll track which usernames were created so we can pre-seed as needed

    results = []
    passed_count = 0
    failed_count = 0

    for i, test in enumerate(tests):
        test_id = test["test_id"]
        state = test.get("requires")

        # Get or build context for this state
        ctx = None
        if state:
            ctx = get_ctx(state)
            if ctx is None:
                result = {
                    "passed": False,
                    "test_id": test_id,
                    "name": test["name"],
                    "url": base + test["endpoint"],
                    "error": f"SETUP FAILED: could not create '{state}' state",
                    "actual_status": None,
                    "expected_status": test["expected_status"],
                    "body_failures": [],
                    "response_body": None,
                }
                results.append(result)
                failed_count += 1
                _print_result(result)
                continue

        # Special handling: REF0010 needs duplicate_test to already exist
        if test_id == "REF0010":
            # Pre-create the duplicate player
            create_player(base, "duplicate_test")

        result = run_test(base, test, ctx)
        results.append(result)

        if result["passed"]:
            passed_count += 1
        else:
            failed_count += 1

        _print_result(result)

    # ── Summary ──
    total = len(results)
    print(f"\n{'='*70}")
    print(f"  RESULTS: {passed_count}/{total} passed  |  {failed_count} failed")
    print(f"{'='*70}\n")

    if failed_count > 0:
        print("  FAILED TESTS SUMMARY")
        print(f"  {'─'*66}")
        for r in results:
            if not r["passed"]:
                eid  = r['test_id']
                name = r['name']
                err  = r.get('error') or ""
                got  = r.get('actual_status', '?')
                want = r.get('expected_status', '?')
                bfail = r.get('body_failures', [])

                print(f"\n  ✗ [{eid}] {name}")
                if err:
                    print(f"      Error   : {err}")
                else:
                    print(f"      Status  : got {got}, want {want} {'✓' if r.get('status_ok') else '✗'}")
                for bf in bfail:
                    print(f"      Body    : {bf}")
                if r.get("response_body") is not None:
                    body_str = json.dumps(r["response_body"], indent=None)
                    if len(body_str) > 200:
                        body_str = body_str[:200] + "..."
                    print(f"      Response: {body_str}")

    print()
    return 0 if failed_count == 0 else 1


def _print_result(r):
    icon   = "✓" if r["passed"] else "✗"
    tid    = r["test_id"]
    name   = r["name"][:55].ljust(55)
    actual   = r.get('actual_status')
    expected = r.get('expected_status')
    status   = f"{str(actual):>3} / {str(expected):<3}"

    if r["passed"]:
        print(f"  {icon} [{tid}] {name}  {status}")
    else:
        print(f"  {icon} [{tid}] {name}  {status}  ← FAIL")
        err = r.get("error")
        if err:
            print(f"         ↳ {err}")
        for bf in r.get("body_failures", []):
            print(f"         ↳ body: {bf}")
        body = r.get("response_body")
        if body is not None:
            body_str = json.dumps(body) if isinstance(body, (dict, list)) else str(body)
            if len(body_str) > 160:
                body_str = body_str[:160] + "..."
            print(f"         ↳ resp: {body_str}")


if __name__ == "__main__":
    sys.exit(main())
