/**
 * Button — standard button with variants and loading state.
 *
 * Props: { variant, size, block, loading, disabled, onClick, type, children }
 */
import { h } from '../../js/utils/dom.js';

export function Button({
  variant = 'default',      // 'default' | 'primary' | 'danger' | 'ghost'
  size = 'md',              // 'sm' | 'md' | 'lg'
  block = false,
  loading = false,
  disabled = false,
  type = 'button',
  onClick,
  ...rest
} = {}, children) {
  const classes = ['btn'];
  if (variant !== 'default') classes.push(`btn--${variant}`);
  if (size    !== 'md')      classes.push(`btn--${size}`);
  if (block)   classes.push('btn--block');
  if (loading) classes.push('btn--loading');

  return h('button', {
    class: classes.join(' '),
    type,
    disabled: disabled || loading,
    onclick: onClick,
    ...rest,
  }, loading ? '' : children);
}
