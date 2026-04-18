// ==========================================================================
// Toast — lightweight notifications
// ==========================================================================

import { h, mount } from './dom.js';

const CONTAINER_ID = 'toast-container';
const DEFAULT_DURATION = 4200;

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = h('div', { id: CONTAINER_ID, class: 'toasts', attrs: { 'aria-live': 'polite' } });
    document.body.appendChild(el);
  }
  return el;
}

function createToast(kind, title, message, duration) {
  const icons = { success: '✓', error: '⚠', warn: '!', info: 'i' };
  const container = ensureContainer();

  let toastEl;
  const close = () => {
    if (!toastEl || !toastEl.parentNode) return;
    toastEl.classList.add('toast--exit');
    setTimeout(() => toastEl.remove(), 200);
  };

  toastEl = h('div', { class: `toast toast--${kind}`, attrs: { role: 'status' } },
    h('div', { class: 'toast__icon' }, icons[kind] || 'i'),
    h('div', { class: 'toast__body' },
      title && h('div', { class: 'toast__title' }, title),
      message && h('div', { class: 'toast__msg' }, message),
    ),
    h('button', { class: 'toast__close', onClick: close, attrs: { 'aria-label': 'Dismiss' } }, '✕'),
  );

  container.appendChild(toastEl);
  if (duration > 0) setTimeout(close, duration);
  return close;
}

function parse(args) {
  // toast.success('title', 'message', duration?)  OR  toast.success('message')
  if (args.length >= 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
    return { title: args[0], message: args[1], duration: args[2] ?? DEFAULT_DURATION };
  }
  return { title: null, message: String(args[0] ?? ''), duration: args[1] ?? DEFAULT_DURATION };
}

export const toast = {
  success(...a) { const { title, message, duration } = parse(a); return createToast('success', title, message, duration); },
  error(...a)   { const { title, message, duration } = parse(a); return createToast('error',   title, message, duration); },
  warn(...a)    { const { title, message, duration } = parse(a); return createToast('warn',    title, message, duration); },
  info(...a)    { const { title, message, duration } = parse(a); return createToast('info',    title, message, duration); },
};
