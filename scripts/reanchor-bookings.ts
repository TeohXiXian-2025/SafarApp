// Rebuilds the locked timeline anchors of bookings whose stored anchors no
// longer match bookingAnchors() — e.g. a KL → Bangkok flight saved as one
// 08:00–09:05 block before cross-timezone journeys became two moments.
// Dry run by default.   Usage: npx tsx scripts/reanchor-bookings.ts [--apply]
import { config } from 'dotenv';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Booking, bookingAnchors, paths, ScheduleItem } from '../src/domain/index.js';

config({ path: '.env.local', quiet: true });
const apply = process.argv.includes('--apply');
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT!, 'base64').toString('utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa) }));

const sig = (a: { day: string; start: string; end: string; event: string }) => `${a.event}@${a.day} ${a.start}-${a.end}`;
let fixed = 0;

for (const trip of (await db.collection(paths.trips()).get()).docs) {
  const schedule = db.collection(paths.schedule(trip.id));
  for (const doc of (await db.collection(paths.bookings(trip.id)).get()).docs) {
    const parsed = Booking.safeParse(doc.data());
    if (!parsed.success) continue;
    const b = parsed.data;
    const old = (await schedule.where('ref.bookingId', '==', b.id).get()).docs;
    const want = bookingAnchors(b);
    const have = old.map((d) => d.data()).map((x) => sig({ ...x, event: x.ref.event } as never)).sort();
    if (JSON.stringify(have) === JSON.stringify(want.map(sig).sort())) continue;
    fixed++;
    console.log(`${trip.get('name')} · ${b.kind} ${b.carrier ?? ''} ${b.number ?? ''}: [${have.join(', ')}] → [${want.map(sig).join(', ')}]`);
    if (!apply) continue;
    const batch = db.batch();
    old.forEach((d) => batch.delete(d.ref));
    const updatedBy = old[0]?.get('updatedBy') ?? b.createdBy;
    want.forEach((a, i) => {
      const ref = schedule.doc(`bk_${b.id}_${i}`);
      batch.set(
        ref,
        ScheduleItem.parse({
          id: ref.id, day: a.day, start: a.start, end: a.end,
          ref: { kind: 'booking', bookingId: b.id, event: a.event },
          track: 'all', memberUids: b.travellerUids, locked: true, orderIndex: 0, updatedBy, updatedAt: Date.now(),
        }),
      );
    });
    await batch.commit();
  }
}
console.log(`${fixed} booking(s) ${apply ? 're-anchored' : 'would be re-anchored (dry run — pass --apply)'}`);
