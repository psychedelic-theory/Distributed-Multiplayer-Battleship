// ==========================================================================
// Lobby screen — register or load player, list/create/join games
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

export function render(mountEl) {
  let username = '';
  let gridSize = 8;
  let maxPlayers = 2;
  let creating = false;
  let joining = new Set();
  let registering = false;
  let games = [];
  let loadingGames = true;
  let listError = '';
  let lastRefreshedAt = null;

  const rerender = () => mount(mountEl, build());

  function isMemberOf(game, playerId) {
    if (!game || !playerId) return false;
    if (game.creator_id === playerId) return true;

    if (Array.isArray(game.players)) {
      return game.players.some((p) => {
        const pid = typeof p === 'object' ? (p.player_id ?? p.playerId ?? p.id) : p;
        return pid === playerId;
      });
    }

    return false;
  }

  async function setActivePlayer(player) {
    if (!player?.player_id) return;

    store.set({
      player: {
        player_id: player.player_id,
        username: player.username,
      },
    });

    const client = session.getClient(store.get().serverUrl);
    client?.getPlayerStats(player.player_id)
      .then((stats) => store.set({ myStats: stats }))
      .catch(() => {});

    await refreshGames();
  }

  async function registerPlayer(name) {
    const client = session.getClient(store.get().serverUrl);
    if (!client) return;

    const normalized = name?.trim();
    if (!normalized) {
      toast.error('Enter a username.');
      return;
    }

    registering = true;
    rerender();

    try {
      const { player_id } = await client.createPlayer(normalized);
      const full = await client.getPlayer(player_id).catch(() => ({
        player_id,
        username: normalized,
      }));

      await setActivePlayer({
        player_id: full.player_id ?? player_id,
        username: full.username ?? normalized,
      });

      toast.success('Registered', `Welcome, ${full.username || normalized}.`);
    } catch (err) {
      toast.error('Registration failed', err.message);
    } finally {
      registering = false;
      rerender();
    }
  }

  async function loadExistingPlayer(name) {
    const client = session.getClient(store.get().serverUrl);
    if (!client) return;

    const normalized = name?.trim();
    if (!normalized) {
      toast.error('Enter a username.');
      return;
    }

    registering = true;
    rerender();

    try {
      const existing = await client.getPlayerByUsername(normalized);
      await setActivePlayer(existing);
      toast.success('Signed in', `Welcome back, ${existing.username}.`);
    } catch (err) {
      toast.error('Sign in failed', err.message);
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
    if (!player) {
      toast.error('Register or load a player first.');
      return;
    }

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

      if (game.status === 'waiting' || game.status === 'waiting_setup') {
        store.set({ screen: 'placement' });
      } else if (game.status === 'active' || game.status === 'playing') {
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
    } catch (_) {
      // non-fatal
    }
  }

  function buildRegistrationCard() {
    return Card({
      variant: 'feature',
      children: h('div', { class: 'stack' },
        h('h3', { class: 'card__title' }, 'Who are you?'),
        h('p', { class: 'card__meta' }, 'Create a new username or reuse an existing one on this server.'),
        Field({
          label: 'Username',
          children: Input({
            value: username,
            placeholder: 'e.g. Johan',
            autofocus: true,
            disabled: registering,
            onInput: (v) => { username = v; },
            onEnter: (v) => registerPlayer(v),
          }),
        }),
        h('div', { class: 'row-sm' },
          Button({
            variant: 'primary',
            size: 'lg',
            block: true,
            loading: registering,
            onClick: () => registerPlayer(username),
            children: 'Register new',
          }),
          Button({
            variant: 'secondary',
            size: 'lg',
            block: true,
            disabled: registering,
            onClick: () => loadExistingPlayer(username),
            children: 'Use existing',
          }),
        ),
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
            options: [5, 6, 7, 8, 9, 10, 12, 15].map((n) => ({
              value: n,
              label: `${n} × ${n}`,
            })),
            onChange: (v) => { gridSize = Number(v); },
          }),
        }),
        Field({
          label: 'Max players',
          children: Select({
            value: maxPlayers,
            options: [2, 3, 4].map((n) => ({
              value: n,
              label: String(n),
            })),
            onChange: (v) => { maxPlayers = Number(v); },
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

    if (loadingGames) {
      return Loader({ label: 'Loading games…', center: true });
    }

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

    const order = { waiting: 0, waiting_setup: 0, active: 1, playing: 1, finished: 2 };
    const sorted = [...games].sort((a, b) => {
      const ao = order[a.status] ?? 99;
      const bo = order[b.status] ?? 99;
      if (ao !== bo) return ao - bo;
      return (b.game_id ?? 0) - (a.game_id ?? 0);
    });

    return h('div', { class: 'stack' },
      ...sorted.map((game) => GameRow({
        game,
        mine: isMemberOf(game, pid),
        joining: joining.has(game.game_id),
        onJoin: () => joinGame(game),
        onOpen: () => enterGame(game.game_id),
      })),
    );
  }

  function buildIdentitySection() {
    const { player, myStats } = store.get();

    if (!player) {
      return buildRegistrationCard();
    }

    return h('div', { class: 'stack' },
      Card({
        children: h('div', { class: 'stack' },
          Identity({
            name: player.username,
            subtitle: `Player #${player.player_id}`,
          }),
          h('div', { class: 'row-sm' },
            Button({
              size: 'sm',
              variant: 'secondary',
              onClick: refreshStats,
              children: 'Refresh stats',
            }),
            Button({
              size: 'sm',
              variant: 'ghost',
              onClick: () => {
                store.set({ player: null, myStats: null });
                username = '';
                rerender();
              },
              children: 'Log out',
            }),
          ),
        ),
      }),
      myStats ? PlayerStatsCard({ stats: myStats }) : null,
    );
  }

  function build() {
    const { player } = store.get();

    return h('div', { class: 'stack stack--lg' },
      h('div', { class: 'stack' },
        h('h2', {}, 'Lobby'),
        h('p', { class: 'screen__lede' }, 'Choose a player identity, then create or join a game.'),
      ),

      buildIdentitySection(),

      player ? buildCreateCard() : null,

      Card({
        children: h('div', { class: 'stack' },
          h('div', { class: 'row row--between row--center' },
            h('h3', { class: 'card__title' }, 'Open games'),
            h('div', { class: 'row-sm' },
              lastRefreshedAt
                ? h('span', { class: 'card__meta' }, `Updated ${lastRefreshedAt.toLocaleTimeString()}`)
                : null,
              Button({
                size: 'sm',
                variant: 'secondary',
                onClick: refreshGames,
                children: 'Refresh',
              }),
            ),
          ),
          buildGamesList(),
        ),
      }),
    );
  }

  refreshGames();
  rerender();
}