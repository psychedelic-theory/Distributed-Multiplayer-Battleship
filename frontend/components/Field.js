/**
 * Field / Input / Select — form primitives.
 */
import { h } from '../../js/utils/dom.js';

/**
 * Field wraps a label, input, and hint/error text.
 * Props: { label, hint, error }
 */
export function Field({ label, hint, error } = {}, input) {
  return h('div.field', {}, [
    label ? h('label.field__label', {}, label) : null,
    input,
    hint  ? h('span.field__hint',  {}, hint) : null,
    error ? h('span.field__error', {}, error) : null,
  ]);
}

export function Input({ mono = false, inline = false, className = '', ...rest } = {}) {
  const classes = ['input'];
  if (mono)   classes.push('input--mono');
  if (inline) classes.push('input--inline');
  if (className) classes.push(className);
  return h('input', { class: classes.join(' '), ...rest });
}

export function Select({ options = [], value, onChange, ...rest } = {}) {
  const select = h('select.select', {
    onchange: onChange,
    ...rest,
  }, options.map(opt => {
    const isObj = typeof opt === 'object';
    const val = isObj ? opt.value : opt;
    const label = isObj ? opt.label : String(opt);
    return h('option', { value: val, selected: String(val) === String(value) }, label);
  }));
  return select;
}
