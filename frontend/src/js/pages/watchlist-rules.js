// Pure helpers for the watchlist page, kept apart from the DOM so they can be unit-tested.

/** Whether we can read a company's jobs yet, as a badge `{ label, tone }`. */
export function companyStatusBadge(status) {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Jobs tracked', tone: 'green' };
    case 'UNSUPPORTED':
      return { label: "Can't read its jobs yet", tone: 'amber' };
    default:
      return { label: 'Checking for jobs', tone: '' };
  }
}

/** "12 open jobs", "1 open job", or null when there are none to show. */
export function openJobsLabel(count) {
  if (!count) {
    return null;
  }
  return `${count} open job${count === 1 ? '' : 's'}`;
}

/** "3 new" for the New badge, or null when nothing is new. */
export function newJobsLabel(count) {
  return count ? `${count} new` : null;
}

/** Whether a search for these words is worth sending (two or more characters). */
export function isSearchable(query) {
  return (query ?? '').trim().length >= 2;
}

/** "3 of 25 companies watched", or null while the cap is unknown. */
export function capLabel(watching, maxCompanies) {
  if (!maxCompanies) {
    return null;
  }
  return `${watching} of ${maxCompanies} companies watched`;
}

/** Whether the watchlist is at its cap (never, while the cap is unknown). */
export function isFull(watching, maxCompanies) {
  return Boolean(maxCompanies) && watching >= maxCompanies;
}
