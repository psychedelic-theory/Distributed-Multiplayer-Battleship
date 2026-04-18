// ==========================================================================
// Button
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * Button({ variant, size, block, disabled, loading, onClick, type, children })
 * variant: default | primary | accent | teal | danger | ghost
 * size:    sm | md (default) | lg
 */
export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  children,
  class: extraClass = '',
  ...rest
} = {}) {
  const classes = ['btn'];
  if (variant !== 'default') classes.push(`btn--${variant}`);
  if (size !== 'md') classes.push(`btn--${size}`);
  if (block) classes.push('btn--block');
  if (extraClass) classes.push(extraClass);

  const label = loading
    ? [h('span', { class: 'loader__spinner', style: { width: '14px', height: '14px', borderWidth: '2px' } }), 'Working…']
    : [children];

  return h('button', {
    class: classes.join(' '),
    type,
    disabled: disabled || loading,
    onClick,
    ...rest,
  }, ...label);
}
