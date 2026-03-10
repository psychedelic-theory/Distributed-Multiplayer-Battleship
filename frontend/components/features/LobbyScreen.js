/**
 * components/features/LobbyScreen.js
 * Player creation, game creation, and join flows.
 */

import { api } from '../../js/api.js';
import { store } from '../../js/store.js';
import { Button, Input, NumberInput, showToast } from '../ui/index.js';

export function LobbyScreen({ onNavigate }) {
  const el = document.createElement('div');
  el.className = 'screen screen--active lobby-screen';
  el.id = 'screen-lobby';

  el.innerHTML = `
    <div class="lobby-hero">
      <div class="lobby-hero__badge label-mono">
        <span class="dot dot--active"></span>
        Multiplayer • Phase 1
      </div>
      <h1 class="display-xl">
        Naval <span class="gradient-text">Combat</span><br/>System
      </h1>
      <p class="lobby-hero__sub text-muted">
        Command your fleet. Destroy your enemies.<br/>
        Dominate the grid.
      </p>
    </div>

    <div class="lobby-panels">
      <!-- Identity Panel -->
      <div class="lobby-panel glass-card" id="panel-identity">
        <div class="panel-header">
          <span class="label-mono text-accent">Step 01</span>
          <h2 class="display-md">Commander Identity</h2>
          <p class="text-muted" style="font-size:var(--text-sm)">Create or reuse your persistent player identity</p>
        </div>
        <div class="panel-body" id="identity-form">
          <!-- injected -->
        </div>
      </div>

      <!-- Game Panel -->
      <div class="lobby-panel glass-card lobby-panel--disabled" id="panel-game">
        <div class="panel-header">
          <span class="label-mono text-accent">Step 02</span>
          <h2 class="display-md">Deploy Fleet</h2>
          <p class="text-muted" style="font-size:var(--text-sm)">Create a new battle or join an existing one</p>
        </div>
        <div class="panel-body" id="game-form">
          <!-- injected -->
        </div>
      </div>

      <!-- Stats Panel -->
      <div class="lobby-panel lobby-panel--stats glass-card lobby-panel--disabled" id="panel-stats">
        <div class="panel-header">
          <span class="label-mono text-accent">Commander Stats</span>
          <h2 class="display-md" id="stats-player-name">—</h2>
        </div>
        <div id="stats-grid" class="stats-grid">
          <div class="stat-item skeleton" style="height:60px"></div>
          <div class="stat-item skeleton" style="height:60px"></div>
          <div class="stat-item skeleton" style="height:60px"></div>
          <div class="stat-item skeleton" style="height:60px"></div>
        </div>
      </div>
    </div>
  `;

  // ── Identity Form ─────────────────────────────────────
  const identityForm = el.querySelector('#identity-form');

  const usernameInput = Input({
    label: 'Commander Callsign',
    placeholder: 'Enter your username…',
    maxLength: 24,
  });

  const createBtn = Button({
    label: 'Deploy Commander',
    variant: 'primary',
    size: 'lg',
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 1v6M1 8h6m2 0h6M8 9v6"/></svg>`,
  });
  createBtn.style.width = '100%';

  const playerIdInput = Input({
    label: 'Or enter existing Player ID',
    placeholder: 'e.g. 42',
    type: 'number',
  });

  const loadBtn = Button({ label: 'Load Identity', variant: 'secondary', size: 'md' });
  loadBtn.style.width = '100%';

  const divider = document.createElement('div');
  divider.className = 'divider';

  identityForm.appendChild(usernameInput);
  identityForm.appendChild(createBtn);
  identityForm.appendChild(divider);
  identityForm.appendChild(playerIdInput);
  identityForm.appendChild(loadBtn);

  // Create player
  createBtn.addEventListener('click', async () => {
    const username = usernameInput.getValue().trim();
    if (!username) { usernameInput.setError('Callsign is required'); return; }
    usernameInput.setError('');
    createBtn.setLoading(true);
    try {
      const { player_id } = await api.createPlayer(username);
      store.set({ playerId: player_id, username });
      showToast({ message: `Commander "${username}" deployed`, type: 'success' });
      onIdentityLoaded(player_id, username);
    } catch (e) {
      showToast({ message: e.message, type: 'error' });
    } finally {
      createBtn.setLoading(false);
    }
  });

  // Load existing player via profile + stats
  loadBtn.addEventListener('click', async () => {
    const id = parseInt(playerIdInput.getValue(), 10);
    if (!id) { playerIdInput.setError('Valid ID required'); return; }
    playerIdInput.setError('');
    loadBtn.setLoading(true);
    try {
      const [player, stats] = await Promise.all([
        api.getPlayer(id),
        api.getStats(id),
      ]);
      store.set({ playerId: id, username: player.username });
      showToast({ message: `Commander "${player.username}" loaded`, type: 'success' });
      onIdentityLoaded(id, player.username, stats);
    } catch (e) {
      showToast({ message: 'Player not found', type: 'error' });
    } finally {
      loadBtn.setLoading(false);
    }
  });

  // ── Load player identity and unlock Step 2 ───────────
  async function onIdentityLoaded(playerId, username, existingStats = null) {
    el.querySelector('#panel-game').classList.remove('lobby-panel--disabled');
    el.querySelector('#panel-stats').classList.remove('lobby-panel--disabled');
    el.querySelector('#stats-player-name').textContent = username;
    buildGameForm();
    loadStats(playerId, existingStats);
  }

  // ── Stats Panel ───────────────────────────────────────
  async function loadStats(playerId, existing = null) {
    try {
      const s = existing || await api.getStats(playerId);
      renderStats(s);
    } catch {}
  }

  function renderStats(s) {
    const grid = el.querySelector('#stats-grid');
    grid.innerHTML = '';
    const items = [
      { label: 'Games Played', value: s.games_played, icon: '⬡' },
      { label: 'Victories',    value: s.wins,          icon: '★', class: 'stat-item--win' },
      { label: 'Accuracy',     value: `${(s.accuracy * 100).toFixed(1)}%`, icon: '◎' },
      { label: 'Total Shots',  value: s.total_shots,   icon: '◆' },
    ];
    items.forEach(({ label, value, icon, class: cls }) => {
      const div = document.createElement('div');
      div.className = `stat-item${cls ? ' ' + cls : ''}`;
      div.innerHTML = `
        <div class="stat-icon">${icon}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-label label-mono">${label}</div>
      `;
      grid.appendChild(div);
    });
  }

  // ── Game Form ─────────────────────────────────────────
  function buildGameForm() {
    const form = el.querySelector('#game-form');
    form.innerHTML = '';

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'tab-row';
    tabs.innerHTML = `
      <button class="tab tab--active" data-tab="create">Create Game</button>
      <button class="tab" data-tab="join">Join Game</button>
    `;
    form.appendChild(tabs);

    const createPane = document.createElement('div');
    createPane.className = 'tab-pane tab-pane--active';
    createPane.id = 'tab-create';

    const joinPane = document.createElement('div');
    joinPane.className = 'tab-pane';
    joinPane.id = 'tab-join';

    // ── Create pane content ──
    const gridSizeInput   = NumberInput({ label: 'Grid Size', value: 10, min: 5, max: 15, onChange: () => {} });
    const maxPlayersInput = NumberInput({ label: 'Max Players', value: 2, min: 1, max: 8, onChange: () => {} });

    const createGameBtn = Button({ label: 'Create Battle', variant: 'primary', size: 'lg' });
    createGameBtn.style.width = '100%';

    createGameBtn.addEventListener('click', async () => {
      const gs = gridSizeInput.getValue();
      const mp = maxPlayersInput.getValue();
      createGameBtn.setLoading(true);
      try {
        const { game_id } = await api.createGame(store.get('playerId'), gs, mp);
        store.set({ gameId: game_id, gridSize: gs, maxPlayers: mp });
        showToast({ message: `Battle #${game_id} created`, type: 'success' });
        onNavigate('placement');
      } catch (e) {
        showToast({ message: e.message, type: 'error' });
      } finally {
        createGameBtn.setLoading(false);
      }
    });

    const rowCreate = document.createElement('div');
    rowCreate.className = 'number-row';
    rowCreate.appendChild(gridSizeInput);
    rowCreate.appendChild(maxPlayersInput);

    createPane.appendChild(rowCreate);
    createPane.appendChild(createGameBtn);

    // ── Join pane content ──
    const gameIdInput = Input({ label: 'Game ID', placeholder: 'Enter Game ID…', type: 'number' });
    const joinBtn     = Button({ label: 'Join Battle', variant: 'primary', size: 'lg' });
    joinBtn.style.width = '100%';

    joinBtn.addEventListener('click', async () => {
      const gameId = parseInt(gameIdInput.getValue(), 10);
      if (!gameId) { gameIdInput.setError('Valid Game ID required'); return; }
      gameIdInput.setError('');
      joinBtn.setLoading(true);
      try {
        await api.joinGame(gameId, store.get('playerId'));
        const game = await api.getGame(gameId);
        store.set({ gameId, gridSize: game.grid_size, maxPlayers: game.max_players });
        showToast({ message: `Joined Battle #${gameId}`, type: 'success' });
        onNavigate('placement');
      } catch (e) {
        showToast({ message: e.message, type: 'error' });
      } finally {
        joinBtn.setLoading(false);
      }
    });

    joinPane.appendChild(gameIdInput);
    joinPane.appendChild(joinBtn);

    // Tab switching
    tabs.addEventListener('click', e => {
      const tab = e.target.dataset.tab;
      if (!tab) return;
      tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('tab--active', t.dataset.tab === tab));
      createPane.classList.toggle('tab-pane--active', tab === 'create');
      joinPane.classList.toggle('tab-pane--active', tab === 'join');
    });

    form.appendChild(createPane);
    form.appendChild(joinPane);
  }

  return el;
}
