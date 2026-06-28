// Shared Wordle constants and puzzle-number / date math.

// The official Discord Wordle Activity application id. Its messages carry the
// player in interactionMetadata.user, a result-grid image, and a once-a-day
// summary listing everyone's score for the previous day.
export const OFFICIAL_WORDLE_APP_ID = '1211781489931452447';

// Anchor observed from real data: puzzle #1835 was played on 2026-06-28.
const ANCHOR_NUMBER = 1835;
const ANCHOR_ISO = '2026-06-28';
const DAY = 86_400_000;
const anchorMs = Date.parse(`${ANCHOR_ISO}T00:00:00Z`);

// The calendar date (YYYY-MM-DD) of an instant in a given IANA timezone. Wordle
// rolls over at local midnight, so the timezone matters for day attribution.
export function localDateISO(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function shiftISO(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function isoToNumber(iso) {
  return ANCHOR_NUMBER + Math.round((Date.parse(`${iso}T00:00:00Z`) - anchorMs) / DAY);
}

export function numberToIso(n) {
  return new Date(anchorMs + (n - ANCHOR_NUMBER) * DAY).toISOString().slice(0, 10);
}

// Puzzle number for a message timestamp, interpreted in the group's timezone.
// dayOffset -1 maps a daily summary ("yesterday's results") to its puzzle.
export function numberForTimestamp(date, timeZone, dayOffset = 0) {
  return isoToNumber(shiftISO(localDateISO(date, timeZone), dayOffset));
}

// Inclusive [from, to] ISO date bounds for a leaderboard period, in timezone.
export function periodRange(period, timeZone = 'UTC') {
  const todayIso = localDateISO(new Date(), timeZone);
  if (period === 'week') {
    const dow = (new Date(`${todayIso}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
    return [shiftISO(todayIso, -dow), shiftISO(todayIso, 6 - dow)];
  }
  if (period === 'month') {
    const first = `${todayIso.slice(0, 7)}-01`;
    const lastDay = new Date(Date.UTC(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)), 0)).getUTCDate();
    return [first, `${todayIso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`];
  }
  return ['0000-01-01', '9999-12-31'];
}
