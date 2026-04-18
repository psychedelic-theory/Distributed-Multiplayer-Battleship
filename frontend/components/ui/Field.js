// ==========================================================================
// Field — Input, Select, and form field wrapper
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * Field({ label, hint, error, children })
 * Wraps an input/select with a label and optional error state.
 */
export function Field({ label, hint, error, children, htmlFor } = {}) {
  return h('div', { class: 'field' },
    label && h('label', { class: 'field__label', attrs: htmlFor ? { for: htmlFor } : {} },
      label,
      hint && h('span', { class: 'hint' }, '— ', hint),
    ),
    children,
    error && h('div', { class: 'field__error' }, error),
  );
}

/**
 * Input({ value, onInput, onChange, onEnter, placeholder, type, mono, ...rest })
 * onEnter is a convenience — fires when user presses Enter.
 */
export function Input({
  value = '',
  onInput,
  onChange,
  onEnter,
  placeholder = '',
  type = 'text',
  mono = false,
  id,
  autofocus = false,
  class: extraClass = '',
  ...rest
} = {}) {
  const classes = ['input'];
  if (mono) classes.push('input--mono');
  if (extraClass) classes.push(extraClass);

  const el = h('input', {
    class: classes.join(' '),
    type,
    value,
    id,
    placeholder,
    onInput: e => { if (onInput) onInput(e.target.value, e); },
    onChange: e => { if (onChange) onChange(e.target.value, e); },
    onKeydown: e => {
      if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter(e.target.value, e);
      }
    },
    ...rest,
  });
  if (autofocus) {
    // Defer so the element is in the DOM
    setTimeout(() => el.focus(), 0);
  }
  return el;
}

/**
 * Select({ value, onChange, options, id })
 * options: [{ value, label }] or [string]
 */
export function Select({ value, onChange, options = [], id, class: extraClass = '', ...rest } = {}) {
  const classes = ['select'];
  if (extraClass) classes.push(extraClass);
  return h('select', {
    class: classes.join(' '),
    id,
    value,
    onChange: e => { if (onChange) onChange(e.target.value, e); },
    ...rest,
  },
  ...options.map(opt => {
    const [v, l] = typeof opt === 'string' ? [opt, opt] : [opt.value, opt.label];
    return h('option', { value: v, selected: String(v) === String(value) || undefined }, l);
  }));
}
