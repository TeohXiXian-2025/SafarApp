// The demo trip's guided "Trip Quest": ten steps through what makes Safar
// different. Each step is done when the trip's real data says so (not when a
// button was clicked), so the guide survives refreshes and can't get stuck.
import { DEMO_KIT, DEMO_SPLIT_PLACE, type ArrangeJob, type Booking, type DemoFile, type Expense, type Idea, type Incident } from '../../domain';

export interface QuestInput {
  uid: string;
  bookings: Booking[];
  ideas: Idea[];
  jobs: ArrangeJob[];
  expenses: Expense[];
  incidents: Incident[];
  /** Pages this visitor opened in this trip (for "have a look" steps). */
  seen: Set<string>;
  /** Your Document Vault has a passport (asked from the server; null = not known yet). */
  hasPassport: boolean | null;
}

export interface QuestStep {
  id: string;
  title: string;
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
  done: (q: QuestInput) => boolean;
}

const isSplitPlace = (i: Idea) => i.place.name.toLowerCase().includes(DEMO_SPLIT_PLACE.toLowerCase()); // Google writes it "ICHIRAN"
const splitIdea = (q: QuestInput) => q.ideas.find((i) => isSplitPlace(i) && !i.splitId) ?? q.ideas.find(isSplitPlace);

