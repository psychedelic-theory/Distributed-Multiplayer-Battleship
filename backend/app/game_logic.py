"""
game_logic.py — Pure game-state helpers that operate on DB connections.

All functions accept an open psycopg connection (or cursor) and return
plain Python values. No Flask imports here — keeps logic testable.
"""


# ---------------------------------------------------------------------------
# Ship / hit helpers
# ---------------------------------------------------------------------------

def get_player_ships(cur, game_id, player_id):
    """Return list of {row, col} dicts for a player's ships in a game."""
    cur.execute(
        "SELECT row, col FROM ships WHERE game_id=%s AND player_id=%s",
        (game_id, player_id),
    )
    return cur.fetchall()


def get_hits_on_player(cur, game_id, target_player_id):
    """
    Return set of (row, col) tuples that have been *hit* on target_player_id's ships.
    We cross-reference moves (fired by anyone) against the target's ship cells.
    """
    cur.execute(
        """
        SELECT m.row, m.col
        FROM moves m
        JOIN ships s ON s.game_id = m.game_id
                     AND s.row = m.row
                     AND s.col = m.col
                     AND s.player_id = %s
        WHERE m.game_id = %s AND m.result = 'hit'
        """,
        (target_player_id, game_id),
    )
    return {(r["row"], r["col"]) for r in cur.fetchall()}


def is_player_eliminated(cur, game_id, player_id):
    """True when all ship cells of player_id have been hit."""
    ships = get_player_ships(cur, game_id, player_id)
    if not ships:
        return False  # no ships placed — shouldn't happen in active game
    hits = get_hits_on_player(cur, game_id, player_id)
    return all((s["row"], s["col"]) in hits for s in ships)


# ---------------------------------------------------------------------------
# Turn / rotation helpers
# ---------------------------------------------------------------------------

def get_active_players_ordered(cur, game_id):
    """
    Return list of non-eliminated game_players ordered by turn_order.
    Each element is a dict: {player_id, turn_order, is_eliminated, ships_placed}.
    """
    cur.execute(
        """
        SELECT player_id, turn_order, is_eliminated, ships_placed
        FROM game_players
        WHERE game_id = %s AND is_eliminated = FALSE
        ORDER BY turn_order
        """,
        (game_id,),
    )
    return cur.fetchall()


def get_all_players_ordered(cur, game_id):
    """Return ALL game_players ordered by turn_order (including eliminated)."""
    cur.execute(
        """
        SELECT player_id, turn_order, is_eliminated, ships_placed
        FROM game_players
        WHERE game_id = %s
        ORDER BY turn_order
        """,
        (game_id,),
    )
    return cur.fetchall()


def get_current_player_id(cur, game_id, current_turn_index):
    """
    Resolve which player_id acts on `current_turn_index`.
    turn_index cycles through *non-eliminated* players by their turn_order.
    Returns player_id or None.
    """
    active = get_active_players_ordered(cur, game_id)
    if not active:
        return None
    idx = current_turn_index % len(active)
    return active[idx]["player_id"]


def advance_turn(cur, game_id, current_turn_index):
    """
    After a shot, re-evaluate elimination and return the next turn index
    (pointing into the updated non-eliminated list).
    Returns (next_turn_index, next_player_id_or_none, game_finished).
    """
    # Re-fetch active (may have changed after elimination update)
    active = get_active_players_ordered(cur, game_id)

    if len(active) <= 1:
        # Game over — 0 or 1 player left
        return current_turn_index, None, True

    # Advance index within the non-eliminated list
    next_idx = (current_turn_index + 1) % len(active)
    next_player_id = active[next_idx]["player_id"]
    return next_idx, next_player_id, False


# ---------------------------------------------------------------------------
# State transition helpers
# ---------------------------------------------------------------------------

def check_and_activate_game(cur, game_id):
    """
    Transition game waiting -> active if:
      - participant count == max_players
      - every participant has ships_placed = TRUE
    Returns True if transition happened.
    """
    cur.execute("SELECT max_players, status FROM games WHERE game_id=%s", (game_id,))
    game = cur.fetchone()
    if not game or game["status"] != "waiting":
        return False

    cur.execute(
        "SELECT COUNT(*) AS cnt FROM game_players WHERE game_id=%s",
        (game_id,),
    )
    total = cur.fetchone()["cnt"]

    cur.execute(
        "SELECT COUNT(*) AS cnt FROM game_players WHERE game_id=%s AND ships_placed=TRUE",
        (game_id,),
    )
    placed = cur.fetchone()["cnt"]

    if total == game["max_players"] and total == placed and total > 0:
        cur.execute(
            "UPDATE games SET status='active' WHERE game_id=%s",
            (game_id,),
        )
        return True
    return False


def count_active_players(cur, game_id):
    """Return number of non-eliminated players."""
    cur.execute(
        "SELECT COUNT(*) AS cnt FROM game_players WHERE game_id=%s AND is_eliminated=FALSE",
        (game_id,),
    )
    return cur.fetchone()["cnt"]


# ---------------------------------------------------------------------------
# Stats update (called transactionally at game completion)
# ---------------------------------------------------------------------------

def update_stats_on_finish(cur, game_id, winner_id):
    """
    Update lifetime stats for all participants of a finished game.
    Must be called inside a transaction that is committed by the caller.
    """
    cur.execute(
        "SELECT player_id FROM game_players WHERE game_id=%s",
        (game_id,),
    )
    participants = [r["player_id"] for r in cur.fetchall()]

    for pid in participants:
        # Count accepted shots and hits for this player in this game
        cur.execute(
            "SELECT COUNT(*) AS shots FROM moves WHERE game_id=%s AND player_id=%s",
            (game_id, pid),
        )
        shots = cur.fetchone()["shots"]

        cur.execute(
            "SELECT COUNT(*) AS hits FROM moves WHERE game_id=%s AND player_id=%s AND result='hit'",
            (game_id, pid),
        )
        hits = cur.fetchone()["hits"]

        is_winner = pid == winner_id

        cur.execute(
            """
            UPDATE players
            SET games_played = games_played + 1,
                wins         = wins + %s,
                losses       = losses + %s,
                total_shots  = total_shots + %s,
                total_hits   = total_hits + %s,
                accuracy     = CASE
                                 WHEN (total_shots + %s) > 0
                                 THEN (total_hits + %s)::numeric / (total_shots + %s)
                                 ELSE 0.0
                               END
            WHERE player_id = %s
            """,
            (
                1 if is_winner else 0,   # wins delta
                0 if is_winner else 1,   # losses delta
                shots, hits,             # shot/hit deltas for SET
                shots, hits, shots,      # shot/hit deltas for CASE expression
                pid,
            ),
        )
