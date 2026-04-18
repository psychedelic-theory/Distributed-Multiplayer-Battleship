// ==========================================================================
// PlayerStatsCard — lifetime stats for a player
// ==========================================================================

import { h } from '../../js/utils/dom.js';
import { Card } from '../ui/Card.js';
import { StatPill } from '../ui/StatPill.js';
import { formatAccuracy } from '../../js/utils/format.js';

/**
 * PlayerStatsCard({ stats, title })
 * stats: normalized stats object (or null)
 */
export function PlayerStatsCard({ stats, title = 'Your Stats' } = {}) {
  const s = stats || {};
  const gamesPlayed = s.games_played ?? 0;
  const wins = s.wins ?? 0;
  const losses = s.losses ?? 0;
  const shots = s.total_shots ?? 0;
  const hits = s.total_hits ?? 0;
  const accuracy = formatAccuracy(s.accuracy);

  return Card({
    title,
    children: h('div', { class: 'stats-row', style: { marginTop: 'var(--sp-3)' } },
      StatPill({ label: 'Games', value: gamesPlayed }),
      StatPill({ label: 'Wins', value: wins }),
      StatPill({ label: 'Losses', value: losses }),
      StatPill({ label: 'Shots', value: shots }),
      StatPill({ label: 'Hits', value: hits }),
      StatPill({ label: 'Accuracy', value: accuracy, small: true }),
    ),
  });
}
