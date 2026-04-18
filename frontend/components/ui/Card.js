// ==========================================================================
// Card
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * Card({ variant, onClick, title, children })
 * variant: default | feature | interactive
 */
export function Card({
  variant = 'default',
  onClick,
  title,
  class: extraClass = '',
  children,
} = {}) {
  const classes = ['card'];
  if (variant !== 'default') classes.push(`card--${variant}`);
  if (onClick) classes.push('card--interactive');
  if (extraClass) classes.push(extraClass);

  return h('div', { class: classes.join(' '), onClick },
    title && h('div', { class: 'card__title' }, title),
    children,
  );
}
