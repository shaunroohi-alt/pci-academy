// Lexical detectors for the local PCI engine. These are deliberately
// transparent: every detection is a regular expression over the user's own
// words, so any finding can be traced to the fragment that triggered it.

const words = (list: string) => list.trim().split(/\s*\|\s*/).join('|')

export const EMOTION_FAMILIES: Record<string, string[]> = {
  anger: ['angry', 'anger', 'furious', 'fury', 'irritated', 'irritation', 'annoyed', 'frustrated', 'frustration', 'resentful', 'resentment', 'rage', 'enraged', 'livid', 'outraged', 'bitter', 'mad at'],
  fear: ['afraid', 'scared', 'fear', 'fearful', 'terrified', 'panic', 'panicked', 'anxious', 'anxiety', 'nervous', 'worried', 'worry', 'uneasy', 'dread', 'stressed', 'stress', 'tense', 'on edge'],
  sadness: ['sad', 'sadness', 'unhappy', 'down', 'depressed', 'hopeless', 'grief', 'grieving', 'heartbroken', 'miserable', 'disappointed', 'disappointment', 'hurt', 'devastated', 'crushed', 'lonely', 'loneliness', 'empty'],
  shame: ['ashamed', 'shame', 'embarrassed', 'embarrassment', 'humiliated', 'humiliation', 'mortified', 'self-conscious', 'exposed'],
  guilt: ['guilty', 'guilt', 'regret', 'regretful', 'remorse', 'sorry'],
  joy: ['happy', 'happiness', 'joy', 'joyful', 'glad', 'delighted', 'excited', 'excitement', 'thrilled', 'elated', 'content', 'pleased', 'cheerful'],
  calm: ['calm', 'peaceful', 'at peace', 'relaxed', 'settled', 'serene', 'relieved', 'relief', 'safe'],
  gratitude: ['grateful', 'thankful', 'gratitude', 'appreciative'],
  pride: ['proud', 'pride', 'confident', 'accomplished'],
  envy: ['jealous', 'jealousy', 'envious', 'envy'],
  overwhelm: ['overwhelmed', 'exhausted', 'drained', 'burnt out', 'burned out', 'numb', 'flat', 'tired of'],
  confusion: ['confused', 'confusion', 'lost', 'uncertain', 'torn', 'conflicted', 'ambivalent'],
  love: ['love', 'loved', 'loving', 'tender', 'affection', 'warm towards'],
  disgust: ['disgusted', 'disgust', 'repulsed', 'sickened'],
  surprise: ['surprised', 'shocked', 'stunned', 'startled', 'amazed'],
  hope: ['hopeful', 'hope', 'optimistic', 'eager'],
}

const EMOTION_WORDS = Object.values(EMOTION_FAMILIES).flat()
export const EMOTION_RE = new RegExp(`\\b(?:${EMOTION_WORDS.map((w) => w.replace(/\s+/g, '\\s+')).join('|')})\\b`, 'i')

export function emotionFamily(word: string): string | null {
  const w = word.toLowerCase()
  for (const [family, list] of Object.entries(EMOTION_FAMILIES)) if (list.includes(w)) return family
  return null
}

/** "felt ignored" — an interpretation of another's conduct phrased as a feeling. */
export const INTERPRETIVE_FEELING_RE = new RegExp(
  `\\b(?:felt|feel|feeling|feels)\\s+(?:so\\s+|really\\s+|completely\\s+|totally\\s+)?(?:${words(
    'ignored | rejected | abandoned | disrespected | betrayed | attacked | judged | used | manipulated | dismissed | unappreciated | invisible | unheard | criticized | criticised | controlled | trapped | unwanted | unloved | left out | excluded | taken for granted | let down | blamed | humiliated | belittled | patronized | patronised | misunderstood | pressured | replaced | cheated',
  )})\\b`,
  'i',
)

