/**
 * components/features/ResultsScreen.js
 * Post-game victory/defeat screen with updated lifetime stats.
 */

import { api } from '../../js/api.js';
import { store } from '../../js/store.js';
import { Button } from '../ui/index.js';

export function ResultsScreen({ onNavigate }) {
  const el = document.createElement('div');
  el.className = 'screen results-screen';
  el.id = 'screen-results';

  const playerId = store.get('playerId');
  const winnerId = store.get('winnerId');
  const username = store.get('username');
  const isWinner = winnerId === playerId;

  el.innerHTML = `
    <div class="results-layout">
      <div class="results-hero">
        <div class="results-emblem${isWinner ? ' results-emblem--win' : ' results-emblem--loss'}">
          ${isWinner ? buildTrophyIcon() : buildAnchorIcon()}
        </div>
        <div class="results-outcome label-mono">${isWinner ? 'Victory' : 'Defeated'}</div>
        <h1 class="display-xl results-title">
          ${isWinner
            ? `<span class="gradient-text">Mission<br/>Complete</span>`
            : `Fleet<br/><span style="color:var(--hit-light)">Destroyed</span>`
          }
        </h1>
        <p class="text-muted results-sub">
          ${isWinner
            ? `Commander ${username} — The seas are yours.`
            : `All ships lost. Regroup and return to battle.`
          }
        </p>
      </div>

      <div class="results-stats glass-card" id="results-stats">
        <div class="label-mono text-accent" style="margin-bottom:var(--space-4)">Lifetime Stats Updated</div>
        <div class="results-stat-grid" id="results-stat-grid">
          ${Array.from({length:6}, () => `<div class="skeleton" style="height:70px;border-radius:var(--radius-md)"></div>`).join('')}
        </div>
      </div>

      <div class="results-actions">
        <div id="results-btns"></div>
      </div>
    </div>

    ${isWinner ? buildConfetti() : ''}
  `;

  // ── Buttons ────────────────────────────────────────────
  const playAgainBtn = Button({
    label: 'Play Again',
    variant: 'primary',
    size: 'lg',
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6"/><path d="M2 4v4h4"/></svg>`,
  });
  const lobbyBtn = Button({ label: 'Return to Lobby', variant: 'secondary', size: 'lg' });

  playAgainBtn.addEventListener('click', () => {
    store.set({
      gameId: null, gameStatus: null, myShips: [], myShots: [],
      shipsPlaced: false, winnerId: null, isMyTurn: false,
    });
    onNavigate('lobby');
  });
  lobbyBtn.addEventListener('click', () => onNavigate('lobby'));

  const actRow = el.querySelector('#results-btns');
  actRow.style.cssText = 'display:flex;gap:var(--space-3);justify-content:center;flex-wrap:wrap;';
  actRow.appendChild(playAgainBtn);
  actRow.appendChild(lobbyBtn);

  // ── Load updated stats ─────────────────────────────────
  async function loadStats() {
    try {
      const s = await api.getStats(playerId);
      const grid = el.querySelector('#results-stat-grid');
      grid.innerHTML = '';

      const items = [
        { label: 'Games Played',  value: s.games_played,                icon: '⬡', highlight: false },
        { label: 'Total Wins',    value: s.wins,                         icon: '★', highlight: isWinner },
        { label: 'Total Losses',  value: s.losses,                       icon: '↓', highlight: !isWinner },
        { label: 'Accuracy',      value: `${(s.accuracy*100).toFixed(1)}%`, icon: '◎', highlight: false },
        { label: 'Total Shots',   value: s.total_shots,                  icon: '◆', highlight: false },
        { label: 'Total Hits',    value: s.total_hits,                   icon: '✦', highlight: false },
      ];

      items.forEach(({ label, value, icon, highlight }, i) => {
        const item = document.createElement('div');
        item.className = `results-stat-item${highlight ? ' results-stat-item--highlight' : ''}`;
        item.style.animationDelay = `${i * 60}ms`;
        item.innerHTML = `
          <div class="results-stat-icon">${icon}</div>
          <div class="results-stat-val">${value}</div>
          <div class="results-stat-lbl label-mono">${label}</div>
        `;
        grid.appendChild(item);
      });
    } catch { /* non-critical */ }
  }

  requestAnimationFrame(loadStats);

  return el;
}

function buildTrophyIcon() {
  return `<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <path d="M20 8h24v20c0 8.8-7.2 16-16 16s-16-7.2-16-16V8z" fill="rgba(30,111,168,0.3)" stroke="#5EB0E8" stroke-width="1.5"/>
    <path d="M8 8h12v12c0 3.3-2.7 6-6 6s-6-2.7-6-6V8z" fill="rgba(30,111,168,0.15)" stroke="#1E6FA8" stroke-width="1"/>
    <path d="M44 8h12v12c0 3.3-2.7 6-6 6s-6-2.7-6-6V8z" fill="rgba(30,111,168,0.15)" stroke="#1E6FA8" stroke-width="1"/>
    <path d="M26 44v8M38 44v8M20 52h24" stroke="#5EB0E8" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="32" cy="26" r="6" fill="#1E6FA8" opacity="0.5"/>
    <path d="M29 26l2 2 4-4" stroke="#B9D9F2" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

function buildAnchorIcon() {
  return `<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="16" r="6" stroke="rgba(214,40,40,0.6)" stroke-width="1.5" fill="none"/>
    <path d="M32 22v26M20 32H12M44 32h8" stroke="rgba(214,40,40,0.6)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M12 48c0-8 8-8 20-8s20 0 20 8" stroke="rgba(214,40,40,0.5)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function buildConfetti() {
  const colors = ['#1E6FA8','#5EB0E8','#B9D9F2','#2E86C9','rgba(185,217,242,0.7)'];
  return `<div class="confetti-field" aria-hidden="true">
    ${Array.from({ length: 28 }, (_, i) => {
      const color = colors[i % colors.length];
      const left  = (i * 3.7 + Math.random() * 4).toFixed(1);
      const delay = (Math.random() * 2.5).toFixed(2);
      const dur   = (2 + Math.random() * 3).toFixed(2);
      const size  = 4 + Math.floor(Math.random() * 6);
      return `<div class="confetti-piece" style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;width:${size}px;height:${size}px;background:${color}"></div>`;
    }).join('')}
  </div>`;
}
