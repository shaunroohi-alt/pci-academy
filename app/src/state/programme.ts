// The programme: seven chapters of fourteen days, ninety-eight days in all.
//
// PLACEHOLDER CONTENT. The practice and letter copy below was written to give
// the app a complete, coherent programme to run on. It is not the Academy's
// curriculum. Replace it with the real course material before launch; the
// shapes here are what the app depends on, not the words.

export const CHAPTER_LENGTH = 14;
export const PROGRAMME_DAYS = 98;

export interface Practice {
  title: string;
  instruction: string;
  minutes: number;
}

export interface Chapter {
  num: string;
  title: string;
  blurb: string;
}

export const CHAPTERS: Chapter[] = [
  { num: 'I', title: 'Arrival', blurb: 'Where the day goes, and what you would like back.' },
  { num: 'II', title: 'Attention', blurb: 'Looking until you see. The unhurried minute, the unnamed room.' },
  { num: 'III', title: 'Expression', blurb: 'Saying the true thing plainly, on paper first.' },
  { num: 'IV', title: 'Judgement', blurb: 'Deciding with less noise and fewer witnesses.' },
  { num: 'V', title: 'Conversation', blurb: 'The pause, the question, the second question.' },
  { num: 'VI', title: 'Rest', blurb: 'Stopping as a skill rather than a collapse.' },
  { num: 'VII', title: 'Integration', blurb: 'The practice without the app.' },
];

