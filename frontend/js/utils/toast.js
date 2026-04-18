/**
 * toast.js — Notification system.
 *
 * Usage: toast.success('Ship placed'), toast.error('Shot rejected'), toast.info(...)
 */

import { h } from './dom.js';

const DEFAULT_DURATION = 3200;

function show(message, variant = 'info', duration = DEFAULT_DURATION) {
  const region = document.getElementById('toast-region');
  if (!region) return;

  const iconByVariant = {
    success: '✓',
    error:   '✕',
    warn:    '!',
    info:    'i',
  };

  const el = h(`div.toast.toast--${variant}`, {}, [
    h('span.toast__icon', {}, iconByVariant[variant] || 'i'),
    h('span.toast__body', {}, message),
  ]);

  region.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast--out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export const toast = {
  success: (msg, d) => show(msg, 'success', d),
  error:   (msg, d) => show(msg, 'error',   d ?? 4200),
  warn:    (msg, d) => show(msg, 'warn',    d),
  info:    (msg, d) => show(msg, 'info',    d),
};
