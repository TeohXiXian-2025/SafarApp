import { aiCounts, downModels } from '../_lib/aiHealth.js';
import { withAuth } from '../_lib/auth.js';
import { configuredServices } from '../_lib/env.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { geminiModels } from '../_lib/gemini.js';
import { serpUsage } from '../_lib/hotels.js';
import { photoUsage } from '../_lib/places.js';
import { googleUsageToday } from '../_lib/openPlaces.js';
import { handle, HttpError, json } from '../_lib/http.js';
import type { RouteTable } from '../_lib/routes.js';
import { socialUsage } from '../_lib/socialProviders.js';
import { autoCheckUsage } from './food.js';
import { checksLeftToday } from '../_lib/analysis.js';

export const systemRoutes: RouteTable = {
  // Public liveness check. Reports which integrations are configured
  // (true/false only) so a deploy can be verified without exposing secrets.
  'GET health': handle(async () =>
    json({ ok: true, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-dev', services: configuredServices() }),
  ),

  // The signed-in user as the server sees them.
  'GET me': withAuth(async (_req, { user }) => json({ uid: user.uid, email: user.email ?? null, name: user.name ?? null })),

  /**
   * How much of each free allowance is used this month, AI requests per day
   * and which AI models are resting — so running low is visible before it
   * breaks. OWNER_EMAILS (comma-separated) limits who can see it; unset = any
   * signed-in user (the numbers aren't secret).
   */
  'GET system/usage': withAuth(
    async (_req, { user }) => {
      const owners = (process.env.OWNER_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (owners.length && !owners.includes((user.email ?? '').toLowerCase())) throw new HttpError(403, 'Only the app owner can see usage');
      const month = new Date().toISOString().slice(0, 7);
      const models = geminiModels();
      const [serp, social, aviation, ai, down, auto, checks, photos, google] = await Promise.all([
        serpUsage(),
        socialUsage(),
        adminDb().doc(`apiUsage/aviationstack_${month}`).get(),
        aiCounts(7),
        downModels(models),
        autoCheckUsage(),
        checksLeftToday(),
        photoUsage(),
        googleUsageToday(),
      ]);
      const cap = (used: number, max: number) => ({ used, cap: max, left: Math.max(0, max - used), pct: max ? Math.round((used / max) * 100) : 0 });
      return json({
        month,
        hotels: { ...cap(serp.used, serp.cap), note: 'Google Hotels (SerpApi). At the cap, hotels switch to LiteAPI sample prices.' },
        instagramTiktok: { ...cap(social.scrapecreators.used, social.scrapecreators.cap), note: 'ScrapeCreators. At the cap, pasted links fall back to the caption only.' },
        xiaohongshu: { ...cap(social.apify.used, social.apify.cap), note: 'Apify. At the cap, pasted links fall back to the caption only.' },
        halalAutoChecks: { ...cap(auto.used, auto.cap), note: "Automatic Halal Radar checks in the Food tab today (app-wide) — this month's remaining budget spread over the days left." },
        halalChecksMonth: {
          ...cap(checks.used, checks.budget),
          note: `Full halal checks (Google reviews) this month, all trips. Budget = HALAL_CHECKS_PER_MONTH (now ${checks.budget}); Google's free tier is ~1,000/month, above that about US$20–40 per 1,000. Raise it in Vercel → Settings → Environment Variables if billing is on. At the cap, labels come from free signals (listings, restaurant type, country, traveller reports).`,
        },
        googleNearby: { ...cap(google.nearby.used, google.nearby.cap), note: `Google nearby searches today (mosques, halal food, cafés, indoor places). Cap = GOOGLE_DAILY_NEARBY. Past it: Geoapify → OpenStreetMap → places Safar already knows.` },
        googleText: { ...cap(google.text.used, google.text.cap), note: `Google text searches today ("halal food", "prayer room"). Cap = GOOGLE_DAILY_TEXT. Past it: the same backups.` },
        googleRoutes: { ...cap(google.routes.used, google.routes.cap), note: `Google travel times today. Cap = GOOGLE_DAILY_ROUTES. Past it: openrouteservice (walking exact, trains estimated), then a distance estimate.` },
        placePhotos: { ...cap(photos.used, photos.cap), note: `Google place photos looked up this month (billed as "Place Details Photos"). Cap = GOOGLE_PHOTOS_MONTHLY_CAP (now ${photos.cap}). At the cap, cards show no photo until next month.` },
        flightStatus: { ...cap(Number(aviation.get('count') ?? 0), Number(process.env.FLIGHT_STATUS_MONTHLY_CAP) || 90), note: 'AviationStack. At the cap, travellers report delays themselves.' },
        ai: {
          last7Days: ai,
          models: models.map((m) => ({ model: m, resting: down.has(m) })),
          note: 'Gemini models are tried in order; a model that hits its daily limit rests and the next one (then Groq) answers.',
        },
      });
    },
    { perMinute: 20 },
  ),
};
