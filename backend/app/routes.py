"""
routes.py — All production /api/* endpoints.

Rules enforced here:
  - JSON only (request.get_json(silent=True))
  - Correct HTTP status codes per PRD
  - Server-generated IDs only (reject client-supplied player_id on creation)
  - All game state transitions go through game_logic helpers
"""

import os

from flask import Blueprint, request, jsonify
import re
from psycopg.errors import UniqueViolation
from .db import get_conn
from .game_logic import (
    get_current_player_id,
    is_player_eliminated,
    check_and_activate_game,
    count_active_players,
    advance_turn,
    update_stats_on_finish,
    get_current_player_id,
)

api = Blueprint("api", __name__, url_prefix="/api")

# ---------------------------------------------------------------------------
# Testing headers debug - temporary
# ---------------------------------------------------------------------------
@api.route("/debug-headers", methods=["GET", "POST"])
def debug_headers():
     return jsonify({
        "received_headers": dict(request.headers),
        "TEST_MODE_env": os.environ.get("TEST_MODE", "NOT_SET"),
        "X-Test-Password": request.headers.get("X-Test-Password", "MISSING"),
        "X-Test-Mode": request.headers.get("X-Test-Mode", "MISSING"),
    }), 200


# ---------------------------------------------------------------------------
# GET /api/health
# ---------------------------------------------------------------------------

@api.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "gate-fix-v2"}), 200


# ---------------------------------------------------------------------------
# Helper: respond with JSON error
# ---------------------------------------------------------------------------

def err(msg, code):
    return jsonify({"error": msg}), code


# ---------------------------------------------------------------------------
# POST /api/reset
# ---------------------------------------------------------------------------

@api.route("/reset", methods=["POST"])
def reset():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                TRUNCATE TABLE moves, ships, game_players, games, players
                RESTART IDENTITY CASCADE
            """)
        conn.commit()
    return jsonify({"status": "reset"}), 200


# ---------------------------------------------------------------------------
# POST /api/players
# ---------------------------------------------------------------------------

@api.route("/players", methods=["POST"])
def create_player():
    body = request.get_json(silent=True)
    if body is None:
        return err("bad_request", 400)

    if "player_id" in body:
        return err("bad_request", 400)

    username = body.get("username")

    if username is None:
        return err("bad_request", 400)
    if not isinstance(username, str):
        return err("bad_request", 400)

    username = username.strip()

    if not username:
        return err("bad_request", 400)
    if len(username) > 30:
        return err("bad_request", 400)
    if not re.fullmatch(r"[A-Za-z0-9_]+", username):
        return err("bad_request", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO players (username) VALUES (%s) RETURNING player_id",
                    (username,),
                )
                player_id = cur.fetchone()["player_id"]
            except UniqueViolation:
                conn.rollback()
                return err("username already taken", 409)

        conn.commit()

    return jsonify({"player_id": player_id}), 201


# ---------------------------------------------------------------------------
# GET /api/players/<id>
# ---------------------------------------------------------------------------

@api.route("/players/<int:player_id>", methods=["GET"])
def get_player(player_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT player_id, username
                FROM players WHERE player_id=%s
                """,
                (player_id,),
            )
            row = cur.fetchone()

    if not row:
        return err("Player not found", 404)

    return jsonify({
        "player_id": row["player_id"],
        "username": row["username"],
    }), 200


# ---------------------------------------------------------------------------
# GET /api/players/by-username/<username>
# ---------------------------------------------------------------------------

@api.route("/players/by-username/<username>", methods=["GET"])
def get_player_by_username(username):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT player_id, username FROM players WHERE username=%s",
                (username,),
            )
            row = cur.fetchone()

    if not row:
        return err("Player not found", 404)

    return jsonify({
        "player_id": row["player_id"],
        "username":  row["username"],
    }), 200


# ---------------------------------------------------------------------------
# GET /api/players/<id>/stats
# ---------------------------------------------------------------------------

