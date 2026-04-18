/**
 * Card — glass surface container.
 */
import { h } from '../../js/utils/dom.js';

export function Card({ feature = false, interactive = false, className = '', ...rest } = {}, children) {
  const classes = ['card'];
  if (feature)     classes.push('card--feature');
  if (interactive) classes.push('card--interactive');
  if (className)   classes.push(className);

  return h('div', { class: classes.join(' '), ...rest }, children);
}
