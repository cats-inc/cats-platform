/**
 * When a transcript message was sent, as Cats Bot's notes show it (cats-bot SPEC-003 FR-13): a bubble shows
 * its time to the minute, its tooltip the whole date and time, and each new local day starts with a divider
 * (Today, Yesterday, then the date, with the year when it is another year). These show whatever the verbose
 * messages and live progress details switches say.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
}

function isChinese(locale: string): boolean {
  return locale.startsWith('zh');
}

/** The time in a bubble: hours and minutes, "上午7:00" or "7:00 AM". */
export function messageTime(at: Date, locale: string): string {
  return formatter(locale, { hour: 'numeric', minute: '2-digit' }).format(at);
}

/**
 * The time's tooltip: the whole date and time, to the second. Spelled out field by field, so Chinese says "上午"
 * like the bubble; its `timeStyle` would say "清晨" or "凌晨" instead.
 */
export function messageTimestamp(at: Date, locale: string): string {
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
  if (isChinese(locale)) {
    const date = formatter(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(at);
    return `${date} ${formatter(locale, { weekday: 'long' }).format(at)} ${formatter(locale, time).format(at)}`;
  }
  return formatter(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', ...time }).format(at);
}

/** A message's time, or null when it is missing or unreadable, so one bad row cannot break the transcript. */
export function readMessageTime(at: string | null | undefined): Date | null {
  if (!at) return null;
  const time = new Date(at);
  return Number.isNaN(time.getTime()) ? null : time;
}

/** The local calendar day a message belongs to. */
export function dayKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}

/**
 * The keys of the items that start a new local day, in the order shown. Only the items passed count, so a line
 * the verbose switch hides starts no day; an item without a time neither starts nor ends one, and an item
 * earlier than one before it starts none.
 */
export function dayStartKeys<T>(items: readonly T[], timeOf: (item: T) => Date | null, keyOf: (item: T) => string): Set<string> {
  const starts = new Set<string>();
  // The latest day reached so far. Items keep their transcript order, and a reply shows when it was sealed, so a
  // line written while it ran can sit after it with an earlier time: going back a day starts nothing.
  let reached = -1;
  for (const item of items) {
    const at = timeOf(item);
    if (!at) continue;
    const day = at.getFullYear() * 10000 + (at.getMonth() + 1) * 100 + at.getDate();
    if (day > reached) {
      starts.add(keyOf(item));
      reached = day;
    }
  }
  return starts;
}

/** The divider's label for the day of `at`, seen on the day of `now`. */
export function dayLabel(at: Date, now: Date, locale: string, words: { today: string; yesterday: string }): string {
  if (dayKey(at) === dayKey(now)) return words.today;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(at) === dayKey(yesterday)) return words.yesterday;
  const date: Intl.DateTimeFormatOptions = at.getFullYear() === now.getFullYear()
    ? { month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'long', day: 'numeric' };
  // Chinese runs the weekday into the date ("11月12日星期四"); a space reads better, as chat apps write it.
  if (isChinese(locale)) return `${formatter(locale, date).format(at)} ${formatter(locale, { weekday: 'long' }).format(at)}`;
  return formatter(locale, { ...date, weekday: 'long' }).format(at);
}

// ---- The day clock: Today and Yesterday change at local midnight. Only the dividers listen to it, so a
// conversation left open overnight relabels its dividers and nothing else in the transcript redraws.

let today = dayKey(new Date());
const dayListeners = new Set<() => void>();
let midnight: ReturnType<typeof setTimeout> | null = null;

/** Milliseconds from `now` to just after the next local midnight. */
export function msUntilNextDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1).getTime() - now.getTime();
}

function checkDay(): void {
  const next = dayKey(new Date());
  if (next === today) return;
  today = next;
  for (const listener of dayListeners) listener();
}

function armMidnight(): void {
  midnight = setTimeout(() => {
    checkDay();
    armMidnight();
  }, msUntilNextDay(new Date()));
}

/** Waking from sleep can run a timer late: the day is checked again when the window is focused or shown. */
function onVisible(): void {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') checkDay();
}

/** `useSyncExternalStore` subscription for the current local day; one timer for the whole window. */
export function subscribeDay(listener: () => void): () => void {
  dayListeners.add(listener);
  if (dayListeners.size === 1) {
    // The clock was idle: take today's day without telling anyone; only a change seen while listening is news.
    today = dayKey(new Date());
    armMidnight();
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    dayListeners.delete(listener);
    if (dayListeners.size > 0) return;
    if (midnight) clearTimeout(midnight);
    midnight = null;
    if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}

/** The current local day, as the day clock last saw it. */
export function currentDayKey(): string {
  return today;
}