/** One practice per day, in order. Index 0 is day 1. */
export const PRACTICES: Practice[] = [
  // I · Arrival
  { title: 'Where the day leaks', instruction: 'List the three places today lost the most time. Do not judge them yet; only find them.', minutes: 10 },
  { title: 'The first hour', instruction: 'Write what you did in your first waking hour, in order. Notice what you had not chosen.', minutes: 8 },
  { title: 'The letter to the month', instruction: 'Ask this month for one thing. A sentence is enough.', minutes: 8 },
  { title: 'What you carried in', instruction: 'Name the mood you woke with, and where you think it came from. Guessing is allowed.', minutes: 6 },
  { title: 'The unfinished shelf', instruction: 'Write down three things you have started and not finished. Leave them unfinished today.', minutes: 8 },
  { title: 'Two columns', instruction: 'Down one side, what the day asks of you. Down the other, what you would ask of it.', minutes: 12 },
  { title: 'The hour you would keep', instruction: 'If you could protect one hour of the day from everyone, which hour, and for what?', minutes: 8 },
  { title: 'A smaller ambition', instruction: 'Take one large intention and cut it down until it fits inside a single day.', minutes: 10 },
  { title: 'The room you avoid', instruction: 'There is a task you walk past. Sit with it for ten minutes without starting it.', minutes: 10 },
  { title: 'Borrowed opinions', instruction: 'Find one thing you believe because someone else said it. Just find it.', minutes: 10 },
  { title: 'The list of small debts', instruction: 'Write the small obligations you owe other people. Answer exactly one.', minutes: 10 },
  { title: 'What is already enough', instruction: 'Name three things in your life that need no improvement at all.', minutes: 8 },
  { title: 'The honest calendar', instruction: 'Look at tomorrow and remove one thing you agreed to out of habit.', minutes: 10 },
  { title: 'Arrival', instruction: 'Read back your first thirteen sentences. Write one more about what you notice.', minutes: 15 },

  // II · Attention
  { title: 'The unhurried minute', instruction: 'Before the first task of the day, sit with one object on your desk for sixty seconds. Notice what you had stopped seeing.', minutes: 12 },
  { title: 'Naming the room', instruction: 'Name ten objects in the room you have never named. Give one of them a proper name.', minutes: 10 },
  { title: 'The walk without the phone', instruction: 'Twenty minutes outside, nothing in your pockets. Report one thing you would have missed.', minutes: 20 },
  { title: 'One sound at a time', instruction: 'Sit still and separate the sounds around you into a list, quietest last.', minutes: 8 },
  { title: 'The second look', instruction: 'Choose a photograph or painting you know well. Look until you find something new in it.', minutes: 10 },
  { title: 'Eating slowly', instruction: 'Take one meal at half your usual speed. No screen, no reading.', minutes: 15 },
  { title: 'The face across from you', instruction: 'In one conversation today, look at the person rather than at your reply.', minutes: 10 },
  { title: 'Three breaths before speech', instruction: 'Three times today, take three breaths before you answer. Note what changed.', minutes: 8 },
  { title: 'The route you never take', instruction: 'Go somewhere ordinary by an unfamiliar way, and pay attention the whole time.', minutes: 15 },
  { title: 'Weather, exactly', instruction: 'Describe today\'s weather in three sentences without using the word nice or bad.', minutes: 6 },
  { title: 'The dull object', instruction: 'Return to the least interesting thing you own. Sit with it for two minutes.', minutes: 10 },
  { title: 'Hands', instruction: 'Watch your own hands do one familiar task. Notice the parts you never decided.', minutes: 8 },
  { title: 'What you interrupted', instruction: 'Count the times you interrupted today, including yourself.', minutes: 8 },
  { title: 'Seeing', instruction: 'Write the difference between what you looked at this fortnight and what you saw.', minutes: 15 },

  // III · Expression
  { title: 'The plain sentence', instruction: 'Take something you believe and write it without a single qualifier.', minutes: 10 },
  { title: 'Cut by half', instruction: 'Write a paragraph about your week. Then remove half the words and keep the meaning.', minutes: 12 },
  { title: 'The unsent letter', instruction: 'Write to someone you owe a difficult message. Do not send it today.', minutes: 15 },
  { title: 'Say the harder half', instruction: 'Find something you softened this week and write the version you meant.', minutes: 10 },
  { title: 'One page, no adjectives', instruction: 'Describe a place you know using only nouns and verbs.', minutes: 12 },
  { title: 'The thing you keep explaining', instruction: 'Write the explanation you repeat most often, once, properly.', minutes: 12 },
  { title: 'Ask plainly', instruction: 'Ask one person for one thing today, without apologising for asking.', minutes: 8 },
  { title: 'The true compliment', instruction: 'Tell someone something specific and true you have never told them.', minutes: 8 },
  { title: 'Your own words', instruction: 'Take a phrase you borrowed from work or the internet and say it in your own language.', minutes: 10 },
  { title: 'The refusal', instruction: 'Decline something today in one sentence, with no reason attached.', minutes: 8 },
  { title: 'Read it aloud', instruction: 'Read something you wrote out loud. Mark every place your voice hesitated.', minutes: 10 },
  { title: 'The first draft is the notes', instruction: 'Write badly and quickly for ten minutes about anything unresolved.', minutes: 10 },
  { title: 'Send it', instruction: 'Return to the unsent letter. Send it, or write down honestly why you will not.', minutes: 12 },
  { title: 'Expression', instruction: 'What is easier to say now than it was two weeks ago? One sentence.', minutes: 15 },

  // IV · Judgement
  { title: 'The decision you are postponing', instruction: 'Name it. Write the actual question underneath it, which is usually different.', minutes: 12 },
  { title: 'Fewer witnesses', instruction: 'Make one small decision today without consulting anyone.', minutes: 8 },
  { title: 'The cost of waiting', instruction: 'Write what the delay itself is costing. Be specific and unkind about it.', minutes: 10 },
  { title: 'Two good options', instruction: 'When both choices are defensible, write which one you would defend to a stranger.', minutes: 10 },
  { title: 'The reversible and the not', instruction: 'Sort this week\'s decisions into those you could undo and those you could not.', minutes: 10 },
  { title: 'Whose voice', instruction: 'For one hesitation, name whose disapproval you are actually imagining.', minutes: 10 },
  { title: 'The smallest test', instruction: 'Find the cheapest experiment that would tell you something real.', minutes: 12 },
  { title: 'Enough information', instruction: 'Decide what you would need to know to decide, then notice whether you can get it.', minutes: 10 },
  { title: 'Sleep on it, properly', instruction: 'Write the decision tonight and do not revisit it until tomorrow.', minutes: 8 },
  { title: 'The advice you would give', instruction: 'Write the advice you would give a friend in your position, then read it as yours.', minutes: 10 },
  { title: 'What you are protecting', instruction: 'Behind a hard decision is usually something you are trying to keep. Name it.', minutes: 12 },
  { title: 'Decide small', instruction: 'Make three decisions today in under a minute each. Notice the regret, if any.', minutes: 8 },
  { title: 'The one you made', instruction: 'Return to the postponed decision and take one irreversible step, however small.', minutes: 15 },
  { title: 'Judgement', instruction: 'What did deciding, rather than weighing, feel like? One sentence.', minutes: 15 },

  // V · Conversation
  { title: 'The pause', instruction: 'Leave one full second of silence before each reply in one conversation.', minutes: 10 },
  { title: 'The second question', instruction: 'Ask someone a question, then ask a second one about their answer.', minutes: 10 },
  { title: 'Do not solve it', instruction: 'Listen to a problem today without offering a single solution.', minutes: 12 },
  { title: 'The thing unsaid', instruction: 'Notice what you chose not to say in one conversation, and why.', minutes: 10 },
  { title: 'Repeat it back', instruction: 'Say someone\'s point back to them until they agree you have it right.', minutes: 10 },
  { title: 'The uncomfortable minute', instruction: 'Stay in one awkward conversation sixty seconds longer than you want to.', minutes: 8 },
  { title: 'Ask about the beginning', instruction: 'Ask someone how something they are living through actually started.', minutes: 10 },
  { title: 'Disagree well', instruction: 'Disagree with someone today while making their case fairly first.', minutes: 12 },
  { title: 'The person you avoid', instruction: 'Have one short, ordinary exchange with someone you have been avoiding.', minutes: 10 },
  { title: 'Speak last', instruction: 'In one group conversation, be the last person to give an opinion.', minutes: 10 },
  { title: 'The apology without but', instruction: 'If one is owed, make it in one sentence containing no explanation.', minutes: 8 },
  { title: 'What they meant', instruction: 'Reconsider a remark that stung. Write the most generous reading of it.', minutes: 10 },
  { title: 'The long call', instruction: 'Speak to someone you have not spoken to properly in a year.', minutes: 20 },
  { title: 'Conversation', instruction: 'Who did you hear this fortnight that you had been missing? One sentence.', minutes: 15 },

  // VI · Rest
  { title: 'Stopping on purpose', instruction: 'End one task while it is going well, and leave it there.', minutes: 8 },
  { title: 'The empty half hour', instruction: 'Thirty minutes with nothing planned and nothing to consume.', minutes: 30 },
  { title: 'What tiredness is telling you', instruction: 'Write where the tiredness sits, and what it is asking for.', minutes: 10 },
  { title: 'The evening boundary', instruction: 'Choose an hour after which work does not exist tonight. Keep it.', minutes: 8 },
  { title: 'Rest that is not a screen', instruction: 'Take one break today with no screen in it at all.', minutes: 15 },
  { title: 'Doing one thing', instruction: 'Do one ordinary task without doing anything else at the same time.', minutes: 12 },
  { title: 'The unproductive walk', instruction: 'Walk with no destination, no podcast, and no step count.', minutes: 20 },
  { title: 'Enough for today', instruction: 'Decide in advance what would make today enough. Stop there.', minutes: 10 },
  { title: 'The nap or the pause', instruction: 'Lie down for fifteen minutes without expecting to sleep.', minutes: 15 },
  { title: 'What you rest from', instruction: 'Name what you are actually recovering from. It may not be work.', minutes: 10 },
  { title: 'A slow morning', instruction: 'Add fifteen minutes to the start of the day and spend them badly.', minutes: 15 },
  { title: 'Put it down', instruction: 'Set aside one worry for a full day. Write it down first so it keeps.', minutes: 8 },
  { title: 'The whole evening', instruction: 'Give one evening entirely to something with no outcome.', minutes: 30 },
  { title: 'Rest', instruction: 'What does rest cost you, and what did it return? One sentence.', minutes: 15 },

  // VII · Integration
  { title: 'The practice that stayed', instruction: 'Look back and name the one exercise you would keep for life.', minutes: 12 },
  { title: 'Your own version', instruction: 'Take that practice and rewrite the instruction in your own words.', minutes: 12 },
  { title: 'The hardest one', instruction: 'Return to the practice you liked least and do it once more.', minutes: 15 },
  { title: 'What changed in others', instruction: 'Ask one person whether they have noticed anything different.', minutes: 10 },
  { title: 'The unhurried minute, again', instruction: 'Sit with one object for sixty seconds. Compare it with day fifteen.', minutes: 12 },
  { title: 'Teach it', instruction: 'Explain one practice to somebody who has never heard of the programme.', minutes: 12 },
  { title: 'The daily minimum', instruction: 'Decide what the smallest honest version of this practice looks like on a bad day.', minutes: 10 },
  { title: 'Without the prompt', instruction: 'Choose today\'s exercise yourself, from anywhere in the programme.', minutes: 12 },
  { title: 'The record', instruction: 'Read ten of your own entries in order. Write what you notice about the writer.', minutes: 20 },
  { title: 'What you would drop', instruction: 'Name the part of this programme that was not for you, and let it go.', minutes: 10 },
  { title: 'The next ninety-eight days', instruction: 'Write what you intend to keep doing, in one paragraph, plainly.', minutes: 15 },
  { title: 'Tell someone', instruction: 'Say out loud to one person what you have been doing for three months.', minutes: 10 },
  { title: 'The last unhurried minute', instruction: 'One object. Sixty seconds. Nothing else.', minutes: 12 },
  { title: 'Integration', instruction: 'The programme ends here. Write the sentence you would want to read a year from now.', minutes: 20 },
];

