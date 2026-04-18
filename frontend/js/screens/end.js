// ==========================================================================
// End screen — winner banner + stats summary + back to lobby
// ==========================================================================

import { h, mount } from '../utils/dom.js';
import { store } from '../state/store.js';
import { session } from '../state/session.js';
import { Card } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Loader } from '../../components/ui/Loader.js';
import { WinnerBanner } from '../../components/ui/WinnerBanner.js';
import { StatPill } from '../../components/ui/StatPill.js';
import { PlayerStatsCard } from '../../components/features/PlayerStatsCard.js';
import { MoveLog } from '../../components/features/MoveLog.js';
import { formatAccuracy } from '../utils/format.js';

export function render(mountEl) {
  let lifetimeStats = null;
  let moves = [];
  let playerNames = new Map();
  let winnerName = '';
  let loading = true;

  const rerender = () => mount(mountEl, build());

  async function load() {
    const { gameId, player, game } = store.get();
    if (!gameId || !player) { loading = false; rerender(); return; }
    const client = session.getClient(store.get().serverUrl);

    try {
      const [stats, movesList, latestGame] = await Promise.all([
        client.getPlayerStats(player.player_id).catch(() => null),
        client.getMoves(gameId).catch(() => []),
        client.getGame(gameId).catch(() => game),
      ]);
      lifetimeStats = stats;
      moves = movesList;
      store.set({ myStats: stats, game: latestGame });

      // Derive the winner if the server didn't provide one. When winner_id is
      // missing but the game is finished, the winner is whoever landed the last
      // hit (the shot that eliminated the other player's fleet).
      let derivedWinnerId = latestGame?.winner_id ?? null;
      if (derivedWinnerId == null && latestGame?.status === 'finished' && movesList.length > 0) {
        // Find the last HIT — the player who scored it is the winner.
        for (let i = movesList.length - 1; i >= 0; i--) {
          if (movesList[i].result === 'hit') {
            derivedWinnerId = movesList[i].player_id;
            break;
          }
        }
        // Fallback to the very last move's player (should be rare — only if
        // the final move was somehow a miss that ended the game).
        if (derivedWinnerId == null) {
          derivedWinnerId = movesList[movesList.length - 1].player_id;
        }
      }

      // Stash the resolved winner back onto the store's game object so the
      // build() function reads it the same way regardless of source.
      if (derivedWinnerId != null && latestGame) {
        store.set({ game: { ...latestGame, winner_id: derivedWinnerId } });
      }

      // Resolve names for anyone in moves + the winner
      const ids = new Set(movesList.map(m => m.player_id));
      if (derivedWinnerId != null) ids.add(derivedWinnerId);
      const results = await Promise.all([...ids].map(async id => {
        if (id === player.player_id) return [id, player.username];
        try { const p = await client.getPlayer(id); return [id, p.username || `Player ${id}`]; }
        catch { return [id, `Player ${id}`]; }
      }));
      for (const [id, name] of results) playerNames.set(id, name);

      if (derivedWinnerId != null) {
        winnerName = playerNames.get(derivedWinnerId) || `Player ${derivedWinnerId}`;
      }
    } catch { /* non-fatal */ }

    loading = false;
    rerender();
  }

  function nameLookup(id) { return playerNames.get(id) || `Player ${id}`; }

  function onBackToLobby() {
    store.resetGame();
    store.set({ screen: 'lobby' });
  }

  function build() {
    const { player, game } = store.get();

    if (loading) {
      return h('div', { class: 'screen screen--narrow' }, Loader({ label: 'Tallying results…', center: true }));
    }

    const myId = player?.player_id;
    const winnerId = game?.winner_id;
    const victory = !!winnerId && winnerId === myId;

    const myMoves = moves.filter(m => m.player_id === myId);
    const myHits = myMoves.filter(m => m.result === 'hit').length;
    const myShots = myMoves.length;
    const sessionAcc = myShots > 0 ? (myHits / myShots) * 100 : 0;

    return h('div', { class: 'screen fade-in' },
      h('div', { class: 'screen__header' },
        h('h1', {}, 'Game Over'),
        h('div', { class: 'subtitle' }, game ? `Game #${game.game_id}` : ''),
      ),

      h('div', { class: 'stack' },
        WinnerBanner({
          victory,
          winnerName: victory ? player.username : winnerName,
        }),

        Card({
          children: h('div', { class: 'stack' },
            h('h3', { class: 'card__title' }, 'This game'),
            h('div', { class: 'stats-row' },
              StatPill({ label: 'Shots', value: myShots }),
              StatPill({ label: 'Hits', value: myHits }),
              StatPill({ label: 'Accuracy', value: formatAccuracy(sessionAcc), small: true }),
              StatPill({ label: 'Moves', value: moves.length }),
              StatPill({ label: 'Result', value: victory ? 'Win' : (winnerId ? 'Loss' : 'Draw') }),
            ),
          ),
        }),

        lifetimeStats && PlayerStatsCard({ stats: lifetimeStats, title: 'Lifetime stats' }),

        Card({
          children: h('div', { class: 'stack-sm' },
            h('h3', { class: 'card__title' }, 'Full move log'),
            MoveLog({ moves, nameLookup, maxItems: 200, newestFirst: false }),
          ),
        }),

        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: 'var(--sp-4)' } },
          Button({ variant: 'primary', size: 'lg', onClick: onBackToLobby, children: 'Back to lobby' }),
        ),
      ),
    );
  }

  rerender();
  load();
}
