// How the dashboard tells its part of the story: Kite's lines for each chapter, the power
// meter, the coaching bubbles, which matches are new since the last visit and the ATS change
// since the last resume version. Pure functions of the `GET /recommendations/dashboard` body
// (and of what this browser remembers), so tests/dashboard-story.test.js runs them under Node.

import { asPercent, canMatchJd, canUnlock, isCommunityEdition, isLocked } from './dashboard-rules.js';

/** A score at or above this share of the maximum makes Kite loop the loop. */
export const STRONG_SHARE = 0.8;

/** How many of the ten power-meter segments light up. */
export function meterSegments(score, maxScore) {
  if (!(maxScore > 0)) {
    return 0;
  }
  return Math.max(0, Math.min(10, Math.round((score / maxScore) * 10)));
}

/** Whether an ATS score is strong enough to celebrate. */
export function isStrongScore(atsScore) {
  return atsScore.max_score > 0 && atsScore.score / atsScore.max_score >= STRONG_SHARE;
}

/** "78" rather than "78.0"; scores arrive as doubles. */
export function formatScore(value) {
  return String(Math.round(value * 10) / 10);
}

/** The coaching text as speech bubbles: one per paragraph, or per line if it has no blank lines. */
export function explanationBubbles(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return [];
  }
  const separator = /\n\s*\n/.test(trimmed) ? /\n\s*\n/ : /\n/;
  return trimmed
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Kite's line on The Omens: the first failed check is the first thing to fix. */
export function omensLine(dashboard) {
  const failed = dashboard.atsScore.checks.filter((check) => !check.passed);
  if (failed.length === 0) {
    return 'Every check passed. The road ahead is clear, traveller.';
  }
  const more = failed.length === 1 ? '' : ` Then ${failed.length - 1} more.`;
  return `Here's what your map says. Fix this first: ${failed[0].detail}.${more}`;
}

/** Kite's line on Paths Ahead. */
export function pathsLine(dashboard) {
  if (isLocked(dashboard)) {
    if (canUnlock(dashboard)) {
      return 'This road is locked, but you hold the key. Re-analyse to open it.';
    }
    return isCommunityEdition(dashboard)
      ? 'These paths need the AI engine, which this edition does not have.'
      : 'This road is locked for now. The panel below says why.';
  }
  const roles = dashboard.recommendations;
  if (roles.length === 0) {
    return 'No paths showed up on this map yet. More skills on your resume will open some.';
  }
  const best = roles[0];
  const count = roles.length === 1 ? 'One road leads' : `${numberWord(roles.length)} roads lead`;
  return `${count} from here. ${best.role.title} fits you best, at ${asPercent(best.matchScore)}%.`;
}

/** Kite's line on The Treasure. */
export function treasureLine(dashboard) {
  return canMatchJd(dashboard)
    ? "Paste the job you want. I'll measure how close you are to it."
    : 'The Treasure is a Premium chapter. It matches your resume to any job you paste.';
}

/** A JD match at or above this score is close enough to celebrate. */
export const CLOSE_MATCH = 0.7;

/** The headline over a JD match result. */
export function jdVerdict(score) {
  if (score >= CLOSE_MATCH) {
    return 'Close to the treasure';
  }
  return score >= 0.4 ? 'On the right road' : 'A long road ahead';
}

/** Kite's line once a JD match comes back. */
export function jdLine(match) {
  const percent = `${asPercent(match.score)}%!`;
  const missing = match.missingSkills.length;
  if (missing === 0) {
    return `${percent} You cover every skill this job names.`;
  }
  const gap = missing === 1 ? 'One skill stands' : `${missing} skills stand`;
  return `${percent} ${gap} between you and this job. They're in yellow.`;
}

/**
 * Splits the recommended roles into the ones this browser has not shown before. `seenRoleIds`
 * is null on the first visit, when nothing counts as new. Returns the new recommendations and
 * the ids to remember from now on.
 */
export function findNewMatches(recommendations, seenRoleIds) {
  const ids = recommendations.map((recommendation) => recommendation.role.id);
  if (!Array.isArray(seenRoleIds)) {
    return { fresh: [], remember: ids };
  }
  const seen = new Set(seenRoleIds);
  const fresh = recommendations.filter((recommendation) => !seen.has(recommendation.role.id));
  // Newest last; keep the memory small.
  const remember = [...seenRoleIds.filter((id) => !ids.includes(id)), ...ids].slice(-200);
  return { fresh, remember };
}

/**
 * The ATS change since the previous resume version, from what this browser remembers
 * (`{ resumeId, score, previous }`). Returns the delta (null when there is nothing to compare)
 * and the record to remember.
 */
export function atsChange(remembered, resumeId, score) {
  if (!remembered || typeof remembered.score !== 'number') {
    return { delta: null, record: { resumeId, score, previous: null } };
  }
  if (remembered.resumeId === resumeId) {
    const previous = typeof remembered.previous === 'number' ? remembered.previous : null;
    return {
      delta: previous === null ? null : score - previous,
      record: { resumeId, score, previous },
    };
  }
  return {
    delta: score - remembered.score,
    record: { resumeId, score, previous: remembered.score },
  };
}

/** "Up 7 since your last map." */
export function describeChange(delta) {
  if (delta === null) {
    return '';
  }
  if (delta === 0) {
    return 'Same as your last map.';
  }
  return `${delta > 0 ? 'Up' : 'Down'} ${formatScore(Math.abs(delta))} since your last map.`;
}

function numberWord(n) {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? String(n);
}
