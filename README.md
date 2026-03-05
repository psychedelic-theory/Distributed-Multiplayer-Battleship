# Distributed Multiplayer Battleship — Phase 1 Backend

A persistent multiplayer Battleship server built with Python + Flask + PostgreSQL.

---

## Project Structure

```
battleship/
├── app/
│   ├── __init__.py       # Flask app factory
│   ├── db.py             # DB connection + schema init
│   ├── routes.py         # Production /api/* endpoints
│   ├── test_routes.py    # /api/test/* endpoints (TEST_MODE only)
│   ├── game_logic.py     # Turn rotation, elimination, stats helpers
│   └── test_gate.py      # TEST_MODE gating helper
├── sql/
│   └── schema.sql        # Table definitions (idempotent, safe to re-run)
├── tests/
│   └── test_battleship.py
├── .env.example
├── requirements.txt
└── README.md
```

---

## Environment Variables

| Variable       | Required | Description                                      |
|----------------|----------|--------------------------------------------------|
| `DATABASE_URL` | ✅ Yes   | PostgreSQL DSN: `postgresql://user:pass@host/db` |
| `TEST_MODE`    | No       | Set to `"true"` to enable test endpoints         |

Copy `.env.example` to `.env` and fill in your values.

---

## Database Setup

1. Create a PostgreSQL database:
```bash
createdb battleship
```

2. The schema is applied **automatically on server startup** via `init_db()`.  
   You can also run it manually:
```bash
psql $DATABASE_URL -f sql/schema.sql
```

Tables created:
- `players` — persistent identity + lifetime stats
- `games` — game config, status, turn index
- `game_players` — join table (composite PK)
- `ships` — 3 single-cell ships per player per game
- `moves` — chronological fire log with timestamps

---

## Running the Server

### Local development
```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://user:password@localhost:5432/battleship"
export TEST_MODE=false   # or "true" for grading

# Run
flask --app app run --debug
```

### Production (Render / Gunicorn)
```bash
gunicorn "app:app" --bind 0.0.0.0:5000
```

Set `DATABASE_URL` and `TEST_MODE` in your Render environment settings — never hardcode secrets.

---

## API Reference

### Production Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/reset` | Reset all game data (keeps player rows, zeroes stats) |
| `POST` | `/api/players` | Create player — returns `{"player_id": int}` |
| `GET`  | `/api/players/{id}/stats` | Lifetime stats |
| `POST` | `/api/games` | Create game — returns `{"game_id": int}` |
| `POST` | `/api/games/{id}/join` | Join game |
| `GET`  | `/api/games/{id}` | Game snapshot |
| `POST` | `/api/games/{id}/place` | Place 3 ships |
| `POST` | `/api/games/{id}/fire` | Fire a shot |
| `GET`  | `/api/games/{id}/moves` | Chronological move history |

### Test Endpoints (TEST_MODE=true only)

Require header: `X-Test-Password: clemson-test-2026`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/test/games/{id}/restart` | Reset ships/moves → waiting; stats unchanged |
| `POST` | `/api/test/games/{id}/ships` | Deterministic ship placement |
| `GET`  | `/api/test/games/{id}/board/{player_id}` | Reveal full board state |

#### Board Response Schema
```json
{
  "player_id": 1,
  "game_id": 1,
  "grid_size": 10,
  "ships": [[0, 0], [1, 1], [2, 2]],
  "hits_received": [[0, 0]],
  "board": [
    ["X", ".", ".", ...],
    [".", "S", ".", ...],
    ...
  ]
}
```
Cell legend: `"."` = empty, `"S"` = intact ship, `"X"` = hit ship cell.

---

## Running Tests

Tests run against a **live server** (integration style):

```bash
# Start server first (with TEST_MODE=true for full test coverage)
export TEST_MODE=true
flask --app app run &

# Run tests
pytest tests/ -v

# Against a deployed server
TEST_BASE_URL=https://your-app.onrender.com pytest tests/ -v
```

---

## Key Design Decisions

- **Server-generated IDs**: `player_id` and `game_id` are `SERIAL` (auto-increment). Clients cannot supply IDs.
- **Turn rotation**: `current_turn_index` points into the ordered list of non-eliminated players. After each shot, the index advances modulo the active player count.
- **Elimination**: Detected immediately after a hit — all 3 ship cells must appear in the hit moves for that player.
- **Stats**: Updated transactionally inside the same DB transaction that marks the game finished. Survives restarts because they live in the `players` table.
- **TEST_MODE**: Checked from the `TEST_MODE` env var at request time; all `/api/test/` routes return 403 if disabled or header is wrong.
