// ==========================================================================
// Modal — backdrop + modal container
// ==========================================================================

import { h } from '../../js/utils/dom.js';
import { Button } from './Button.js';

/**
 * openModal({ title, body, footer, onClose, dismissable })
 * Appends a modal to <body> and returns a close() function.
 *   body:   Node or array of Nodes for the modal body
 *   footer: Node (optional) — typically action buttons
 *   onClose: called after the modal is removed
 *   dismissable: if true (default), clicking backdrop or pressing Esc closes.
 */
export function openModal({
  title,
  body,
  footer,
  onClose,
  dismissable = true,
} = {}) {
  let backdropEl;

  const close = () => {
    if (!backdropEl || !backdropEl.parentNode) return;
    backdropEl.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };

  const onKey = e => {
    if (e.key === 'Escape' && dismissable) close();
  };

  const onBackdrop = e => {
    if (e.target === backdropEl && dismissable) close();
  };

  backdropEl = h('div', { class: 'modal-backdrop', onClick: onBackdrop },
    h('div', { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      h('div', { class: 'modal__header' },
        title && h('div', { class: 'modal__title' }, title),
        dismissable && h('button', {
          class: 'modal__close',
          onClick: close,
          attrs: { 'aria-label': 'Close' },
        }, '✕'),
      ),
      h('div', { class: 'modal__body' },
        ...(Array.isArray(body) ? body : [body]).filter(Boolean),
      ),
      footer && h('div', { class: 'modal__footer' },
        ...(Array.isArray(footer) ? footer : [footer]),
      ),
    ),
  );

  document.body.appendChild(backdropEl);
  document.addEventListener('keydown', onKey);

  return close;
}

/**
 * confirm({ title, message, confirmLabel, cancelLabel, danger })
 * Returns a Promise<boolean>.
 */
export function confirmModal({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
} = {}) {
  return new Promise(resolve => {
    let resolved = false;
    const finish = val => {
      if (resolved) return;
      resolved = true;
      close();
      resolve(val);
    };

    const close = openModal({
      title,
      body: h('p', {}, message),
      footer: [
        Button({ variant: 'ghost', onClick: () => finish(false), children: cancelLabel }),
        Button({
          variant: danger ? 'danger' : 'primary',
          onClick: () => finish(true),
          children: confirmLabel,
        }),
      ],
      onClose: () => finish(false),
    });
  });
}
