/**
 * app.js — Main application controller
 * Bootstraps the app, manages screen routing, and creates ambient particles.
 */

import { store } from './store.js';
import { Header } from '../components/layout/Header.js';
import { LobbyScreen } from '../components/features/LobbyScreen.js';
import { PlacementScreen } from '../components/features/PlacementScreen.js';
import { GameScreen } from '../components/features/GameScreen.js';
import { ResultsScreen } from '../components/features/ResultsScreen.js';

// ── Particle System ──────────────────────────────────────
function initParticles() {
  const field = document.createElement('div');
  field.className = 'particles';
  document.body.prepend(field);

  const count = 14;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size  = 2 + Math.random() * 4;
    const left  = Math.random() * 100;
    const dur   = 18 + Math.random() * 20;
    const delay = Math.random() * -20;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${left}%;
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      opacity:0;
    `;
    field.appendChild(p);
  }
}

// ── Screen Router ────────────────────────────────────────
class App {
  constructor() {
    this.root        = document.getElementById('app');
    this.currentScreen = null;
    this.screens     = {};

    this.header = Header();
    this.main   = document.createElement('main');
    this.main.className = 'app-main';

    this.root.appendChild(this.header);
    this.root.appendChild(this.main);

    initParticles();
  }

  navigate(screenName) {
    // Destroy previous screen
    if (this.currentScreen?.destroy) this.currentScreen.destroy();
    this.main.innerHTML = '';

    let screen;
    const nav = (to) => this.navigate(to);

    switch (screenName) {
      case 'lobby':
        screen = LobbyScreen({ onNavigate: nav });
        break;
      case 'placement':
        screen = PlacementScreen({ onNavigate: nav });
        break;
      case 'game':
        screen = GameScreen({ onNavigate: nav });
        break;
      case 'results':
        screen = ResultsScreen({ onNavigate: nav });
        break;
      default:
        screen = LobbyScreen({ onNavigate: nav });
    }

    screen.classList.add('screen--active');
    this.main.appendChild(screen);
    this.currentScreen = screen;

    store.set({ activeScreen: screenName });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  start() {
    this.navigate('lobby');
  }
}

// ── Boot ─────────────────────────────────────────────────
const app = new App();
app.start();
