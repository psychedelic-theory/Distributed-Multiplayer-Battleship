// ==========================================================================
// Lobby screen — register player, list/create/join games
// ==========================================================================

import { h, mount } from '../utils/dom.js';
import { store } from '../state/store.js';
import { session } from '../state/session.js';
import { toast } from '../utils/toast.js';
import { Card } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Field, Input, Select } from '../../components/ui/Field.js';
import { Identity } from '../../components/ui/Identity.js';
import { Loader } from '../../components/ui/Loader.js';
import { GameRow } from '../../components/features/GameRow.js';
import { PlayerStatsCard } from '../../components/features/PlayerStatsCard.js';
import { formatClock } from '../utils/format.js';

export function render(mountEl) {
  // ---- Local UI state ----
  let username = '';
  let gridSize = 8;
  let maxPlayers = 2;
  let creating = false;
  let joining = new Set(); // game ids currently being joined
  let registering = false;
  let games = [];
  let loadingGames = true;
  let listError = '';
  let lastRefreshedAt = null;

  const rerender = () => mount(mountEl, build());

  // ---- Helpers ----
  function isMemberOf(game, playerId) {
    if (!game || !playerId) return false;
    // game.creator_id is reliably present; other IDs only if server includes players list.
    if (game.creator_id === playerId) return true;
    if (Array.isArray(game.players)) {
      return game.players.some(p => {
        const pid = typeof p === 'object' ? (p.player_id ?? p.playerId ?? p.id) : p;
        return pid === playerId;
      });
    }
    return false;
  }

  async function registerPlayer(name) {
    const client = session.getClient(store.get().serverUrl);
    if (!client) return;
    if (!name || !name.trim()) {
      toast.error('Enter a username.');
      return;
    }

    const trimmed = name.trim();

    registering = true;
    rerender();

    try {
      let full;

      try {
        // First try logging into an existing account
        full = await client.getPlayerByUsername(trimmed);
        toast.success('Welcome back', `Logged in as ${full.username}.`);
      } catch (err) {
        // If username does not exist, create a new account
        if (err.status === 404) {
          const { player_id } = await client.createPlayer(trimmed);
          full = await client.getPlayer(player_id).catch(() => ({
            player_id,
            username: trimmed,
          }));
          toast.success('Registered', `Welcome, ${full.username}.`);
        } else {
          throw err;
        }
      }

      store.set({
        player: {
          player_id: full.player_id,
          username: full.username,
        }
      });

      client
        .getPlayerStats(full.player_id)
        .then(stats => store.set({ myStats: stats }))
        .catch(() => {});
    } catch (err) {
      toast.error('Login failed', err.message);
    } finally {
      registering = false;
      rerender();
    }
  }

  async function createGame() {
    const { player, serverUrl } = store.get();
    if (!player) return;
    const client = session.getClient(serverUrl);
    creating = true;
    rerender();
    try {
      const { game_id } = await client.createGame({
        creator_id: player.player_id,
        grid_size: Number(gridSize),
        max_players: Number(maxPlayers),
      });
      toast.success('Game created', `#${game_id}`);
      // Jump straight into placement for this game
      enterGame(game_id);
    } catch (err) {
      toast.error('Create failed', err.message);
      creating = false;
      rerender();
    }
  }

  async function joinGame(game) {
    const { player } = store.get();
    if (!player) { toast.error('Register first.'); return; }
    joining.add(game.game_id);
    rerender();
    try {
      const client = session.getClient(store.get().serverUrl);
      await client.joinGame(game.game_id, player.player_id);
      toast.success('Joined', `Game #${game.game_id}`);
      enterGame(game.game_id);
    } catch (err) {
      toast.error('Join failed', err.message);
      joining.delete(game.game_id);
      rerender();
    }
  }

  async function enterGame(gameId) {
    session.stopPolling();
    const client = session.getClient(store.get().serverUrl);
    try {
      const game = await client.getGame(gameId);
      store.resetGame();
      store.set({ gameId, game });

      // Route based on current status
      if (game.status === 'waiting') {
        store.set({ screen: 'placement' });
      } else if (game.status === 'active') {
        store.set({ screen: 'game' });
      } else if (game.status === 'finished') {
        store.set({ screen: 'end' });
      } else {
        store.set({ screen: 'placement' });
      }
    } catch (err) {
      toast.error('Could not open game', err.message);
    }
  }

  async function refreshGames() {
    const client = session.getClient(store.get().serverUrl);
    if (!client) return;
    try {
      const list = await client.listGames();
      games = list;
      listError = '';
      lastRefreshedAt = new Date();
    } catch (err) {
      listError = err.message;
    } finally {
      loadingGames = false;
      rerender();
    }
  }

  async function refreshStats() {
    const { player } = store.get();
    if (!player) return;
    const client = session.getClient(store.get().serverUrl);
    try {
      const stats = await client.getPlayerStats(player.player_id);
      store.set({ myStats: stats });
    } catch { /* non-fatal */ }
  }

  // ---- Build pieces ----

  function buildRegistrationCard() {
    return Card({
      variant: 'feature',
      children: h('div', { class: 'stack' },
        h('h3', { class: 'card__title' }, 'Who are you?'),
        h('p', { class: 'card__meta' }, 'Register a player identity to get started.'),
        Field({
          label: 'Username',
          children: Input({
            value: username,
            placeholder: 'e.g. Johan',
            autofocus: true,
            disabled: registering,
            onInput: v => { username = v; },
            onEnter: v => registerPlayer(v),
          }),
        }),
        Button({
          variant: 'primary',
          size: 'lg',
          block: true,
          loading: registering,
          onClick: () => registerPlayer(username),
          children: 'Register',
        }),
      ),
    });
  }

  function buildCreateCard() {
    return Card({
      children: h('div', { class: 'stack' },
        h('h3', { class: 'card__title' }, 'Create a game'),
        Field({
          label: 'Grid size',
          hint: '5–15',
          children: Select({
            value: gridSize,
            options: [5, 6, 7, 8, 9, 10, 12, 15].map(n => ({ value: n, label: `${n} × ${n}` })),
            onChange: v => { gridSize = Number(v); },
          }),
        }),
        Field({
          label: 'Max players',
          children: Select({
            value: maxPlayers,
            options: [2, 3, 4].map(n => ({ value: n, label: String(n) })),
            onChange: v => { maxPlayers = Number(v); },
          }),
        }),
        Button({
          variant: 'accent',
          block: true,
          loading: creating,
          onClick: createGame,
          children: 'Create game',
        }),
      ),
    });
  }

  function buildGamesList() {
    const { player } = store.get();
    const pid = player?.player_id;

    if (loadingGames) return Loader({ label: 'Loading games…', center: true });

    if (listError) {
      return h('div', { class: 'empty-state' },
        h('div', { class: 'empty-state__icon' }, '⚠'),
        h('div', {}, listError),
        h('div', { style: { marginTop: 'var(--sp-3)' } },
          Button({ size: 'sm', onClick: refreshGames, children: 'Retry' }),
        ),
      );
    }

    if (!games || games.length === 0) {
      return h('div', { class: 'empty-state' },
        h('div', { class: 'empty-state__icon' }, '⚓'),
        h('div', {}, 'No games yet. Create the first one!'),
      );
    }

    // Sort: waiting → active → finished, then newest by id desc
    const order = { waiting: 0, active: 1, finished: 2 };
    const sorted = [...games].sort((a, b) => {
      const oa = order[a.status] ?? 9;
      const ob = order[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      return (b.game_id || 0) - (a.game_id || 0);
    });

    return h('div', { class: 'games-list stagger' },
      ...sorted.map(g => GameRow({
        game: g,
        isMember: isMemberOf(g, pid),
        canJoin: !!pid,
        onJoin: joinGame,
        onView: enterGame.bind(null, g.game_id),
      })),
    );
  }

  function build() {
    const { player, myStats } = store.get();

    if (!player) {
      // Registration-only view
      return h('div', { class: 'screen screen--narrow fade-in' },
        h('div', { class: 'screen__header' },
          h('h1', {}, 'Lobby'),
          h('div', { class: 'subtitle' }, 'First things first — let\'s register you.'),
        ),
        buildRegistrationCard(),
      );
    }

    return h('div', { class: 'screen fade-in' },
      h('div', { class: 'screen__header row-between' },
        h('div', {},
          h('h1', {}, 'Lobby'),
          h('div', { class: 'subtitle' }, 'Browse games, join one, or create your own.'),
        ),
        Identity({ name: player.username, me: true, large: true }),
      ),

      h('div', { class: 'lobby-grid' },
        // Left: games list
        h('section', {},
          h('div', { class: 'lobby-section-head' },
            h('h3', {}, 'Games'),
            h('div', { class: 'row-sm' },
              h('span', { class: 'count' },
                lastRefreshedAt
                  ? `${games.length} games · updated ${formatClock(lastRefreshedAt)}`
                  : `${games.length} games`,
              ),
              Button({
                variant: 'teal',
                size: 'sm',
                onClick: refreshGames,
                disabled: loadingGames,
                children: loadingGames ? 'Refreshing…' : '↻ Refresh',
              }),
            ),
          ),
          buildGamesList(),
        ),

        // Right: create + stats
        h('aside', { class: 'stack' },
          buildCreateCard(),
          PlayerStatsCard({ stats: myStats, title: 'Your stats' }),
        ),
      ),
    );
  }

  // ---- Initial render + kickoff ----
  rerender();

  const { player } = store.get();
  if (player) {
    refreshGames();
    refreshStats();
    // Note: no auto-polling. The user refreshes the games list manually via the
    // Refresh button. This avoids constant DOM rebuilds that disrupt interaction
    // (hover states, cursor position, focus) every couple seconds.
  }
}
