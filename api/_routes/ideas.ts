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
  placeIsStale,
  ideaItemId,
  conflictKey,
  ideaConflicts,
  visitPlan,
  windowText,
  Member as MemberSchema,
  type Member,
} from '../../src/domain/index.js';
import { Type } from '@google/genai';
import { extractJson } from '../_lib/gemini.js';
import { withTrip } from '../_lib/auth.js';
import { adminBucket, adminDb } from '../_lib/firebaseAdmin.js';
import { analyzePlace } from '../_lib/halal.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { DEFAULT_DURATION, photoUrl, placeDetails } from '../_lib/places.js';
import type { RouteTable } from '../_lib/routes.js';
import { downloadMedia, extractCandidates, fetchPost, imagePart, parseShareInput } from '../_lib/social.js';
import { fetchRichPost } from '../_lib/socialProviders.js';
import { transcribe } from '../_lib/groq.js';
import type { Part } from '@google/genai';
import { loadTrip, logActivity } from '../_lib/trip.js';
import { useDailyQuota } from '../_lib/quota.js';

const ANALYSIS_TTL = 14 * 86_400_000;
/** Bump when the analysis format changes so cached results are redone. */
const ANALYSIS_VERSION = 3;
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
   * Find places in a social post. Any combination of:
   *   url           — a link or an app's copied share text
   *   storagePaths  — screenshots and/or screen-recording frames (≤ 8)
   *   audioPath     — a screen recording's audio (speech → text)
   *   text          — a pasted caption
   * Links go through three layers: (1) free-credit readers for the FULL post
   * (all images + the video's speech), else (2) free built-in readers
   * (embed/oEmbed/share text), else (3) ask for a screen recording/screenshots.
   * Nothing is saved yet.
   */
  'POST ideas/import': withTrip(
    async (req, { tripId, user }) => {
      const started = Date.now();
      const raw = await readJson(
        req,
        z
          .object({
            url: z.string().min(8).max(5000).optional(),
            text: z.string().min(8).max(5000).optional(),
            storagePaths: z.array(z.string().max(300)).min(1).max(8).optional(),
            storagePath: z.string().max(300).optional(), // older clients
            audioPath: z.string().max(300).optional(),
          })
          .refine((b) => b.url || b.text || b.storagePaths || b.storagePath || b.audioPath, 'Send a link, screenshots, a recording or a caption'),
      );
      const storagePaths = raw.storagePaths ?? (raw.storagePath ? [raw.storagePath] : []);
      await useDailyQuota(user.uid, 'import');
      const trip = await loadTrip(tripId);
      const platform = { instagram: 'Instagram', xiaohongshu: 'Xiaohongshu', tiktok: 'TikTok', youtube: 'YouTube' } as const;
      const parts: Part[] = [];
      const captions: string[] = [];
      let source: IdeaSource = { type: storagePaths.length || raw.audioPath ? 'screenshot' : 'text' };
      const used = { provider: null as string | null, images: 0, transcript: false, skipped: null as string | null };

      // Uploaded files must be the caller's own, for this trip.
      const prefix = `trips/${tripId}/users/${user.uid}/`;
      const ownFile = async (path: string, allowed: RegExp) => {
        if (!path.startsWith(prefix) || path.includes('..')) throw new HttpError(403, 'Invalid upload');
        const file = adminBucket().file(path);
        const [meta] = await file.getMetadata().catch(() => {
          throw new HttpError(404, 'Upload not found — please upload it again');
        });
        const type = String(meta.contentType ?? '');
        if (!allowed.test(type)) throw new HttpError(415, 'Unsupported file type');
        const [buf] = await file.download();
        return { buf, type };
      };

      // ── Link ──────────────────────────────────────────────────────────
      if (raw.url) {
        const { url, type, extraText } = parseShareInput(raw.url);
        source = { type, url: url.href.slice(0, 2000) };
        if (extraText) {
          captions.push(extraText);
          parts.push({ text: `Text shared with the link:\n${extraText}` });
        }

        // Layer 1: full post from a free-credit reader (all images + video speech).
        const { post: rich, skipped } = await fetchRichPost(url, type);
        if (skipped) used.skipped = skipped;
        if (rich) {
          used.provider = rich.provider;
          if (rich.caption) {
            captions.push(rich.caption);
            parts.push({ text: `Post caption:\n${rich.caption}` });
          }
          if (rich.location) parts.push({ text: `Location tagged on the post: ${rich.location}` });
          if (rich.author) source.author = rich.author.slice(0, 120);
          const [images, transcript] = await Promise.all([
            Promise.all(rich.imageUrls.slice(0, 8).map((u) => imagePart(u))),
            rich.videoUrl && !raw.audioPath
              ? downloadMedia(rich.videoUrl).then((m) => (m ? transcribe(m.data, m.mimeType, 'video.mp4') : null))
              : Promise.resolve(null),
          ]);
          for (const img of images) if (img) parts.push(img), used.images++;
          if (used.images) parts.push({ text: `Above: ${used.images} photo(s) from the post (place names are often written on them).` });
          if (transcript) {
            used.transcript = true;
            parts.push({ text: `What is said in the post's video (auto transcript):\n${transcript}` });
          }
        }

        // Layer 2: free built-in readers (embed page / oEmbed / Open Graph).
        if (!rich || (!rich.caption && !used.images)) {
          const post = await fetchPost(url, type);
          if (post?.caption) {
            captions.push(post.caption);
            parts.push({ text: `Post caption:\n${post.caption}` });
          }
          if (post?.image) parts.push(post.image, { text: "Above: the post's cover image / thumbnail (may show place names)." });
          if (post?.author) source.author = post.author.slice(0, 120);
          if (post?.finalUrl) source.url = post.finalUrl.slice(0, 2000);
        }
      }

      // ── Pasted caption ────────────────────────────────────────────────
      if (raw.text) {
        captions.push(raw.text);
        parts.push({ text: `Post caption:\n${raw.text}` });
      }

      // ── Screenshots / recording frames ───────────────────────────────
      for (const path of storagePaths) {
        const { buf, type } = await ownFile(path, /^image\/(jpeg|png|webp|heic|heif)$/);
        parts.push({ inlineData: { mimeType: type, data: buf.toString('base64') } });
      }
      if (storagePaths.length) {
        used.images += storagePaths.length;
        parts.push({ text: `Above: ${storagePaths.length} screenshot(s) or frame(s) of the post (photos, video moments or its caption).` });
      }

      // ── Recording audio → speech to text ─────────────────────────────
      if (raw.audioPath) {
        const { buf, type } = await ownFile(raw.audioPath, /^audio\/(wav|x-wav|webm|mp4|m4a|mpeg|ogg)$/);
        const transcript = await transcribe(buf, type, `recording.${type.split('/')[1].replace('x-', '')}`);
        if (transcript) {
          used.transcript = true;
          parts.push({ text: `What is said in the recording (auto transcript):\n${transcript}` });
        }
      }

      if (captions.length) source.caption = captions.join('\n\n').slice(0, 2000);

      // Layer 3: nothing to read at all → ask for a recording/screenshots.
      if (!parts.length) {
        return json({
          source,
          candidates: [],
          unresolved: [],
          skippedRegions: [],
          used,
          needsScreenshot: true,
          message:
            source.type === 'xiaohongshu'
              ? "Xiaohongshu doesn't let other apps read its posts. In the app, tap Share → Copy link and paste the whole copied text here — or upload a screen recording / screenshots of the note."
              : `${platform[source.type as keyof typeof platform] ?? 'That site'} didn't share this post with us. Upload a screen recording or screenshots of it instead.`,
        });
      }

      // Links: images are a bonus (text-only fallback if no vision model is free).
      const { candidates, unresolved, skippedRegions } = await extractCandidates(parts, trip.destinations, {
        imagesOptional: !!raw.url && !storagePaths.length,
        budgetMs: Math.max(20_000, 100_000 - (Date.now() - started)),
      });
      if (!candidates.length) {
        const video = ['instagram', 'tiktok', 'youtube'].includes(source.type);
        return json({
          source,
          candidates,
          unresolved,
          skippedRegions,
          used,
          needsScreenshot: !storagePaths.length,
          message: unresolved.length
            ? `Found ${unresolved.join(', ')} but couldn't locate ${unresolved.length === 1 ? 'it' : 'them'} on the map. Try searching instead.`
            : video
              ? `We couldn't find specific places in this post${skippedRegions.length ? ` (only ${skippedRegions.join(', ')})` : ''} — they're probably only shown in the video. Upload a screen recording of it, or screenshots of the moments that show each place.`
              : `No specific places found${skippedRegions.length ? ` — only ${skippedRegions.join(', ')}` : ''}. Try a screen recording or screenshots that show the place names, or search the place.`,
        });
      }
      return json({ source, candidates, unresolved, skippedRegions, used });
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
      await useDailyQuota(member.uid, 'addIdea');
      const existing = await adminDb().collection(paths.ideas(tripId)).where('placeKey', '==', placeKey).limit(1).get();
      if (!existing.empty) return json({ id: existing.docs[0].id, duplicate: true });

      const { place } = await placeDetails(body.placeId);
      if (place.photoName) {
        const url = await photoUrl(place.photoName);
        if (url) Object.assign(place, { photoUrl: url, photoUrlAt: Date.now() });
      }
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

  /**
   * Re-fetch place details older than 30 days (Google's caching terms) for a
   * trip's ideas. Called when the board opens; a few per call keeps it cheap.
   */
  'POST ideas/refresh': withTrip(
    async (_req, { tripId }) => {
      const snap = await adminDb().collection(paths.ideas(tripId)).get();
      const stale = snap.docs
        .map((d) => Idea.safeParse(d.data()))
        .flatMap((r) => (r.success && placeIsStale(r.data) ? [r.data] : []))
        .slice(0, 8);
      let refreshed = 0;
      for (const idea of stale) {
        const fresh = await placeDetails(idea.place.placeId!).catch(() => null);
        if (!fresh) continue;
        const place = { ...fresh.place, category: idea.place.category }; // keep the category people have been seeing
        if (place.photoName) {
          const url = await photoUrl(place.photoName);
          if (url) Object.assign(place, { photoUrl: url, photoUrlAt: Date.now() });
        }
        await ideaRef(tripId, idea.id).update({ place, updatedAt: Date.now() });
        refreshed++;
      }
      return json({ refreshed, remaining: Math.max(0, stale.length - refreshed) });
    },
    { perMinute: 4 },
  ),

  /** Halal Radar + review analysis for an idea (cached per place for 14 days). */
  'POST ideas/analyze': withTrip(
    async (req, { tripId, user }) => {
      const { ideaId, force } = await readJson(req, z.object({ ideaId: Id, force: z.boolean().default(false) }));
      const idea = await loadIdea(tripId, ideaId);
      const cacheRef = adminDb().doc(`placesCache/${idea.placeKey}`);

      const cached = force ? null : (await cacheRef.get()).data();
      let result: { halal: Idea['halal']; sentiment?: Idea['sentiment'] };
      // Picked up on analysis so ideas added before phone numbers were fetched get one too.
      let phone: string | undefined;
      if (cached && cached.v === ANALYSIS_VERSION && Date.now() - Number(cached.at) < ANALYSIS_TTL) {
        result = { halal: cached.halal, ...(cached.sentiment ? { sentiment: cached.sentiment } : {}) };
        phone = cached.phone;
      } else {
        await useDailyQuota(user.uid, 'analyze');
        await ideaRef(tripId, ideaId).update({ analysis: { status: 'pending', at: Date.now() } });
        try {
          const details = await placeDetails(idea.place.placeId!, { forAnalysis: true });
          result = await analyzePlace(details);
          phone = details.place.phone;
          await cacheRef.set({ ...result, ...(phone ? { phone } : {}), v: ANALYSIS_VERSION, at: Date.now() });
        } catch (err) {
          const message = err instanceof HttpError ? err.message : 'Analysis failed';
          await ideaRef(tripId, ideaId).update({ analysis: { status: 'error', at: Date.now(), error: message.slice(0, 300) } });
          throw err;
        }
      }
      await ideaRef(tripId, ideaId).update({
        halal: result.halal,
        ...(result.sentiment ? { sentiment: result.sentiment } : {}),
        ...(phone && !idea.place.phone ? { 'place.phone': phone } : {}),
        analysis: { status: 'done', at: Date.now() },
        updatedAt: Date.now(),
      });
      return json(result);
    },
    { perMinute: 20 },
  ),

  /**
   * AI middle-ground ideas for members whose preferences this idea conflicts
   * with (halal level, alcohol, prayer, budget). Cached on the idea per
   * conflict set; only nearby places we actually looked up are suggested.
   */
  'POST ideas/resolve': withTrip(
    async (req, { tripId, user }) => {
      const { ideaId, force } = await readJson(req, z.object({ ideaId: Id, force: z.boolean().default(false) }));
      const db = adminDb();
      const [idea, trip, memberSnap] = await Promise.all([loadIdea(tripId, ideaId), loadTrip(tripId), db.collection(paths.members(tripId)).get()]);
      const members = memberSnap.docs.map((d) => MemberSchema.safeParse(d.data())).flatMap((r) => (r.success ? [r.data] : []));
      const summary = (await db.doc(paths.halalSummary(idea.placeKey)).get()).data() as HalalSummary | undefined;
      const conflicts = ideaConflicts(idea, members, { currency: trip.currency, trip, ...(summary?.tier ? { communityTier: summary.tier } : {}) });
      if (!conflicts.length) return json({ conflicts, suggestions: [] });
      const key = conflictKey(conflicts);
      if (!force && idea.resolution?.key === key) return json({ conflicts, suggestions: idea.resolution.suggestions });

      await useDailyQuota(user.uid, 'analyze');
      const h = idea.halal;
      const facts = {
        place: { name: idea.place.name, kind: idea.place.typeLabel ?? idea.place.category, address: idea.place.address, phone: idea.place.phone, openingHours: idea.place.openingHours, durationMin: idea.estDurationMin },
        radar: h ? { verdict: h.verdict, tier: h.tier, flags: h.flags, evidence: h.evidence.map((e) => e.text) } : null,
        conflicts: conflicts.map((c) => ({ member: c.name, severity: c.severity, issue: c.detail })),
        prayerSpacesNearby: h?.prayer?.places.map((p) => `${p.name} (${p.walkMin} min walk)`) ?? [],
        halalFoodNearby: h?.halalFood?.places.map((p) => `${p.name} (${p.walkMin} min walk)`) ?? [],
        // Between-prayer slots the whole visit fits in (only when no mosque is close).
        visitWindowsBetweenPrayers: h?.prayer?.access === 'far' ? visitPlan(idea, trip).windows.slice(0, 3).map(windowText) : undefined,
        groupSize: members.length,
      };
      const ai = await extractJson({
        system: `You plan group trips where some members are Muslim or have other needs. An activity the group likes conflicts with some members' preferences. Suggest 2–4 practical middle-ground solutions so everyone can still enjoy the day. Types:
- "alternative": a nearby substitute for the affected members (ONLY use places from halalFoodNearby / prayerSpacesNearby — never invent place names).
- "split": the group splits briefly (e.g. others eat here, affected members eat at X, meet after).
- "timing": schedule around it (e.g. visit after Asr, pray at X first, go at lunch when the halal counter is open). If visitWindowsBetweenPrayers is given, use those exact times.
- "prep": something to do beforehand (e.g. call the restaurant on its phone number to ask about the halal kitchen, pack a prayer mat, set a spending cap).
Each: short title (≤ 8 words), a concrete 1–2 sentence detail, and forMembers = names of the members it helps. Be specific to the facts; no generic advice.`,
        parts: [{ text: JSON.stringify(facts) }],
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ['alternative', 'split', 'timing', 'prep'] },
                  title: { type: Type.STRING },
                  detail: { type: Type.STRING },
                  forMembers: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['type', 'title', 'detail', 'forMembers'],
              },
            },
          },
          required: ['suggestions'],
        },
        validate: z.object({
          suggestions: z.array(z.object({ type: z.enum(['alternative', 'split', 'timing', 'prep']), title: z.string(), detail: z.string(), forMembers: z.array(z.string()).default([]) })).max(8),
        }),
      });
      const uidByName = new Map(conflicts.map((c) => [c.name.toLowerCase(), c.uid]));
      const suggestions = ai.suggestions.slice(0, 4).map((s) => ({
        type: s.type,
        title: s.title.trim().slice(0, 120),
        detail: s.detail.trim().slice(0, 400),
        forUids: [...new Set(s.forMembers.map((n) => uidByName.get(n.trim().toLowerCase())).filter((u): u is string => !!u))],
      }));
      await ideaRef(tripId, ideaId).update({ resolution: { key, suggestions, at: Date.now() } });
      return json({ conflicts, suggestions });
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
        if (idea.status === 'scheduled') throw new HttpError(409, `${idea.place.name} is on the timeline — take it off first`);
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
      batch.delete(adminDb().doc(`${paths.schedule(tripId)}/${ideaItemId(ideaId)}`)); // and its timeline slot
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
