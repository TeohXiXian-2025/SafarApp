// The demo trip's guided "Trip Quest": a first-trip walkthrough that teaches
// the normal Safar planning flow from teammates and preferences through halal
// discovery, group decisions, prayer-aware planning and final review.
import { DEMO_KIT, DEMO_POST_URL, DEMO_SPLIT_PLACE, type ArrangeJob, type Booking, type DemoFile, type Expense, type Idea, type Incident, type ScheduleItem } from '../../domain';

export interface QuestInput {
  uid: string;
  bookings: Booking[];
  ideas: Idea[];
  jobs: ArrangeJob[];
  expenses: Expense[];
  incidents: Incident[];
  /** Everything on the plan (stops, prayer breaks, booking moments). */
  schedule: ScheduleItem[];
  /** Pages this visitor opened in this trip. */
  seen: Set<string>;
  clicked: Set<string>;
  /** Your Document Vault has a passport (asked from the server; null = not known yet). */
  hasPassport: boolean | null;
}

export const FEATURES = {
  group: { icon: '👥', name: 'Teammates & Needs' },
  bookings: { icon: '🎫', name: 'Fixed Trip Anchors' },
  halal: { icon: '📡', name: 'Halal Discovery' },
  decisions: { icon: '🤝', name: 'Agree, Disagree & Resolve' },
  prayer: { icon: '🕌', name: 'Prayer-Aware Plan' },
} as const;
export type FeatureKey = keyof typeof FEATURES;

export interface QuestStep {
  id: string;
  title: string;
  feature?: FeatureKey;
  story: string;
  todo: string[];
  why: string;
  where: string;
  target?: string;
  files?: DemoFile[];
  link?: { url: string; label: string };
  done: (q: QuestInput) => boolean;
  blocked?: (q: QuestInput) => string | null;
  bonus?: boolean;
  reveal?: (q: QuestInput) => Reveal | null;
}

export interface Reveal {
  path: string;
  target: string;
  text: string;
}

const TAB: Partial<Record<Idea['status'], string>> = { voting: 'voting', backlog: 'backlog', scheduled: 'backlog', mixed: 'mixed', split_pending: 'mixed', backup: 'backup', rejected: 'rejected' };
const ideaReveal = (i: Idea | undefined, text: string): Reveal | null => (i ? { path: `/ideas?filter=${TAB[i.status] ?? 'backlog'}`, target: `idea-${i.id}`, text } : null);
const planReveal = (it: ScheduleItem | undefined, text: string): Reveal | null => (it ? { path: `/timeline?day=${it.day}`, target: `item-${it.id}`, text } : null);
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const bookingOf = (it: ScheduleItem, q: QuestInput) => (it.ref.kind === 'booking' ? q.bookings.find((b) => it.ref.kind === 'booking' && b.id === it.ref.bookingId) : undefined);

const isSplitPlace = (i: Idea) => i.place.name.toLowerCase().includes(DEMO_SPLIT_PLACE.toLowerCase());
const splitIdea = (q: QuestInput) => q.ideas.find((i) => isSplitPlace(i) && !i.splitId) ?? q.ideas.find(isSplitPlace);
const ownLinkedIdea = (q: QuestInput) =>
  q.ideas
    .filter((i) => i.createdBy === q.uid && ['instagram', 'tiktok', 'xiaohongshu', 'youtube', 'link', 'screenshot'].includes(i.source.type))
    .sort((a, b) => a.createdAt - b.createdAt)[0];
const radarIdea = (q: QuestInput) => q.ideas.filter((i) => i.createdBy === q.uid && i.source.type === 'radar').sort((a, b) => b.createdAt - a.createdAt)[0];
const firstPrayer = (q: QuestInput) => {
  const days = [...new Set(q.schedule.filter((i) => i.ref.kind === 'idea').map((i) => i.day))].sort();
  return q.schedule.filter((i) => i.prayer && i.prayer.prayer !== 'Fajr' && i.day === days[0] && i.prayer.facility).sort((a, b) => a.start.localeCompare(b.start))[0];
};

