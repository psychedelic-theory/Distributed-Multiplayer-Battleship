"""
tests/test_battleship.py

Automated tests covering:
  - Player creation (400/403 cases, duplicate username, client-supplied ID rejection)
  - Ship placement rules (3 ships, bounds, overlap, twice, wrong game)
  - Turn enforcement (out of turn, wrong player, game not active)
  - TEST_MODE gating (disabled → 403, enabled without header → 403, enabled with header → 200)
  - Fire mechanics (hit, miss, elimination, game completion, repeat shot rejection)
  - Stats persistence (checked after game finish)

Run with:
    pytest tests/ -v
"""

import os
import pytest
import requests

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:5000")
TEST_HEADER = {"X-Test-Mode": "clemson-test-2026", "Content-Type": "application/json"}
LEGACY_TEST_HEADER = {"X-Test-Password": "clemson-test-2026", "Content-Type": "application/json"}
HEADERS = {"Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_state():
    """Reset server state before every test."""
    r = requests.post(f"{BASE}/api/reset")
    assert r.status_code == 200
    yield


def create_player(username):
    r = requests.post(f"{BASE}/api/players", json={"username": username}, headers=HEADERS)
    assert r.status_code == 201, r.text
    return r.json()["player_id"]


def create_game(creator_id, grid_size=10, max_players=2):
    r = requests.post(
        f"{BASE}/api/games",
        json={"creator_id": creator_id, "grid_size": grid_size, "max_players": max_players},
        headers=HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json()["game_id"]


def join_game(game_id, player_id):
    r = requests.post(f"{BASE}/api/games/{game_id}/join", json={"player_id": player_id}, headers=HEADERS)
    return r


def place_ships(game_id, player_id, ships=None):
    if ships is None:
        ships = [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}]
    r = requests.post(
        f"{BASE}/api/games/{game_id}/place",
        json={"player_id": player_id, "ships": ships},
        headers=HEADERS,
    )
    return r


def fire(game_id, player_id, row, col):
    return requests.post(
        f"{BASE}/api/games/{game_id}/fire",
        json={"player_id": player_id, "row": row, "col": col},
        headers=HEADERS,
    )


def setup_active_game():
    """Helper: create 2-player game, both place ships, game transitions to active."""
    p1 = create_player("alice")
    p2 = create_player("bob")
    gid = create_game(p1, grid_size=10, max_players=2)
    join_game(gid, p2)

    # p1 ships at (0,0),(1,1),(2,2); p2 ships at (5,5),(6,6),(7,7)
    r1 = place_ships(gid, p1, [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}])
    assert r1.status_code == 200, r1.text
    r2 = place_ships(gid, p2, [{"row": 5, "col": 5}, {"row": 6, "col": 6}, {"row": 7, "col": 7}])
    assert r2.status_code == 200, r2.text
    return gid, p1, p2


# ---------------------------------------------------------------------------
# POST /api/players
# ---------------------------------------------------------------------------

class TestCreatePlayer:
    def test_create_success(self):
        r = requests.post(f"{BASE}/api/players", json={"username": "testuser"}, headers=HEADERS)
        assert r.status_code == 201
        assert "player_id" in r.json()

    def test_duplicate_username(self):
        create_player("dupeuser")
        r = requests.post(f"{BASE}/api/players", json={"username": "dupeuser"}, headers=HEADERS)
        assert r.status_code == 400

    def test_reject_client_supplied_id(self):
        r = requests.post(
            f"{BASE}/api/players",
            json={"username": "hacker", "player_id": 999},
            headers=HEADERS,
        )
        assert r.status_code == 400

    def test_missing_username(self):
        r = requests.post(f"{BASE}/api/players", json={}, headers=HEADERS)
        assert r.status_code == 400

    def test_invalid_json(self):
        r = requests.post(f"{BASE}/api/players", data="not json", headers={"Content-Type": "application/json"})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/games
# ---------------------------------------------------------------------------

class TestCreateGame:
    def test_creator_id_must_be_int(self):
        r = requests.post(
            f"{BASE}/api/games",
            json={"creator_id": "not-an-int", "grid_size": 10, "max_players": 2},
            headers=HEADERS,
        )
        assert r.status_code == 400

    def test_grid_size_too_small(self):
        p = create_player("gs1")
        r = requests.post(f"{BASE}/api/games", json={"creator_id": p, "grid_size": 4, "max_players": 2})
        assert r.status_code == 400

    def test_grid_size_too_large(self):
        p = create_player("gs2")
        r = requests.post(f"{BASE}/api/games", json={"creator_id": p, "grid_size": 16, "max_players": 2})
        assert r.status_code == 400

    def test_invalid_max_players(self):
        p = create_player("mp1")
        r = requests.post(f"{BASE}/api/games", json={"creator_id": p, "grid_size": 10, "max_players": 0})
        assert r.status_code == 400

    def test_nonexistent_creator(self):
        r = requests.post(f"{BASE}/api/games", json={"creator_id": 99999, "grid_size": 10, "max_players": 2})
        assert r.status_code == 404

    def test_returns_game_id(self):
        p = create_player("creator1")
        r = requests.post(f"{BASE}/api/games", json={"creator_id": p, "grid_size": 10, "max_players": 2})
        assert r.status_code == 201
        assert "game_id" in r.json()


