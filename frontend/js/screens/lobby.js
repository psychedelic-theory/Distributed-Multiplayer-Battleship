// ==========================================================================
// Lobby screen — sign in or create account, list/create/join games.
//
// Rejoin logic (Option B):
//   - isMemberOf() checks whether the current player already has a row in a
//     game (via creator_id or the players array when present).
//   - GameRow receives isMember=true for those games and renders an "Open"
//     button instead of "Join".
//   - enterGame() is called directly — it fetches the current game state and
//     routes to placement, game, or end screen without calling /join again.
//   - If the game is active and the player has persisted ships, those are
//     restored from localStorage so the board renders correctly on rejoin.
// ==========================================================================

import { h, mount } from '../utils/dom.js';
import { store } from '../state/store.js';
import { session } from '../state/session.js';
import { toast } from '../utils/toast.js';
import { Card } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Field, Input, Select } from '../../components/ui/Field.js';
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

  // ---- Sign in ----
  async function signIn(name) {
    const client = session.getClient(store.get().serverUrl);
    if (!client) return;
    const trimmed = (name || '').trim();
    if (!trimmed) { authError = 'Enter your username.'; rerender(); return; }

    authing = true;
    authError = '';
    rerender();

    try {
      const body = await client.getPlayerByUsername(trimmed);
      const player_id = body.player_id;
      const uname = body.username ?? trimmed;
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

  // ---- Create account ----
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

  // ---- Membership check ----
  // Returns true if the current player already has a seat in this game.
  // We check creator_id and the players array (populated by some servers).
  // For servers that don't include a players array we fall back to a direct
  // /join attempt and catch the 400 duplicate-join response in joinGame().
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

  // ---- Create game ----
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

  // ---- Join game (new player, not yet a member) ----
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
      // The server returns 400 for duplicate joins. If that happens it means
      // we mis-detected membership (server didn't expose a players array), so
      // treat it as a rejoin and go straight in.
      if (err.status === 400 && err.message && err.message.toLowerCase().includes('already')) {
        toast.info('Rejoining', `Game #${game.game_id}`);
        enterGame(game.game_id);
        return;
      }
      toast.error('Join failed', err.message);
      joining.delete(game.game_id);
      rerender();
    }
  }

  // ---- Enter game (handles both first-join and rejoin) ----
  // This is the single routing function for all game entry paths. It fetches
  // the latest game state and decides which screen to show. For rejoins into
  // an active or waiting-but-ships-placed game, it restores myShips from
  // localStorage so the board renders correctly without a test-mode endpoint.
  async function enterGame(gameId) {
    session.stopPolling();
    const client = session.getClient(store.get().serverUrl);
    const { player } = store.get();

    try {
      const game = await client.getGame(gameId);
      store.resetGame();
      store.set({ gameId, game });

      if (game.status === 'waiting') {
        // Restore ships in case this player already placed them before leaving.
        const saved = player ? store.restoreShips(gameId, player.player_id) : [];
        if (saved && saved.length > 0) {
          store.set({ myShips: saved });
        }
        store.set({ screen: 'placement' });

      } else if (game.status === 'active') {
        // Always restore ships for the active game — the board needs them to
        // render incoming hits on the correct cells.
        const saved = player ? store.restoreShips(gameId, player.player_id) : [];
        if (saved && saved.length > 0) {
          store.set({ myShips: saved });
          toast.info('Rejoined', `Game #${gameId} — your fleet has been restored.`);
        } else {
          toast.info('Rejoined', `Game #${gameId}`);
        }
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

  // ---- Refresh games list ----
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

  // ---- Auth card ----
  function buildAuthCard() {
    const isSignIn = authMode === 'signin';
    const title = isSignIn ? 'Sign in' : 'Create account';
    const subtitle = isSignIn
      ? 'Enter your username to pick up where you left off.'
      : 'Choose a username to get started.';
    const btnLabel = isSignIn ? 'Sign in' : 'Create account';
    const toggleLabel = isSignIn ? 'No account yet? ' : 'Already have one? ';
    const toggleAction = isSignIn ? 'Create one' : 'Sign in';

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
    const isStale = lastRefreshedAt && (Date.now() - lastRefreshedAt.getTime()) > 15000;

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
      ...sorted.map(g => {
        const member = isMemberOf(g, pid);
        return GameRow({
          game: g,
          isMember: member,
          canJoin: !!pid,
          onJoin: joinGame,
          // Both "Open" (member) and "Join" (non-member) funnel through enterGame.
          // joinGame handles the /join API call then calls enterGame; for members
          // the GameRow emits onView which goes straight to enterGame.
          onView: () => enterGame(g.game_id),
        });
      }),
    );
  }

  // ---- Main build ----
  function build() {
    const { player, myStats } = store.get();

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

    return h('div', { class: 'screen fade-in' },
      h('div', { class: 'screen__header' },
        h('h1', {}, 'Lobby'),
        h('div', { class: 'subtitle' }, 'Browse games, join one, or create your own.'),
      ),

      h('div', { class: 'lobby-grid' },
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
                variant: isStale ? 'primary' : 'teal',
                size: 'sm',
                onClick: refreshGames,
                disabled: loadingGames,
                children: loadingGames ? 'Refreshing…' : isStale ? '↻ Refresh (stale)' : '↻ Refresh',
              }),
            ),
          ),
          buildGamesList(),
        ),

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

  // Auto-poll setup — only starts after a player is signed in.
  let lobbyPollInterval = null;

  function startLobbyPoll() {
    if (lobbyPollInterval) return; // already running, don't stack
    lobbyPollInterval = setInterval(() => {
      if (store.get().screen !== 'lobby') {
        clearInterval(lobbyPollInterval);
        lobbyPollInterval = null;
        return;
      }
      if (store.get().player) refreshGames();
    }, 30000);
  }

  function stopLobbyPoll() {
    if (lobbyPollInterval) {
      clearInterval(lobbyPollInterval);
      lobbyPollInterval = null;
    }
  }

  // Start immediately if already signed in, otherwise wait for sign-in.
  if (store.get().player) {
    startLobbyPoll();
  }

  // Watch for sign-in (to start poll) and navigation away (to stop poll).
  const unsubscribeLobby = store.subscribe(state => {
    if (state.screen !== 'lobby') {
      stopLobbyPoll();
      unsubscribeLobby();
      return;
    }
    if (state.player && !lobbyPollInterval) {
      startLobbyPoll();
    }
    if (!state.player) {
      stopLobbyPoll();
    }
  });
}