function noSplit(q: QuestInput): string | null {
  const i = splitIdea(q);
  if (!i || i.decidedBy || i.splitId) return null;
  if (i.votes[q.uid]?.value === -1 || i.status === 'backup')
    return 'You disagreed with Ichiran, so most of the group said no and it went to Reserve. To see the split: Ideas -> Reserve -> Ichiran menu -> Reopen voting, then Agree. Or skip this step.';
  if (i.status === 'rejected') return 'Ichiran was turned down, so there is nothing to split. Skip this step.';
  if (i.status === 'backlog' || i.status === 'scheduled') return 'Everyone agreed on Ichiran, so there was nothing to split. Skip this step.';
  return null;
}

const KYOTO_STATION = { lat: 34.9858, lng: 135.7588 };

export const QUEST: QuestStep[] = [
  {
    id: 'start',
    feature: 'group',
    title: 'Start with the trip',
    story: 'Welcome to the sample Japan trip. For this demo, we already added your teammates so you can see the group flow right away. In your future trips, you can add more people from the People page with an invite link.',
    todo: ['We already added your demo teammates.', 'Tap Show me where, then create an invite link.', 'In a future trip, share the link to add more teammates.'],
    why: 'Safar works best when the group is in one shared workspace. The demo starts with teammates ready, then shows the exact place where invites live.',
    where: '/members#invite',
    target: 'invite-create',
    done: (q) => q.clicked.has('start'),
    reveal: () => ({ path: '/members', target: 'invite-links', text: 'This is where you add teammates in a real trip: create an invite link, copy it, or share it with your group.' }),
  },
  {
    id: 'group',
    feature: 'group',
    title: 'Meet the group',
    story: "Aisyah is planning with Mum Aminah, brother Farid and Daniel. Their needs are different: halal rules, prayer breaks, pace, interests and budget.",
    todo: ['Open People.', 'Meet the teammates, then tap View group preferences.'],
    why: 'Safar turns individual needs into group rules, such as the strictest halal level for shared meals and prayer breaks only for the people who pray.',
    where: '/members',
    target: 'group-review',
    done: (q) => q.clicked.has('group'),
    reveal: () => ({ path: '/members', target: 'group-rules', text: 'Four people become one planning context: halal, prayer, pace and budget are visible before decisions start.' }),
  },
  {
    id: 'invite',
    feature: 'group',
    title: 'Add a teammate',
    story: 'Real trips become easier when everyone can join the same workspace instead of planning through scattered chats.',
    todo: ['People -> Invite links.', 'Copy the link you created.', 'Share it in a future trip so a teammate can join and vote.'],
    why: 'The People page is where collaboration begins: invite teammates first, then their preferences and votes can shape the plan.',
    where: '/members#invite',
    target: 'invite-copy',
    done: (q) => q.clicked.has('invite'),
    reveal: () => ({ path: '/members', target: 'group-rules', text: 'Safar uses the member list as the source of truth for preferences, votes, bookings and split plans.' }),
  },
  {
    id: 'preferences',
    feature: 'group',
    title: 'Review preferences',
    story: 'Before adding more places, check how Safar reads the group: who needs halal, who prays, how fast the group moves and what everyone likes.',
    todo: ['Review the group preferences card.', 'Tap Edit my preferences to see how your needs are set.'],
    why: 'Preferences are not just profile details. They drive halal warnings, conflict checks, prayer blocks, pacing and what counts as a good suggestion.',
    where: '/members#preferences',
    target: 'preferences-edit',
    done: (q) => q.clicked.has('preferences'),
    reveal: () => ({ path: '/members', target: 'group-rules', text: 'The group rules are the planning guardrails: they make the later food, voting and prayer steps make sense.' }),
  },
  {
    id: 'bookings',
    feature: 'bookings',
    title: 'Add fixed bookings',
    story: 'Flights, train rides and hotels are fixed anchors. Activities should move around them, not the other way round.',
    todo: ['Download the sample flight e-ticket, train ticket and hotel confirmations.', 'Bookings -> Add ticket or hotel -> upload them.', 'Check what Safar read, then save.'],
    why: 'Bookings create fixed times on the Plan, so auto-planning knows when the group is in Tokyo or Kyoto and what cannot be moved.',
    where: '/bookings',
    target: 'add-booking',
    files: [DEMO_KIT.flight, DEMO_KIT.train, DEMO_KIT.hotelTokyo, DEMO_KIT.hotelKyoto],
    done: (q) => q.clicked.has('bookings'),
    reveal: (q) => {
      const train = q.schedule.find((i) => bookingOf(i, q)?.kind === 'train' && i.ref.kind === 'booking');
      return planReveal(train, 'The bookings are now fixed anchors on the Plan. Safar plans activities around travel, hotels and local time zones.');
    },
  },
  {
    id: 'radar',
    feature: 'halal',
    title: 'Find food with Halal Radar',
    story: 'Thursday evening, the group arrives near Kyoto Station. Mum only eats certified halal, so dinner needs more than a generic restaurant search.',
    todo: ['Open Food near Kyoto Station.', 'Compare Halal, Pork-free and Not-checked places.', 'Add one suitable restaurant to Ideas.'],
    why: 'Halal Radar brings halal level, evidence source, distance, opening state and contact actions into one screen before the group votes.',
    where: `/food?lat=${KYOTO_STATION.lat}&lng=${KYOTO_STATION.lng}&near=${encodeURIComponent('Kyoto Station')}`,
    target: 'radar-add',
    done: (q) => q.clicked.has('radar'),
    reveal: (q) => ideaReveal(radarIdea(q), 'Food found through Halal Radar carries its halal evidence into Ideas, so the group can vote with context.'),
  },
  {
    id: 'suggest',
    feature: 'halal',
    title: 'Suggest a place or link',
    story: 'Farid sends a reel with Kyoto places. Safar can turn a social link into candidate stops instead of making you search each place manually.',
    todo: ['Copy the Instagram link below.', 'Ideas -> Add place or link -> paste it.', 'Pick the places Safar found and add them.'],
    why: 'The Ideas board is the planning inbox: places from search, links and Halal Radar collect there before becoming part of the schedule.',
    where: '/ideas',
    target: 'add-idea',
    link: { url: DEMO_POST_URL, label: 'Instagram reel - Kyoto: Arashiyama, Kinkaku-ji, Nishiki market' },
    done: (q) => q.clicked.has('suggest'),
    reveal: (q) => ideaReveal(ownLinkedIdea(q), 'A suggestion is now on the Ideas board with place details, halal checks, nearby prayer info and group votes.'),
  },
  {
    id: 'vote',
    feature: 'decisions',
    title: 'Vote Agree or Disagree',
    story: 'Ideas are not automatically placed on the schedule. The group first agrees, disagrees or explains why something is not suitable.',
    todo: ['Open Ideas -> Vote now.', 'Tap Agree or Disagree on a highlighted idea.', 'Votes can carry reasons when there is a concern.'],
    why: 'Agree and Disagree keep group planning explicit. Safar uses the result to decide whether an idea is accepted, reserved, rejected or needs a compromise.',
    where: '/ideas?filter=voting#vote',
    target: 'vote-agree',
    done: (q) => q.clicked.has('vote'),
    reveal: (q) => ideaReveal(q.ideas.find((i) => !!i.votes[q.uid]), 'The vote is now part of the shared decision record, with counts and who still needs to answer.'),
  },
  {
    id: 'conflict',
    feature: 'decisions',
    title: 'Trigger a food conflict',
    story: 'Daniel really wants Ichiran ramen in Shibuya. Mum and Farid disagree because the broth is pork. You can agree only if you confirm why.',
    todo: ['Ideas -> Vote now -> open Ichiran.', 'Tap Agree.', 'When Safar warns that it conflicts with your rules, confirm: "I will keep Daniel company and just have tea."'],
    why: 'A group vote is not just majority rule. If an idea conflicts with someone’s needs, Safar makes the reason visible before resolving it.',
    where: '/ideas?filter=voting#conflict',
    target: 'conflict-agree',
    done: (q) => q.clicked.has('conflict'),
    reveal: (q) => ideaReveal(splitIdea(q), 'Two sides are now visible: some want ramen, others need halal food. Safar can resolve this without forcing one group to lose.'),
  },
  {
    id: 'split',
    feature: 'decisions',
    title: 'Solve the conflict',
    story: 'Safar found halal middle grounds nearby. The admin can accept a split: you and Daniel go to Ichiran, Mum and Farid eat halal nearby, then everyone regroups.',
    todo: ['Ideas -> Needs a decision -> open Ichiran.', 'Review the middle grounds and choices.', 'Accept the split plan.'],
    why: 'Mixed groups can briefly split when one plan cannot serve everyone. Safar times both tracks and sets a shared regroup point.',
    where: '/ideas?filter=mixed',
    target: 'split-accept',
    done: (q) => q.clicked.has('split'),
    blocked: noSplit,
    reveal: (q) => {
      const i = splitIdea(q);
      const onPlan = i && q.schedule.find((x) => x.ref.kind === 'idea' && x.ref.ideaId === i.id && x.track.endsWith(':A'));
      return onPlan
        ? planReveal(onPlan, 'The conflict is now a split on the Plan: ramen for one track, halal food nearby for the other, with a regroup point.')
        : ideaReveal(i, 'The conflict is resolved as a split decision. Auto-plan can place both tracks into the same part of the day.');
    },
  },
  {
    id: 'autoPlan',
    feature: 'prayer',
    title: 'Auto-plan the trip',
    story: 'Now Safar has teammates, preferences, bookings, halal-aware ideas and decisions. It is ready to turn the pieces into a schedule.',
    todo: ['Plan -> Auto-plan -> Whole trip.', 'Look over the preview, then apply it.', 'Open the planned days to see bookings, stops, meals and travel time together.'],
    why: 'Auto-plan connects the whole workflow: fixed bookings, agreed ideas, split decisions, travel time, opening hours and prayers become one timeline.',
    where: '/timeline',
    target: 'auto-plan',
    done: (q) => q.clicked.has('autoPlan'),
    reveal: (q) => {
      const stop = q.schedule.find((i) => i.ref.kind === 'idea');
      return planReveal(stop, 'The plan is no longer a list of ideas. It is a timed itinerary with routes, fixed anchors and group decisions.');
    },
  },
  {
    id: 'prayer',
    feature: 'prayer',
    title: 'Check prayer time',
    story: 'For Aisyah, Mum and Farid, prayer is part of the day. Daniel does not pray, so Safar should keep him included too.',
    todo: ['Open Plan and find the fixed prayer times.', 'Tap the highlighted Dhuhr time to jump into the day.', 'Check the nearby mosque or prayer room and what the non-praying teammate can do nearby.'],
    why: 'Prayer times are treated like fixed blocks in the day, with walking time and nearby facilities included so the trip does not stall.',
    where: '/timeline',
    target: 'prayer-review',
    done: (q) => q.clicked.has('prayer'),
    reveal: (q) =>
      planReveal(
        firstPrayer(q),
        `A prayer time is fixed on the route: Aisyah, Mum and Farid pray at ${firstPrayer(q)?.prayer?.facility?.name ?? 'a nearby prayer place'}, while Daniel can use nearby free time and regroup after.`,
      ),
  },
  {
    id: 'final',
    feature: 'prayer',
    title: 'Final review',
    story: 'The sample trip now shows the full Safar flow: teammates, needs, bookings, halal discovery, votes, conflict resolution and prayer-aware planning.',
    todo: ['Review Plan, Ideas, Food and People.', 'Use the guide’s Show buttons to revisit what changed.', 'Keep the trip if you want to continue exploring.'],
    why: 'A new user should leave the guide knowing the main loop: invite people, collect needs, add anchors, discover places, decide together, resolve conflicts and plan around prayer.',
    where: '/timeline',
    done: (q) => q.clicked.has('final'),
    reveal: (q) => planReveal(firstPrayer(q) ?? q.schedule.find((i) => i.ref.kind === 'idea'), 'The trip is planned end to end: group needs shaped the food choices, decisions and prayer-aware schedule.'),
  },
];

export interface QuestProgress {
  done: Set<string>;
  current: QuestStep | null;
  count: number;
}

export function questProgress(q: QuestInput): QuestProgress {
  const done = new Set(QUEST.filter((s) => s.done(q)).map((s) => s.id));
  return { done, current: QUEST.find((s) => !done.has(s.id)) ?? null, count: done.size };
}
