import type { Notices } from './types';

export const INITIAL_INTENTS: Record<string, boolean> = {
  'Steadier attention': false,
  'Creative confidence': false,
  'A calmer working day': false,
  'Clearer decisions': false,
  'Better conversations': false,
  'Rest that restores': false,
};

export const HOURS = ['06:30', '07:00', '08:30'];

export const INITIAL_NOTICES: Notices = { practice: true, coach: true, evening: false };

export const NOTICE_DEFS: [keyof Notices, string, (hour: string) => string][] = [
  ['practice', 'Daily practice', (hour) => `At ${hour}, every day`],
  ['coach', 'Letter for each chapter', () => 'When a chapter opens'],
  ['evening', 'Evening reflection nudge', () => 'If nothing written by 21:00'],
];

export const PRACTICE_LINES = {
  idle: 'Choose one object on your desk. Not an interesting one. Press start and keep your eyes on it until the minute ends.',
  running: 'Stay with it. When your attention leaves, notice where it went, and bring it back without comment.',
  paused: 'Paused. Return when the room allows.',
  ended: 'The minute is over. Write one sentence about it on the Today page.',
};