/** "I feel like he doesn't care" — a proposition, not a feeling. */
export const FEEL_LIKE_RE = /\b(?:i|it)\s+(?:feel|felt|feels)\s+(?:like|as\s+if|as\s+though|that)\b/i

export const SELF_EMOTION_RE = new RegExp(
  `\\b(?:i|i'm|i’m|im|i\\s+was|i\\s+am|i\\s+felt|i\\s+feel|i\\s+get|i\\s+got|i\\s+became|made\\s+me|makes\\s+me|left\\s+me)\\b[^.!?]{0,30}?\\b(?:${EMOTION_WORDS.map((w) =>
    w.replace(/\s+/g, '\\s+'),
  ).join('|')})\\b`,
  'i',
)

export const JUDGMENT_RE = new RegExp(
  `\\b(?:${words(
    "stupid | idiot | idiotic | lazy | selfish | rude | unfair | wrong | terrible | awful | horrible | pathetic | useless | worthless | ridiculous | disrespectful | inappropriate | unacceptable | disgusting | shameful | embarrassing | incompetent | careless | inconsiderate | arrogant | boring | ugly | fake | toxic | crazy | insane | weak | failure | disaster | mess | a joke | the worst | the best | perfect | amazing | brilliant | excellent | great | bad | good enough | not good enough | too much | not enough | better than | worse than | deserve | deserved | fair",
  )})\\b`,
  'i',
)

export const INTERPRETATION_RE = new RegExp(
  `\\b(?:${words(
    "on purpose | deliberately | intentionally | just to | trying to | tried to make me | meant to | was meant | means that | that means | doesn't care | does not care | didn't care | don't care about me | ignoring me | ignored me | obviously | clearly | must have | must be | probably | i think | i thought | i guess | i suppose | i assume | i assumed | i bet | seems | seemed | apparently | that's why | that is why | the reason | thinks i | thought i | think i'm | judging me | looking down on | doesn't respect | didn't respect | hates me | hated me | likes me | is mad at me | was mad at me | angry with me | against me | punishing me | testing me | wanted me to | wants me to | out to get | to hurt me | to annoy me | to make a point | to prove",
  )})\\b`,
  'i',
)

export const ASSUMPTION_RE = new RegExp(
  `\\b(?:${words(
    "obviously | of course | everyone knows | everybody knows | everyone | everybody | no one | nobody | always | never | must have | must be | surely | certainly | will never | won't ever | is going to | are going to | it's going to | there's no way | there is no way | no point | pointless | it's impossible | impossible | can't ever | they all | anyone would | nothing will | nothing ever | everything always",
  )})\\b`,
  'i',
)

export const ABSOLUTE_RE = /\b(?:always|never|every\s+(?:single\s+)?time|everyone|everybody|no\s+one|nobody|everything|nothing|all\s+the\s+time|constantly|forever|each\s+time|whenever)\b/i

export const RECURRENCE_RE =
  /\b(?:always|never|every\s+(?:single\s+)?time|again|once\s+again|as\s+usual|like\s+always|all\s+the\s+time|constantly|whenever|each\s+time|keep(?:s)?\s+\w+ing|kept\s+\w+ing|same\s+(?:thing|pattern|story)|over\s+and\s+over|repeatedly|habit(?:ually)?|usually|often|every\s+(?:day|week|morning|night|month))\b/i

export const EXPECTATION_RE = new RegExp(
  `\\b(?:${words(
    "should have | shouldn't have | should've | should | supposed to | was meant to | expected | expect | expecting | ought to | at least | the least (?:he|she|they|you) could | i wanted | i want | i hoped | i was hoping | i thought (?:he|she|they|it) would | was going to | were going to | deserve | owed | owe me | promised",
  )})\\b`,
  'i',
)

