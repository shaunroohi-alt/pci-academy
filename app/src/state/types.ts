export type Screen =
  | 'welcome' | 'intent' | 'name'
  | 'home' | 'practice' | 'path' | 'journal' | 'entry' | 'note'
  | 'profile' | 'settings' | 'checkout' | 'done';

export type TimerState = 'idle' | 'running' | 'paused' | 'ended';

export type TodayStyle = 'classic' | 'ledger' | 'colophon';

export type PlanId = 'monthly' | 'annual';

export interface JournalEntry {
  id: number;
  date: string;
  day: number;
  practice: string;
  chapter: string;
  text: string;
  coach?: string;
}

export interface Notices {
  practice: boolean;
  coach: boolean;
  evening: boolean;
}

export interface AppState {
  screen: Screen;
  entryId: number | null;
  intents: Record<string, boolean>;
  name: string;
  hour: string;
  practiceDone: boolean;
  doneAt: string;
  reflection: string;
  saved: boolean;
  timer: number;
  timerState: TimerState;
  notices: Notices;
  plan: PlanId;
  member: boolean;
  cardName: string;
  cardNo: string;
  expiry: string;
  cvc: string;
  payError: boolean;
  entries: JournalEntry[];
  todayStyle: TodayStyle;
}
