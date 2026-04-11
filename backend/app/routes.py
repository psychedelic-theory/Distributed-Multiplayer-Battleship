from flask import Blueprint, request, jsonify
from app.db import get_db

bp = Blueprint("routes", __name__, url_prefix="/api")

# ------------------------
# HEALTH CHECK
# ------------------------
@bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


# ------------------------
# CREATE PLAYER
# ------------------------
@bp.route("/players", methods=["POST"])
def create_player():
    db = get_db()

    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "bad_request"}), 400

    username = data.get("username") or data.get("name")

    if not username:
        return jsonify({"error": "bad_request"}), 400

    # validate username (only alphanumeric)
    if not username.isalnum():
        return jsonify({"error": "bad_request"}), 400

    # check duplicate
    existing = db.execute(
        "SELECT id FROM players WHERE username = ?",
        (username,)
    ).fetchone()

    if existing:
        return jsonify({"error": "conflict"}), 409

    cur = db.execute(
        "INSERT INTO players (username) VALUES (?)",
        (username,)
    )
    db.commit()

    player_id = cur.lastrowid

    return jsonify({
        "player_id": player_id,
        "playerId": player_id,
        "username": username,
        "name": username
    }), 201


# ------------------------
# RESET (KEEP PLAYERS)
# ------------------------
@bp.route("/reset", methods=["POST"])
def reset():
    db = get_db()

    db.execute("DELETE FROM games")
    db.execute("DELETE FROM game_players")
    db.execute("DELETE FROM ships")
    db.execute("DELETE FROM shots")

    db.commit()

    return jsonify({"status": "reset"}), 200


# ------------------------
# TEST: RESTART GAME
# ------------------------
@bp.route("/test/games/<int:game_id>/restart", methods=["POST"])
def test_restart(game_id):
    password = request.headers.get("X-Test-Password")

    if password != "test":
        return jsonify({"error": "forbidden"}), 403

    db = get_db()

    db.execute("UPDATE games SET status='waiting_setup' WHERE id=?", (game_id,))
    db.execute("DELETE FROM ships WHERE game_id=?", (game_id,))
    db.execute("DELETE FROM shots WHERE game_id=?", (game_id,))

    db.commit()

    return jsonify({
        "status": "reset",
        "game_id": game_id
    }), 200


# ------------------------
# TEST: VIEW BOARD
# ------------------------
@bp.route("/test/games/<int:game_id>/board/<int:player_id>", methods=["GET"])
def test_board(game_id, player_id):
    password = request.headers.get("X-Test-Password")

    if password != "test":
        return jsonify({"error": "forbidden"}), 403

    db = get_db()

    game = db.execute("SELECT * FROM games WHERE id=?", (game_id,)).fetchone()
    if not game:
        return jsonify({"error": "not_found"}), 404

    player = db.execute("SELECT * FROM players WHERE id=?", (player_id,)).fetchone()
    if not player:
        return jsonify({"error": "not_found"}), 404

    ships = db.execute(
        "SELECT x, y FROM ships WHERE game_id=? AND player_id=?",
        (game_id, player_id)
    ).fetchall()

    shots = db.execute(
        "SELECT x, y, result FROM shots WHERE game_id=?",
        (game_id,)
    ).fetchall()

    return jsonify({
        "ships": [dict(s) for s in ships],
        "shots": [dict(s) for s in shots]
    }), 200


# ------------------------
# FIRE (FIXED LOGIC)
# ------------------------
@bp.route("/games/<int:game_id>/fire", methods=["POST"])
def fire(game_id):
    db = get_db()

    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "bad_request"}), 400

    player_id = data.get("player_id")
    x = data.get("x")
    y = data.get("y")

    if player_id is None or x is None or y is None:
        return jsonify({"error": "bad_request"}), 400

    game = db.execute(
        "SELECT * FROM games WHERE id=?",
        (game_id,)
    ).fetchone()

    if not game:
        return jsonify({"error": "not_found"}), 404

    if game["status"] == "finished":
        return jsonify({"error": "game_over"}), 410

    if game["status"] != "playing":
        return jsonify({"error": "forbidden"}), 403

    # prevent duplicate fire (GLOBAL per cell)
    existing = db.execute(
        "SELECT * FROM shots WHERE game_id=? AND x=? AND y=?",
        (game_id, x, y)
    ).fetchone()

    if existing:
        return jsonify({"error": "conflict"}), 409

    # check hit
    hit = db.execute(
        "SELECT * FROM ships WHERE game_id=? AND x=? AND y=?",
        (game_id, x, y)
    ).fetchone()

    result = "hit" if hit else "miss"

    db.execute(
        "INSERT INTO shots (game_id, player_id, x, y, result) VALUES (?, ?, ?, ?, ?)",
        (game_id, player_id, x, y, result)
    )
    db.commit()

    return jsonify({
        "result": result
    }), 200