const TRAITS = words(
  "useless | worthless | stupid | lazy | selfish | weak | broken | a failure | failure | a loser | loser | a fraud | fraud | fake | an idiot | idiot | a mess | mess | a disappointment | a liar | liar | a cheat | a narcissist | narcissist | an introvert | introvert | an extrovert | extrovert | a perfectionist | perfectionist | a people[- ]pleaser | people[- ]pleaser | a coward | coward | a bully | bully | a genius | genius | smart | creative | talented | hopeless | unlovable | too much | not enough | difficult | too sensitive | sensitive | emotional | an anxious person | a control freak | a procrastinator | procrastinator | an overthinker | overthinker | an empath | bad at \\w+ | good at \\w+ | terrible at \\w+ | hopeless at \\w+ | careless | irresponsible | unreliable | toxic | manipulative | controlling | cold | heartless | crazy | insane | a burden | burden | boring | ugly | unattractive | not (?:a|an) \\w+ person | (?:a|an) \\w+ person | the kind of person | the type of person | the one who",
)

export const SELF_IDENTITY_RE = new RegExp(
  `\\b(?:i\\s+am|i'm|i’m|im|i've\\s+always\\s+been|i\\s+have\\s+always\\s+been|i\\s+was\\s+born|i\\s+will\\s+always\\s+be|i'll\\s+always\\s+be)\\s+(?:just\\s+|such\\s+|so\\s+|always\\s+|never\\s+|really\\s+|basically\\s+|simply\\s+|not\\s+|only\\s+|clearly\\s+)*(?:${TRAITS})\\b|\\bthat'?s\\s+(?:just\\s+)?(?:who|how|what)\\s+i\\s+am\\b|\\bi'?m\\s+not\\s+(?:a|an|the)\\s+\\w+\\s+(?:person|type)\\b`,
  'i',
)

export const OTHER_IDENTITY_RE = new RegExp(
  `\\b(?:he\\s+is|he's|she\\s+is|she's|they\\s+are|they're|you\\s+are|you're|my\\s+\\w+\\s+is)\\s+(?:just\\s+|such\\s+|so\\s+|always\\s+|never\\s+|really\\s+|basically\\s+|a\\s+total\\s+|completely\\s+)*(?:${TRAITS})\\b|\\bthat'?s\\s+(?:just\\s+)?(?:who|how|what)\\s+(?:he|she|they)\\s+(?:is|are)\\b`,
  'i',
)

const IRREGULAR_PAST = words(
  'said | told | went | left | came | took | gave | made | ran | wrote | sent | got | put | sat | stood | kept | let | met | paid | brought | bought | knew | saw | heard | spoke | broke | forgot | hid | lost | won | began | drank | ate | slept | woke | drove | rode | threw | caught | fought | sang | sold | spent | taught | wore | chose | held | hung | led | read | rang | rose | shook | shut | sought | swore | tore | wept | withdrew | quit | did | forgave | hit | cut | set | fell | flew | froze | grew | hurt | lay | lit | overslept | ran | sent | slammed | snapped | yelled | shouted | screamed | cried | laughed | agreed | refused | stopped | started | walked | avoided | apologized | apologised | ignored | replied | answered | asked | called | texted | emailed | cancelled | canceled | postponed | stayed | waited | finished | skipped | missed | opened | closed | argued | interrupted | complained | criticized | criticised | explained | promised | decided | planned | tried | worked | practiced | practised | returned | helped | offered | accepted | declined | changed | moved | hugged | kissed | lied | pushed | pulled | touched | looked | listened | watched | noticed | realized | realised',
)

/** Person subject followed (within a few words) by an action verb in the past. */
export const BEHAVIOR_RE = new RegExp(
  `\\b(?:i|we|he|she|they|you|my\\s+\\w+|his\\s+\\w+|her\\s+\\w+|our\\s+\\w+|the\\s+(?:manager|boss|team|client|teacher|doctor|driver|kids|children))\\s+(?:just\\s+|then\\s+|finally\\s+|still\\s+|immediately\\s+|suddenly\\s+|also\\s+|never\\s+|always\\s+|eventually\\s+)?(?:(?:didn't|did\\s+not|never|couldn't|wouldn't|won't|hasn't|haven't)\\s+\\w+|(?:${IRREGULAR_PAST})|\\w{3,}ed)\\b`,
  'i',
)

