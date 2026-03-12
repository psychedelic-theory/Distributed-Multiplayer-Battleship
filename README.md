# Distributed Multiplayer Battleship

A full-stack, turn-based Battleship game built for collaborative software engineering practice. The project combines a Flask + PostgreSQL backend with a modular vanilla JavaScript frontend to deliver a persistent multiplayer experience with clear API contracts, deterministic test support, and production-ready deployment paths.

## Project Overview

This project implements a distributed multiplayer Battleship game where players can:
- Create player identities.
- Create and join game lobbies.
- Place ships on a shared grid.
- Take turn-based shots against opponents.
- Track game outcomes and lifetime player statistics.

The system was designed to emphasize:
- **Correctness** through strict request validation and state transition rules.
- **Testability** via dedicated test-mode API routes.
- **Maintainability** through clear module boundaries in both frontend and backend.
- **Deployment readiness** using containerized backend/frontend services and PostgreSQL.

## Architecture Summary

### High-Level Components

```text
Frontend (Static HTML/CSS/JS)
        |
        | HTTP (JSON)
        v
Backend API (Flask Blueprints)
        |
        v
PostgreSQL (games, players, moves, ships, game_players)
```

### Backend
- **Framework:** Flask
- **Database:** PostgreSQL (via psycopg)
- **Core modules:**
  - `routes.py` for production `/api/*` endpoints.
  - `test_routes.py` for deterministic `/api/test/*` endpoints (gated by `TEST_MODE`).
  - `game_logic.py` for turn progression, elimination checks, game activation, and final stat updates.
  - `db.py` for connection management.

### Frontend
- **Stack:** Static HTML, CSS, JavaScript (no heavy framework dependency).
- **Design approach:** componentized UI and feature modules.
- **Key layers:**
  - API client (`js/api.js`) for backend communication.
  - State management (`js/store.js`) for reactive data flow.
  - Feature screens/components for lobby, placement, gameplay, and results.

### Repository Structure

```text
battleship/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── db.py
│   │   ├── game_logic.py
│   │   ├── routes.py
│   │   ├── test_gate.py
│   │   └── test_routes.py
│   ├── sql/schema.sql
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── css/
    ├── js/
    ├── components/
    └── Dockerfile
```

## API Description (Detailed)

Base path: `/api`  
Content-Type: `application/json`

### API Design Rules
- JSON request bodies are required for all POST endpoints.
- IDs are server-generated where applicable (for example, client-supplied `player_id` is rejected in player creation).
- Input validation is strict (integer checks, coordinate bounds, placement constraints, duplicate-action prevention).
- State transitions are enforced server-side (`waiting` → `active` → `finished`).

### Core Entities
- **Player**: identity + persistent lifetime stats.
- **Game**: lobby/configuration and current phase.
- **Game Player**: player membership and turn/elimination metadata per game.
- **Ship**: one board coordinate per ship cell (3 ship cells/player).
- **Move**: one fired shot with result (`hit` or `miss`) and timestamp.

### Production Endpoints

#### `POST /api/reset`
Resets game/move/ship data and player stats to baseline.  
**Use case:** clean environment for repeated test runs.

#### `POST /api/players`
Creates a new player.

**Request body**
```json
{ "username": "Johan" }
```

**Success response (201)**
```json
{ "player_id": 1 }
```

**Validation highlights**
- `username` required and unique.
- `player_id` cannot be supplied by the client.

#### `GET /api/players/{player_id}`
Returns identity data for a specific player.

**Success response (200)**
```json
{ "player_id": 1, "username": "Johan" }
```

#### `GET /api/players/{player_id}/stats`
Returns lifetime performance statistics.

**Success response (200)**
```json
{
  "games_played": 3,
  "wins": 2,
  "losses": 1,
  "total_shots": 20,
  "total_hits": 9,
  "accuracy": 45.0
}
```

#### `POST /api/games`
Creates a game lobby and auto-joins the creator as turn order `0`.

**Request body**
```json
{ "creator_id": 1, "grid_size": 8, "max_players": 2 }
```

**Success response (201)**
```json
{ "game_id": 10 }
```

**Validation highlights**
- `grid_size` must be integer between 5 and 15.
- `max_players` must be integer >= 1.
- `creator_id` must reference an existing player.

#### `POST /api/games/{game_id}/join`
Adds an existing player to a waiting game.

**Request body**
```json
{ "player_id": 2 }
```

**Success response (200)**
```json
{ "message": "Joined game successfully" }
```

**Validation highlights**
- Game must exist and be `waiting`.
- Player must exist and not already be in the game.
- Game capacity (`max_players`) is enforced.

#### `GET /api/games/{game_id}`
Returns game metadata.

**Success response (200)**
```json
{
  "game_id": 10,
  "grid_size": 8,
  "status": "waiting",
  "current_turn_index": 0,
  "active_players": 2
}
```

#### `POST /api/games/{game_id}/place`
Places exactly three ship coordinates for the player.

