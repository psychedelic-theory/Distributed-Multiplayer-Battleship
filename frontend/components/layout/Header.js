/**
 * components/layout/Header.js
 * Top navigation bar with logo, player identity, and game status.
 */

import { store } from '../../js/store.js';

export function Header() {
  const el = document.createElement('header');
  el.className = 'app-header glass-card';
  el.innerHTML = `
    <div class="app-header__logo">
      <div class="logo-mark">
        <div class="logo-grid">
          ${Array.from({ length: 9 }, (_, i) => `<div class="logo-cell${i === 4 ? ' logo-cell--hit' : i % 3 === 0 ? ' logo-cell--ship' : ''}"></div>`).join('')}
        </div>
      </div>
      <div class="logo-text">
        <span class="logo-name display-md">BATTLESHIP</span>
        <span class="label-mono logo-sub">Naval Combat System</span>
      </div>
    </div>

    <div class="app-header__center" id="header-status"></div>

    <div class="app-header__right">
      <div class="player-pill" id="player-pill"></div>
    </div>
  `;

  // Reactive updates
  store.on('username', (username) => {
    const pill = el.querySelector('#player-pill');
    if (username) {
      pill.innerHTML = `
        <div class="pill-avatar">${username.charAt(0).toUpperCase()}</div>
        <div class="pill-info">
          <span class="pill-name">${username}</span>
          <span class="pill-id label-mono">ID #${store.get('playerId')}</span>
        </div>
      `;
      pill.classList.add('player-pill--active');
    } else {
      pill.innerHTML = '';
      pill.classList.remove('player-pill--active');
    }
  });

  store.on('gameStatus', (status) => {
    const center = el.querySelector('#header-status');
    if (!status || !store.get('gameId')) {
      center.innerHTML = '';
      return;
    }
    const labels = { waiting: 'Waiting for Players', active: 'Battle Active', finished: 'Game Over' };
    center.innerHTML = `
      <div class="header-game-status">
        <span class="badge badge--${status}">
          <span class="dot dot--${status}"></span>
          ${labels[status] || status}
        </span>
        <span class="label-mono header-game-id">GAME #${store.get('gameId')}</span>
      </div>
    `;
  });

  return el;
}
