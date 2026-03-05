# Battleship — Distributed Multiplayer Naval Combat

A persistent multiplayer Battleship game with a Flask/PostgreSQL backend and a premium glass-morphism frontend.

```
battleship/
├── backend/                  ← Flask API + PostgreSQL
│   ├── app/
│   │   ├── __init__.py       # App factory
│   │   ├── db.py             # DB connection
│   │   ├── routes.py         # Production /api/* endpoints
│   │   ├── test_routes.py    # /api/test/* (TEST_MODE only)
│   │   ├── game_logic.py     # Turn, elimination, stats helpers
│   │   └── test_gate.py      # TEST_MODE gating
│   ├── sql/schema.sql
│   ├── tests/
│   ├── Dockerfile            ← Gunicorn
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                 ← Static HTML/CSS/JS
    ├── index.html            # App entry point
    ├── js/
    │   ├── app.js            # Router + bootstrap
    │   ├── api.js            # Backend API client
    │   └── store.js          # Reactive state
    ├── css/
    │   ├── tokens.css        # Design tokens
    │   ├── global.css        # Layout + animations
    │   ├── components.css    # Button, Input, Toast, Modal
    │   ├── grid.css          # BattleGrid component
    │   └── screens.css       # Screen-level styles
    ├── components/
    │   ├── ui/               # Button, Input, Toast, Modal, NumberInput
    │   ├── layout/           # Header
    │   └── features/         # BattleGrid, LobbyScreen, PlacementScreen,
    │                         #   GameScreen, ResultsScreen
    └── Dockerfile            ← nginx static server
```

## Northflank Deployment (do in this order)

### 1. PostgreSQL Addon
- Project → Addons → Create → PostgreSQL
- Note the `DATABASE_URL` secret

### 2. Backend Service
- New Combined Service → repo subdirectory: `backend/`
- Environment variables:
  - `DATABASE_URL` → link to addon secret
  - `TEST_MODE` → `true` (grading) or `false` (prod)
- Port: `8000`

### 3. Frontend Service
- New Combined Service → repo subdirectory: `frontend/`
- Edit `frontend/index.html`: set `window.API_BASE = 'https://YOUR-BACKEND.code.run'`
- Port: `80`

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql://user:pass@localhost:5432/battleship"
export TEST_MODE=true
flask --app app run --debug --port 5000

# Frontend (in a separate terminal — any static server)
cd frontend
npx serve .          # or: python3 -m http.server 3000
# Then set window.API_BASE = 'http://localhost:5000' in index.html
```

## Game Flow

1. **Lobby** → Create your Commander identity → Create or join a game
2. **Placement** → Click 3 cells on your grid to place ships → Confirm
3. **Battle** → Take turns firing at the enemy grid → Hit all 3 ships to win
4. **Results** → View updated lifetime stats → Play again
