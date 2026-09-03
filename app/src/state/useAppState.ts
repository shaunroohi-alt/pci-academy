import { useEffect, useRef, useState } from 'react';
import type { AppState, JournalEntry, PlanId, Screen, TodayStyle } from './types';
import { CHAPTER_DEFS, DAY_NO, HOURS, INITIAL_ENTRIES, INITIAL_INTENTS, INITIAL_NOTICES, NOTICE_DEFS, PRACTICE_LINES, PRICES } from './data';

const CURRENCY_SYMBOL = '$';

function initialState(): AppState {
  return {
    screen: 'welcome',
    entryId: null,
    intents: { ...INITIAL_INTENTS },
    name: '',
    hour: '07:00',
    practiceDone: false,
    doneAt: '',
    reflection: '',
    saved: false,
    timer: 60,
    timerState: 'idle',
    notices: { ...INITIAL_NOTICES },
    plan: 'annual',
    member: false,
    cardName: '',
    cardNo: '',
    expiry: '',
    cvc: '',
    payError: false,
    entries: INITIAL_ENTRIES,
    todayStyle: 'classic',
  };
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
  const finishPractice = () => {
    clearTimer();
    const d = new Date();
    const doneAt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    patch({ practiceDone: true, doneAt, screen: 'home', timerState: 'idle', timer: 60 });
  };

  const acc = 'var(--color-accent)';
  const div = 'var(--color-divider)';

  const name = s.name.trim() || 'Eleanor';

  const intents = Object.keys(s.intents).map((k) => {
    const on = s.intents[k];
    return {
      key: k, label: k, weight: on ? 600 : 400, color: on ? acc : 'var(--color-text)',
      ring: on ? acc : div, fill: on ? acc : 'transparent', shadow: on ? 'inset 0 0 0 4px var(--color-bg)' : 'none',
      toggle: () => patch((st) => ({ intents: { ...st.intents, [k]: !st.intents[k] } })),
    };
  });
  const chosen = Object.keys(s.intents).filter((k) => s.intents[k]);

  const hours = HOURS.map((h) => ({
    label: h, color: s.hour === h ? acc : 'var(--color-text)',
    shadow: s.hour === h ? `inset 0 0 0 1px ${acc}` : 'none',
    pick: () => patch({ hour: h }),
  }));

  const chapterDone = 8 + (s.practiceDone ? 1 : 0);
  const chapterDays = Array.from({ length: 14 }, (_, i) => ({ color: i < chapterDone ? acc : 'var(--color-neutral-300)' }));

  const plans = ([
    { id: 'monthly' as PlanId, name: 'Monthly', note: 'Billed each month', price: `${CURRENCY_SYMBOL}${PRICES.monthly}` },
    { id: 'annual' as PlanId, name: 'Annual', note: `Two months free · ${CURRENCY_SYMBOL}${(PRICES.annual / 12).toFixed(2)} a month`, price: `${CURRENCY_SYMBOL}${PRICES.annual}` },
  ]).map((p) => {
    const on = s.plan === p.id;
    return {
      ...p, border: on ? acc : div, fill: on ? acc : 'transparent',
      dot: on ? 'inset 0 0 0 3px var(--color-bg)' : 'none',
      shadow: on ? `inset 0 0 0 1px ${acc}` : 'none',
      pick: () => patch({ plan: p.id }),
    };
  });
  const planLabel = s.member ? (s.plan === 'annual' ? 'Annual member' : 'Monthly member') : 'Trial · 5 days left';

  const base: JournalEntry[] = s.saved && s.reflection.trim()
    ? [{ id: DAY_NO, date: '2 Sept', day: DAY_NO, practice: 'The unhurried minute', chapter: 'Chapter II · Attention', text: s.reflection.trim() }, ...s.entries]
    : s.entries;
  const entries = base.map((e) => ({ ...e, hasCoach: !!e.coach, open: () => patch({ entryId: e.id, screen: 'entry' }) }));
  const groups: { label: string; items: typeof entries }[] = [];
  entries.forEach((e) => {
    let g = groups.find((x) => x.label === e.chapter);
    if (!g) { g = { label: e.chapter, items: [] }; groups.push(g); }
    g.items.push(e);
  });
  const entry = entries.find((e) => e.id === s.entryId) || entries[0];

  const chapters = CHAPTER_DEFS.map((c) => {
    const done = c.num === 'II' ? chapterDone : c.done;
    return {
      ...c, done,
      pct: `${Math.round((done / 14) * 100)}%`,
      status: done === 14 ? 'Complete' : done ? `${done} of 14` : c.opens,
      opacity: done ? 1 : 0.55,
      numColor: done === 14 ? 'var(--color-neutral-400)' : done ? acc : 'var(--color-neutral-400)',
    };
  });

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

  const mm = String(Math.floor(s.timer / 60));
  const ss = String(s.timer % 60).padStart(2, '0');
  const ts = s.timerState;
  const practiceLine = PRACTICE_LINES[ts];

  const tab = (on: boolean) => (on ? acc : 'var(--color-neutral-600)');

  const derived = {
    name, initial: name[0].toUpperCase(), dayNo: DAY_NO,
    intents, intentCount: chosen.length, noIntent: chosen.length === 0, chosenIntents: chosen,
    hours,
    chapterDone, chapterDays,
    streakLine: s.practiceDone ? 'Practised 12 days without a gap. Chapter III opens after day 43.' : 'Practised 11 days without a gap. Today keeps the thread.',
    entries, recentEntries: entries.slice(0, 3), entryCount: entries.length, journalGroups: groups, entry, chapters,
    plans, dueToday: `${CURRENCY_SYMBOL}${PRICES[s.plan]}`,
    planLabel, planLabelLower: s.plan, notMember: !s.member,
    memberHeadline: s.member ? 'Full programme' : 'Your trial ends Sunday',
    memberBody: s.member
      ? 'All seven chapters, weekly coach notes and your complete journal.'
      : 'Keep the practice going: all seven chapters and weekly notes from your coach.',
    notices,
    timerText: `${mm}:${ss}`, timerColor: ts === 'ended' ? acc : 'var(--color-text)', practiceLine,
    timerIdle: ts === 'idle', timerRunning: ts === 'running', timerPaused: ts === 'paused', timerEnded: ts === 'ended', timerNotEnded: ts !== 'ended',
    tabHomeColor: tab(s.screen === 'home'), tabPathColor: tab(s.screen === 'path'), tabJournalColor: tab(s.screen === 'journal'), tabProfileColor: tab(s.screen === 'profile'),
    showTabs: (['home', 'path', 'journal', 'profile'] as Screen[]).includes(s.screen),
    cardBorder: s.payError ? 'var(--color-accent-700)' : div,
    cardNameValue: s.cardName || name,
  };

  const actions = {
    go,
    toWelcome: () => go('welcome'), toIntent: () => go('intent'), toName: () => go('name'),
    toHome: () => go('home'), toPath: () => go('path'), toJournal: () => go('journal'),
    toNote: () => go('note'), toProfile: () => go('profile'), toSettings: () => go('settings'),
    toCheckout: () => patch({ screen: 'checkout', payError: false }),
    toPractice: () => patch({ screen: 'practice', timer: 60, timerState: 'idle' }),
    leavePractice: () => { clearTimer(); patch({ screen: 'home', timerState: 'idle', timer: 60 }); },
    startTimer, pauseTimer, finishPractice,
    openEntry: (id: number) => patch({ entryId: id, screen: 'entry' }),
    setName: (v: string) => patch({ name: v }),
    setReflection: (v: string) => patch({ reflection: v, saved: false }),
    saveReflection: () => patch({ saved: true }),
    setCardName: (v: string) => patch({ cardName: v }),
    setCardNo: (v: string) => patch({
      cardNo: v.replace(/[^\d]/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '),
      payError: false,
    }),
    setExpiry: (v: string) => patch({ expiry: v }),
    setCvc: (v: string) => patch({ cvc: v }),
    confirmPay: () => {
      const ok = s.cardNo.replace(/\s/g, '').length === 16 && s.expiry.trim() && s.cvc.trim().length >= 3;
      if (!ok) { patch({ payError: true }); return; }
      patch({ member: true, screen: 'done', payError: false });
    },
    setTodayStyle: (style: TodayStyle) => patch({ todayStyle: style }),
  };

  return { s, derived, actions };
}

export type UseAppState = ReturnType<typeof useAppState>;
