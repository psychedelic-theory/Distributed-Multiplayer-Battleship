"""
routes.py — All production /api/* endpoints.

Rules enforced here:
  - JSON only (request.get_json(silent=True))
  - Correct HTTP status codes per PRD
  - Server-generated IDs only (reject client-supplied player_id on creation)
  - All game state transitions go through game_logic helpers
"""

from flask import Blueprint, request, jsonify
from .db import get_conn
from .game_logic import (
    get_current_player_id,
    is_player_eliminated,
    check_and_activate_game,
    count_active_players,
    advance_turn,
    update_stats_on_finish,
)

api = Blueprint("api", __name__, url_prefix="/api")


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
    """Truncate all game data and player stats (but keep player rows)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Order matters due to FK constraints
            cur.execute("TRUNCATE moves, ships, game_players, games RESTART IDENTITY CASCADE")
            cur.execute(
                """
                UPDATE players
                SET games_played=0, wins=0, losses=0,
                    total_shots=0, total_hits=0, accuracy=0.0
                """
            )
        conn.commit()
    return jsonify({"status": "reset"}), 200


# ---------------------------------------------------------------------------
# POST /api/players
# ---------------------------------------------------------------------------

@api.route("/players", methods=["POST"])
def create_player():
    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    # Reject client-supplied player_id (PRD addendum)
    if "player_id" in body:
        return err("player_id must not be supplied by the client", 400)

    username = body.get("username", "").strip()
    if not username:
        return err("username is required", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check uniqueness
            cur.execute("SELECT player_id FROM players WHERE username=%s", (username,))
            if cur.fetchone():
                return err("username already exists", 400)

            cur.execute(
                "INSERT INTO players (username) VALUES (%s) RETURNING player_id",
                (username,),
            )
            player_id = cur.fetchone()["player_id"]
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
# GET /api/players/<id>/stats
# ---------------------------------------------------------------------------

@api.route("/players/<int:player_id>/stats", methods=["GET"])
def get_stats(player_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT games_played, wins, losses, total_shots, total_hits, accuracy
                FROM players WHERE player_id=%s
                """,
                (player_id,),
            )
            row = cur.fetchone()

    if not row:
        return err("Player not found", 404)

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

    if not isinstance(grid_size, int) or not (5 <= grid_size <= 15):
        return err("grid_size must be an integer between 5 and 15", 400)

    if not isinstance(max_players, int) or max_players < 1:
        return err("max_players must be an integer >= 1", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify creator exists
            cur.execute("SELECT player_id FROM players WHERE player_id=%s", (creator_id,))
            if not cur.fetchone():
                return err("Creator player not found", 404)

            # Create game
            cur.execute(
                """
                INSERT INTO games (grid_size, max_players, status, current_turn_index)
                VALUES (%s, %s, 'waiting', 0) RETURNING game_id
                """,
                (grid_size, max_players),
            )
            game_id = cur.fetchone()["game_id"]

            # Auto-add creator at turn_order=0
            cur.execute(
                """
                INSERT INTO game_players (game_id, player_id, turn_order)
                VALUES (%s, %s, 0)
                """,
                (game_id, creator_id),
            )
        conn.commit()

    return jsonify({"game_id": game_id}), 201


# ---------------------------------------------------------------------------
# POST /api/games/<id>/join
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>/join", methods=["POST"])
def join_game(game_id):
    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    player_id = body.get("player_id")
    if player_id is None:
        return err("player_id is required", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Game must exist
            cur.execute(
                "SELECT status, max_players FROM games WHERE game_id=%s", (game_id,)
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
            cur.execute(
                "INSERT INTO game_players (game_id, player_id, turn_order) VALUES (%s, %s, %s)",
                (game_id, player_id, count),
            )
        conn.commit()

    return jsonify({"message": "Joined game successfully"}), 200


# ---------------------------------------------------------------------------
# GET /api/games/<id>
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>", methods=["GET"])
def get_game(game_id):
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
                "SELECT COUNT(*) AS cnt FROM game_players WHERE game_id=%s AND is_eliminated=FALSE",
                (game_id,),
            )
            active_players = cur.fetchone()["cnt"]

            cur.execute(
                """
                SELECT player_id, turn_order, is_eliminated, ships_placed
                FROM game_players
                WHERE game_id=%s
                ORDER BY turn_order
                """,
                (game_id,),
            )
            players = cur.fetchall()

            current_player_id = None
            if game["status"] == "active":
                current_player_id = get_current_player_id(
                    cur,
                    game_id,
                    game["current_turn_index"],
                )

    return jsonify({
        "game_id":             game["game_id"],
        "grid_size":           game["grid_size"],
        "max_players":         game["max_players"],
        "status":              game["status"],
        "current_turn_index":  game["current_turn_index"],
        "current_player_id":   current_player_id,
        "active_players":      active_players,
        "players": [
            {
                "player_id": p["player_id"],
                "turn_order": p["turn_order"],
                "is_eliminated": p["is_eliminated"],
                "ships_placed": p["ships_placed"],
            }
            for p in players
        ],
    }), 200


# ---------------------------------------------------------------------------
# POST /api/games/<id>/place
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>/place", methods=["POST"])
def place_ships(game_id):
    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    player_id = body.get("player_id")
    ships     = body.get("ships")

    if player_id is None:
        return err("player_id is required", 400)

    if not isinstance(ships, list) or len(ships) != 3:
        return err("ships must be an array of exactly 3 ship positions", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Game must exist
            cur.execute(
                "SELECT status, grid_size FROM games WHERE game_id=%s", (game_id,)
            )
            game = cur.fetchone()
            if not game:
                return err("Game not found", 404)

            if game["status"] != "waiting":
                return err("Ship placement is only allowed during waiting state", 400)

            # Player must be in the game
            cur.execute(
                "SELECT ships_placed FROM game_players WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )
            gp = cur.fetchone()
            if not gp:
                return err("Player is not in this game", 403)

            # Cannot place twice
            if gp["ships_placed"]:
                return err("Ships already placed for this player", 400)

            # Validate each ship coord
            gs = game["grid_size"]
            coords = []
            for s in ships:
                r = s.get("row")
                c = s.get("col")
                if r is None or c is None or not isinstance(r, int) or not isinstance(c, int):
                    return err("Each ship must have integer row and col", 400)
                if not (0 <= r < gs and 0 <= c < gs):
                    return err(f"Ship coordinate ({r},{c}) is out of bounds for grid size {gs}", 400)
                coords.append((r, c))

            # No duplicate coords (overlap)
            if len(set(coords)) != len(coords):
                return err("Ships cannot overlap", 400)

            # Insert ships
            for r, c in coords:
                cur.execute(
                    "INSERT INTO ships (game_id, player_id, row, col) VALUES (%s, %s, %s, %s)",
                    (game_id, player_id, r, c),
                )

            # Mark ships_placed
            cur.execute(
                "UPDATE game_players SET ships_placed=TRUE WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )

            # Attempt to activate the game
            check_and_activate_game(cur, game_id)
        conn.commit()

    return jsonify({"message": "Ships placed successfully"}), 200


# ---------------------------------------------------------------------------
# POST /api/games/<id>/fire
# ---------------------------------------------------------------------------

@api.route("/games/<int:game_id>/fire", methods=["POST"])
def fire(game_id):
    body = request.get_json(silent=True)
    if not body:
        return err("Request body must be valid JSON", 400)

    player_id = body.get("player_id")
    row       = body.get("row")
    col       = body.get("col")

    if player_id is None or row is None or col is None:
        return err("player_id, row, and col are required", 400)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Game must exist
            cur.execute(
                "SELECT game_id, status, current_turn_index, grid_size FROM games WHERE game_id=%s",
                (game_id,),
            )
            game = cur.fetchone()
            if not game:
                return err("Game not found", 404)

            # 403: game not active
            if game["status"] != "active":
                return err("Game is not active", 403)

            # 403: player must be in this game
            cur.execute(
                "SELECT is_eliminated FROM game_players WHERE game_id=%s AND player_id=%s",
                (game_id, player_id),
            )
            gp = cur.fetchone()
            if not gp:
                return err("Player is not in this game", 403)

            # 403: it must be this player's turn
            current_pid = get_current_player_id(cur, game_id, game["current_turn_index"])
            if current_pid != player_id:
                return err("It is not this player's turn", 403)

            # Validate coordinates
            gs = game["grid_size"]
            if not (isinstance(row, int) and isinstance(col, int) and 0 <= row < gs and 0 <= col < gs):
                return err(f"Coordinates ({row},{col}) are out of bounds", 400)

            # Reject repeat shots by the same shooter at the same cell in this game
            cur.execute(
                "SELECT 1 FROM moves WHERE game_id=%s AND player_id=%s AND row=%s AND col=%s",
                (game_id, player_id, row, col),
            )
            if cur.fetchone():
                return err("You already fired at this cell", 400)

            # Determine hit or miss: check if (row, col) is an un-hit ship of any OTHER player
            # First find which player owns that cell (if any)
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
                # Check it hasn't already been hit (by anyone)
                cur.execute(
                    "SELECT 1 FROM moves WHERE game_id=%s AND row=%s AND col=%s AND result='hit'",
                    (game_id, row, col),
                )
                already_hit = cur.fetchone()
                result = "hit" if not already_hit else "miss"
            else:
                result = "miss"

            # Log the move
            cur.execute(
                "INSERT INTO moves (game_id, player_id, row, col, result) VALUES (%s,%s,%s,%s,%s)",
                (game_id, player_id, row, col, result),
            )

            # Check elimination: did we just eliminate the target player?
            if result == "hit" and ship_row:
                target_pid = ship_row["player_id"]
                if is_player_eliminated(cur, game_id, target_pid):
                    cur.execute(
                        "UPDATE game_players SET is_eliminated=TRUE WHERE game_id=%s AND player_id=%s",
                        (game_id, target_pid),
                    )

            # Check game completion (only 1 non-eliminated player remains)
            active_count = count_active_players(cur, game_id)

            if active_count <= 1:
                # Game finished — find the winner (last standing)
                cur.execute(
                    "SELECT player_id FROM game_players WHERE game_id=%s AND is_eliminated=FALSE",
                    (game_id,),
                )
                winner_row = cur.fetchone()
                winner_id  = winner_row["player_id"] if winner_row else player_id

                cur.execute(
                    "UPDATE games SET status='finished' WHERE game_id=%s", (game_id,)
                )
                # Transactional stats update
                update_stats_on_finish(cur, game_id, winner_id)
                conn.commit()

                return jsonify({
                    "result":         result,
                    "next_player_id": None,
                    "game_status":    "finished",
                    "winner_id":      winner_id,
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
        "result":         result,
        "next_player_id": next_player_id,
        "game_status":    "active",
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