@api.route("/players/<int:player_id>/stats", methods=["GET"])
def get_stats(player_id):
    with get_conn() as conn:
        with conn.cursor() as cur:

            # FIRST: verify player exists
            cur.execute(
                "SELECT 1 FROM players WHERE player_id=%s",
                (player_id,),
            )
            if cur.fetchone() is None:
                return err("Player not found", 404)

            # THEN: fetch stats
            cur.execute(
                """
                SELECT games_played, wins, losses, total_shots, total_hits, accuracy
                FROM players WHERE player_id=%s
                """,
                (player_id,),
            )
            row = cur.fetchone()

    return jsonify({
        "games_played": row["games_played"],
        "wins":         row["wins"],
        "losses":       row["losses"],
        "total_shots":  row["total_shots"],
        "total_hits":   row["total_hits"],
        "accuracy":     float(row["accuracy"]),
    }), 200


# ---------------------------------------------------------------------------
# POST /api/games
# ---------------------------------------------------------------------------

@api.route("/games", methods=["POST"])
def create_game():
    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    creator_id  = body.get("creator_id")
    grid_size   = body.get("grid_size")
    max_players = body.get("max_players")

    if creator_id is None or grid_size is None or max_players is None:
        return err("creator_id, grid_size, and max_players are required", 400)

    if not isinstance(creator_id, int):
        return err("creator_id must be an integer", 400)

    if not isinstance(grid_size, int) or not (5 <= grid_size <= 15):
        return err("grid_size must be an integer between 5 and 15", 400)

    if not isinstance(max_players, int) or max_players < 2:
        return err("max_players must be an integer >= 2", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify creator exists
            cur.execute("SELECT player_id FROM players WHERE player_id=%s", (creator_id,))
            if not cur.fetchone():
                return err("Creator player not found", 404)

            # Create game only; do NOT auto-join creator
            cur.execute(
                """
                INSERT INTO games (grid_size, max_players, status, current_turn_index)
                VALUES (%s, %s, 'waiting', 0) RETURNING game_id
                """,
                (grid_size, max_players),
            )
            game_id = cur.fetchone()["game_id"]

        conn.commit()

    return jsonify({
        "game_id": game_id,
        "status": "waiting_setup",
        "waiting": True,
        "grid_size": grid_size,
        "max_players": max_players,
    }), 201


# ---------------------------------------------------------------------------
# POST /api/games/<id>/join
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>/join", methods=["POST"])
def join_game(game_id):
    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    player_id = body.get("player_id") or body.get("playerId")
    if player_id is None:
        return err("player_id is required", 400)
    if not isinstance(player_id, int):
        return err("player_id must be an integer", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Game must exist
            cur.execute(
                "SELECT status, max_players FROM games WHERE game_id=%s FOR UPDATE", (game_id,)
            )
            game = cur.fetchone()
            if not game:
                return err("Game not found", 404)

            if game["status"] != "waiting":
                return err("Game is not in waiting state", 400)

            # Player must exist
            cur.execute("SELECT player_id FROM players WHERE player_id=%s", (player_id,))
            if not cur.fetchone():
                return err("Player not found", 404)

            # Duplicate join check (PRD addendum)
            cur.execute(
                "SELECT 1 FROM game_players WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )
            if cur.fetchone():
                return err("Player already joined this game", 400)

            # Check capacity
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM game_players WHERE game_id=%s", (game_id,)
            )
            count = cur.fetchone()["cnt"]
            if count >= game["max_players"]:
                return err("Game is full", 400)

            # Assign next turn_order slot
            try:
                cur.execute(
                    "INSERT INTO game_players (game_id, player_id, turn_order) VALUES (%s, %s, %s)",
                    (game_id, player_id, count),
                )
            except UniqueViolation:
                conn.rollback()
                return err("Game state changed, please retry join", 409)
        conn.commit()

    return jsonify({
    "status": "joined",
    "message": "Joined game successfully"
    }), 200


# ---------------------------------------------------------------------------
# GET /api/games/<id>
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>", methods=["GET"])
def get_game(game_id):
    current_turn_player_id = None
    active_players = 0
    total_moves = 0

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT game_id, grid_size, max_players, status, current_turn_index
                FROM games WHERE game_id=%s
                """,
                (game_id,),
            )
            game = cur.fetchone()
            if not game:
                return err("Game not found", 404)

            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM game_players
                WHERE game_id=%s AND is_eliminated=FALSE
                """,
                (game_id,),
            )
            active_players = cur.fetchone()["cnt"]

            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM moves
                WHERE game_id=%s
                """,
                (game_id,),
            )
            total_moves = cur.fetchone()["cnt"]

            if game["status"] == "active":
                current_turn_player_id = get_current_player_id(
                    cur, game_id, game["current_turn_index"]
                )

    if game["status"] == "waiting":
        api_status = "waiting_setup"
    elif game["status"] == "active":
        api_status = "playing"
    else:
        api_status = game["status"]

    return jsonify({
        "game_id": game["game_id"],
        "grid_size": game["grid_size"],
        "max_players": game["max_players"],
        "status": api_status,
        "current_turn_index": game["current_turn_index"],
        "active_players": active_players,
        "current_turn_player_id": current_turn_player_id,
        "total_moves": total_moves,
    }), 200


# ---------------------------------------------------------------------------
# POST /api/games/<id>/place
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>/place", methods=["POST"])
def place_ships(game_id):
    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    player_id = body.get("player_id") or body.get("playerId")
    ships = body.get("ships")

    if player_id is None:
        return err("player_id is required", 400)
    if not isinstance(player_id, int):
        return err("player_id must be an integer", 400)

    # ship_index: 0=Battleship(5 cells), 1=Cruiser(3 cells), 2=Destroyer(2 cells)
    SHIP_SIZES = [5, 3, 2]
    TOTAL_CELLS = sum(SHIP_SIZES)  # 10

    if not isinstance(ships, list) or len(ships) != TOTAL_CELLS:
        return err(f"ships must be an array of exactly {TOTAL_CELLS} ship cells", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Game must exist
            cur.execute(
                "SELECT status, grid_size FROM games WHERE game_id=%s FOR UPDATE",
                (game_id,),
            )
            game = cur.fetchone()
            if not game:
                return err("Game not found", 404)

            # Player must be in the game
            cur.execute(
                "SELECT ships_placed FROM game_players WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )
            gp = cur.fetchone()
            if not gp:
                return err("Player is not in this game", 400)

            # Cannot place twice (must come BEFORE status check)
            if gp["ships_placed"]:
                return err("Ships already placed for this player", 409)

            # New placements only allowed during waiting state
            if game["status"] != "waiting":
                return err("Ship placement is only allowed during waiting state", 400)

            gs = game["grid_size"]

            # Group cells by ship_index and validate each
            ships_by_index = {0: [], 1: [], 2: []}
            for s in ships:
                if not isinstance(s, dict):
                    return err("Each ship cell must be an object with row, col, and ship_index", 400)
                r = s.get("row")
                c = s.get("col")
                si = s.get("ship_index")
                if r is None or c is None or si is None:
                    return err("Each ship cell must have integer row, col, and ship_index", 400)
                if not isinstance(r, int) or not isinstance(c, int) or not isinstance(si, int):
                    return err("row, col, and ship_index must be integers", 400)
                if si not in ships_by_index:
                    return err("ship_index must be 0, 1, or 2", 400)
                if not (0 <= r < gs and 0 <= c < gs):
                    return err(f"Ship coordinate ({r},{c}) is out of bounds for grid size {gs}", 400)
                ships_by_index[si].append((r, c))

            # Validate each ship has the correct number of cells
            for si, expected in enumerate(SHIP_SIZES):
                if len(ships_by_index[si]) != expected:
                    return err(
                        f"Ship {si} must have exactly {expected} cells, got {len(ships_by_index[si])}",
                        400,
                    )

            # Validate each ship is contiguous in a straight line
            for si, cells in ships_by_index.items():
                rows = sorted(set(r for r, c in cells))
                cols = sorted(set(c for r, c in cells))
                if len(rows) == 1:
                    expected_cols = list(range(cols[0], cols[0] + len(cells)))
                    if cols != expected_cols:
                        return err(f"Ship {si} cells must be contiguous", 400)
                elif len(cols) == 1:
                    expected_rows = list(range(rows[0], rows[0] + len(cells)))
                    if rows != expected_rows:
                        return err(f"Ship {si} cells must be contiguous", 400)
                else:
                    return err(f"Ship {si} must be placed in a straight horizontal or vertical line", 400)

            # No overlapping cells across ships
            all_coords = [coord for cells in ships_by_index.values() for coord in cells]
            if len(set(all_coords)) != len(all_coords):
                return err("Ships cannot overlap", 400)

            # Insert all ship cells
            for si, cells in ships_by_index.items():
                for r, c in cells:
                    cur.execute(
                        "INSERT INTO ships (game_id, player_id, ship_index, row, col) VALUES (%s, %s, %s, %s, %s)",
                        (game_id, player_id, si, r, c),
                    )

            # Mark ships placed
            cur.execute(
                "UPDATE game_players SET ships_placed=TRUE WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )

            # Attempt to activate game
            check_and_activate_game(cur, game_id)

        conn.commit()

    return jsonify({
        "status": "placed",
        "message": "Ships placed successfully"
    }), 200


# ---------------------------------------------------------------------------
# POST /api/games/<id>/fire
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>/fire", methods=["POST"])
def fire(game_id):
    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    player_id = body.get("player_id") or body.get("playerId")
    row = body.get("row")
    col = body.get("col")

    if player_id is None or row is None or col is None:
        return err("player_id, row, and col are required", 400)
    if not isinstance(player_id, int):
        return err("player_id must be an integer", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Game must exist
            cur.execute(
                """
                SELECT game_id, status, current_turn_index, grid_size
                FROM games
                WHERE game_id=%s
                FOR UPDATE
                """,
                (game_id,),
            )
            game = cur.fetchone()
            if not game:
                return err("Game not found", 404)

            # Reject fire when the game has not started or is already over
            if game["status"] == "finished":
                return err("Game is not active", 400)
            if game["status"] != "active":
                return err("Game is not active", 400)

            # Player must be in this game
            cur.execute(
                """
                SELECT is_eliminated
                FROM game_players
                WHERE game_id=%s AND player_id=%s
                """,
                (game_id, player_id),
            )
            gp = cur.fetchone()
            if not gp:
                return err("Player is not in this game", 400)

            # REF0064 fix:
            # Check that all players have placed ships before allowing fire
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM game_players
                WHERE game_id=%s AND ships_placed=FALSE
                """,
                (game_id,),
            )
            not_ready = cur.fetchone()["cnt"]
            if not_ready > 0:
                return err("Game is not ready to start", 400)

            # It must be this player's turn
            current_pid = get_current_player_id(cur, game_id, game["current_turn_index"])
            if current_pid != player_id:
                return err("It is not this player's turn", 403)

            # Validate coordinates
            gs = game["grid_size"]
            if not (
                isinstance(row, int)
                and isinstance(col, int)
                and 0 <= row < gs
                and 0 <= col < gs
            ):
                return err(f"Coordinates ({row},{col}) are out of bounds", 400)

            # Reject repeat shots by the same shooter at the same cell in this game
            cur.execute(
                """
                SELECT 1
                FROM moves
                WHERE game_id=%s AND player_id=%s AND row=%s AND col=%s
                """,
                (game_id, player_id, row, col),
            )
            if cur.fetchone():
                return err("You already fired at this cell", 409)

            # Determine hit or miss
            cur.execute(
                """
                SELECT s.player_id
                FROM ships s
                WHERE s.game_id=%s AND s.row=%s AND s.col=%s
                """,
                (game_id, row, col),
            )
            ship_row = cur.fetchone()

            if ship_row and ship_row["player_id"] != player_id:
                cur.execute(
                    """
                    SELECT 1
                    FROM moves
                    WHERE game_id=%s AND row=%s AND col=%s AND result='hit'
                    """,
                    (game_id, row, col),
                )
                already_hit = cur.fetchone()
                result = "hit" if not already_hit else "miss"
            else:
                result = "miss"

            # Log the move
            try:
                cur.execute(
                    """
                    INSERT INTO moves (game_id, player_id, row, col, result)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (game_id, player_id, row, col, result),
                )
            except UniqueViolation:
                conn.rollback()
                return err("You already fired at this cell", 409)

            # Check elimination
            if result == "hit" and ship_row:
                target_pid = ship_row["player_id"]
                if is_player_eliminated(cur, game_id, target_pid):
                    cur.execute(
                        """
                        UPDATE game_players
                        SET is_eliminated=TRUE
                        WHERE game_id=%s AND player_id=%s
                        """,
                        (game_id, target_pid),
                    )

            # Check game completion
            active_count = count_active_players(cur, game_id)

            if active_count <= 1:
                cur.execute(
                    """
                    SELECT player_id
                    FROM game_players
                    WHERE game_id=%s AND is_eliminated=FALSE
                    """,
                    (game_id,),
                )
                winner_row = cur.fetchone()
                winner_id = winner_row["player_id"] if winner_row else player_id

                cur.execute(
                    "UPDATE games SET status='finished' WHERE game_id=%s",
                    (game_id,),
                )
                update_stats_on_finish(cur, game_id, winner_id)
                conn.commit()

                return jsonify({
                    "result": result,
                    "next_player_id": None,
                    "game_status": "finished",
                    "winner_id": winner_id,
                }), 200

            # Advance turn
            next_turn_idx, next_player_id, finished = advance_turn(
                cur, game_id, game["current_turn_index"]
            )
            cur.execute(
                "UPDATE games SET current_turn_index=%s WHERE game_id=%s",
                (next_turn_idx, game_id),
            )
        conn.commit()

    return jsonify({
        "result": result,
        "next_player_id": next_player_id,
        "game_status": "playing",
    }), 200


# ---------------------------------------------------------------------------
# GET /api/games/<id>/moves
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>/moves", methods=["GET"])
def get_moves(game_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM games WHERE game_id=%s", (game_id,))
            if not cur.fetchone():
                return err("Game not found", 404)

            cur.execute(
                """
                SELECT player_id, row, col, result,
                       created_at AT TIME ZONE 'UTC' AS timestamp
                FROM moves
                WHERE game_id=%s
                ORDER BY created_at ASC
                """,
                (game_id,),
            )
            rows = cur.fetchall()

    moves = [
        {
            "player_id": r["player_id"],
            "row":       r["row"],
            "col":       r["col"],
            "result":    r["result"],
            "timestamp": r["timestamp"].isoformat() + "Z",
        }
        for r in rows
    ]
    return jsonify({"moves": moves}), 200

# ---------------------------------------------------------------------------
# GET /api/players
# ---------------------------------------------------------------------------

@api.route("/players", methods=["GET"])
def list_players():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT player_id, username
                FROM players
                ORDER BY player_id ASC
                """
            )
            rows = cur.fetchall()

    return jsonify({
        "players": [
            {
                "player_id": row["player_id"],
                "playerId": row["player_id"],
                "username": row["username"],
                "name": row["username"],
                "displayName": row["username"],
            }
            for row in rows
        ]
    }), 200


# ---------------------------------------------------------------------------
# GET /api/games
# ---------------------------------------------------------------------------

@api.route("/games", methods=["GET"])
def list_games():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT game_id, grid_size, max_players, status, current_turn_index
                FROM games
                ORDER BY game_id ASC
                """
            )
            rows = cur.fetchall()

    return jsonify({
        "games": [
            {
                "game_id": row["game_id"],
                "grid_size": row["grid_size"],
                "max_players": row["max_players"],
                "status": row["status"],
                "current_turn_index": row["current_turn_index"],
            }
            for row in rows
        ]
    }), 200