# ---------------------------------------------------------------------------
# POST /api/games/{id}/join
# ---------------------------------------------------------------------------

class TestJoinGame:
    def test_player_id_type_rejected(self):
        p1 = create_player("jt1")
        gid = create_game(p1, max_players=2)
        r = requests.post(
            f"{BASE}/api/games/{gid}/join",
            json={"player_id": "bad-type"},
            headers=HEADERS,
        )
        assert r.status_code == 400

    def test_duplicate_join(self):
        p1 = create_player("j1")
        p2 = create_player("j2")
        gid = create_game(p1, max_players=3)
        r = join_game(gid, p2)
        assert r.status_code == 200
        r2 = join_game(gid, p2)
        assert r2.status_code == 400

    def test_game_full(self):
        p1 = create_player("f1")
        p2 = create_player("f2")
        p3 = create_player("f3")
        gid = create_game(p1, max_players=2)
        join_game(gid, p2)
        r = join_game(gid, p3)
        assert r.status_code == 400

    def test_nonexistent_game(self):
        p = create_player("j3")
        r = join_game(99999, p)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/games/{id}/place
# ---------------------------------------------------------------------------

class TestPlaceShips:
    def test_player_id_type_rejected(self):
        p = create_player("pltype")
        gid = create_game(p, max_players=1)
        r = requests.post(
            f"{BASE}/api/games/{gid}/place",
            json={"player_id": "bad-type", "ships": [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}]},
            headers=HEADERS,
        )
        assert r.status_code == 400

    def test_ship_entry_must_be_object(self):
        p = create_player("plobj")
        gid = create_game(p, max_players=1)
        r = requests.post(
            f"{BASE}/api/games/{gid}/place",
            json={"player_id": p, "ships": ["bad", {"row": 1, "col": 1}, {"row": 2, "col": 2}]},
            headers=HEADERS,
        )
        assert r.status_code == 400

    def test_must_be_exactly_3(self):
        p = create_player("pl1")
        gid = create_game(p, max_players=1)
        r = place_ships(gid, p, [{"row": 0, "col": 0}, {"row": 1, "col": 1}])
        assert r.status_code == 400

    def test_out_of_bounds(self):
        p = create_player("pl2")
        gid = create_game(p, max_players=1)
        r = place_ships(gid, p, [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 99, "col": 99}])
        assert r.status_code == 400

    def test_overlap(self):
        p = create_player("pl3")
        gid = create_game(p, max_players=1)
        r = place_ships(gid, p, [{"row": 0, "col": 0}, {"row": 0, "col": 0}, {"row": 1, "col": 1}])
        assert r.status_code == 400

    def test_cannot_place_twice(self):
        p = create_player("pl4")
        gid = create_game(p, max_players=1)
        place_ships(gid, p)  # first placement
        r = place_ships(gid, p)  # second attempt
        assert r.status_code == 400

    def test_player_not_in_game(self):
        p1 = create_player("pl5")
        p2 = create_player("pl6")
        gid = create_game(p1, max_players=1)
        r = place_ships(gid, p2)
        assert r.status_code == 403

    def test_placement_forbidden_after_active(self):
        """Single-player game goes active immediately after placement; second call rejected."""
        p = create_player("pl7")
        gid = create_game(p, max_players=1)
        place_ships(gid, p)
        # game should now be active; try placing again
        r = place_ships(gid, p, [{"row": 3, "col": 3}, {"row": 4, "col": 4}, {"row": 5, "col": 5}])
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/games/{id}/fire
# ---------------------------------------------------------------------------

