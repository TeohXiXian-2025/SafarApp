import { z } from 'zod';
import {
  HalalReport,
  HalalSummary,
  HalalTier,
  Id,
  Idea,
  IdeaSource,
  ideaStatusFromVotes,
  paths,
  summarizeReports,
  tallyVotes,
  type Member,
} from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { adminBucket, adminDb } from '../_lib/firebaseAdmin.js';
import { analyzePlace } from '../_lib/halal.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { DEFAULT_DURATION, placeDetails } from '../_lib/places.js';
import type { RouteTable } from '../_lib/routes.js';
import { extractCandidates, fetchPost, parseShareInput } from '../_lib/social.js';
import { loadTrip, logActivity } from '../_lib/trip.js';

const ANALYSIS_TTL = 14 * 86_400_000;
const ideaRef = (tripId: string, id: string) => adminDb().doc(paths.idea(tripId, id));

async function loadIdea(tripId: string, id: string): Promise<Idea> {
  const snap = await ideaRef(tripId, id).get();
  if (!snap.exists) throw new HttpError(404, 'Idea not found');
  return Idea.parse(snap.data());
}

const canManage = (idea: Idea, m: Member) => idea.createdBy === m.uid || m.role === 'admin';

// ─── Routes ──────────────────────────────────────────────────────────────────