export const QUEST: QuestStep[] = [
  {
    id: 'group',
    title: 'Meet your group',
    story: "You're Aisyah, planning a week in Japan for your mum Aminah, your brother Farid and his friend Daniel. Four people, four different sets of needs.",
    todo: ['Open People and read what everyone needs: halal level, prayer times, pace and budget.'],
    why: 'Safar merges everyone into one set of group rules — the strictest halal level for shared meals, prayer breaks only for the people who pray, the slowest pace.',
    where: '/members',
    done: (q) => q.seen.has('members'),
  },
  {
    id: 'flight',
    title: 'Add your flights',
    story: 'The tickets are booked: KL → Tokyo on Monday 7 Dec, and home from Osaka on Sunday 13 Dec.',
    todo: ['Download the flight e-ticket below.', 'Bookings → Add ticket or hotel → upload it.', 'Check what the AI read, then save.'],
    why: 'One PDF becomes two flights, matched to all four travellers. Their times become fixed on the Plan, in each airport’s own time zone, and the prayer times during the flights are worked out.',
    where: '/bookings',
    target: 'add-booking',
    files: [DEMO_KIT.flight],
    done: (q) => q.bookings.filter((b) => b.kind === 'flight').length >= 2,
  },
  {
    id: 'stays',
    title: 'Hotels and the bullet train',
    story: 'Three nights in Asakusa, the Shinkansen to Kyoto on Thursday morning, three nights at Kyoto Station.',
    todo: ['Upload the two hotel confirmations and the Shinkansen ticket the same way.'],
    why: 'Check-in and the train become fixed times. Each day now knows which city you are in and where it starts — nothing gets planned before you land or while you are on the train.',
    where: '/bookings',
    target: 'add-booking',
    files: [DEMO_KIT.hotelTokyo, DEMO_KIT.train, DEMO_KIT.hotelKyoto],
    done: (q) => q.bookings.filter((b) => b.kind === 'hotel').length >= 2 && q.bookings.some((b) => b.kind === 'train'),
  },
  {
    id: 'post',
    title: 'Turn a post into plans',
    story: 'Farid sent an Instagram post: three Kyoto must-sees for Muslim travellers.',
    todo: ['Ideas → Add place or link → upload the screenshot.', 'Pick the places the AI found and add them.', 'Watch the others vote a moment later — then vote 👍 yourself, so they are agreed.'],
    why: 'Safar reads screenshots, TikTok, Instagram and Xiaohongshu links, finds each place on the map, and checks it: halal status (with where that comes from), alcohol, and the nearest place to pray.',
    where: '/ideas',
    target: 'add-idea',
    files: [DEMO_KIT.post],
    done: (q) => q.ideas.some((i) => i.createdBy === q.uid && i.source.type === 'screenshot'),
  },
  {
    id: 'vote',
    title: "Vote on Daniel's ramen",
    story: 'Daniel really wants Ichiran ramen in Shibuya. Mum and Farid voted 👎 — the broth is pork. You don’t mind keeping Daniel company over a cup of tea.',
    todo: ['Ideas → Vote now → vote 👍 on Ichiran.', 'Safar asks you to confirm, because it isn’t halal for you — write “I’ll keep Daniel company and just have tea.”'],
    why: 'Votes carry reasons. When some are in and some are out, Safar doesn’t just pick the majority — it looks for a way everyone gets a good meal.',
    where: '/ideas?filter=voting',
    done: (q) => !!splitIdea(q)?.votes[q.uid],
  },
  {
    id: 'split',
    title: 'Settle the split',
    story: 'Two for, two against: it needs a decision. Safar found halal places a few minutes away, and Mum and Farid each picked where they’ll eat instead.',
    todo: ['Ideas → Needs a decision → open Ichiran.', 'See where Mum and Farid will eat instead.', 'As the admin, accept it: you and Daniel go to Ichiran, Mum and Farid eat halal nearby, and everyone meets back after.'],
    why: 'Mixed groups don’t have to choose one restaurant for everyone: Safar splits the group for an hour, times both meals and sets a meeting point.',
    where: '/ideas?filter=mixed',
    done: (q) => !!splitIdea(q)?.decidedBy,
  },
  {
    id: 'plan',
    title: 'Auto-plan the whole trip',
    story: 'Seven days, ten places, two cities, flights, a train, two hotels — and five prayers a day for three of you.',
    todo: ['Plan → Auto-plan → the whole trip.', 'Look over the preview, then apply it.'],
    why: 'Every visit is placed around the fixed times (flights, train, check-in), prayer breaks are added at a mosque or prayer room nearby with the walk counted, travel times come from real routes, and meals land at halal places.',
    where: '/timeline',
    target: 'auto-plan',
    done: (q) => q.jobs.some((j) => j.status === 'applied'),
  },
  {
    id: 'passport',
    title: 'Check your documents',
    story: 'Aisyah’s passport expires in April 2027 — is that a problem for this trip?',
    todo: ['Bookings → Documents → agree, then upload the passport (a specimen).', 'Read the checks Safar runs for Japan.'],
    why: 'Documents are read by AI but stay private to you. Safar cross-checks them with the trip: validity after you travel, visa rules, travel dates with no hotel or no ticket home.',
    where: '/bookings?tab=documents',
    target: 'vault-upload',
    files: [DEMO_KIT.passport],
    done: (q) => q.hasPassport === true,
  },
  {
    id: 'receipt',
    title: 'Split the dinner bill',
    story: 'Aisyah paid ¥38,720 for the halal wagyu dinner on Tuesday night.',
    todo: ['Money → Add expense → scan the receipt.', 'Split it between the four of you and save.'],
    why: 'Receipts are read in any currency and converted to ringgit, and Safar keeps a running tally of who owes whom.',
    where: '/money',
    target: 'add-expense',
    files: [DEMO_KIT.receipt],
    done: (q) => q.expenses.length > 0,
  },
  {
    id: 'delay',
    title: 'When the train is late',
    story: 'Thursday morning: snow near Sekigahara. The Nozomi will reach Kyoto 90 minutes late.',
    todo: ['Bookings → the Shinkansen → “Delayed or cancelled?”', 'Upload the delay message, then apply the new plan.'],
    why: 'Safar reads the operator’s message, moves the train, and re-plans the rest of the day around it — prayer times and hotel check-in included — so no one has to redo the day by hand.',
    where: '/bookings',
    target: 'resync-train',
    files: [DEMO_KIT.delay],
    done: (q) => q.incidents.some((i) => i.status === 'applied') || q.bookings.some((b) => b.kind === 'train' && b.endLocal !== '2026-12-10T11:15'),
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