class TestFire:
    def test_player_id_type_rejected(self):
        gid, p1, p2 = setup_active_game()
        r = requests.post(
            f"{BASE}/api/games/{gid}/fire",
            json={"player_id": "bad-type", "row": 0, "col": 0},
            headers=HEADERS,
        )
        assert r.status_code == 400

    def test_wrong_player_turn(self):
        gid, p1, p2 = setup_active_game()
        # p2 fires before it's their turn (p1 goes first)
        r = fire(gid, p2, 0, 0)
        assert r.status_code == 403

    def test_invalid_player_fires(self):
        gid, p1, p2 = setup_active_game()
        r = fire(gid, 99999, 0, 0)
        assert r.status_code == 403

    def test_fire_on_waiting_game(self):
        p = create_player("fw1")
        gid = create_game(p, max_players=1)
        r = fire(gid, p, 0, 0)
        assert r.status_code == 403

    def test_repeat_shot_rejected(self):
        gid, p1, p2 = setup_active_game()
        fire(gid, p1, 9, 9)  # p1 misses
        fire(gid, p2, 9, 8)  # p2 misses
        fire(gid, p1, 9, 9)  # p1 tries same cell again
        # Actually p1 fires a different cell first to get turn back
        # Simpler: fire same cell twice in sequence after getting turn twice
        # We'll just check direct repeat in same turn context:
        r = fire(gid, p1, 9, 9)
        assert r.status_code == 400

    def test_hit_and_miss_result(self):
        gid, p1, p2 = setup_active_game()
        # p1 fires at p2's ship (5,5)
        r = fire(gid, p1, 5, 5)
        assert r.status_code == 200
        assert r.json()["result"] == "hit"
        assert r.json()["game_status"] == "active"

    def test_miss_result(self):
        gid, p1, p2 = setup_active_game()
        r = fire(gid, p1, 9, 9)
        assert r.status_code == 200
        assert r.json()["result"] == "miss"

    def test_game_completion_and_winner(self):
        """Eliminate all p2 ships to finish the game."""
        gid, p1, p2 = setup_active_game()
        # p2 ships: (5,5),(6,6),(7,7)
        # p1 fires all 3, p2 fires blanks in between
        fire(gid, p1, 5, 5)
        fire(gid, p2, 9, 9)
        fire(gid, p1, 6, 6)
        fire(gid, p2, 9, 8)
        r = fire(gid, p1, 7, 7)
        assert r.status_code == 200
        data = r.json()
        assert data["game_status"] == "finished"
        assert data["winner_id"] == p1
        assert data["next_player_id"] is None


# ---------------------------------------------------------------------------
# GET /api/players/{id}/stats
# ---------------------------------------------------------------------------

class TestStats:
    def test_stats_after_game(self):
        gid, p1, p2 = setup_active_game()
        # p1 wins by eliminating p2
        fire(gid, p1, 5, 5)
        fire(gid, p2, 9, 9)
        fire(gid, p1, 6, 6)
        fire(gid, p2, 9, 8)
        fire(gid, p1, 7, 7)

        r = requests.get(f"{BASE}/api/players/{p1}/stats")
        assert r.status_code == 200
        s = r.json()
        assert s["wins"] == 1
        assert s["losses"] == 0
        assert s["games_played"] == 1
        assert s["total_shots"] == 3
        assert s["total_hits"] == 3
        assert abs(s["accuracy"] - 1.0) < 0.001

    def test_stats_loser(self):
        gid, p1, p2 = setup_active_game()
        fire(gid, p1, 5, 5)
        fire(gid, p2, 9, 9)
        fire(gid, p1, 6, 6)
        fire(gid, p2, 9, 8)
        fire(gid, p1, 7, 7)

        r = requests.get(f"{BASE}/api/players/{p2}/stats")
        assert r.status_code == 200
        s = r.json()
        assert s["wins"] == 0
        assert s["losses"] == 1
        assert s["games_played"] == 1

    def test_stats_not_found(self):
        r = requests.get(f"{BASE}/api/players/99999/stats")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/games/{id}/moves
# ---------------------------------------------------------------------------

class TestMoves:
    def test_moves_chronological(self):
        gid, p1, p2 = setup_active_game()
        fire(gid, p1, 5, 5)
        fire(gid, p2, 0, 0)
        r = requests.get(f"{BASE}/api/games/{gid}/moves")
        assert r.status_code == 200
        moves = r.json()["moves"]
        assert len(moves) == 2
        assert moves[0]["player_id"] == p1
        assert moves[1]["player_id"] == p2
        assert "timestamp" in moves[0]

    def test_moves_game_not_found(self):
        r = requests.get(f"{BASE}/api/games/99999/moves")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# TEST MODE gating
# ---------------------------------------------------------------------------

