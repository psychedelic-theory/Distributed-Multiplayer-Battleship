-- Battleship Phase 1 Schema
-- Run this once to initialize the database

-- Players: persistent identity across games
CREATE TABLE IF NOT EXISTS players (
    player_id   SERIAL PRIMARY KEY,
    username    VARCHAR(100) NOT NULL UNIQUE,
    games_played INT NOT NULL DEFAULT 0,
    wins        INT NOT NULL DEFAULT 0,
    losses      INT NOT NULL DEFAULT 0,
    total_shots INT NOT NULL DEFAULT 0,
    total_hits  INT NOT NULL DEFAULT 0,
    accuracy    NUMERIC(6,4) NOT NULL DEFAULT 0.0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Games: configurable grid, lifecycle status, turn pointer
CREATE TABLE IF NOT EXISTS games (
    game_id             SERIAL PRIMARY KEY,
    grid_size           INT NOT NULL CHECK (grid_size >= 5 AND grid_size <= 15),
    max_players         INT NOT NULL CHECK (max_players >= 1),
    status              VARCHAR(10) NOT NULL DEFAULT 'waiting'
                            CHECK (status IN ('waiting', 'active', 'finished')),
    current_turn_index  INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GamePlayers: join table tracking participation and turn order
CREATE TABLE IF NOT EXISTS game_players (
    game_id         INT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id       INT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    turn_order      INT NOT NULL,          -- 0-based, fixed at join time
    is_eliminated   BOOLEAN NOT NULL DEFAULT FALSE,
    ships_placed    BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (game_id, player_id)
);

-- Ships: exactly 3 single-cell ships per player per game
CREATE TABLE IF NOT EXISTS ships (
    game_id     INT NOT NULL,
    player_id   INT NOT NULL,
    row         INT NOT NULL,
    col         INT NOT NULL,
    PRIMARY KEY (game_id, player_id, row, col),
    FOREIGN KEY (game_id, player_id) REFERENCES game_players(game_id, player_id) ON DELETE CASCADE
);

-- Moves: chronological fire log
CREATE TABLE IF NOT EXISTS moves (
    move_id     SERIAL PRIMARY KEY,
    game_id     INT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id   INT NOT NULL REFERENCES players(player_id),
    row         INT NOT NULL,
    col         INT NOT NULL,
    result      VARCHAR(4) NOT NULL CHECK (result IN ('hit', 'miss')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast move lookups
CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ships_game_player ON ships(game_id, player_id);