export const ideaRoutes: RouteTable = {
  /**
   * Link (or an app's copied share text) / screenshots / caption → candidate
   * places. Nothing is saved yet.
   */
  'POST ideas/import': withTrip(
    async (req, { tripId, user }) => {
      const body = await readJson(
        req,
        z.union([
          z.object({ url: z.string().min(8).max(5000) }),
          z.object({ text: z.string().min(8).max(5000) }),
          z.object({ storagePaths: z.array(z.string().max(300)).min(1).max(4) }),
          z.object({ storagePath: z.string().max(300) }),
        ]),
      );
      const trip = await loadTrip(tripId);
      const platform = { instagram: 'Instagram', xiaohongshu: 'Xiaohongshu', tiktok: 'TikTok', youtube: 'YouTube' } as const;

      let source: IdeaSource;
      const parts: import('@google/genai').Part[] = [];
      if ('url' in body) {
        const { url, type, extraText } = parseShareInput(body.url);
        const post = await fetchPost(url, type);
        if (!post?.caption && !post?.image && !extraText) {
          return json({
            source: { type, url: url.href },
            candidates: [],
            unresolved: [],
            skippedRegions: [],
            needsScreenshot: true,
            message:
              type === 'xiaohongshu'
                ? "Xiaohongshu doesn't let other apps read its posts. In the app, tap Share → Copy link and paste the whole copied text here — or upload screenshots of the post's photos."
                : `${platform[type]} didn't share this post with us. Upload screenshots of the post (up to 4) instead.`,
          });
        }
        const caption = [post?.caption, extraText].filter(Boolean).join('\n\n');
        source = {
          type,
          url: (post?.finalUrl ?? url.href).slice(0, 2000),
          ...(caption ? { caption: caption.slice(0, 2000) } : {}),
          ...(post?.author ? { author: post.author.slice(0, 120) } : {}),
        };
        if (post?.caption) parts.push({ text: `Post caption:
${post.caption}` });
        if (extraText) parts.push({ text: `Text shared with the link:
${extraText}` });
        if (post?.image) parts.push(post.image, { text: "Above: the post's cover image / thumbnail (may show place names)." });
      } else if ('text' in body) {
        source = { type: 'text', caption: body.text.slice(0, 2000) };
        parts.push({ text: `Post caption:
${body.text}` });
      } else {
        const storagePaths = 'storagePaths' in body ? body.storagePaths : [body.storagePath];
        const prefix = `trips/${tripId}/users/${user.uid}/`;
        for (const path of storagePaths) {
          if (!path.startsWith(prefix) || path.includes('..')) throw new HttpError(403, 'Invalid upload');
          const file = adminBucket().file(path);
          const [meta] = await file.getMetadata().catch(() => {
            throw new HttpError(404, 'Upload not found — please upload it again');
          });
          const type = String(meta.contentType ?? '');
          if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(type)) throw new HttpError(415, 'Upload screenshots (images)');
          const [buf] = await file.download();
          parts.push({ inlineData: { mimeType: type, data: buf.toString('base64') } });
        }
        source = { type: 'screenshot' };
        parts.push({ text: `These are ${storagePaths.length} screenshot(s) of one travel post (photos, video frames or its caption).` });
      }

      // For links the cover image is a bonus; screenshots ARE the content.
      const { candidates, unresolved, skippedRegions } = await extractCandidates(parts, trip.destinations, { imagesOptional: 'url' in body });
      if (!candidates.length) {
        const video = source.type === 'instagram' || source.type === 'tiktok' || source.type === 'youtube';
        return json({
          source,
          candidates,
          unresolved,
          skippedRegions,
          needsScreenshot: source.type !== 'screenshot',
          message: unresolved.length
            ? `Found ${unresolved.join(', ')} but couldn't locate ${unresolved.length === 1 ? 'it' : 'them'} on the map. Try searching instead.`
            : video
              ? `This post's caption doesn't name specific places${skippedRegions.length ? ` (only ${skippedRegions.join(', ')})` : ''} — they're probably only shown in the video. Pause on the moments that show each place's name and upload those screenshots (up to 4).`
              : `No specific places found${skippedRegions.length ? ` — only ${skippedRegions.join(', ')}` : ''}. Try screenshots that show the place names, or search the place.`,
        });
      }
      return json({ source, candidates, unresolved, skippedRegions });
    },
    { perMinute: 8 },
  ),

  /** Add a place to the Idea Board (any member). */
  'POST ideas/add': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(
        req,
        z.object({ placeId: z.string().min(3).max(300), source: IdeaSource.default({ type: 'manual' }), notes: z.string().max(1000).optional() }),
      );
      const placeKey = paths.placeKey({ placeId: body.placeId });
      const existing = await adminDb().collection(paths.ideas(tripId)).where('placeKey', '==', placeKey).limit(1).get();
      if (!existing.empty) return json({ id: existing.docs[0].id, duplicate: true });

      const { place } = await placeDetails(body.placeId);
      const ref = adminDb().collection(paths.ideas(tripId)).doc();
      const now = Date.now();
      const idea = Idea.parse({
        id: ref.id,
        placeKey,
        place,
        source: body.source,
        ...(body.notes ? { notes: body.notes } : {}),
        estDurationMin: DEFAULT_DURATION[place.category],
        analysis: { status: 'pending', at: now },
        status: 'voting',
        votes: {},
        createdBy: member.uid,
        createdAt: now,
        updatedAt: now,
      });
      const batch = adminDb().batch();
      batch.set(ref, idea);
      logActivity(batch, tripId, member.uid, `${member.displayName} suggested ${place.name}`);
      await batch.commit();
      return json({ id: ref.id, duplicate: false }, { status: 201 });
    },
    { perMinute: 30 },
  ),

  /** Halal Radar + review analysis for an idea (cached per place for 14 days). */
  'POST ideas/analyze': withTrip(
    async (req, { tripId }) => {
      const { ideaId, force } = await readJson(req, z.object({ ideaId: Id, force: z.boolean().default(false) }));
      const idea = await loadIdea(tripId, ideaId);
      const cacheRef = adminDb().doc(`placesCache/${idea.placeKey}`);

      const cached = force ? null : (await cacheRef.get()).data();
      let result: { halal: Idea['halal']; sentiment?: Idea['sentiment'] };
      if (cached && Date.now() - Number(cached.at) < ANALYSIS_TTL) {
        result = { halal: cached.halal, ...(cached.sentiment ? { sentiment: cached.sentiment } : {}) };
      } else {
        await ideaRef(tripId, ideaId).update({ analysis: { status: 'pending', at: Date.now() } });
        try {
          const details = await placeDetails(idea.place.placeId!, { forAnalysis: true });
          result = await analyzePlace(details);
          await cacheRef.set({ ...result, at: Date.now() });
        } catch (err) {
          const message = err instanceof HttpError ? err.message : 'Analysis failed';
          await ideaRef(tripId, ideaId).update({ analysis: { status: 'error', at: Date.now(), error: message.slice(0, 300) } });
          throw err;
        }
      }
      await ideaRef(tripId, ideaId).update({
        halal: result.halal,
        ...(result.sentiment ? { sentiment: result.sentiment } : {}),
        analysis: { status: 'done', at: Date.now() },
        updatedAt: Date.now(),
      });
      return json(result);
    },
    { perMinute: 20 },
  ),

  /** 👍 / 👎 (value 1 / -1), or 0 to take your vote back. Recomputes the idea's status. */
  'POST ideas/vote': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, value: z.union([z.literal(1), z.literal(-1), z.literal(0)]), reason: z.string().max(300).optional() }));
      const db = adminDb();
      const status = await db.runTransaction(async (tx) => {
        const trip = await loadTrip(tripId, tx);
        const snap = await tx.get(ideaRef(tripId, body.ideaId));
        if (!snap.exists) throw new HttpError(404, 'Idea not found');
        const idea = Idea.parse(snap.data());
        if (!['voting', 'mixed', 'backlog', 'rejected'].includes(idea.status) || idea.decidedBy) {
          throw new HttpError(409, 'Voting on this idea is closed');
        }
        const votes = { ...idea.votes };
        if (body.value === 0) delete votes[member.uid];
        else votes[member.uid] = { value: body.value, ...(body.reason ? { reason: body.reason } : {}), at: Date.now() };
        const next = ideaStatusFromVotes(tallyVotes(votes, trip.memberIds));
        tx.update(snap.ref, { votes, status: next, updatedAt: Date.now() });
        if (next !== idea.status && next !== 'voting') {
          const label = { backlog: 'everyone approved it — added to the backlog', rejected: 'everyone passed on it', mixed: 'votes are split' }[next];
          logActivity(tx, tripId, 'system', `${idea.place.name}: ${label}`);
        }
        return next;
      });
      return json({ status });
    },
    { perMinute: 60 },
  ),

  /** Admin: close voting early, or force the outcome. */
  'POST ideas/decide': withTrip(
    async (req, { tripId, member }) => {
      const { ideaId, action } = await readJson(req, z.object({ ideaId: Id, action: z.enum(['close', 'backlog', 'reject', 'reopen']) }));
      const db = adminDb();
      const status = await db.runTransaction(async (tx) => {
        const trip = await loadTrip(tripId, tx);
        const snap = await tx.get(ideaRef(tripId, ideaId));
        if (!snap.exists) throw new HttpError(404, 'Idea not found');
        const idea = Idea.parse(snap.data());
        const tally = tallyVotes(idea.votes, trip.memberIds);
        const next =
          action === 'close' ? ideaStatusFromVotes(tally, true) : action === 'backlog' ? 'backlog' : action === 'reject' ? 'rejected' : ideaStatusFromVotes(tally);
        tx.update(snap.ref, {
          status: next,
          ...(action === 'reopen' ? { decidedBy: null } : { decidedBy: member.uid }),
          updatedAt: Date.now(),
        });
        const verb = { close: `closed voting on ${idea.place.name} (${next})`, backlog: `moved ${idea.place.name} to the backlog`, reject: `rejected ${idea.place.name}`, reopen: `reopened voting on ${idea.place.name}` }[action];
        logActivity(tx, tripId, member.uid, `${member.displayName} ${verb}`);
        return next;
      });
      return json({ status });
    },
    { admin: true, perMinute: 30 },
  ),

  /** Remove an idea (its author or the admin). */
  'POST ideas/delete': withTrip(
    async (req, { tripId, member }) => {
      const { ideaId } = await readJson(req, z.object({ ideaId: Id }));
      const idea = await loadIdea(tripId, ideaId);
      if (!canManage(idea, member)) throw new HttpError(403, 'Only the person who suggested this, or the admin, can remove it');
      const batch = adminDb().batch();
      batch.delete(ideaRef(tripId, ideaId));
      logActivity(batch, tripId, member.uid, `${member.displayName} removed ${idea.place.name}`);
      await batch.commit();
      return json({ ok: true });
    },
    { perMinute: 30 },
  ),

  /** Community halal report for a place on this trip's board. One per user per place; updates replace. */
  'POST halal/report': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(
        req,
        z.object({
          ideaId: Id,
          tier: HalalTier,
          flags: HalalReport.shape.flags.default({}),
          note: z.string().max(500).optional(),
        }),
      );
      const idea = await loadIdea(tripId, body.ideaId);
      const db = adminDb();
      const now = Date.now();
      const reportRef = db.doc(paths.halalReport(idea.placeKey, member.uid));
      const prev = await reportRef.get();
      await reportRef.set(
        HalalReport.parse({
          uid: member.uid,
          tier: body.tier,
          flags: body.flags,
          ...(body.note ? { note: body.note } : {}),
          createdAt: prev.exists ? Number(prev.data()!.createdAt) : now,
          updatedAt: now,
        }),
      );

      const all = await db.collection(paths.halalReports(idea.placeKey)).get();
      const summary = HalalSummary.parse({
        placeKey: idea.placeKey,
        name: idea.place.name,
        ...summarizeReports(all.docs.map((d) => HalalReport.parse(d.data()))),
        updatedAt: now,
      });
      await db.doc(paths.halalSummary(idea.placeKey)).set(summary);
      return json(summary);
    },
    { perMinute: 10 },
  ),
};