class TestModeGating:
    def test_test_endpoints_disabled_when_test_mode_false(self):
        """
        This test assumes the server is running with TEST_MODE=false.
        If your server has TEST_MODE=true, this will fail by design — that's correct.
        """
        p = create_player("tg1")
        gid = create_game(p, max_players=1)
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode != "true":
            r = requests.get(
                f"{BASE}/api/test/games/{gid}/board/{p}",
                headers=TEST_HEADER,
            )
            assert r.status_code == 403

    def test_test_endpoints_require_header(self):
        """When TEST_MODE=true, missing header → 403."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode == "true":
            p = create_player("tg2")
            gid = create_game(p, max_players=1)
            r = requests.get(f"{BASE}/api/test/games/{gid}/board/{p}")
            assert r.status_code == 403

    def test_test_endpoints_legacy_header_still_works(self):
        """When TEST_MODE=true, legacy X-Test-Password is still accepted."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode == "true":
            p = create_player("tg-legacy")
            gid = create_game(p, max_players=1)
            r = requests.get(
                f"{BASE}/api/test/games/{gid}/board/{p}",
                headers=LEGACY_TEST_HEADER,
            )
            assert r.status_code == 200

    def test_test_endpoints_wrong_password(self):
        """When TEST_MODE=true, wrong header → 403."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode == "true":
            p = create_player("tg3")
            gid = create_game(p, max_players=1)
            r = requests.get(
                f"{BASE}/api/test/games/{gid}/board/{p}",
                headers={"X-Test-Mode": "wrong-password"},
            )
            assert r.status_code == 403

    def test_board_reveal_test_mode(self):
        """Full board reveal with correct credentials (only runs if TEST_MODE=true)."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode != "true":
            pytest.skip("TEST_MODE not enabled")

        p = create_player("tg4")
        gid = create_game(p, max_players=1)
        place_ships(gid, p, [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}])

        r = requests.get(
            f"{BASE}/api/test/games/{gid}/board/{p}",
            headers=TEST_HEADER,
        )
        assert r.status_code == 200
        data = r.json()
        assert "board" in data
        assert "ships" in data
        assert len(data["ships"]) == 3

    def test_restart_test_mode(self):
        """Restart resets ships/moves but not stats (only runs if TEST_MODE=true)."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode != "true":
            pytest.skip("TEST_MODE not enabled")

        p1 = create_player("tr1")
        p2 = create_player("tr2")
        gid = create_game(p1, max_players=2)
        join_game(gid, p2)
        place_ships(gid, p1, [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}])
        place_ships(gid, p2, [{"row": 5, "col": 5}, {"row": 6, "col": 6}, {"row": 7, "col": 7}])

        r = requests.post(
            f"{BASE}/api/test/games/{gid}/restart",
            headers=TEST_HEADER,
        )
        assert r.status_code == 200

        game = requests.get(f"{BASE}/api/games/{gid}").json()
        assert game["status"] == "waiting"

    def test_board_reveal_query_param_variant(self):
        """GET /api/test/games/{id}/board?playerId=... works when TEST_MODE=true."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode != "true":
            pytest.skip("TEST_MODE not enabled")

        p = create_player("tg-query")
        gid = create_game(p, max_players=1)
        place_ships(gid, p, [{"row": 0, "col": 0}, {"row": 1, "col": 1}, {"row": 2, "col": 2}])

        r = requests.get(
            f"{BASE}/api/test/games/{gid}/board",
            params={"playerId": p},
            headers=TEST_HEADER,
        )
        assert r.status_code == 200
        data = r.json()
        assert "hits" in data
        assert "misses" in data
        assert "sunk" in data

    def test_test_ships_accepts_grader_payload(self):
        """POST /api/test/games/{id}/ships accepts camelCase + coordinates payload."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode != "true":
            pytest.skip("TEST_MODE not enabled")

        p = create_player("tg-ships")
        gid = create_game(p, max_players=1)
        payload = {
            "playerId": p,
            "ships": [
                {"type": "destroyer", "coordinates": [[0, 0], [0, 1]]},
                {"type": "patrol", "coordinates": [[1, 1]]},
            ],
        }
        r = requests.post(
            f"{BASE}/api/test/games/{gid}/ships",
            json=payload,
            headers=TEST_HEADER,
        )
        assert r.status_code == 200

    def test_test_reset_alias_endpoint(self):
        """POST /api/test/games/{id}/reset behaves like restart."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode != "true":
            pytest.skip("TEST_MODE not enabled")

        gid, p1, p2 = setup_active_game()
        fire(gid, p1, 5, 5)

        r = requests.post(
            f"{BASE}/api/test/games/{gid}/reset",
            headers=TEST_HEADER,
        )
        assert r.status_code == 200

        game = requests.get(f"{BASE}/api/games/{gid}").json()
        assert game["status"] == "waiting"

    def test_set_turn_endpoint(self):
        """POST /api/test/games/{id}/set-turn forces current player."""
        test_mode = os.environ.get("TEST_MODE", "false").lower()
        if test_mode != "true":
            pytest.skip("TEST_MODE not enabled")

        gid, p1, p2 = setup_active_game()

        r = requests.post(
            f"{BASE}/api/test/games/{gid}/set-turn",
            json={"playerId": p2},
            headers=TEST_HEADER,
        )
        assert r.status_code == 200

        game = requests.get(f"{BASE}/api/games/{gid}").json()
        assert game["current_player_id"] == p2