/** One letter per chapter, opened when its chapter begins. */
export interface Letter {
  title: string;
  paragraphs: string[];
}

export const LETTERS: Letter[] = [
  {
    title: 'On beginning without ceremony',
    paragraphs: [
      'Most programmes open by asking you to believe something. This one opens by asking you to look. The first fortnight is not about improvement at all; it is about finding out where your days actually go, which is almost never where you assume.',
      'You will want to fix what you find. Try not to, yet. A thing observed honestly for two weeks tends to suggest its own remedy, and the remedy you arrive at yourself is the one you will keep.',
      'If you miss a day, begin again on the next one. The programme is not a streak, and nothing here is spoiled by a gap.',
    ],
  },
  {
    title: 'On the difference between looking and seeing',
    paragraphs: [
      'This chapter circles one idea: we mostly look, and rarely see. Looking is what the eye does on its own. Seeing is a decision, and like most decisions it costs something at the moment you make it.',
      'So when the practice asks you to sit with an object, do not try to be interesting about it. Sit with the dull one. Boredom is the doorway, and the other side of it is where seeing begins.',
      'Expect this fortnight to feel slower than the last. That is the point of it.',
    ],
  },
  {
    title: 'On saying the true thing plainly',
    paragraphs: [
      'Having looked, you now have something to say. The difficulty is that most of us have learned to say things at an angle, hedged enough that no one can hold us to them.',
      'The exercises here strip the hedges out. You will write sentences with no qualifiers, ask for things without apologising, and decline without explaining. Some of it will feel rude. It is worth finding out whether it actually is.',
      'Write first, speak second. Paper is where you can afford to be wrong.',
    ],
  },
  {
    title: 'On deciding with fewer witnesses',
    paragraphs: [
      'A decision made in front of an audience is rarely your own. This chapter reduces the audience, sometimes to nobody at all, and asks what you would choose then.',
      'You will notice that the hard decisions are not the ones with unclear answers. They are the ones where the answer is clear and inconvenient. Naming what you are protecting usually dissolves the difficulty faster than more analysis will.',
      'Where a decision is reversible, make it quickly. Save the deliberation for the ones you cannot take back.',
    ],
  },
  {
    title: 'On the second question',
    paragraphs: [
      'Almost everyone asks one question and then waits for their turn to speak. The whole of this chapter lives in the second question, the one that responds to what was actually said.',
      'You will be asked to leave silences, to resist solving, and to stay in one uncomfortable conversation a minute longer than you would like. The minute is where the real subject usually arrives.',
      'Listening well is not passive and it is not free. You will be tired afterwards. That is a reasonable price.',
    ],
  },
  {
    title: 'On stopping as a skill',
    paragraphs: [
      'Rest is treated almost everywhere as what happens when effort fails. This chapter treats it as something done deliberately, and done well or badly like anything else.',
      'The exercises will ask you to stop while things are going well, which is harder than stopping when you are exhausted, and more useful. Collapse is not rest; it is only the absence of choice.',
      'Notice what you are actually recovering from. It is often not the work.',
    ],
  },
  {
    title: 'On the practice without the app',
    paragraphs: [
      'The last chapter has a single purpose, which is to make this programme unnecessary. Everything here points outward: choose your own exercise, write your own instruction, teach it to someone else.',
      'Decide now what the smallest honest version of the practice looks like on your worst day. That version, not the ideal one, is what will survive the next year.',
      'When you reach day ninety-eight, the app has nothing further to tell you. Keep the minute.',
    ],
  },
];

/** 1-based day number to its practice, clamped to the programme's length. */
export function practiceForDay(day: number): Practice {
  const i = Math.min(Math.max(day, 1), PROGRAMME_DAYS) - 1;
  return PRACTICES[i];
}

/** 0-based chapter index for a 1-based day number. */
export function chapterIndexForDay(day: number): number {
  const i = Math.floor((Math.min(Math.max(day, 1), PROGRAMME_DAYS) - 1) / CHAPTER_LENGTH);
  return Math.min(i, CHAPTERS.length - 1);
}

/** "Chapter II · Attention" */
export function chapterLabel(index: number): string {
  const c = CHAPTERS[index];
  return `Chapter ${c.num} · ${c.title}`;
}

/** First day number of a 0-based chapter index. */
export function chapterStartDay(index: number): number {
  return index * CHAPTER_LENGTH + 1;
}
