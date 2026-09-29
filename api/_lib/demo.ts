// The demo trip (see src/domain/demo.ts).
//
//   startDemo()        a guest account + a fresh copy of the template trip
//   matesReact()       the travel mates vote and pick middle grounds, through
//                      the same routes (and rules) as people
//   buildTemplate()    (re)builds the template trip, all through those routes
//   deleteExpired()    demo trips (and guest accounts) older than DEMO_TTL_MS
import { randomBytes } from 'node:crypto';
import type { DocumentReference } from 'firebase-admin/firestore';
import {
  DEMO_MATES,
  DEMO_PLAYER,
  DEMO_TRIP_PREFIX,
  DEMO_TTL_MS,
  Idea,
  isDemoMate,
  type GeoPoint,
  nonGoers,
  paths,
  type Conflict,
  type MemberPrefs,
} from '../../src/domain/index.js';
import { internalAuth } from './auth.js';
import { adminAuth, adminDb } from './firebaseAdmin.js';
import { HttpError } from './http.js';
import { searchPlace } from './places.js';
import { deleteTripFiles } from './vault.js';

/** The visitor's part while the template is built (replaced by the guest's id in each copy). */
const TEMPLATE_PLAYER = 'safar-demo-aisyah';

interface DemoConfig {
  templateTripId: string;
  builtAt: number;
}

// ── Acting as someone ─────────────────────────────────────────────────────

