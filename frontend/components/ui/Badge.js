// ==========================================================================
// Badge — status pills
// ==========================================================================

import { h } from '../../js/utils/dom.js';

const LABELS = {
  live:     'Live',
  waiting:  'Waiting',
  finished: 'Finished',
  error:    'Error',
  full:     'Full',
};

/**
 * Badge({ variant, label, dot })
 * variant: live | waiting | finished | error | full | default
 * label: overrides the default label for that variant
 * dot: show the leading dot (default true for live/waiting, false otherwise)
 */
export function Badge({ variant = 'default', label, dot, children } = {}) {
  const classes = ['badge'];
  if (variant !== 'default') classes.push(`badge--${variant}`);

  const showDot = dot === undefined
    ? (variant === 'live' || variant === 'waiting')
    : !!dot;

  const text = children ?? label ?? LABELS[variant] ?? variant;

  return h('span', { class: classes.join(' ') },
    showDot && h('span', { class: 'badge__dot' }),
    text,
  );
}

/** Convenience — map a raw game status string to the right badge. */
export function GameStatusBadge(status) {
  switch (status) {
    case 'active':   return Badge({ variant: 'live' });
    case 'waiting':  return Badge({ variant: 'waiting' });
    case 'finished': return Badge({ variant: 'finished' });
    default:         return Badge({ variant: 'default', label: status || 'Unknown' });
  }
}
