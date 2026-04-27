// ==========================================================================
// Header — sticky app header
// ==========================================================================

import { h } from '../../js/utils/dom.js';
import { Identity } from '../ui/Identity.js';
import { ServerPill } from '../ui/ServerPill.js';
import { Button } from '../ui/Button.js';
import { ThemeToggle } from '../ui/ThemeToggle.js';
import { store } from '../../js/state/store.js';
import { session } from '../../js/state/session.js';
import { toast } from '../../js/utils/toast.js';

/**
 * Header — reads from store directly.
 * Shows brand, back-to-lobby when in game screens, ThemeToggle,
 * ServerPill with disconnect, and Identity if signed in.
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
      (screen === 'placement' || screen === 'game' || screen === 'end') &&
        Button({ variant: 'ghost', size: 'sm', onClick: onBackToLobby, children: '← Lobby' }),

      player &&
        Button({ variant: 'ghost', size: 'sm', onClick: onSignOut, children: 'Sign out' }),

      serverUrl && ServerPill({ url: serverUrl, onDisconnect }),

      player && Identity({ name: player.username, me: true }),

      ThemeToggle(),
    ),
  );
}