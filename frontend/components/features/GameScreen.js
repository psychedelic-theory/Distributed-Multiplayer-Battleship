/**
 * components/features/GameScreen.js
 * Main battle screen: attack board, defense board, move log, turn indicator.
 */

import { api } from '../../js/api.js';
import { store } from '../../js/store.js';
import { Button, showToast } from '../ui/index.js';
import { BattleGrid } from './BattleGrid.js';

export function GameScreen({ onNavigate }) {
  const el = document.createElement('div');
  el.className = 'screen game-screen';
  el.id = 'screen-game';

  const gameId   = store.get('gameId');
  const playerId = store.get('playerId');
  const gridSize = store.get('gridSize') || 10;
  const myShips  = store.get('myShips')  || [];

  let pollInterval = null;
  let myShots      = [];   // {row,col,result}
  let lastMoveId   = 0;
  let isMyTurn     = false;
  let gameStatus   = 'waiting';

  // ── Layout ─────────────────────────────────────────────
  el.innerHTML = `
    <div class="game-layout">

      <!-- Left: Attack Board -->
      <div class="game-panel game-panel--attack">
        <div class="game-panel__header">
          <span class="label-mono text-accent">Enemy Waters</span>
          <div class="turn-indicator" id="turn-indicator">
            <div class="spinner"></div>
            <span>Loading…</span>
          </div>
        </div>
        <div id="attack-grid-wrap"></div>
      </div>

      <!-- Center: HUD -->
      <div class="game-hud glass-card">
        <div class="hud-game-info">
          <div class="label-mono text-accent">Game #${gameId}</div>
          <div class="hud-status" id="hud-status">
            <span class="badge badge--waiting"><span class="dot dot--waiting"></span>Waiting…</span>
          </div>
        </div>
        <div class="divider"></div>

        <div class="hud-stats">
          <div class="hud-stat">
            <span class="hud-stat__val" id="stat-shots">0</span>
            <span class="hud-stat__lbl label-mono">Shots</span>
          </div>
          <div class="hud-stat">
            <span class="hud-stat__val" id="stat-hits">0</span>
            <span class="hud-stat__lbl label-mono">Hits</span>
          </div>
          <div class="hud-stat">
            <span class="hud-stat__val" id="stat-acc">0%</span>
            <span class="hud-stat__lbl label-mono">Acc.</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="move-log-wrap">
          <div class="label-mono text-accent" style="margin-bottom:var(--space-2)">Battle Log</div>
          <div class="move-log" id="move-log"></div>
        </div>

        <div class="hud-actions" id="hud-actions" style="margin-top:var(--space-4)"></div>
      </div>

      <!-- Right: Defense Board -->
      <div class="game-panel game-panel--defense">
        <div class="game-panel__header">
          <span class="label-mono text-accent">Your Waters</span>
          <span class="label-mono text-muted" id="defense-sublabel">Ships deployed</span>
        </div>
        <div id="defense-grid-wrap"></div>
      </div>

    </div>
  `;

  // ── Build grids ─────────────────────────────────────────
  const attackGrid = BattleGrid({
    size: gridSize,
    mode: 'attack',
    ships: [],
    shots: [],
    disabled: true,
    onCellClick: ({ row, col }) => handleFire(row, col),
  });

  const defenseGrid = BattleGrid({
    size: gridSize,
    mode: 'defense',
    ships: myShips,
    shots: [],
    disabled: true,
  });

  el.querySelector('#attack-grid-wrap').appendChild(attackGrid);
  el.querySelector('#defense-grid-wrap').appendChild(defenseGrid);

  // ── Buttons ─────────────────────────────────────────────
  const leaveBtn = Button({ label: 'Leave Battle', variant: 'ghost', size: 'sm' });
  leaveBtn.addEventListener('click', () => {
    stopPolling();
    onNavigate('lobby');
  });

  el.querySelector('#hud-actions').appendChild(leaveBtn);

  // ── Fire ────────────────────────────────────────────────
  async function handleFire(row, col) {
    if (!isMyTurn || gameStatus !== 'active') return;

    // Prevent re-firing same cell
    if (myShots.some(s => s.row === row && s.col === col)) {
      showToast({ message: 'Already fired at this cell', type: 'info' });
      return;
    }

    attackGrid.setDisabled(true);

    try {
      const res = await api.fire(gameId, playerId, row, col);
      const { result, next_player_id, game_status, winner_id } = res;

      // Update attack board
      attackGrid.updateCell(row, col, result);
      myShots.push({ row, col, result });
      updateHudStats();

      if (result === 'hit') {
        showToast({ message: `💥 Direct hit! [${String.fromCharCode(65+col)}${row+1}]`, type: 'hit' });
      } else {
        showToast({ message: `Miss — [${String.fromCharCode(65+col)}${row+1}]`, type: 'miss' });
      }

      if (game_status === 'finished') {
        stopPolling();
        store.set({ winnerId: winner_id });
        showToast({ message: winner_id === playerId ? '🏆 Victory! You win!' : 'Defeat — better luck next time', type: winner_id === playerId ? 'success' : 'error', duration: 5000 });
        setTimeout(() => onNavigate('results'), 2500);
        return;
      }

      isMyTurn = (next_player_id === playerId);
      updateTurnIndicator();
      if (!isMyTurn) {
        attackGrid.setDisabled(true);
        startPolling();
      } else {
        attackGrid.setDisabled(false);
      }

    } catch (e) {
      showToast({ message: e.message, type: 'error' });
      attackGrid.setDisabled(!isMyTurn);
    }
  }

  // ── Polling ──────────────────────────────────────────────
  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(pollGame, 2500);
  }

  function stopPolling() {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  async function pollGame() {
    try {
      const [game, movesRes] = await Promise.all([
        api.getGame(gameId),
        api.getMoves(gameId),
      ]);

      gameStatus = game.status;
      store.set({ gameStatus });
      updateHudStatus(game);

      if (game.status === 'active') {
        const activePid = resolveCurrentPlayer(game);
        isMyTurn = (activePid === playerId);
        updateTurnIndicator();

        if (isMyTurn) {
          stopPolling();
          attackGrid.setDisabled(false);
        }
      }

      // Sync new moves onto grids
      syncMoves(movesRes.moves || []);

      if (game.status === 'finished') {
        stopPolling();
        setTimeout(() => onNavigate('results'), 1500);
      }

    } catch { /* network hiccup — keep polling */ }
  }

  function resolveCurrentPlayer(game) {
    const players = Array.isArray(game.players) ? game.players : [];
    const activePlayers = players
      .filter(p => !p.is_eliminated)
      .sort((a, b) => a.turn_order - b.turn_order);
  
    if (!activePlayers.length) return null;
  
    const idx = game.current_turn_index % activePlayers.length;
    return activePlayers[idx].player_id;
  }

  function syncMoves(moves) {
    const log  = el.querySelector('#move-log');
    const newMoves = moves.slice(lastMoveId);
    lastMoveId = moves.length;

    newMoves.forEach(m => {
      // Update defense grid if someone hit our ship
      if (m.player_id !== playerId && m.result === 'hit') {
        const isMyShip = myShips.some(s => s.row === m.row && s.col === m.col);
        if (isMyShip) defenseGrid.updateCell(m.row, m.col, 'hit');
      }
      // Update attack grid with shots we already fired (sync)
      if (m.player_id === playerId && !myShots.some(s => s.row === m.row && s.col === m.col)) {
        myShots.push({ row: m.row, col: m.col, result: m.result });
        attackGrid.updateCell(m.row, m.col, m.result);
      }

      // Log entry
      const entry = document.createElement('div');
      const isMine = m.player_id === playerId;
      entry.className = `move-entry move-entry--${m.result}${isMine ? ' move-entry--mine' : ''}`;
      entry.style.animation = `slideInRight var(--dur-base) var(--ease-out) both`;
      const col = String.fromCharCode(65 + m.col);
      const row = m.row + 1;
      entry.innerHTML = `
        <span class="move-entry__icon">${m.result === 'hit' ? '◆' : '○'}</span>
        <span class="move-entry__text">
          <strong>${isMine ? 'You' : `P#${m.player_id}`}</strong>
          fired [${col}${row}] →
          <span class="${m.result === 'hit' ? 'text-hit' : 'text-muted'}">${m.result}</span>
        </span>
      `;
      log.appendChild(entry);
    });

    if (newMoves.length) log.scrollTop = log.scrollHeight;
    updateHudStats();
  }

  // ── HUD helpers ──────────────────────────────────────────
  function updateHudStats() {
    const shots = myShots.length;
    const hits  = myShots.filter(s => s.result === 'hit').length;
    const acc   = shots > 0 ? (hits / shots * 100).toFixed(0) : 0;
    el.querySelector('#stat-shots').textContent = shots;
    el.querySelector('#stat-hits').textContent  = hits;
    el.querySelector('#stat-acc').textContent   = `${acc}%`;
  }

  function updateHudStatus(game) {
    const hud    = el.querySelector('#hud-status');
    const status = game.status;
    const labels = { waiting: 'Waiting for Players', active: 'Battle Active', finished: 'Game Over' };
    hud.innerHTML = `
      <span class="badge badge--${status}">
        <span class="dot dot--${status}"></span>
        ${labels[status] || status}
      </span>
      <span class="label-mono text-muted" style="font-size:10px">${game.active_players} active</span>
    `;
  }

  function updateTurnIndicator() {
    const ind = el.querySelector('#turn-indicator');
    if (gameStatus === 'waiting') {
      ind.innerHTML = `<div class="spinner"></div><span class="label-mono text-muted">Waiting for players…</span>`;
      return;
    }
    if (isMyTurn) {
      ind.innerHTML = `<span class="badge badge--your-turn"><span class="dot dot--active"></span>Your Turn — Fire!</span>`;
      const grid = el.querySelector('#attack-grid-wrap .battle-grid');
      grid?.classList.add('battle-grid--active-turn');
    } else {
      ind.innerHTML = `<span class="badge badge--waiting"><span class="dot dot--waiting"></span>Enemy's Turn</span>`;
      el.querySelector('#attack-grid-wrap .battle-grid')?.classList.remove('battle-grid--active-turn');
    }
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    try {
      const [game, movesRes] = await Promise.all([
        api.getGame(gameId),
        api.getMoves(gameId),
      ]);
      gameStatus = game.status;
      store.set({ gameStatus });
      updateHudStatus(game);
      syncMoves(movesRes.moves || []);
      startPolling();
    } catch (e) {
      showToast({ message: 'Could not load game state', type: 'error' });
    }
  }

  // Start when screen becomes active
  requestAnimationFrame(init);

  // Cleanup on unmount
  el.destroy = () => stopPolling();

  return el;
}
