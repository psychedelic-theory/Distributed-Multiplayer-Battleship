// ==========================================================================
// Lobby screen — sign in or create account, list/create/join games
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
  // ---- Auth mode state ----
  let authMode = 'signin'; // 'signin' | 'create'
  let username = '';
  let authError = '';
  let authing = false;

  // ---- Game list state ----
  let gridSize = 8;
  let maxPlayers = 2;
  let creating = false;
  let joining = new Set();
  let games = [];
  let loadingGames = true;
  let listError = '';
  let lastRefreshedAt = null;

  const rerender = () => mount(mountEl, build());

  // ---- Auth mode toggle ----
  function switchMode(mode) {
    authMode = mode;
    username = '';
    authError = '';
    rerender();
  }

  // ---- Sign in: GET /api/players/by-username/<username> ----
  async function signIn(name) {
    const client = session.getClient(store.get().serverUrl);
    if (!client) return;
    const trimmed = (name || '').trim();
    if (!trimmed) { authError = 'Enter your username.'; rerender(); return; }

    authing = true;
    authError = '';
    rerender();

    try {
      const body = await client._fetch(`/api/players/by-username/${encodeURIComponent(trimmed)}`);
      // Normalize whichever shape the server returns
      const player_id = body.player_id ?? body.playerId ?? body.id;
      const uname = body.username ?? body.name ?? trimmed;
      store.set({ player: { player_id, username: uname } });
      toast.success('Signed in', `Welcome back, ${uname}.`);
      client.getPlayerStats(player_id).then(stats => store.set({ myStats: stats })).catch(() => {});
      refreshGames();
    } catch (err) {
      if (err.status === 404) {
        authError = 'No account found with that username.';
      } else {
        authError = err.message || 'Sign in failed.';
      }
    } finally {
      authing = false;
      rerender();
    }
  }

  // ---- Create account: POST /api/players ----
  async function createAccount(name) {
    const client = session.getClient(store.get().serverUrl);
    if (!client) return;
    const trimmed = (name || '').trim();
    if (!trimmed) { authError = 'Enter a username.'; rerender(); return; }

    authing = true;
    authError = '';
    rerender();

    try {
      const { player_id } = await client.createPlayer(trimmed);
      const full = await client.getPlayer(player_id).catch(() => ({ player_id, username: trimmed }));
      store.set({ player: { player_id: full.player_id ?? player_id, username: full.username ?? trimmed } });
      toast.success('Account created', `Welcome, ${full.username || trimmed}.`);
      client.getPlayerStats(player_id).then(stats => store.set({ myStats: stats })).catch(() => {});
      refreshGames();
    } catch (err) {
      if (err.status === 409) {
        authError = 'That username is already taken.';
      } else {
        authError = err.message || 'Registration failed.';
      }
    } finally {
      authing = false;
      rerender();
    }
  }

  function handleAuthSubmit() {
    if (authMode === 'signin') signIn(username);
    else createAccount(username);
  }

  // ---- Sign out ----
  function signOut() {
    store.set({ player: null, myStats: null });
    authMode = 'signin';
    username = '';
    authError = '';
    rerender();
  }

  // ---- Helpers ----
  function isMemberOf(game, playerId) {
    if (!game || !playerId) return false;
    if (game.creator_id === playerId) return true;
    if (Array.isArray(game.players)) {
      return game.players.some(p => {
        const pid = typeof p === 'object' ? (p.player_id ?? p.playerId ?? p.id) : p;
        return pid === playerId;
      });
    }
    return false;
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
      try {
        await client.joinGame(game_id, player.player_id);
      } catch (joinErr) {
        console.warn('[createGame] joinGame after create:', joinErr.message);
      }
      enterGame(game_id);
    } catch (err) {
      toast.error('Create failed', err.message);
      creating = false;
      rerender();
    }
  }

  async function joinGame(game) {
    const { player } = store.get();
    if (!player) { toast.error('Sign in first.'); return; }
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

  // ---- Auth card (sign-in or create-account) ----
  function buildAuthCard() {
    const isSignIn = authMode === 'signin';
    const title = isSignIn ? 'Sign in' : 'Create account';
    const subtitle = isSignIn
      ? 'Enter your username to pick up where you left off.'
      : 'Choose a username to get started.';
    const btnLabel = isSignIn ? 'Sign in' : 'Create account';
    const toggleLabel = isSignIn ? 'No account yet? ' : 'Already have one? ';
    const toggleAction = isSignIn ? 'Create one' : 'Sign in';

    // Error message with optional mode-switch link
    let errorNode = null;
    if (authError) {
      const showSwitch = (isSignIn && authError.includes('No account'))
        || (!isSignIn && authError.includes('already taken'));
      errorNode = h('div', { class: 'field__error', style: { marginTop: '0' } },
        authError,
        showSwitch && ' ',
        showSwitch && h('span', {
          style: {
            color: 'var(--brand-teal-hi)',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontSize: 'inherit',
          },
          onClick: () => switchMode(isSignIn ? 'create' : 'signin'),
        }, isSignIn ? 'Create an account instead?' : 'Sign in instead?'),
      );
    }

    return Card({
      variant: 'feature',
      children: h('div', { class: 'stack' },
        h('div', {},
          h('h3', { class: 'card__title' }, title),
          h('p', { class: 'card__meta', style: { marginBottom: '0' } }, subtitle),
        ),
        Field({
          label: 'Username',
          children: Input({
            value: username,
            placeholder: isSignIn ? 'Your username' : 'e.g. Johan',
            autofocus: true,
            disabled: authing,
            onInput: v => { username = v; },
            onEnter: () => handleAuthSubmit(),
          }),
        }),
        errorNode,
        Button({
          variant: 'primary',
          size: 'lg',
          block: true,
          loading: authing,
          onClick: handleAuthSubmit,
          children: btnLabel,
        }),
        h('div', {
          style: {
            textAlign: 'center',
            fontSize: 'var(--fs-xs)',
            color: 'var(--color-text-mute)',
            marginTop: 'var(--sp-1)',
          },
        },
          toggleLabel,
          h('span', {
            style: {
              color: 'var(--brand-teal-hi)',
              cursor: 'pointer',
              textDecoration: 'underline',
            },
            onClick: () => switchMode(isSignIn ? 'create' : 'signin'),
          }, toggleAction),
        ),
      ),
    });
  }

  // ---- Create game card ----
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

  // ---- Games list ----
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

  // ---- Main build ----
  function build() {
    const { player, myStats } = store.get();

    // Not signed in — show auth card only
    if (!player) {
      return h('div', { class: 'screen screen--narrow fade-in' },
        h('div', { class: 'screen__header' },
          h('h1', {}, 'Lobby'),
          h('div', { class: 'subtitle' },
            authMode === 'signin'
              ? 'Sign in to join or create games.'
              : 'Create an account to start playing.',
          ),
        ),
        buildAuthCard(),
      );
    }

    // Signed in — full lobby view
    return h('div', { class: 'screen fade-in' },
      h('div', { class: 'screen__header row-between' },
        h('div', {},
          h('h1', {}, 'Lobby'),
          h('div', { class: 'subtitle' }, 'Browse games, join one, or create your own.'),
        ),
        h('div', { class: 'row' },
          Identity({ name: player.username, me: true, large: true }),
          Button({
            variant: 'ghost',
            size: 'sm',
            onClick: signOut,
            children: 'Sign out',
          }),
        ),
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
  }
}