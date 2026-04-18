// ==========================================================================
// Header — sticky app header
// ==========================================================================

import { h } from '../../js/utils/dom.js';
import { Identity } from '../ui/Identity.js';
import { ServerPill } from '../ui/ServerPill.js';
import { Button } from '../ui/Button.js';
import { store } from '../../js/state/store.js';
import { session } from '../../js/state/session.js';
import { toast } from '../../js/utils/toast.js';

/**
 * Header — reads from store directly.
 * Shows brand, ServerPill (with disconnect), and Identity if present.
 */
export function Header() {
  const { serverUrl, player, screen } = store.get();

  const onDisconnect = () => {
    session.stopPolling();
    session.clearClient();
    store.resetGame();
    store.set({
      screen: 'connect',
      serverUrl: null,
      serverConnected: false,
      player: null,
    });
    toast.info('Disconnected from server');
  };

  const onSignOut = () => {
    session.stopPolling();
    store.resetGame();
    store.set({ player: null, screen: 'lobby' });
    // If we're signed out, reroute to lobby which will prompt for registration
    store.set({ screen: 'lobby' });
  };

  const onBackToLobby = () => {
    session.stopPolling();
    store.resetGame();
    store.set({ screen: 'lobby' });
  };

  return h('header', { class: 'app-header' },
    h('div', { class: 'app-header__brand' },
      h('div', { class: 'app-header__brand-mark' }, 'B'),
      h('span', {}, 'Battleship'),
    ),
    h('div', { class: 'app-header__actions' },
      // Show "back to lobby" when deep in a game flow
      (screen === 'placement' || screen === 'game' || screen === 'end') &&
        Button({ variant: 'ghost', size: 'sm', onClick: onBackToLobby, children: '← Lobby' }),

      serverUrl && ServerPill({ url: serverUrl, onDisconnect }),

      player && Identity({ name: player.username, me: true }),
    ),
  );
}
