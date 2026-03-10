"""
test_routes.py — All /api/test/* endpoints (only accessible when TEST_MODE=true).

Board state response schema (GET /api/test/games/{id}/board/{player_id}):
{
  "player_id": <int>,
  "game_id":   <int>,
  "grid_size": <int>,
  "ships":     [[row, col], ...],          -- player's ship positions
  "hits_received": [[row, col], ...],      -- enemy shots that hit player's ships
  "board": [                               -- grid_size x grid_size 2D array
    [".", "S", "X", ...]                   -- "." = empty, "S" = intact ship, "X" = hit ship
  ]
}
"""

from flask import Blueprint, request, jsonify
from .db import get_conn
from .test_gate import require_test_mode
from .game_logic import check_and_activate_game

test_api = Blueprint("test_api", __name__, url_prefix="/api/test")


def err(msg, code):
    return jsonify({"error": msg}), code


# ---------------------------------------------------------------------------
# POST /api/test/games/<id>/restart
# ---------------------------------------------------------------------------

@test_api.route("/games/<int:game_id>/restart", methods=["POST"])
def restart_game(game_id):
    gate = require_test_mode()
    if gate:
        return gate

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT game_id FROM games WHERE game_id=%s", (game_id,))
            if not cur.fetchone():
                return err("Game not found", 404)

            # Delete moves and ships for this game
            cur.execute("DELETE FROM moves WHERE game_id=%s", (game_id,))
            cur.execute("DELETE FROM ships WHERE game_id=%s", (game_id,))

            # Reset game to waiting, reset turn index
            cur.execute(
                "UPDATE games SET status='waiting', current_turn_index=0 WHERE game_id=%s",
                (game_id,),
            )

            # Reset player placement flags and elimination flags (but NOT stats)
            cur.execute(
                """
                UPDATE game_players
                SET ships_placed=FALSE, is_eliminated=FALSE
                WHERE game_id=%s
                """,
                (game_id,),
            )
        conn.commit()

    return jsonify({"message": "Game restarted", "game_id": game_id}), 200


# ---------------------------------------------------------------------------
# POST /api/test/games/<id>/ships
# ---------------------------------------------------------------------------

@test_api.route("/games/<int:game_id>/ships", methods=["POST"])
def place_ships_test_mode(game_id):
    """
    Deterministic ship placement for grading.
    Same validation rules as production place, but bypasses the 'placed twice' guard
    so autograder can set ships after a restart.
    """
    gate = require_test_mode()
    if gate:
        return gate

    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    player_id = body.get("player_id")
    ships     = body.get("ships")

    if player_id is None:
        return err("player_id is required", 400)

    if not isinstance(ships, list) or len(ships) != 3:
        return err("ships must be an array of exactly 3 positions", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, grid_size FROM games WHERE game_id=%s", (game_id,)
            )
            game = cur.fetchone()
            if not game:
                return err("Game not found", 404)

            # Player must be in game
            cur.execute(
                "SELECT 1 FROM game_players WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )
            if not cur.fetchone():
                return err("Player is not in this game", 403)

            gs = game["grid_size"]
            coords = []
            for s in ships:
                if not isinstance(s, dict):
                    return err("Each ship must be an object with integer row and col", 400)
                r = s.get("row")
                c = s.get("col")
                if r is None or c is None or not isinstance(r, int) or not isinstance(c, int):
                    return err("Each ship must have integer row and col", 400)
                if not (0 <= r < gs and 0 <= c < gs):
                    return err(f"Ship coordinate ({r},{c}) is out of bounds", 400)
                coords.append((r, c))

            if len(set(coords)) != len(coords):
                return err("Ships cannot overlap", 400)

            # Remove any existing ships for this player in this game (deterministic reset)
            cur.execute(
                "DELETE FROM ships WHERE game_id=%s AND player_id=%s", (game_id, player_id)
            )

            for r, c in coords:
                cur.execute(
                    "INSERT INTO ships (game_id, player_id, row, col) VALUES (%s,%s,%s,%s)",
                    (game_id, player_id, r, c),
                )

            cur.execute(
                "UPDATE game_players SET ships_placed=TRUE WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )

            # Attempt to activate game if all players have placed
            check_and_activate_game(cur, game_id)
        conn.commit()

    return jsonify({"message": "Ships placed (test mode)", "game_id": game_id, "player_id": player_id}), 200


# ---------------------------------------------------------------------------
# GET /api/test/games/<id>/board/<player_id>
# ---------------------------------------------------------------------------

@test_api.route("/games/<int:game_id>/board/<int:player_id>", methods=["GET"])
def get_board(game_id, player_id):
    """
    Reveal full board state for a player.

    Board cell legend:
      "."  = empty, no ship, not fired at by this player
      "S"  = intact ship cell (not yet hit)
      "X"  = ship cell that has been hit
    """
    gate = require_test_mode()
    if gate:
        return gate

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT grid_size FROM games WHERE game_id=%s", (game_id,))
            game = cur.fetchone()
            if not game:
                return err("Game not found", 404)

            cur.execute(
                "SELECT 1 FROM game_players WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )
            if not cur.fetchone():
                return err("Player not found in this game", 404)

            gs = game["grid_size"]

            # Player's ships
            cur.execute(
                "SELECT row, col FROM ships WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )
            ship_cells = {(r["row"], r["col"]) for r in cur.fetchall()}

            # Hits received on this player's ships (by anyone)
            cur.execute(
                """
                SELECT m.row, m.col
                FROM moves m
                JOIN ships s ON s.game_id=m.game_id AND s.row=m.row AND s.col=m.col
                             AND s.player_id=%s
                WHERE m.game_id=%s AND m.result='hit'
                """,
                (player_id, game_id),
            )
            hit_cells = {(r["row"], r["col"]) for r in cur.fetchall()}

    # Build 2D grid
    grid = [["." for _ in range(gs)] for _ in range(gs)]
    for r, c in ship_cells:
        if (r, c) in hit_cells:
            grid[r][c] = "X"
        else:
            grid[r][c] = "S"

    return jsonify({
        "player_id":     player_id,
        "game_id":       game_id,
        "grid_size":     gs,
        "ships":         [[r, c] for r, c in sorted(ship_cells)],
        "hits_received": [[r, c] for r, c in sorted(hit_cells)],
        "board":         grid,
    }), 200
