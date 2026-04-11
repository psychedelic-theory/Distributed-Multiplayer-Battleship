from flask import Blueprint, request, jsonify
from app.db import get_db

bp = Blueprint("test_routes", __name__, url_prefix="/api/test")

TEST_PASSWORD = "test"


def check_auth():
    password = request.headers.get("X-Test-Password")
    if password != TEST_PASSWORD:
        return False
    return True


@bp.route("/games/<int:game_id>/ships", methods=["POST"])
def set_ships(game_id):
    if not check_auth():
        return jsonify({"error": "forbidden"}), 403

    db = get_db()

    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "bad_request"}), 400

    player_id = data.get("player_id")
    ships = data.get("ships")

    if not player_id or not ships:
        return jsonify({"error": "bad_request"}), 400

    for ship in ships:
        db.execute(
            "INSERT INTO ships (game_id, player_id, x, y) VALUES (?, ?, ?, ?)",
            (game_id, player_id, ship["x"], ship["y"])
        )

    db.commit()

    return jsonify({"status": "ok"}), 200