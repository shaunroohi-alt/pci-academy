import type { AppState } from './types';

const KEY = 'pci-academy/state';
const VERSION = 1;

/**
 * The slice of state that outlives a launch.
 *
 * Deliberately excluded: the practice timer, which should always start fresh
 * at sixty seconds, and entryId, which is momentary UI state.
 */
type Persisted = Pick<
  AppState,
  | 'intents' | 'name' | 'hour' | 'practiceDone' | 'doneAt'
  | 'reflection' | 'saved' | 'notices' | 'entries' | 'todayStyle'
>;

const FIELDS: (keyof Persisted)[] = [
  'intents', 'name', 'hour', 'practiceDone', 'doneAt',
  'reflection', 'saved', 'notices', 'entries', 'todayStyle',
];

/** Storage throws rather than no-ops in some WKWebView and private-mode cases. */
export function load(): Partial<AppState> | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== VERSION || typeof parsed.state !== 'object') return null;

    // Only take keys we recognise, so a stale or hand-edited payload cannot
    // inject unexpected fields into the running state.
    const out: Partial<AppState> = {};
    for (const field of FIELDS) {
      if (parsed.state[field] !== undefined) out[field] = parsed.state[field];
    }
    return out;
  } catch {
    return null;
  }
}

export function save(state: AppState): void {
  try {
    const slice = {} as Persisted;
    for (const field of FIELDS) (slice as Record<string, unknown>)[field] = state[field];
    window.localStorage.setItem(KEY, JSON.stringify({ version: VERSION, state: slice }));
  } catch {
    // A full or unavailable store must never take the app down.
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
