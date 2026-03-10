# Difference Summary: pre-`c42b297` vs `c42b297`

Compared commits:
- Previous version: `5a70df5`
- New version: `c42b297`

## Endpoint changes
- Added `POST /api/test/games/<game_id>/reset` as an alias to restart logic.
- Added `GET /api/test/games/<game_id>/board` with `playerId`/`player_id` query handling, while preserving `GET /board/<player_id>`.
- Added `POST /api/test/games/<game_id>/set-turn` for deterministic turn forcing in active games.

## Validation/behavior changes
- Test ships endpoint now accepts both `player_id` and `playerId`.
- Test ships endpoint accepts both:
  - `[{"row": r, "col": c}, ...]`
  - `[{"coordinates": [[r, c], ...]}, ...]`
- Ship placement in test mode is now restricted to `waiting` game state.
- Board response now includes `hits`, `misses`, and `sunk` fields (in addition to existing fields).

## Test coverage changes
- Added tests for:
  - board query-param variant,
  - grader ship payload variant,
  - reset alias endpoint,
  - set-turn endpoint.
