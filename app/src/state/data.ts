import type { JournalEntry, Notices } from './types';

export const INITIAL_INTENTS: Record<string, boolean> = {
  'Steadier attention': true,
  'Creative confidence': false,
  'A calmer working day': false,
  'Clearer decisions': false,
  'Better conversations': false,
  'Rest that restores': false,
};

export const HOURS = ['06:30', '07:00', '08:30'];

export const INITIAL_NOTICES: Notices = { practice: true, coach: true, evening: false };

export const INITIAL_ENTRIES: JournalEntry[] = [
  { id: 37, date: '1 Sept', day: 37, practice: 'Three breaths before speech', chapter: 'Chapter II · Attention', text: 'I interrupted less; the pause felt longer to me than to anyone else.', coach: 'That gap is where the other person finally arrives. Keep it.' },
  { id: 36, date: '31 Aug', day: 36, practice: 'The list of small debts', chapter: 'Chapter II · Attention', text: 'Three unanswered letters. I wrote one.' },
  { id: 35, date: '30 Aug', day: 35, practice: 'The walk without the phone', chapter: 'Chapter II · Attention', text: 'The walk without the phone was shorter than I feared.', coach: 'Fear of boredom usually overestimates the boredom.' },
  { id: 34, date: '29 Aug', day: 34, practice: 'Naming the room', chapter: 'Chapter II · Attention', text: 'Eleven objects I had never named. The lamp is called Ada now.' },
  { id: 14, date: '9 Aug', day: 14, practice: 'The letter to September', chapter: 'Chapter I · Arrival', text: 'I asked September for one quiet week. It replied with two.' },
  { id: 3, date: '29 Jul', day: 3, practice: 'Where the day leaks', chapter: 'Chapter I · Arrival', text: 'Mostly through the door I leave open for other people.' },
];

export interface ChapterDef {
  num: string;
  title: string;
  blurb: string;
  done: number;
  opens?: string;
}

export const CHAPTER_DEFS: ChapterDef[] = [
  { num: 'I', title: 'Arrival', blurb: 'Where the day goes, and what you would like back.', done: 14 },
  { num: 'II', title: 'Attention', blurb: 'Looking until you see. The unhurried minute, the unnamed room.', done: 0 },
  { num: 'III', title: 'Expression', blurb: 'Saying the true thing plainly, on paper first.', done: 0, opens: 'Opens after day 43' },
  { num: 'IV', title: 'Judgement', blurb: 'Deciding with less noise and fewer witnesses.', done: 0, opens: 'Opens after day 57' },
  { num: 'V', title: 'Conversation', blurb: 'The pause, the question, the second question.', done: 0, opens: 'Opens after day 71' },
  { num: 'VI', title: 'Rest', blurb: 'Stopping as a skill rather than a collapse.', done: 0, opens: 'Opens after day 85' },
  { num: 'VII', title: 'Integration', blurb: 'The practice without the app.', done: 0, opens: 'Opens after day 99' },
];

export const DAY_NO = 38;

export const NOTICE_DEFS: [keyof Notices, string, (hour: string) => string][] = [
  ['practice', 'Daily practice', (hour) => `At ${hour}, every day`],
  ['coach', "Coach's weekly note", () => 'Mondays'],
  ['evening', 'Evening reflection nudge', () => 'If nothing written by 21:00'],
];

export const TODAY_PRACTICE = {
  title: 'The unhurried minute',
  minutes: 12,
  blurb: 'Before the first task of the day, sit with one object on your desk for sixty seconds. Notice what you had stopped seeing.',
  chapter: 'Chapter II · Attention',
};

export const PRACTICE_LINES = {
  idle: 'Choose one object on your desk. Not an interesting one. Press start and keep your eyes on it until the minute ends.',
  running: 'Stay with it. When your attention leaves, notice where it went, and bring it back without comment.',
  paused: 'Paused. Return when the room allows.',
  ended: 'The minute is over. What did the object turn out to be? Write one sentence on the Today page.',
};
