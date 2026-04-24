// ==========================================================================
// theme.js — light/dark mode handling
// ==========================================================================

import { storage } from './storage.js';

const THEME_KEY = 'theme';

export function getTheme() {
  return storage.get(THEME_KEY, 'dark');
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  storage.set(THEME_KEY, theme);
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}