import { useEffect, useRef, useState } from 'react';
import type { AppState, JournalEntry, Screen, TodayStyle } from './types';
import { HOURS, INITIAL_INTENTS, INITIAL_NOTICES, NOTICE_DEFS, PRACTICE_LINES } from './data';
import {
  CHAPTERS, CHAPTER_LENGTH, LETTERS, PROGRAMME_DAYS,
  chapterIndexForDay, chapterLabel, chapterStartDay, practiceForDay,
} from './programme';
import { clockTime, daysBetween, formatLong, formatMonthYear, formatShort, toISODate, weekday } from './dates';
import { clear, load, save } from './persistence';

function baseState(): AppState {
  return {
    screen: 'welcome',
    entryDay: null,
    intents: { ...INITIAL_INTENTS },
    name: '',
    hour: '07:00',
    enrolledAt: null,
    completions: {},
    drafts: {},
    timer: 60,
    timerState: 'idle',
    notices: { ...INITIAL_NOTICES },
    entries: [],
    todayStyle: 'classic',
  };
}

function initialState(): AppState {
  const stored = load();
  // Enrolment is what marks someone as having started. Anyone who has, opens
  // on Today rather than being walked through the welcome screen again.
  if (stored?.enrolledAt) return { ...baseState(), ...stored, screen: 'home' };
  return stored ? { ...baseState(), ...stored } : baseState();
}

