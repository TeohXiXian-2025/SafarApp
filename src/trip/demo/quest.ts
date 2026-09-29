// The demo trip's guided "Trip Quest": the six things Safar does that other
// planners don't (see FEATURES), told as one week in Japan. Each step is done
// when the trip's real data says so (not when a button was clicked), so the
// guide survives refreshes, can be done in any order, and can't get stuck: a
// step that can no longer happen (a different choice was made) says why.
import { DEMO_KIT, DEMO_MATES, DEMO_POST_URL, DEMO_SPLIT_PLACE, type ArrangeJob, type Booking, type DemoFile, type Expense, type Idea, type Incident, type ScheduleItem } from '../../domain';

export interface QuestInput {
  uid: string;
  bookings: Booking[];
  ideas: Idea[];
  jobs: ArrangeJob[];
  expenses: Expense[];
  incidents: Incident[];
  /** The plan's prayer breaks. */
  prayers: ScheduleItem[];
  /** Pages this visitor opened in this trip (for "have a look" steps). */
  seen: Set<string>;
  /** Your Document Vault has a passport (asked from the server; null = not known yet). */
  hasPassport: boolean | null;
}

/** The six features the demo is built to show (README: Our Solution + Extra Features). */
export const FEATURES = {
  vault: { icon: '🔒', name: 'AI Document Vault' },
  social: { icon: '📱', name: 'Social-to-Itinerary' },
  split: { icon: '🤝', name: 'AI Compromise & Auto-Split' },
  prayer: { icon: '⏱️', name: 'Prayer-Anchored Timeline' },
  radar: { icon: '📡', name: 'Halal Radar' },
  rescue: { icon: '🚨', name: 'Emergency Fallback' },
} as const;
export type FeatureKey = keyof typeof FEATURES;

export interface QuestStep {
  id: string;
  title: string;
  /** Which of the six features it shows (none: the intro and the bonus). */
  feature?: FeatureKey;
  /** The story: what's going on for Aisyah's group. */
  story: string;
  /** What to do, step by step. */
  todo: string[];
  /** Why it matters — what Safar does that other planners don't. */
  why: string;
  /** Where it happens: a path inside the trip ('' = Home) and the thing to point at. */
  where: string;
  target?: string;
  files?: DemoFile[];
  /** A link to copy and paste (instead of a file). */
  link?: { url: string; label: string };
  done: (q: QuestInput) => boolean;
  /** Why it can't happen any more (a different choice was made earlier) — with how to get it back. */
  blocked?: (q: QuestInput) => string | null;
  /** Not part of the six (shown as a bonus). */
  bonus?: boolean;
}

const isSplitPlace = (i: Idea) => i.place.name.toLowerCase().includes(DEMO_SPLIT_PLACE.toLowerCase()); // Google writes it "ICHIRAN"
const splitIdea = (q: QuestInput) => q.ideas.find((i) => isSplitPlace(i) && !i.splitId) ?? q.ideas.find(isSplitPlace);

/** Ichiran can't be split any more: why, and how to bring it back. */
function noSplit(q: QuestInput): string | null {
  const i = splitIdea(q);
  if (!i || i.decidedBy || i.splitId) return null;
  if (i.votes[q.uid]?.value === -1 || i.status === 'backup')
    return 'You voted 👎 on Ichiran, so most of the group said no (1 for, 3 against) and it went to the Reserve — Safar only splits the group when at least half want to go. To see the split: Ideas → Reserve → Ichiran’s ⋯ menu → Reopen voting, then vote 👍. Or skip this step.';
  if (i.status === 'rejected') return 'Ichiran was turned down, so there is nothing to split. Skip this step.';
  if (i.status === 'backlog' || i.status === 'scheduled') return 'Everyone agreed on Ichiran, so there was nothing to split. Skip this step.';
  return null;
}

/** Kyoto Station — where the group arrives on Thursday (the radar step searches around it). */
const KYOTO_STATION = { lat: 34.9858, lng: 135.7588 };