/** Calls an API route as a travel mate (or the template's player), in this process. */
export async function callAs(uid: string, route: string, body: unknown, tripId?: string): Promise<{ status: number; body: any }> {
  if (!isDemoMate(uid)) throw new Error('callAs is only for the demo mates');
  const { dispatch } = await import('../_app.js');
  const url = new URL(`http://internal/api/${route}`);
  if (tripId) url.searchParams.set('tripId', tripId);
  const res = await dispatch(new Request(url, { method: 'POST', headers: { authorization: internalAuth(uid), 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }));
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ── The travel mates ──────────────────────────────────────────────────────

interface Persona {
  uid: string;
  name: string;
  prefs: MemberPrefs;
  /** 👎 reason when a restaurant is off limits for them. */
  cantEat: string;
  /** 👍 despite a smaller concern (e.g. alcohol sold at a market). */
  okAnyway: string;
}

const PERSONAS: Persona[] = [
  {
    uid: DEMO_MATES.aminah,
    name: 'Aminah',
    prefs: { halalRequired: true, halalTier: 'certified', prayerReminders: true, pace: 'moderate', interests: ['temples', 'gardens', 'mosques'], hotelPriorities: ['prayer_space_nearby', 'halal_food_nearby'], dailyBudget: 250, hotelBudget: { min: 250, max: 600 } },
    cantEat: 'Mak only eats at certified halal places — this one serves pork.',
    okAnyway: "I'll come along and only eat at the halal places.",
  },
  {
    uid: DEMO_MATES.farid,
    name: 'Farid',
    prefs: { halalRequired: true, halalTier: 'muslim_owned', prayerReminders: true, pace: 'fast', interests: ['anime', 'museums', 'views'], hotelPriorities: ['near_transit'], dailyBudget: 300, hotelBudget: { min: 200, max: 700 } },
    cantEat: 'Pork broth — not halal for me.',
    okAnyway: "Fine for me, I'll skip anything not halal.",
  },
  {
    uid: DEMO_MATES.daniel,
    name: 'Daniel',
    prefs: { halalRequired: false, halalTier: 'certified', prayerReminders: false, pace: 'fast', interests: ['ramen', 'views', 'nightlife'], hotelPriorities: ['near_transit', 'rating_first'], dailyBudget: 350, hotelBudget: { min: 200, max: 700 } },
    cantEat: 'Not for me.',
    okAnyway: 'Sounds good to me!',
  },
];
const PLAYER_PREFS: MemberPrefs = { halalRequired: true, halalTier: 'muslim_owned', prayerReminders: true, pace: 'moderate', interests: ['food', 'temples', 'photography'], hotelPriorities: ['near_transit', 'halal_food_nearby'], dailyBudget: 300, hotelBudget: { min: 250, max: 700 } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A mate's vote: 👍, or 👎 when a restaurant is off limits for them; a smaller concern is confirmed and still 👍. */
async function voteAs(p: Persona, tripId: string, idea: Idea): Promise<string> {
  const up = await callAs(p.uid, 'ideas/vote', { ideaId: idea.id, value: 1 }, tripId);
  if (up.status !== 409) return `${up.status}`;
  const conflicts = ((up.body?.details?.conflicts ?? up.body?.conflicts) ?? []) as Conflict[];
  // A restaurant they can't eat at (pork, not halal enough, marked not halal): any blocker.
  const offLimits = idea.place.category === 'food' && conflicts.some((c) => c.severity === 'blocker');
  if (offLimits) await callAs(p.uid, 'ideas/vote', { ideaId: idea.id, value: -1, tag: 'halal', reason: p.cantEat }, tripId);
  else await callAs(p.uid, 'ideas/vote', { ideaId: idea.id, value: 1, ack: p.okAnyway }, tripId);
  return `409 ${conflicts.map((c) => `${c.kind}/${c.severity}`).join(',')} → ${offLimits ? '👎' : '👍'}`;
}

/**
 * After the visitor does something on a demo trip: every mate who still has
 * to vote does (once the place's halal check is back), and every mate not
 * going to a split idea picks a middle ground (a halal alternative if there
 * is one). Safe to run any number of times.
 */
export async function matesReact(tripId: string): Promise<void> {
  const db = adminDb();
  const [tripSnap, ideaSnap] = await Promise.all([db.doc(paths.trip(tripId)).get(), db.collection(paths.ideas(tripId)).get()]);
  const memberIds = (tripSnap.get('memberIds') as string[] | undefined) ?? [];
  const mates = PERSONAS.filter((p) => memberIds.includes(p.uid));
  for (const doc of ideaSnap.docs) {
    const parsed = Idea.safeParse(doc.data());
    if (!parsed.success) continue;
    const idea = parsed.data;
    if (idea.status === 'voting' && idea.analysis?.status !== 'pending') {
      for (const p of mates.filter((m) => !idea.votes[m.uid])) {
        await sleep(1200); // a moment apart, like people
        await voteAs(p, tripId, idea);
      }
    }
    if (idea.status === 'mixed' && idea.options?.length) {
      const pick = idea.options.find((o) => o.type === 'alternative' && o.place?.halalListed) ?? idea.options.find((o) => o.type === 'alternative') ?? idea.options.find((o) => o.type === 'free_time');
      if (!pick) continue;
      for (const uid of nonGoers(idea, memberIds).filter((u) => isDemoMate(u) && !idea.choices[u])) {
        await sleep(1200);
        await callAs(uid, 'ideas/choose', { ideaId: idea.id, optionId: pick.id }, tripId);
      }
    }
  }
}

// ── A visitor's own copy ──────────────────────────────────────────────────

/** Fields that move with "now" in a copy (not fetchedAt: Google's 30-day caching clock stays). */
const SHIFT = new Set(['at', 'createdAt', 'updatedAt', 'joinedAt', 'votingEndsAt', 'choiceEndsAt']);

function shiftTimes(v: unknown, delta: number): unknown {
  if (Array.isArray(v)) return v.map((x) => shiftTimes(x, delta));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SHIFT.has(k) && typeof x === 'number' ? x + delta : shiftTimes(x, delta)]));
  return v;
}

/** Every document under a trip (all sub-collections, any depth). */
async function allDocs(ref: DocumentReference): Promise<{ path: string; data: Record<string, unknown> }[]> {
  const out: { path: string; data: Record<string, unknown> }[] = [];
  const snap = await ref.get();
  if (snap.exists) out.push({ path: ref.path, data: snap.data()! });
  for (const col of await ref.listCollections()) {
    for (const d of (await col.get()).docs) {
      out.push({ path: d.ref.path, data: d.data() });
      for (const sub of await d.ref.listCollections()) for (const s of (await sub.get()).docs) out.push(...(await allDocs(s.ref)));
    }
  }
  return out;
}