export function useAppState() {
  const [s, setState] = useState<AppState>(initialState);
  const patch = (p: Partial<AppState> | ((st: AppState) => Partial<AppState>)) =>
    setState((st) => ({ ...st, ...(typeof p === 'function' ? p(st) : p) }));

  const intervalRef = useRef<number | undefined>(undefined);
  const clearTimer = () => {
    if (intervalRef.current !== undefined) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  };
  useEffect(() => clearTimer, []);
  useEffect(() => { save(s); }, [s]);

  const go = (screen: Screen) => patch({ screen });

  const startTimer = () => {
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      setState((st) => {
        if (st.timer <= 1) {
          clearTimer();
          return { ...st, timer: 0, timerState: 'ended' };
        }
        return { ...st, timer: st.timer - 1 };
      });
    }, 1000);
    patch({ timerState: 'running' });
  };
  const pauseTimer = () => { clearTimer(); patch({ timerState: 'paused' }); };

  const acc = 'var(--color-accent)';
  const div = 'var(--color-divider)';

  // ── where the user is in the programme ────────────────────────────────
  const today = toISODate();
  // Before enrolment the app previews day one; the count is clamped so a long
  // absence lands on the final day rather than running past the programme.
  const dayNo = s.enrolledAt
    ? Math.min(Math.max(daysBetween(s.enrolledAt, today) + 1, 1), PROGRAMME_DAYS)
    : 1;
  const practice = practiceForDay(dayNo);
  const chapterIndex = chapterIndexForDay(dayNo);
  const chapter = CHAPTERS[chapterIndex];
  const chapterName = chapterLabel(chapterIndex);
  const chapterDayNo = dayNo - chapterStartDay(chapterIndex) + 1;

  const completedDays = Object.keys(s.completions).map(Number).sort((a, b) => a - b);
  const practiceDone = s.completions[dayNo] !== undefined;
  const doneAt = s.completions[dayNo] ?? '';

  const chapterFirstDay = chapterStartDay(chapterIndex);
  const chapterDone = completedDays.filter(
    (d) => d >= chapterFirstDay && d < chapterFirstDay + CHAPTER_LENGTH,
  ).length;
  const chapterDays = Array.from({ length: CHAPTER_LENGTH }, (_, i) => ({
    color: s.completions[chapterFirstDay + i] !== undefined ? acc : 'var(--color-neutral-300)',
  }));

  // Consecutive days ending today, or ending yesterday if today is not done yet.
  let streak = 0;
  for (let d = practiceDone ? dayNo : dayNo - 1; d >= 1; d--) {
    if (s.completions[d] === undefined) break;
    streak++;
  }
  const nextChapter = CHAPTERS[chapterIndex + 1];
  const streakLine = [
    streak === 0
      ? 'Today begins the thread.'
      : `Practised ${streak} ${streak === 1 ? 'day' : 'days'} without a gap.`,
    nextChapter ? `Chapter ${nextChapter.num} opens on day ${chapterStartDay(chapterIndex + 1)}.` : '',
  ].filter(Boolean).join(' ');

  // ── the person ────────────────────────────────────────────────────────
  const name = s.name.trim();
  const intents = Object.keys(s.intents).map((k) => {
    const on = s.intents[k];
    return {
      key: k, label: k, weight: on ? 600 : 400, color: on ? acc : 'var(--color-text)',
      ring: on ? acc : div, fill: on ? acc : 'transparent',
      shadow: on ? 'inset 0 0 0 4px var(--color-bg)' : 'none',
      toggle: () => patch((st) => ({ intents: { ...st.intents, [k]: !st.intents[k] } })),
    };
  });
  const chosen = Object.keys(s.intents).filter((k) => s.intents[k]);

  const hours = HOURS.map((h) => ({
    label: h, color: s.hour === h ? acc : 'var(--color-text)',
    shadow: s.hour === h ? `inset 0 0 0 1px ${acc}` : 'none',
    pick: () => patch({ hour: h }),
  }));

  const notices = NOTICE_DEFS.map(([k, label, sub]) => {
    const on = s.notices[k];
    return {
      key: k, label, sub: sub(s.hour),
      ring: on ? acc : div,
      bg: on ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'transparent',
      knob: on ? '18px' : '2px', knobBg: on ? acc : 'var(--color-neutral-400)',
      toggle: () => patch((st) => ({ notices: { ...st.notices, [k]: !st.notices[k] } })),
    };
  });

  // ── the journal ───────────────────────────────────────────────────────
  const entries = [...s.entries]
    .sort((a, b) => b.day - a.day)
    .map((e) => ({
      ...e,
      dateLabel: formatShort(e.date),
      open: () => patch({ entryDay: e.day, screen: 'entry' }),
    }));
  const groups: { label: string; items: typeof entries }[] = [];
  entries.forEach((e) => {
    let g = groups.find((x) => x.label === e.chapter);
    if (!g) { g = { label: e.chapter, items: [] }; groups.push(g); }
    g.items.push(e);
  });
  const entry = entries.find((e) => e.day === s.entryDay) ?? null;

  const draft = s.drafts[dayNo] ?? '';
  const savedToday = s.entries.find((e) => e.day === dayNo);
  const isSaved = !!savedToday && savedToday.text === draft.trim() && draft.trim() !== '';

  // ── the path ──────────────────────────────────────────────────────────
  const chapters = CHAPTERS.map((c, i) => {
    const start = chapterStartDay(i);
    const done = completedDays.filter((d) => d >= start && d < start + CHAPTER_LENGTH).length;
    const open = dayNo >= start;
    return {
      ...c, done, open,
      pct: `${Math.round((done / CHAPTER_LENGTH) * 100)}%`,
      status: done === CHAPTER_LENGTH ? 'Complete'
        : open ? `${done} of ${CHAPTER_LENGTH}`
        : `Opens on day ${start}`,
      opacity: open ? 1 : 0.55,
      numColor: done === CHAPTER_LENGTH ? 'var(--color-neutral-400)' : open ? acc : 'var(--color-neutral-400)',
    };
  });

  const letter = LETTERS[chapterIndex];

  // The Ledger treatment shows the days either side of today as a register.
  const ledgerRows = [-2, -1, 0, 1, 2]
    .map((offset) => dayNo + offset)
    .filter((d) => d >= 1 && d <= PROGRAMME_DAYS)
    .map((d) => ({
      day: d,
      isToday: d === dayNo,
      future: d > dayNo,
      done: s.completions[d] !== undefined,
      title: d > dayNo ? '—' : practiceForDay(d).title,
      instruction: practiceForDay(d).instruction,
      minutes: d > dayNo ? '·' : String(practiceForDay(d).minutes),
    }));

  const mm = String(Math.floor(s.timer / 60));
  const ss = String(s.timer % 60).padStart(2, '0');
  const ts = s.timerState;
  const tab = (on: boolean) => (on ? acc : 'var(--color-neutral-600)');

  const derived = {
    name: name || 'friend',
    initial: (name || '?')[0].toUpperCase(),
    hasName: name !== '',
    joinedLabel: s.enrolledAt ? `Since ${formatMonthYear(s.enrolledAt)}` : 'Not yet begun',

    dayNo, todayISO: today,
    dayLabel: `${weekday(today)} · ${formatShort(today)}`,
    weekdayLabel: weekday(today),
    longDateLabel: formatLong(today),
    weekNo: Math.ceil(dayNo / 7),
    ledgerRows,
    practiceTitle: practice.title,
    practiceInstruction: practice.instruction,
    practiceMinutes: practice.minutes,
    chapterNum: chapter.num, chapterName, chapterDayNo,
    practiceDone, doneAt,
    daysPractised: completedDays.length,

    intents, intentCount: chosen.length, noIntent: chosen.length === 0, chosenIntents: chosen,
    hours, notices,

    chapterDone, chapterDays, streakLine, chapters,
    letterTitle: letter.title, letterParagraphs: letter.paragraphs,

    entries, recentEntries: entries.slice(0, 3), entryCount: entries.length,
    journalGroups: groups, entry, hasEntries: entries.length > 0,

    draft, draftEmpty: draft.trim() === '', isSaved,
    saveLabel: isSaved ? 'Kept in your journal' : 'Keep',

    timerText: `${mm}:${ss}`, timerColor: ts === 'ended' ? acc : 'var(--color-text)',
    practiceLine: PRACTICE_LINES[ts],
    timerIdle: ts === 'idle', timerRunning: ts === 'running',
    timerPaused: ts === 'paused', timerEnded: ts === 'ended', timerNotEnded: ts !== 'ended',

    tabHomeColor: tab(s.screen === 'home'), tabPathColor: tab(s.screen === 'path'),
    tabJournalColor: tab(s.screen === 'journal'), tabProfileColor: tab(s.screen === 'profile'),
    showTabs: (['home', 'path', 'journal', 'profile'] as Screen[]).includes(s.screen),
  };

  const actions = {
    go,
    toWelcome: () => go('welcome'), toIntent: () => go('intent'), toName: () => go('name'),
    toHome: () => go('home'), toPath: () => go('path'), toJournal: () => go('journal'),
    toNote: () => go('note'), toProfile: () => go('profile'), toSettings: () => go('settings'),
    toPractice: () => patch({ screen: 'practice', timer: 60, timerState: 'idle' }),
    leavePractice: () => { clearTimer(); patch({ screen: 'home', timerState: 'idle', timer: 60 }); },

    /** Finishing onboarding is what starts the clock on the programme. */
    enrol: () => patch((st) => ({ enrolledAt: st.enrolledAt ?? toISODate(), screen: 'home' })),

    startTimer, pauseTimer,
    finishPractice: () => {
      clearTimer();
      patch((st) => ({
        completions: { ...st.completions, [dayNo]: clockTime() },
        screen: 'home', timerState: 'idle', timer: 60,
      }));
    },

    openEntry: (day: number) => patch({ entryDay: day, screen: 'entry' }),
    setName: (v: string) => patch({ name: v }),
    setDraft: (v: string) => patch((st) => ({ drafts: { ...st.drafts, [dayNo]: v } })),
    saveReflection: () => {
      const text = draft.trim();
      if (!text) return;
      const record: JournalEntry = {
        day: dayNo, date: today, practice: practice.title, chapter: chapterName, text,
      };
      patch((st) => ({
        entries: [...st.entries.filter((e) => e.day !== dayNo), record],
      }));
    },

    setTodayStyle: (style: TodayStyle) => patch({ todayStyle: style }),
    signOut: () => { clearTimer(); clear(); setState(baseState()); },
  };

  return { s, derived, actions };
}

export type UseAppState = ReturnType<typeof useAppState>;
