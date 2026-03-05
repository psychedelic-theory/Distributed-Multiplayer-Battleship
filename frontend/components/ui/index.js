/**
 * components/ui/index.js — Primitive UI components
 * Button, Input, Toast, Modal — all return DOM elements.
 */

/* ══ Button ══════════════════════════════════════════════ */
export function Button({
  label,
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'danger'
  size    = 'md',       // 'sm' | 'md' | 'lg'
  icon    = null,
  loading = false,
  disabled = false,
  onClick = () => {},
} = {}) {
  const btn = document.createElement('button');
  btn.className = `btn btn--${variant} btn--${size}`;
  btn.disabled  = disabled || loading;

  const renderInner = () => {
    btn.innerHTML = '';
    if (loading) {
      const sp = document.createElement('span');
      sp.className = 'spinner';
      btn.appendChild(sp);
    } else {
      if (icon) {
        const ic = document.createElement('span');
        ic.className = 'btn__icon';
        ic.innerHTML = icon;
        btn.appendChild(ic);
      }
      const txt = document.createElement('span');
      txt.textContent = label;
      btn.appendChild(txt);
    }
  };

  renderInner();
  btn.addEventListener('click', onClick);

  btn.setLoading = (v) => { btn.disabled = v; loading = v; renderInner(); };
  btn.setLabel   = (v) => { label = v; renderInner(); };

  return btn;
}

/* ══ Input ═══════════════════════════════════════════════ */
export function Input({
  placeholder = '',
  label       = '',
  type        = 'text',
  value       = '',
  maxLength   = 32,
  onInput     = () => {},
  onEnter     = () => {},
} = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'input-group';

  if (label) {
    const lbl = document.createElement('label');
    lbl.className = 'input-label label-mono';
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }

  const inner = document.createElement('div');
  inner.className = 'input-inner';

  const inp = document.createElement('input');
  inp.type        = type;
  inp.placeholder = placeholder;
  inp.value       = value;
  inp.maxLength   = maxLength;
  inp.className   = 'input-field';
  inp.addEventListener('input', () => onInput(inp.value));
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(inp.value); });

  inner.appendChild(inp);
  wrap.appendChild(inner);

  wrap.getValue   = () => inp.value;
  wrap.setValue   = (v) => { inp.value = v; };
  wrap.setError   = (msg) => {
    wrap.querySelector('.input-error')?.remove();
    if (msg) {
      const err = document.createElement('span');
      err.className = 'input-error';
      err.textContent = msg;
      wrap.appendChild(err);
      inner.classList.add('input-inner--error');
    } else {
      inner.classList.remove('input-inner--error');
    }
  };
  wrap.focus = () => inp.focus();

  return wrap;
}

/* ══ NumberInput ═════════════════════════════════════════ */
export function NumberInput({ label, value, min, max, onChange } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'number-input-group';

  const lbl = document.createElement('span');
  lbl.className = 'input-label label-mono';
  lbl.textContent = label;
  wrap.appendChild(lbl);

  const ctrl = document.createElement('div');
  ctrl.className = 'number-input-ctrl';

  const btnDec = document.createElement('button');
  btnDec.className = 'number-btn';
  btnDec.textContent = '−';
  btnDec.type = 'button';

  const display = document.createElement('span');
  display.className = 'number-display font-mono';
  display.textContent = value;

  const btnInc = document.createElement('button');
  btnInc.className = 'number-btn';
  btnInc.textContent = '+';
  btnInc.type = 'button';

  let current = value;

  btnDec.addEventListener('click', () => {
    if (current > min) { current--; display.textContent = current; onChange(current); }
  });
  btnInc.addEventListener('click', () => {
    if (current < max) { current++; display.textContent = current; onChange(current); }
  });

  ctrl.appendChild(btnDec);
  ctrl.appendChild(display);
  ctrl.appendChild(btnInc);
  wrap.appendChild(ctrl);

  wrap.getValue = () => current;
  return wrap;
}

/* ══ Toast ═══════════════════════════════════════════════ */
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast({ message, type = 'info', duration = 3500 }) {
  // type: 'info' | 'success' | 'error' | 'hit' | 'miss'
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icons = {
    info:    '◆',
    success: '✓',
    error:   '✕',
    hit:     '🎯',
    miss:    '○',
  };

  toast.innerHTML = `
    <span class="toast__icon">${icons[type] || icons.info}</span>
    <span class="toast__msg">${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

/* ══ Modal ═══════════════════════════════════════════════ */
export function Modal({ title, content, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card glass-card';

  const header = document.createElement('div');
  header.className = 'modal-header';

  const ttl = document.createElement('h3');
  ttl.className = 'display-md';
  ttl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', () => { overlay.remove(); onClose?.(); });

  header.appendChild(ttl);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else {
    body.appendChild(content);
  }

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) { overlay.remove(); onClose?.(); }
  });

  overlay.open = () => {
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));
  };
  overlay.close = () => { overlay.remove(); };

  return overlay;
}