export const QUEST: QuestStep[] = [
  {
    id: 'group',
    title: 'Meet your group',
    story: "You're Aisyah, planning a week in Japan for your mum Aminah, your brother Farid and his friend Daniel. Three of you pray and eat halal (Mum: certified only); Daniel doesn't, and he really wants ramen.",
    todo: ['Open People and read what everyone needs: halal level, prayer times, pace and budget.'],
    why: 'Safar merges everyone into one set of group rules — the strictest halal level for shared meals, prayer breaks only for the people who pray, the slowest pace — so nobody has to give up what they need.',
    where: '/members',
    done: (q) => q.seen.has('members'),
  },
  {
    id: 'flight',
    feature: 'vault',
    title: 'Drop in your flight e-ticket',
    story: 'The tickets are booked: KL → Tokyo on Monday 7 Dec, and home from Osaka on Sunday 13 Dec.',
    todo: ['Download the flight e-ticket below.', 'Bookings → Add ticket or hotel → upload it.', 'Check what the AI read, then save.'],
    why: 'One PDF becomes two flights with their flight numbers and booking reference, matched to all four travellers. Their times become fixed on the Plan in each airport’s own time zone — and this is what the Emergency Fallback watches later.',
    where: '/bookings',
    target: 'add-booking',
    files: [DEMO_KIT.flight],
    done: (q) => q.bookings.filter((b) => b.kind === 'flight').length >= 2,
  },
  {
    id: 'stays',
    feature: 'vault',
    title: 'Hotels and the bullet train',
    story: 'Three nights in Asakusa, the Shinkansen to Kyoto on Thursday morning, three nights at Kyoto Station.',
    todo: ['Upload the two hotel confirmations and the Shinkansen ticket the same way.'],
    why: 'The AI cross-checks them with each other: a check-in before anyone can arrive, a night with no hotel, a check-out after the train leaves. Each day now knows which city you are in — nothing gets planned while you are on the train.',
    where: '/bookings',
    target: 'add-booking',
    files: [DEMO_KIT.hotelTokyo, DEMO_KIT.train, DEMO_KIT.hotelKyoto],
    done: (q) => q.bookings.filter((b) => b.kind === 'hotel').length >= 2 && q.bookings.some((b) => b.kind === 'train'),
  },
  {
    id: 'passport',
    feature: 'vault',
    title: 'Check your passport',
    story: 'Aisyah’s passport expires in April 2027 — is that a problem for this trip?',
    todo: ['Bookings → Documents → agree, then upload the passport (a specimen).', 'Read the checks Safar runs for Japan.'],
    why: 'Documents are read by AI but stay private to you. Safar cross-checks them with the trip weeks ahead: validity after you travel, visa rules for your nationality, dates with no hotel or no ticket home.',
    where: '/bookings?tab=documents',
    target: 'vault-upload',
    files: [DEMO_KIT.passport],
    done: (q) => q.hasPassport === true,
  },
  {
    id: 'post',
    feature: 'social',
    title: 'Turn an Instagram reel into plans',
    story: 'Farid sent a reel: three Kyoto must-sees. Instead of hunting for each place on the map…',
    todo: ['Copy the Instagram link below.', 'Ideas → Add place or link → paste it.', 'Pick the places Safar found and add them.', 'Watch the others vote a moment later — then vote 👍 yourself.'],
    why: 'Safar reads the post — caption, photos, even what is said in the video — finds each place on the map, and checks it: halal status (and where that comes from), alcohol, and the nearest place to pray. Works with Instagram, TikTok, Xiaohongshu and YouTube.',
    where: '/ideas',
    target: 'add-idea',
    link: { url: DEMO_POST_URL, label: 'Instagram reel · Kyoto: Arashiyama, Kinkaku-ji, Nishiki market' },
    done: (q) => q.ideas.some((i) => i.createdBy === q.uid && ['instagram', 'tiktok', 'xiaohongshu', 'youtube', 'link', 'screenshot'].includes(i.source.type)),
  },
  {
    id: 'vote',
    feature: 'split',
    title: "Vote on Daniel's ramen",
    story: 'Daniel really wants Ichiran ramen in Shibuya. Mum and Farid voted 👎 — the broth is pork. You don’t mind keeping Daniel company over a cup of tea.',
    todo: ['Ideas → Vote now → vote 👍 on Ichiran.', 'Safar asks you to confirm, because it isn’t halal for you — write “I’ll keep Daniel company and just have tea.”'],
    why: 'Votes carry reasons, and a 👍 on something that clashes with your own rules has to be confirmed. With two for and two against, Safar doesn’t just take the majority — it looks for a way everyone gets a good meal.',
    where: '/ideas?filter=voting',
    done: (q) => !!splitIdea(q)?.votes[q.uid],
  },
  {
    id: 'split',
    feature: 'split',
    title: 'Settle it with a split',
    story: 'Two for, two against. Safar found halal places a few minutes away, and Mum and Farid each picked where they’ll eat instead.',
    todo: ['Ideas → Needs a decision → open Ichiran.', 'See the middle grounds Safar offered and where Mum and Farid chose to eat.', 'As the admin, accept it: you and Daniel go to Ichiran, Mum and Farid eat halal nearby, and everyone meets back after.'],
    why: 'Mixed groups don’t have to choose one restaurant for everyone: Safar splits the group for an hour, times both meals so they end together and sets a meeting point.',
    where: '/ideas?filter=mixed',
    done: (q) => !!splitIdea(q)?.decidedBy,
    blocked: noSplit,
  },
  {
    id: 'plan',
    feature: 'prayer',
    title: 'Auto-plan around five prayers',
    story: 'Seven days, ten places, two cities, flights, a train, two hotels — and five prayers a day for three of you.',
    todo: [
      'Plan → Auto-plan → Whole trip. Look over the preview, then apply it.',
      'Open Tue 8 Dec: each prayer time is a fixed block with a mosque or prayer room near your route — and Daniel gets free time nearby instead of waiting.',
    ],
    why: 'Prayer times come from where you are that day. Visits are placed around them and the fixed times (flights, train, check-in), with real travel times; long visits and halal restaurants hold a prayer (step out, pray, come back), and meals land at halal places.',
    where: '/timeline',
    target: 'auto-plan',
    done: (q) => q.jobs.some((j) => j.status === 'applied'),
  },
  {
    id: 'whilePraying',
    feature: 'prayer',
    title: 'While you pray, Daniel isn’t waiting',
    story: 'Daniel doesn’t pray. On most trips he’d stand outside the mosque five times a day. He suggested Tower Records Shibuya — nobody else wanted it, so it’s in the Reserve.',
    todo: [
      'Ideas → Reserve → Tower Records Shibuya → ⋯ → “Good for the others while we pray”.',
      'A moment later Daniel picks it for a prayer break near Shibuya.',
      'Plan → that day → the prayer break: you, Mum and Farid pray, Daniel browses records nearby, and everyone meets back at the same time.',
    ],
    why: 'Mixed groups don’t stall at prayer times: the ones who pray mark places the others would enjoy, the others pick what to do — their own time, no vote — and Safar checks it fits the break and sets where everyone meets again.',
    where: '/ideas?filter=backup',
    done: (q) => q.prayers.some((i) => !!i.prayer?.fillerPicks?.[DEMO_MATES.daniel]),
    blocked: (q) =>
      !q.jobs.some((j) => j.status === 'applied')
        ? 'Do “Auto-plan around five prayers” first — Daniel picks something for one of the prayer breaks on the plan.'
        : !q.ideas.some((i) => /tower records/i.test(i.place.name))
          ? 'This demo trip was made before this step existed — start a new demo to try it, or skip it.'
          : null,
  },
  {
    id: 'radar',
    feature: 'radar',
    title: 'Dinner in Kyoto with the Halal Radar',
    story: 'Thursday evening, just off the train at Kyoto Station. Mum only eats certified halal — where can the four of you have dinner?',
    todo: ['Open Food: it searches around Kyoto Station.', 'Compare the Halal, Pork-free and Not-checked tabs — each place says where its verdict comes from, how far it is and if it’s open.', 'Add one that suits Mum to Ideas (+ Ideas).'],
    why: 'One screen instead of maps, reviews and forums: nearby places sorted by halal level (certified, Muslim-owned, pork-free), with the source of each verdict, walking time, reported queues and a call button to ask.',
    where: `/food?lat=${KYOTO_STATION.lat}&lng=${KYOTO_STATION.lng}&near=${encodeURIComponent('Kyoto Station')}`,
    target: 'radar-add',
    done: (q) => q.ideas.some((i) => i.createdBy === q.uid && i.source.type === 'radar'),
  },
  {
    id: 'delay',
    feature: 'rescue',
    title: 'When the train is late',
    story: 'Thursday morning: snow near Sekigahara. The Nozomi will reach Kyoto 90 minutes late.',
    todo: ['Bookings → the Shinkansen → “Delayed or cancelled?”', 'Upload the delay message, preview, then apply the new plan.', 'Open the Plan on Thu 10 Dec: the day follows the new arrival time.'],
    why: 'Safar reads the operator’s message, moves the train and re-plans the rest of the day around it — prayer times and hotel check-in included — tells everyone, and shows halal food and prayer rooms near where you’re stuck.',
    where: '/bookings',
    target: 'resync-train',
    files: [DEMO_KIT.delay],
    done: (q) => q.incidents.some((i) => i.status === 'applied') || q.bookings.some((b) => b.kind === 'train' && b.endLocal !== '2026-12-10T11:15'),
  },
  {
    id: 'receipt',
    bonus: true,
    title: 'Bonus: split the dinner bill',
    story: 'Aisyah paid ¥38,720 for the halal wagyu dinner on Tuesday night.',
    todo: ['Money → Add expense → scan the receipt.', 'Split it between the four of you and save.'],
    why: 'Receipts are read in any currency and converted to ringgit, and Safar keeps a running tally of who owes whom.',
    where: '/money',
    target: 'add-expense',
    files: [DEMO_KIT.receipt],
    done: (q) => q.expenses.length > 0,
  },
];

export interface QuestProgress {
  done: Set<string>;
  /** The first step not done yet (null = all done). */
  current: QuestStep | null;
  count: number;
}

export function questProgress(q: QuestInput): QuestProgress {
  const done = new Set(QUEST.filter((s) => s.done(q)).map((s) => s.id));
  return { done, current: QUEST.find((s) => !done.has(s.id)) ?? null, count: done.size };
}