/** Copies the template trip for a guest: new ids, the guest as the player, times moved to now. */
async function copyTemplate(cfg: DemoConfig, guestUid: string): Promise<string> {
  const db = adminDb();
  const tripId = `${DEMO_TRIP_PREFIX}${randomBytes(9).toString('base64url').replace(/[-_]/g, 'x')}`;
  const now = Date.now();
  const docs = await allDocs(db.doc(paths.trip(cfg.templateTripId)));
  if (!docs.length) throw new HttpError(503, 'The demo trip is being set up — try again in a few minutes');
  const swap = (s: string) => s.split(cfg.templateTripId).join(tripId).split(TEMPLATE_PLAYER).join(guestUid);
  let batch = db.batch();
  let n = 0;
  for (const d of docs) {
    const data = shiftTimes(JSON.parse(swap(JSON.stringify(d.data))), now - cfg.builtAt) as Record<string, unknown>;
    if (d.path === paths.trip(cfg.templateTripId)) Object.assign(data, { status: 'planning', demo: { expiresAt: now + DEMO_TTL_MS }, createdAt: now, updatedAt: now });
    batch.set(db.doc(swap(d.path)), data);
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return tripId;
}

/** Guest account + its own demo trip. Returns a sign-in token for the app. */
export async function startDemo(): Promise<{ token: string; tripId: string }> {
  const db = adminDb();
  const cfg = (await db.doc(paths.demoConfig()).get()).data() as DemoConfig | undefined;
  if (!cfg?.templateTripId) throw new HttpError(503, 'The demo trip is being set up — try again in a few minutes');
  const uid = `guest_${randomBytes(12).toString('base64url').replace(/[-_]/g, 'x')}`;
  await adminAuth().createUser({ uid, displayName: DEMO_PLAYER });
  await db.doc(paths.user(uid)).set({ uid, displayName: DEMO_PLAYER, createdAt: Date.now() });
  const tripId = await copyTemplate(cfg, uid);
  const token = await adminAuth().createCustomToken(uid, { demo: true });
  return { token, tripId };
}

/** The guest made a real account (linked Google / email): their demo trip stays. */
export async function keepDemo(tripId: string, uid: string): Promise<void> {
  const user = await adminAuth().getUser(uid);
  if (!user.providerData.length) throw new HttpError(409, 'Sign up first — then the trip is yours to keep');
  await adminDb().doc(paths.trip(tripId)).update({ 'demo.kept': true, updatedAt: Date.now() });
}

/** Deletes demo trips past their time (and guest accounts that never became real ones). */
export async function deleteExpired(now = Date.now()): Promise<number> {
  const db = adminDb();
  const snap = await db.collection(paths.trips()).where('demo.expiresAt', '<', now).limit(50).get();
  let deleted = 0;
  for (const t of snap.docs) {
    if (t.get('demo.kept')) continue;
    const memberIds = (t.get('memberIds') as string[] | undefined) ?? [];
    await db.recursiveDelete(t.ref);
    await deleteTripFiles(t.id, memberIds).catch(() => {});
    for (const uid of memberIds.filter((u) => u.startsWith('guest_'))) {
      const user = await adminAuth().getUser(uid).catch(() => null);
      if (user && user.providerData.length) continue; // they made a real account
      await adminAuth().deleteUser(uid).catch(() => {});
      await db.recursiveDelete(db.doc(paths.user(uid))).catch(() => {});
    }
    deleted++;
  }
  return deleted;
}

// ── The template ──────────────────────────────────────────────────────────

/**
 * The ideas already on the board: search text (or the Google place id, which
 * may be kept indefinitely — no search needed), who suggested it, all agreed?
 * `name`/`at` are used only when Google won't answer (daily limit): the place
 * then comes from the backup sources, still under its Google key.
 */
const TEMPLATE_IDEAS: { q: string; name: string; at: GeoPoint; placeId?: string; near: 'tokyo' | 'kyoto'; by: string; agreed: boolean }[] = [
  { q: 'Senso-ji Temple Asakusa', name: 'Sensō-ji', at: { lat: 35.7134, lng: 139.79553 }, placeId: 'ChIJ8T1GpMGOGGARDYGSgpooDWw', near: 'tokyo', by: DEMO_MATES.aminah, agreed: true },
  { q: 'teamLab Planets TOKYO', name: 'teamLab Planets TOKYO', at: { lat: 35.64938, lng: 139.78973 }, placeId: 'ChIJSeco5wiJGGARItbTS8lQ5G0', near: 'tokyo', by: DEMO_MATES.farid, agreed: true },
  { q: 'Tokyo Camii & Diyanet Turkish Culture Center', name: 'Tokyo Camii', at: { lat: 35.66817, lng: 139.67655 }, placeId: 'ChIJFUO-WUfzGGARhzhX4px1Jsc', near: 'tokyo', by: DEMO_MATES.aminah, agreed: true },
  { q: 'SHIBUYA SKY', name: 'Shibuya Sky', at: { lat: 35.65829, lng: 139.70226 }, placeId: 'ChIJ4Rr2JWiLGGARcyRSHuZ-9G8', near: 'tokyo', by: DEMO_MATES.daniel, agreed: true },
  { q: 'Halal Wagyu Yakiniku Panga Asakusa', name: 'Halal Wagyu Yakiniku Panga', at: { lat: 35.70485, lng: 139.781 }, placeId: 'ChIJdzczsDuPGGARHhw2tyh5Dt0', near: 'tokyo', by: TEMPLATE_PLAYER, agreed: true },
  { q: 'Fushimi Inari Taisha', name: 'Fushimi Inari Taisha', at: { lat: 34.96752, lng: 135.77971 }, placeId: 'ChIJIW0uPRUPAWAR6eI6dRzKGns', near: 'kyoto', by: DEMO_MATES.farid, agreed: true },
  { q: 'Kiyomizu-dera', name: 'Kiyomizu-dera', at: { lat: 34.9943, lng: 135.78444 }, placeId: 'ChIJB_vchdMIAWARujTEUIZlr2I', near: 'kyoto', by: DEMO_MATES.aminah, agreed: true },
  // Daniel's pick: the others can't eat there — waiting for the visitor's vote.
  { q: 'Ichiran Shibuya', name: 'Ichiran Shibuya', at: { lat: 35.66113, lng: 139.70099 }, placeId: 'ChIJOWucdKiMGGARbppa4b4CKA8', near: 'tokyo', by: DEMO_MATES.daniel, agreed: false },
];

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const KYOTO = { lat: 34.9858, lng: 135.7588 };

/**
 * (Re)builds the template trip through the API as its four people, then
 * points config/demo at it. New copies use it at once; the old one is deleted.
 */
export async function buildTemplate(log: (s: string) => void = console.log): Promise<{ templateTripId: string; ideas: number }> {
  const db = adminDb();
  const people = [{ uid: TEMPLATE_PLAYER, name: DEMO_PLAYER, prefs: PLAYER_PREFS }, ...PERSONAS];
  for (const p of people) await db.doc(paths.user(p.uid)).set({ uid: p.uid, displayName: p.name, createdAt: Date.now() });

  const created = await callAs(TEMPLATE_PLAYER, 'trips/create', {
    name: 'Japan in December',
    destinations: [
      { name: 'Tokyo', location: TOKYO, countryCode: 'JP', arriveDate: '2026-12-07', leaveDate: '2026-12-10' },
      { name: 'Kyoto', location: KYOTO, countryCode: 'JP', arriveDate: '2026-12-10', leaveDate: '2026-12-13' },
    ],
    startDate: '2026-12-07',
    endDate: '2026-12-13',
    currency: 'MYR',
  });
  if (created.status !== 201) throw new HttpError(502, `trips/create: ${JSON.stringify(created.body)}`);
  const tripId = created.body.tripId as string;
  log(`template trip ${tripId}`);
  try {
    return await fillTemplate(tripId, people, log);
  } catch (err) {
    await db.recursiveDelete(db.doc(paths.trip(tripId))); // a half-built template is never used
    throw err;
  }
}

async function fillTemplate(tripId: string, people: { uid: string; prefs: MemberPrefs }[], log: (s: string) => void): Promise<{ templateTripId: string; ideas: number }> {
  const db = adminDb();

  const invite = await callAs(TEMPLATE_PLAYER, 'invites/create', {}, tripId);
  for (const p of PERSONAS) {
    const r = await callAs(p.uid, 'invites/accept', { token: invite.body.token });
    if (r.status >= 300) throw new HttpError(502, `invites/accept ${p.name}: ${JSON.stringify(r.body)}`);
  }
  for (const p of people) await db.doc(paths.member(tripId, p.uid)).update({ prefs: p.prefs });

  const player: Persona = { uid: TEMPLATE_PLAYER, name: DEMO_PLAYER, prefs: PLAYER_PREFS, cantEat: 'Not halal for me.', okAnyway: "I'll only eat at the halal places." };
  let ideas = 0;
  for (const t of TEMPLATE_IDEAS) {
    const placeId = t.placeId ?? (await searchPlace(t.q, t.near === 'tokyo' ? TOKYO : KYOTO))?.placeId;
    if (!placeId) throw new HttpError(502, `Not found on the map: ${t.q} (Google's daily search limit may be used up — try after it resets)`);
    if (!t.placeId) log(`  ${t.q} → placeId ${placeId}`);
    const added = await callAs(t.by, 'ideas/add', { placeId, place: { name: t.name, location: t.at } }, tripId);
    if (added.status >= 300) throw new HttpError(502, `ideas/add ${t.q}: ${JSON.stringify(added.body)}`);
    const ideaId = added.body.id as string;
    await callAs(t.by, 'ideas/analyze', { ideaId }, tripId);
    const idea = Idea.parse((await db.doc(`${paths.ideas(tripId)}/${ideaId}`).get()).data());
    // Everyone agreed (the player too); Ichiran waits for the player, the mates vote as themselves.
    for (const p of t.agreed ? [player, ...PERSONAS] : PERSONAS) {
      if (t.agreed) {
        const up = await callAs(p.uid, 'ideas/vote', { ideaId, value: 1 }, tripId);
        if (up.status === 409) await callAs(p.uid, 'ideas/vote', { ideaId, value: 1, ack: p.okAnyway }, tripId);
      } else log(`    ${p.name} on ${idea.place.name} (${idea.place.category}): ${await voteAs(p, tripId, idea)}`);
    }
    const after = Idea.parse((await db.doc(`${paths.ideas(tripId)}/${ideaId}`).get()).data());
    // The story needs the real checks: a place without its halal check would get the wrong votes.
    if (after.analysis?.status !== 'done') throw new HttpError(502, `${after.place.name}: the halal check didn't finish (${after.analysis?.error ?? 'no result'}) — Google's daily limit may be used up; build again later`);
    if (!t.agreed && !Object.values(after.votes).some((v) => v.value === -1)) throw new HttpError(502, `${after.place.name}: nobody voted 👎 — its halal check found no problem, so the split step wouldn't happen`);
    log(`  ${after.place.name}: ${after.status}${after.halal ? ` (${after.halal.verdict}${after.halal.tier ? `, ${after.halal.tier}` : ''})` : ''}`);
    ideas++;
  }

  // Out of the hourly reminders; each copy is set back to "planning".
  const builtAt = Date.now();
  await db.doc(paths.trip(tripId)).update({ status: 'archived', updatedAt: builtAt });
  const old = (await db.doc(paths.demoConfig()).get()).data() as DemoConfig | undefined;
  await db.doc(paths.demoConfig()).set({ templateTripId: tripId, builtAt } satisfies DemoConfig);
  if (old?.templateTripId && old.templateTripId !== tripId) await db.recursiveDelete(db.doc(paths.trip(old.templateTripId)));
  return { templateTripId: tripId, ideas };
}