**Request body**
```json
{
  "player_id": 1,
  "ships": [
    { "row": 0, "col": 0 },
    { "row": 1, "col": 1 },
    { "row": 2, "col": 2 }
  ]
}
```

**Success response (200)**
```json
{ "message": "Ships placed successfully" }
```

**Validation highlights**
- Exactly 3 coordinates required.
- No overlap and all coordinates must be within board bounds.
- Placement allowed only during `waiting` phase.
- After all players place ships, game auto-transitions to `active`.

#### `POST /api/games/{game_id}/fire`
Executes one turn action.

**Request body**
```json
{ "player_id": 1, "row": 3, "col": 4 }
```

**Success response while active (200)**
```json
{ "result": "miss", "next_player_id": 2, "game_status": "active" }
```

**Success response when game finishes (200)**
```json
{ "result": "hit", "next_player_id": null, "game_status": "finished", "winner_id": 1 }
```

**Validation highlights**
- Game must be `active`.
- Shooter must belong to game and it must be their turn.
- Coordinates must be in bounds.
- Duplicate shots by same shooter at same coordinate are rejected.
- Eliminations and final winner/stat updates are handled transactionally.

#### `GET /api/games/{game_id}/moves`
Returns chronological move history.

**Success response (200)**
```json
{
  "moves": [
    { "player_id": 1, "row": 3, "col": 4, "result": "miss", "timestamp": "2026-01-01T00:00:00Z" }
  ]
}
```

### Test/Grading Endpoints (`TEST_MODE=true`)
Base path: `/api/test`

These endpoints support deterministic grading and QA automation.

#### `POST /api/test/games/{game_id}/restart` (alias: `/reset`)
Resets a game instance to pre-play conditions:
- Deletes moves and ships for that game.
- Returns game to `waiting`.
- Resets `ships_placed` and elimination flags.

#### `POST /api/test/games/{game_id}/ships`
Deterministic ship placement for grading workflows.
- Accepts `player_id` (or `playerId`) with `ships` array.
- Replaces prior ships for that player in that game.
- Helps create repeatable scenarios for backend tests.

#### `GET /api/test/games/{game_id}/board/{player_id}`
Returns board-visibility payload for validation, including:
- Player ship cells.
- Hits received.
- 2D board matrix using symbols (`.`, `S`, `X`).

### Error Behavior (General)
- Validation failures return `400` with `{ "error": "..." }`.
- Not-found resources return `404`.
- Forbidden state/action cases (for example wrong turn or inactive game fire) return `403`.
- Concurrency/state conflicts may return `409` for race-like collisions.

## Team and Roles

### Team Members
- **Johan Zapata**
- **Nathan Kitchens**

### Human Role (Johan Zapata)
- Designed **backend endpoint testing strategy in Postman**.
- Designed **frontend visual elements** and **overall UI styling direction**.
- Helped align product behavior with user-facing clarity and consistency.

### AI Collaboration Roles
AI tools were used as engineering assistants to improve speed, quality, and documentation discipline:
- **ChatGPT (Codex):**
  - Assisted with implementation support, refactoring suggestions, and structured documentation updates.
  - Helped enforce consistent API and architecture descriptions.
- **Claude:**
  - Supported iterative reasoning, review feedback synthesis, and alternative implementation perspectives.
  - Assisted in communication clarity for project artifacts.

## Engineering Discipline and Collaboration

This project reflects disciplined engineering and team collaboration through:
- **Separation of concerns:** backend game logic, routing, and persistence responsibilities are modularized.
- **Deterministic testing workflow:** dedicated test-mode endpoints enable reliable verification and grading.
- **API contract consistency:** strict JSON validation, status code discipline, and controlled state transitions.
- **Iterative collaboration:** human-led product/testing decisions paired with AI-assisted development and documentation.
- **Deployment reproducibility:** containerized backend/frontend services with explicit environment configuration.

## What Changed in This README Revision

- Expanded the API section from a brief endpoint list into a detailed contract reference.
- Added request/response JSON examples for core gameplay endpoints.
- Added validation, state-transition, and error-code behavior notes.
- Clarified test/grading endpoint purpose for deterministic backend validation.
- Preserved and reaffirmed team roles, AI collaboration details, and engineering discipline practices.

## Deployment (Northflank)

1. **Create PostgreSQL Addon** and capture/link `DATABASE_URL`.
2. **Deploy backend service** from `backend/` with:
   - `DATABASE_URL`
   - `TEST_MODE` (`true` for grading, `false` for production)
   - Port `8000`
3. **Deploy frontend service** from `frontend/` and set `window.API_BASE` in `frontend/index.html` to backend URL.

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql://user:pass@localhost:5432/battleship"
export TEST_MODE=true
flask --app app run --debug --port 5000

# Frontend (new terminal)
cd frontend
npx serve .
# or: python3 -m http.server 3000
# Set window.API_BASE = 'http://localhost:5000' in index.html
```

## Typical Game Flow

1. Create player identities.
2. Create or join a game lobby.
3. Place three ships.
4. Play alternating turns until one player remains.
5. Review final result and updated stats.
