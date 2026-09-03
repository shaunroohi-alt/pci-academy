export type Screen =
  | 'welcome' | 'intent' | 'name'
  | 'home' | 'practice' | 'path' | 'journal' | 'entry' | 'note'
  | 'profile' | 'settings';

export type TimerState = 'idle' | 'running' | 'paused' | 'ended';

export type TodayStyle = 'classic' | 'ledger' | 'colophon';

export interface JournalEntry {
  /** 1-based programme day the entry was written on; also its identity. */
  day: number;
  /** yyyy-mm-dd the entry was written. */
  date: string;
  /** Title of that day's practice, kept so the entry reads on its own later. */
  practice: string;
  chapter: string;
  text: string;
}

export interface Notices {
  practice: boolean;
  coach: boolean;
  evening: boolean;
}

export interface AppState {
  screen: Screen;
  /** Programme day of the entry being read, null when none is open. */
  entryDay: number | null;
  intents: Record<string, boolean>;
  name: string;
  hour: string;
  /** yyyy-mm-dd the user finished onboarding; null until they do. */
  enrolledAt: string | null;
  /** Programme day -> local time the practice was marked complete. */
  completions: Record<number, string>;
  /** In-progress reflections keyed by programme day, so a day rollover
      naturally retires yesterday's draft without special handling. */
  drafts: Record<number, string>;
  timer: number;
  timerState: TimerState;
  notices: Notices;
  entries: JournalEntry[];
  todayStyle: TodayStyle;
}