export const ELLIPTICAL_OMISSION_RE = /\b(?:but\s+)?(?:i|we)\s+(?:didn't|did\s+not|never\s+did|couldn't|wouldn't|hadn't|haven't|never\s+got\s+round\s+to\s+it|never\s+did\s+it)\s*[.!]?\s*$/i

export const OMISSION_RE = /\b(?:didn't|did\s+not|never|couldn't|wouldn't|hasn't|haven't|failed\s+to)\s+(?:even\s+)?(\w+)/i

export const HABITUAL_BEHAVIOR_RE =
  /\bi\s+(?:always\s+|usually\s+|often\s+|tend\s+to\s+|keep\s+)?(?:avoid|procrastinate|delay|withdraw|apologi[sz]e|overthink|overwork|overeat|scroll|check|agree|say\s+yes|say\s+no|shut\s+down|go\s+quiet|snap|cancel|freeze|push\s+(?:people|them)\s+away|people-please)\b/i

const PASSIVE_EVENT = /\b(?:was|were|got|has\s+been|had\s+been)\s+(?:\w+ly\s+)?(?:cancelled|canceled|moved|postponed|delayed|announced|released|rejected|accepted|approved|fired|hired|promoted|laid\s+off|diagnosed|born|married|divorced|admitted|discharged|sold|closed|opened|changed|scheduled|rescheduled|broken|stolen|lost|found|finished)\b/i
const OCCURRENCE = /\b(?:there\s+(?:was|were|is|are)|it\s+(?:rained|snowed|happened|started|ended|began|broke)|happened|occurred|took\s+place|the\s+\w+\s+(?:arrived|started|ended|began|finished|rang|failed|crashed|broke|closed|opened))\b/i

export const EVENT_RE = new RegExp(`${PASSIVE_EVENT.source}|${OCCURRENCE.source}`, 'i')

const LOCATIONS = words(
  "work | home | the office | office | school | university | college | class | the meeting | a meeting | meeting | the party | a party | dinner | lunch | breakfast | the car | the store | the shop | the gym | church | the hospital | hospital | the kitchen | bed | the phone | the call | a call | zoom | the train | the bus | the airport | the restaurant | a restaurant | the park | the beach | rehearsal | practice | the studio | stage | the interview | an interview | the wedding | the funeral | the table | the event | the conference | my desk | my room | our room | the house | their house | his place | her place | my place | online | text | email | the group chat",
)

const RELATIONS = words(
  'mother | mom | mum | father | dad | parents | partner | wife | husband | boyfriend | girlfriend | boss | manager | colleague | coworker | co-worker | friend | friends | best friend | sister | brother | son | daughter | team | family | kids | children | teacher | client | clients | landlord | neighbor | neighbour | therapist | coach | ex | roommate | flatmate | grandmother | grandfather | aunt | uncle | cousin | students | audience | band',
)

const TIMES = words(
  "this morning | this afternoon | this evening | tonight | last night | yesterday | today | tomorrow | earlier | later | lately | recently | last week | this week | next week | last month | last year | years ago | as a child | when i was (?:a )?(?:child|kid|young|little|teenager) | in the morning | in the evening | in the afternoon | at night | late at night | after work | before work | before bed | at the weekend | on the weekend | monday | tuesday | wednesday | thursday | friday | saturday | sunday | at \\d{1,2}(?::\\d{2})?\\s?(?:am|pm)?",
)

const STATES = words(
  "when i'm tired | when i was tired | when i am tired | tired | hungry | late at night | after drinking | hungover | under pressure | on (?:a )?deadline | before a deadline | sleep-deprived | sick | ill | in a rush | rushing | running late | alone | in public | in front of (?:everyone|people|others|the team|the class)",
)

export const CONTEXT_RES: { kind: 'place' | 'relation' | 'time' | 'state'; re: RegExp }[] = [
  { kind: 'place', re: new RegExp(`\\b(?:at|in|during|on|over|by|via|after|before)\\s+(?:the\\s+|my\\s+|a\\s+|our\\s+)?(?:${LOCATIONS})\\b`, 'gi') },
  { kind: 'relation', re: new RegExp(`\\b(?:with|to|from|and|my|our|his|her|their)\\s+(?:${RELATIONS})\\b`, 'gi') },
  { kind: 'time', re: new RegExp(`\\b(?:${TIMES})\\b`, 'gi') },
  { kind: 'state', re: new RegExp(`\\b(?:${STATES})\\b`, 'gi') },
]

export const TIME_REFERENCE_RE = new RegExp(
  `\\b(?:${TIMES}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\\s+\\d{1,2})?|in\\s+(?:19|20)\\d{2}|\\d+\\s+(?:days?|weeks?|months?|years?)\\s+ago)\\b`,
  'i',
)

export const SEQUENCE_RE = /\b(?:first|then|after\s+that|afterwards|later|finally|next|before\s+that|eventually|at\s+first)\b/i

export const DREAM_RE = /\b(?:dream|dreamt|dreamed|dreaming|nightmare|in\s+the\s+dream|vision)\b/i
export const METAPHOR_RE =
  /\b(?:like\s+a|like\s+an|as\s+if|as\s+though|felt\s+like\s+a|symbol(?:ic|ises|izes)?|a\s+sign|an\s+omen|omen|synchronicity|archetype|archetypal|shadow\s+self|the\s+shadow|the\s+universe\s+(?:is|was)|a\s+message|metaphor)\b/i

export const PHILOSOPHICAL_RE =
  /\b(?:meaning\s+of\s+(?:life|it\s+all|existence)|purpose\s+of\s+(?:life|existence|being)|who\s+am\s+i|what\s+am\s+i|free\s+will|fate|destiny|consciousness|the\s+self|existence|what\s+is\s+real|reality\s+is|the\s+soul|my\s+soul|what\s+it\s+means\s+to\s+be|being\s+and\s+becoming|nature\s+of\s+(?:being|reality|the\s+self|identity)|is\s+there\s+a\s+god|why\s+(?:do\s+)?we\s+exist)\b/i

export const DIRECTION_REQUEST_RE =
  /\b(?:what\s+should\s+i\s+do|should\s+i\b|what\s+do\s+i\s+do|how\s+(?:do|can|should)\s+i\s+(?:fix|stop|change|get\s+over|make|deal\s+with|handle|overcome|move\s+on|let\s+go)|tell\s+me\s+what\s+to\s+do|what\s+would\s+you\s+do|give\s+me\s+(?:some\s+)?advice|any\s+advice|help\s+me\s+decide|is\s+it\s+(?:right|wrong|ok|okay|fair)\s+(?:to|that|if)|am\s+i\s+(?:wrong|right)|was\s+i\s+(?:wrong|right)|who\s+(?:is|was)\s+right)\b/i

export const CLASSIFICATION_REQUEST_RE =
  /\b(?:do\s+i\s+have|could\s+i\s+have|is\s+(?:this|it)\s+(?:a\s+)?(?:sign|symptom)\s+of|am\s+i\s+(?:a\s+)?(?:narcissist|depressed|bipolar|autistic|codependent|toxic|crazy|normal|broken)|is\s+(?:he|she|they|my\s+\w+)\s+(?:a\s+)?(?:narcissist|psychopath|sociopath|toxic|abusive|gaslighting)|what(?:'s|\s+is)\s+wrong\s+with\s+me|what\s+is\s+my\s+(?:type|personality|attachment\s+style)|diagnos\w*)\b/i

export const HARM_RE =
  /\b(?:abus(?:e|ed|ive)|assault(?:ed)?|hit\s+me|beat\s+me|violen(?:ce|t)|rap(?:e|ed)|harass(?:ed|ment)|threaten(?:ed)?|bull(?:y|ied)|stalk(?:ed|ing)|attacked\s+me|died|death|passed\s+away|funeral|grief|miscarriage|cancer|suicid\w*|self[- ]harm|kill(?:ed)?|overdose|accident|injur(?:ed|y))\b/i

export const SELF_OBSERVATION_RE =
  /\b(?:i\s+noticed|i\s+realized|i\s+realised|i\s+caught\s+myself|i\s+watched\s+myself|i\s+observed|i\s+saw\s+myself|i\s+became\s+aware|it\s+occurred\s+to\s+me|i\s+found\s+myself|i\s+recogni[sz]ed|i\s+could\s+see\s+(?:that\s+)?i)\b/i

export const REVISION_RE =
  /\b(?:at\s+first|used\s+to|i\s+changed\s+my\s+mind|now\s+i\s+(?:think|see|feel|believe)|i\s+no\s+longer|not\s+anymore|anymore|on\s+second\s+thought|originally|i\s+thought\s+.{1,60}?\s+but\s+now|this\s+time\s+i\s+didn't|for\s+once)\b/i

/** Marks the earlier side of a revision ("At first I thought…"). */
export const REVISION_FROM_RE = /\b(?:at\s+first|used\s+to|originally|i\s+(?:first\s+)?thought|before,?\s+i|previously|i\s+assumed)\b/i
/** Marks the later side of a revision ("…but now I see…"). */
export const REVISION_TO_RE = /\b(?:now|anymore|no\s+longer|changed|realized|realised|turns\s+out|actually|in\s+fact|these\s+days)\b/i

export const CAUSAL_CONNECTOR_RE = /\b(?:because|so\s+that|so|which\s+made|that\s+made|made\s+me|caused|led\s+to|after\s+which|and\s+then|then)\b/i

/** A stated valuation or stance ("I don't care", "I love it", "I prefer…"). */
export const STANCE_RE = /\bi\s+(?:really\s+|just\s+|still\s+|honestly\s+)?(?:don't\s+|do\s+not\s+|didn't\s+|did\s+not\s+)?(?:care|mind|like|love|hate|prefer|believe|value|respect|trust|admire|resent)\b/i

export const INDIFFERENCE_RE =
  /\b(?:i\s+don't\s+care|i\s+do\s+not\s+care|i\s+didn't\s+care|it\s+doesn't\s+matter|it\s+does\s+not\s+matter|i'm\s+fine|i\s+am\s+fine|i\s+was\s+fine|whatever|i'm\s+over\s+it|i\s+am\s+over\s+it|not\s+a\s+big\s+deal|no\s+big\s+deal|it\s+didn't\s+bother\s+me|it\s+doesn't\s+bother\s+me)\b/i

export const STATED_INTENTION_RE =
  /\b(?:i\s+(?:said|told\s+\w+|promised|decided|planned|meant|wanted|was\s+going|intended|committed|swore)\s+(?:that\s+)?(?:i\s+would|i'd|i\s+will|i'll|to))\s+(\w+)/i

export const VALUE_RE = /\b(?:i\s+value|i\s+believe\s+in|i\s+care\s+(?:a\s+lot\s+)?about|(?:it's|it\s+is)\s+important\s+to\s+me(?:\s+to)?|i\s+pride\s+myself\s+on|matters\s+to\s+me)\s+(\w+(?:\s+\w+)?)/i

export const FEEDBACK_LOOP_RE =
  /\bthe\s+more\s+(?:i|he|she|they|we)\b.{1,60}?\bthe\s+more\b|\bwhich\s+makes?\s+(?:me|him|her|them)\b.{1,60}?\bwhich\s+makes?\b|\bit'?s\s+a\s+(?:cycle|loop|spiral)\b|\bvicious\s+circle\b/i

// Trait families used to recognise an identity claim meeting contrary conduct.
export const TRAIT_CONFLICTS: { trait: RegExp; conduct: RegExp; label: string }[] = [
  { label: 'calm / anger', trait: /\b(?:calm|patient|not\s+an?\s+angry|chill|easy-?going)\b/i, conduct: /\b(?:shouted|yelled|screamed|snapped|lost\s+my\s+temper|furious|angry|raged|slammed)\b/i },
  { label: 'honest / dishonest', trait: /\b(?:honest|not\s+a\s+liar|truthful)\b/i, conduct: /\b(?:lied|made\s+up|pretended|covered\s+up|didn't\s+tell)\b/i },
  { label: 'lazy / effort', trait: /\b(?:lazy|a\s+procrastinator|procrastinator|useless)\b/i, conduct: /\b(?:finished|completed|worked\s+(?:late|all|hard)|stayed\s+late|got\s+it\s+done|delivered|practiced|practised|trained)\b/i },
  { label: 'confident / avoidance', trait: /\b(?:confident|not\s+shy|fearless)\b/i, conduct: /\b(?:avoided|froze|hid|couldn't\s+speak|stayed\s+quiet|panicked|nervous|scared)\b/i },
  { label: 'not jealous / jealousy', trait: /\b(?:not\s+(?:a\s+)?jealous|never\s+jealous)\b/i, conduct: /\b(?:jealous|envious|checked\s+(?:his|her|their)\s+phone)\b/i },
  { label: 'independent / reliance', trait: /\b(?:independent|don't\s+need\s+anyone|don't\s+need\s+(?:him|her|them))\b/i, conduct: /\b(?:called\s+(?:him|her|them)|begged|waited\s+for|needed\s+(?:him|her|them)|missed\s+(?:him|her|them))\b/i },
  { label: 'creative / not creative', trait: /\b(?:not\s+(?:a\s+)?creative|not\s+an?\s+artist|can't\s+(?:draw|sing|write))\b/i, conduct: /\b(?:wrote|drew|painted|sang|composed|designed|improvised|made\s+a\s+song)\b/i },
]

/** Polarity pairs for direct contradictions within material. */
export const POLARITY_PAIRS: [RegExp, RegExp, string][] = [
  [/\b(?:i\s+)?(?:love|loved|adore)\s+(\w+)/i, /\b(?:i\s+)?(?:hate|hated|can't\s+stand|despise)\s+(\w+)/i, 'love / hate'],
  [/\bi\s+(?:want|wanted)\s+(?:to\s+)?(\w+)/i, /\bi\s+(?:don't|do\s+not|didn't|did\s+not)\s+want\s+(?:to\s+)?(\w+)/i, 'want / do not want'],
  [/\bi\s+(?:trust|trusted)\s+(\w+)/i, /\bi\s+(?:don't|do\s+not|didn't|can't)\s+trust\s+(\w+)/i, 'trust / distrust'],
  [/\bi\s+(?:like|liked|enjoy|enjoyed)\s+(\w+)/i, /\bi\s+(?:don't|do\s+not|didn't)\s+(?:like|enjoy)\s+(\w+)/i, 'like / dislike'],
  [/\bi\s+(?:agree|agreed)\s+(?:with\s+)?(\w+)/i, /\bi\s+(?:disagree|disagreed|don't\s+agree|didn't\s+agree)\s+(?:with\s+)?(\w+)/i, 'agree / disagree'],
  [/\bi(?:'m|\s+am|\s+was)\s+ready\b()/i, /\bi(?:'m|\s+am|\s+was)\s+not\s+ready\b()/i, 'ready / not ready'],
  [/\bi\s+always\s+(\w+)/i, /\bi\s+never\s+(\w+)/i, 'always / never'],
  [/\bi\s+(?:need|needed)\s+(\w+)/i, /\bi\s+(?:don't|do\s+not|didn't)\s+need\s+(\w+)/i, 'need / do not need'],
  [/\bi\s+(?:miss|missed)\s+(\w+)/i, /\bi\s+(?:don't|do\s+not|didn't)\s+miss\s+(\w+)/i, 'miss / do not miss'],
]
