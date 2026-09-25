# Safar — Prototype → Live System Build Plan

_Drafted 2026-09-24. Tick boxes as you go; one owner per task._

---

## 0. Where the prototype is today (audit)

| Area | Current state | What has to change |
| :--- | :--- | :--- |
| **Data** | ~1,400 lines of mock data (`src/data/*.ts`, `INITIAL_TRIP_STATE` in `useTripState.ts`) drive every screen. Kyoto/Tokyo, Amina/Tariq/Fatima are hardcoded. | Every screen reads from the database. Mock files are deleted, or kept only as test fixtures. |
| **"Multiplayer"** | `multiplayerSync.ts` uses `BroadcastChannel` + `localStorage`, so "sync" only works between tabs of **one browser**. | Real per-trip Firestore listeners. |
| **Firestore** | `firestoreService.ts` writes to a fixed doc (`safar-kyoto-day3`) and seeds a fake clash with `votedCount: 3`. Voting sets `votedCount: 4, status: 'resolved'` whatever the vote was. | Proper per-trip collections, real vote tallying. |
| **Security rules** | Any signed-in (even anonymous) user can read/write/delete **any** itinerary. | Membership-based rules. |
| **Auth** | Anonymous auth plus a fake "switch user" modal. `firebase-applet-config.json` came from an AI Studio project. | Real accounts (Google + email). A Firebase project **you own**, with config in env vars. |
| **AI** | No LLM calls at all. `aiPlannerService.ts` returns hardcoded solutions, and ~47 `setTimeout`s fake the "AI thinking". `GEMINI_API_KEY` is unused. | Server-side AI endpoints. |
| **Real APIs already working** | Aladhan prayer times (`prayerTimeService.ts`), Open-Meteo weather, Google Maps rendering, Haversine/geohash math. | Keep them. They're good. |
| **Two data models** | `src/types.ts` (`Itinerary`/`ActivityBlock`) **and** `src/types/itinerary.ts` (`TripState`/`ItineraryStop`) describe the same thing differently. | Merge into one domain model. |
| **Routing** | A `currentScreen` string in `App.tsx`. No URLs, so a trip can't be linked or refreshed. | React Router with shareable URLs (`/t/:tripId/...`). |
| **Mobile** | Desktop-first. Only 10 `lg:` / 51 `md:` breakpoints across 24k lines. No manifest, no service worker. | Mobile-first layouts plus an installable PWA. |
| **CI** | `.github/workflows/deploy.yml` still deploys to GitHub Pages (retired). | Replace with a CI check job. Vercel does the deploys. |

**Strategy:** keep the visual components (they're the valuable part of the prototype), but rip out their internal mock state. Rebuild the **data layer + backend** underneath them, then make them responsive.

---

## 1. Target architecture

```
 ┌───────────── Client (PWA, React 19 + Vite) ─────────────┐
 │ React Router · Zustand (UI state) · Firestore listeners │
 │ dnd-kit (touch drag) · Google Maps · vite-plugin-pwa    │
 └──────┬──────────────────────┬───────────────────────────┘
        │ realtime reads/writes│ HTTPS + Firebase ID token
        ▼                      ▼
 ┌──────────────┐     ┌──────────────────────────────────┐
 │  Firebase    │◄────│ Vercel Functions  /api/*          │
 │  Auth        │     │  (firebase-admin, secrets live    │
 │  Firestore   │     │   here, never in the bundle)      │
 │  Storage     │     └──┬──────┬──────┬──────┬──────┬───┘
 └──────────────┘        │      │      │      │      │
                     Gemini  Google  Aladhan  OSM    FX /
                   (extract, Places/ (prayer) Overpass flight
                    reason)  Routes           (mosques) status
```

**Decisions (recommended):**

1. **Stay on Firebase** (Auth + Firestore + Storage). You already use it, and realtime listeners fit collaborative trips well.
   - Note: new Cloud Storage buckets require the **Blaze (pay-as-you-go)** plan. Switch to Blaze and **set a budget alert** (e.g. RM20). Free quotas still cover a student-scale app.
2. **Backend = Vercel Functions in `/api`** (same repo, same deploy). All API keys (Gemini, Places server key, flight API) live there. The browser only ever holds the *restricted* Maps JS key.
3. **Long AI jobs use a "job document" pattern.** The client calls `/api/...`, the function writes `trips/{id}/jobs/{jobId}` with `status: running → done`, and the client listens to that doc. This avoids function timeouts and gives every member a live progress indicator.
4. **AI = Gemini** (already a dependency) with **structured JSON output** (response schema). Validate every AI response with **Zod** before writing it to the DB.
5. **Scheduling is deterministic code, not the LLM.** The "AI Arrange" solver uses real travel times and opening hours. The LLM only explains the result or breaks ties. This is more reliable and cheaper, and you can test it.

---

## 2. Data model (Firestore)

```
users/{uid}                     displayName, photoURL, email, defaultPrefs
trips/{tripId}                  name, destinations[{name, placeId, lat, lng}],
                                startDate, endDate, timezone, currency,
                                adminId, memberIds[] (for rules/queries), status
  members/{uid}                 role: 'admin'|'member', displayName, joinedAt,
                                prefs { budgetPerNight{min,max}, dailyBudget,
                                        halalRequired, dietaryTier, prayerReminders,
                                        pace, interests[], hotelPriorities[] }
  invites/{token}               createdBy, expiresAt, maxUses, uses
  bookings/{id}                 kind: flight|train|bus|hotel, carrier, number, pnr,
                                from{name,lat,lng}, to{...}, departAt, arriveAt (ISO+tz),
                                travellerUids[], fileRef, parseConfidence, confirmedBy
  ideas/{id}                    place{placeId,name,lat,lng,address,openingHours,
                                      category,priceLevel,rating}, source{type:
                                      tiktok|instagram|xhs|manual|radar|ai, url},
                                halal{verdict: ok|caution|not_friendly, tier,
                                      reasons[], confidence}, sentiment{score,
                                      verdict, pros[], cons[]}, estDurationMin,
                                status: voting|approved|mixed|split_pending|
                                        rejected|backlog|scheduled, createdBy
    votes/{uid}                 value: 1|-1, reason?, at
  splits/{id}                   ideaId, trackA{ideaId, memberUids[]},
                                trackB{altPlace, memberUids[]}, reunion{place,
                                time}, status: proposed|approved|rejected
  schedule/{itemId}             day (YYYY-MM-DD), start, end, ideaId|bookingId,
                                track: 'all'|splitId:A|splitId:B, memberUids[],
                                transitFromPrev{mode,minutes,meters},
                                prayer?{name, facility{placeId,name,lat,lng,walkMin},
                                        fillerIdeaId?}, locked, orderIndex
  expenses/{id}                 title, amount, currency, fxRateToTrip, paidByUid,
                                splits[{uid, share}], category, scheduleItemId?, at
  documents/{id}                ownerUid, kind: passport|visa|ticket|hotel|other,
                                storagePath, extracted{...}, visibility: owner|group
  checks/{id}                   severity, title, detail, relatedIds[], resolved
  incidents/{id}                type, description, attachments[], createdBy,
                                status, resyncJobId
  jobs/{id}                     type, status, progress, result, error
  activity/{id}                 actorUid, text, at      ← live activity feed
placesCache/{placeId}           details + halal assessment shared across trips
halalVerifications/{placeId}    certBody, certNo, expiry, evidenceUrl, verifiedBy
```

**Rule of thumb:** clients write *intent* (votes, ideas, manual schedule moves, expenses). **Servers** write *AI results* (halal verdicts, splits, arranged schedules, cross-checks) with the admin SDK, so clients can't forge "Certified Halal".

---

## 3. Feature-by-feature spec

### F1. Accounts, trips, invites _(flow step 1)_
- Sign in with Google or email/password (Firebase Auth). Delete the fake user switcher.
- The creator becomes **admin**. Create trip: name, dates, 1+ destinations (Places Autocomplete), currency.
- Invite by link or QR (`/join/:token`), shareable to WhatsApp (reuse `ShareInviteModal`). Admin can remove members or transfer admin.
- "My Trips" list page.

### F2. Booking import → timeline anchors _(step 2)_
- Upload a PDF/image, or paste the confirmation email text. `/api/bookings/parse` → Gemini multimodal returns a structured `Booking[]`, validated with Zod.
- **Always show a confirm/edit form** before saving. AI parsing is never auto-trusted.
- Confirmed bookings become **locked** schedule items (flight arrive/depart, train legs, hotel check-in/out). They also define each day's **start/end location** for later steps.

### F3. Preference intake _(step 3)_
- Per-member form: nightly hotel budget range, daily spend, **Halal requirement toggle** + tier (Certified / Muslim-owned / Pork-free OK), prayer reminders, pace, interests, hotel priorities (near transit, family rooms, prayer space nearby…).
- Shown as a group summary for the admin: merged budget = **intersection** of ranges (warn if empty), strictest halal tier wins for shared meals.

### F4. AI hotel recommendations _(step 4)_
- `/api/hotels/recommend`: Places search (lodging) around a **centroid of arrival points + planned areas**. Score by merged budget (price level), rating, distance to transit, distance to nearest mosque/musalla, and halal food density within 800 m. Gemini writes the "why this fits your group" line.
- **Live prices (decided: real pricing API, worldwide).** Build a `HotelRatesProvider` interface in `/api/_lib/hotels/` so the provider can be swapped later without touching the UI.
  - **Primary: LiteAPI (Nuitée).** Self-serve signup with a free sandbox, so no business contract is needed to start. Live rates + availability for ~2–3M hotels worldwide, searchable by lat/lng. Core endpoints are free (they earn a commission/markup on bookings). Flow: `GET /data/hotels` (search by coordinates) → `POST /hotels/rates` (dates, occupancy, currency) → show the cheapest refundable/non-refundable rate per hotel.
  - **Optional cross-check: SerpApi Google Hotels.** Shows the prices from Booking.com, Agoda, Expedia and others for the same hotel, with a deep link to each. The free plan has 250 searches/month, so use it only when a user opens a hotel's detail page, and cache the result.
  - **Booking.com's own API (Demand API)** requires Managed Affiliate Partner status + a signed contract, and its partner terms need written approval for AI use. You can't get it self-serve, so it's out of scope. Apply later if the product gets traction.
  - **Amadeus Self-Service** closed on 17 Jul 2026, so don't use it. **Expedia Rapid / Agoda / Hotelbeds** all need a commercial partner agreement; they're later options.
  - Hotels come from LiteAPI; distance to mosque/musalla and nearby halal food come from our own data.
  - v1: "Book" opens the provider/OTA link. v2 (optional): in-app booking via LiteAPI prebook/book with payment.
- Members can vote on hotels the same way as ideas.

### F5. Idea Board: social import + manual add + Halal Radar + review analysis _(step 5)_
- **Social import** `/api/import/social`:
  1. Fetch the URL server-side. Pull the caption/title from **oEmbed** (TikTok has a public oEmbed endpoint; Instagram oEmbed needs a Meta app token) and Open Graph meta tags (works for Xiaohongshu share pages in most cases).
  2. Gemini extracts candidate places (name + city hints) from caption/title/hashtags.
  3. Resolve each place with **Places Text Search** biased to the trip destinations → real `placeId`, coordinates, opening hours.
  4. User picks which extracted places to add.
  - ⚠️ Downloading and analysing the actual video/audio is fragile and against most platforms' ToS. For v1, use captions + metadata, and add a fallback: "paste the caption or upload a screenshot" (Gemini reads screenshots well).
- **Manual add:** Places Autocomplete search, or drop a pin on the map.
- **Halal Radar assessment** `/api/halal/assess` (cached in `placesCache`):
  - Food places: combine the signals in the **Halal Signal Stack** (§3a). The highest-trust signal wins, and every verdict shows its source.
  - Activities: flag non-Muslim-friendly factors (alcohol-centric venues, bars, pork-focused food events, mixed onsen/bathing, casinos, gambling) and list **why**.
  - **Only human-verified entries may show "Certified Halal".** AI guesses show "Likely Muslim-friendly (unverified)". Getting this wrong is a trust problem, not a UI problem.
- **"Is it worth it?" analysis:** scraping TikTok/IG comments is against ToS and unstable. Use **Google Places reviews** (the API returns up to 5) + rating + review count instead → Gemini sentiment summary: verdict (Highly recommended / Mixed / Skip), pros, cons. Optionally include the social caption as extra context.

### F6. Voting → Backlog _(step 6)_
- Each member votes 👍/👎 (one `votes/{uid}` doc, enforced by rules), with an optional reason.
- Tally runs server-side (a transaction in `/api/ideas/:id/vote`, or a Firestore trigger if you add Cloud Functions):
  - **All members voted 👍** → `backlog`.
  - **Mixed** → `mixed`, which triggers F7.
  - **All 👎** → `rejected`.
  - Admin can close voting early (non-voters are counted as abstain). Admin can override.

### F7. Split Tracks _(step 7)_
- `/api/splits/propose` for a `mixed` idea. Group members by vote, **and** by halal constraint when the idea is non-halal food.
- Search Places for alternatives **within ~1 km / 15 min walk** with the same category, compatible halal tier, open at similar times, and similar duration.
- Compute the **reunion point + time** from the next backlog item or the midpoint, using Routes API walking times.
- Admin approves → both tracks go into the backlog as a linked pair. Admin rejects → the idea goes back to the board.
- The timeline UI renders the two tracks side by side, with a reunion marker (reuse `SplitSyncBlock` / `AiSplitRoute`).

### F8. Arrange: AI auto-fill + manual drag _(step 8)_
- **Manual:** drag from the Backlog panel onto a day. Use **dnd-kit**, because it supports touch; on mobile, use a long-press to drag, or a "Move to day…" sheet.
- **"AI Arrange"** `/api/schedule/arrange` (job pattern):
  1. Fixed anchors: booking items, locked items, hotel start/end each day.
  2. Cluster backlog items into days by geography (k-means with k = number of days, seeded by hotel/arrival location).
  3. Order within each day: nearest-neighbour + 2-opt, using a **Routes API distance matrix** (transit/walk).
  4. Fit into time windows: opening hours, estimated duration, meal windows. Items that don't fit go back to the backlog with a reason.
  5. Run F9 (prayer pairing).
  6. Gemini writes a short explanation per day.
- The admin gets a **preview/diff** first and presses Apply. Keep an undo snapshot.

### F9. Prayer pairing _(step 9)_
- Prayer times per day and city from **Aladhan** (already implemented) for the trip timezone.
- For each prayer window, find the scheduled block that overlaps it or comes nearest. Find the closest prayer space: curated `halalVerifications` musallas + Places (`mosque`) + **OSM Overpass** (`amenity=place_of_worship` + `religion=muslim`, which is free and has good coverage).
- Attach it to the block: facility, walk minutes, wudu info if known. Insert a 20–30 min prayer sub-block.
- For non-Muslim members, suggest a **filler** nearby (café/viewpoint/shop within the same walk radius, taken from the backlog first, then Places).
- Re-run automatically when the schedule changes (debounced).

### F10. Restaurant tab (Halal Radar) _(step 10)_
- Location = device GPS (with permission), or the selected schedule block's location.
- `/api/restaurants/nearby`: Places Nearby (restaurant) + `halalVerifications` + cached AI tier → show **Certified Halal / Muslim-owned / Pork-free** tabs, walking distance and time, rating, open now, price level.
- ⚠️ **"Live wait times":** Google's official API does not expose Popular Times. Replace this with an "Usually busy now" estimate, or member-reported waits. Don't show fake numbers.
- ⚠️ **"Verified menus":** not available from Places. Use a website/menu link, plus member-uploaded menu photos (Gemini can flag pork/alcohol items).
- "Add to Idea Board" button → creates an idea (source `radar`).

### 3a. Halal Signal Stack + community ratings (worldwide)

**No global official halal API exists.** Certifiers such as JAKIM (MY), MUIS (SG), HFA (UK), IFANCA (US) and the Japanese and Korean bodies each publish their own directories, and none offers an open worldwide API. So Safar combines several sources, ranked by trust:

| Rank | Source | Coverage | Can show "Certified"? |
| :--- | :--- | :--- | :--- |
| 1 | **Moderator-verified certificate** (a user uploads a certificate photo; Gemini reads the certifier, number and expiry; a moderator approves) | Anywhere users contribute | ✅ Yes, until the certificate expires |
| 2 | **Community consensus** (≥3 reports agreeing, weighted by reporter trust) | Anywhere | ❌ Shows "Community: Muslim-owned / Pork-free / …" |
| 3 | **Google Places Text Search** `"halal restaurant"` + location bias (discovery), plus name/type hints. Optional: **Foursquare Places** search for `halal` | Worldwide | ❌ Shows "Listed as halal on Google/Foursquare" |
| 4 | **OpenStreetMap `diet:halal=yes|only`** via Overpass (free, global) | Patchy but worldwide, good in some EU/Asian cities | ❌ Shows "Tagged halal on OpenStreetMap" |
| 5 | **Google Places** name/type/reviews/website → Gemini classification | Worldwide | ❌ Shows "AI estimate (unverified)" + reasons |

- Keep a `certifiers` collection (name, country, logo, website) seeded with the major bodies, so the AI-read certificate is matched against real certifiers.
- Partnership later: CrescentRating/HalalTrip and Zabihah have large databases but no self-serve public API. Contact them for data licensing if the app grows.

**Community rating system (user-defined):**
```
halalReports/{placeId}/reports/{uid}   one report per user per place
  status: certified | muslim_owned | halal_options | pork_free | serves_alcohol | not_halal
  certificatePhoto?  (Storage path)     menuPhoto?
  note, visitedAt, createdAt
halalSummary/{placeId}                  written by the server only
  verdict, tier, confidence, sources[], reportCounts{...}, lastVerifiedAt,
  certificate?{certifier, number, expiresAt, verifiedBy}
users/{uid}.trust                       reputation 0–100
```
- One report per user per place (enforced by rules). Users can update their own report.
- **Aggregation** (server, on each new report): trust-weighted votes. Reports older than 12 months lose weight. A place with conflicting reports shows "⚠ Disputed — see reports".
- **Trust score:** it goes up when a user's reports match the later consensus or a verified certificate, and down when moderators reject their reports. New accounts start low, which limits spam.
- **Moderation queue:** certificate photos and disputed places. Any app admin can be a moderator (`users/{uid}.roles: ['moderator']`).
- **UI:** a "Report halal status" button on every restaurant/idea card. The card shows where the verdict came from ("Certified · JAKIM · exp 03/2027", "Community · 7 reports", "AI estimate").

### 3b. Worldwide coverage (no fixed cities)

| Need | API (global) |
| :--- | :--- |
| Place search, details, opening hours, reviews, photos | Google Places API (New) |
| Travel times / routes | Google Routes API (walk/drive everywhere; transit where Google has the data) |
| Maps | Google Maps JS API |
| Timezone of any destination | Google Time Zone API, or offline `tz-lookup` from coordinates (free) |
| Prayer times | Aladhan (free, any lat/lng, pick the calculation method by country) |
| Qibla direction | Calculated locally (great-circle bearing to the Kaaba), free |
| Mosques / musallas | OSM Overpass (`amenity=place_of_worship` + `religion=muslim`) + Places type `mosque` + community-added musallas |
| Halal food | Signal Stack above |
| Hotels + prices | LiteAPI (+ SerpApi Google Hotels) |
| Currency conversion | Frankfurter (ECB rates, free, ~30 currencies) → fallback to open.er-api.com (free, 160+ currencies) |
| Weather | Open-Meteo (free, global) |
| Flight status (Emergency) | AeroDataBox or AviationStack (free tiers are small; manual entry is the fallback) |

Every "city preset" in the prototype (Tokyo/Kyoto astronomical tables, mapX/mapY SVG coordinates) is deleted. All positions are real lat/lng.

### F11. Extras
- **Document Vault:** files go in Storage `trips/{tripId}/users/{uid}/...`. Rules: the owner reads; the group sees extracted *non-sensitive* fields only when the owner shares. Gemini extracts the fields, then a **deterministic cross-check** runs:
  - passport valid ≥ 6 months after return
  - names match across passport, tickets and hotel
  - ticket dates match the timeline
  - visa validity covers the stay
  - every member has an inbound and outbound booking
  
  Findings go to `checks/`. Delete the raw file on request. Never log PII.
- **Expense Tracker:** add expense (payer, amount, currency, split equal/by shares/exact). Convert to the trip currency with a free FX API (e.g. Frankfurter/ECB rates). Show balances + a **"settle up" with the fewest transfers** (greedy min-cash-flow). Link an expense to a schedule item. Budget vs. actual per member.
- **Emergency Resync:** the admin presses Emergency → form (what happened, new ETA, screenshot upload) → `/api/emergency/resync` job:
  1. Parse the disruption (Gemini) into a new time and location.
  2. Shift or drop affected items.
  3. Re-run arrange for the remaining day(s).
  4. Re-run prayer pairing.
  5. Find halal food + prayer space near the delay location.
  6. Log extra costs to expenses.
  
  All members get the change summary (activity feed + optional push notification). Optional: auto-detect flight delays with a flight-status API. Free tiers are small, so keep this manual for v1.

---

## 4. Mobile + "Add to Home Screen" (PWA)

- **`vite-plugin-pwa`**:
  - `manifest.webmanifest`: name, short_name, `display: standalone`, theme/background colour `#00685F`, `start_url: /trips`.
  - Icons: 192 and 512, plus a **maskable** 512.
  - Workbox service worker: precache the app shell; runtime-cache images and fonts.
  - Update prompt when a new version deploys.
- iOS extras:
  - In `index.html`: `apple-touch-icon` (180px), `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `viewport-fit=cover`.
  - Use `env(safe-area-inset-*)` padding.
- **Install UX:**
  - Android/Chrome: capture `beforeinstallprompt` and show an "Install Safar" button.
  - iOS Safari: show a one-time banner, "Tap Share → Add to Home Screen" (iOS has no install prompt API).
- **Offline:**
  - Firestore `persistentLocalCache` means today's timeline and prayer spots open offline.
  - Cache the day's prayer times.
  - Mark the offline state in the UI.
- **Push (optional, later):** Firebase Cloud Messaging web push. On iOS it works only for installed PWAs (iOS 16.4+).
- **Responsive layout:**
  - Mobile (<768px): **bottom tab bar** — Timeline · Ideas · Food · Map · More (Hotels, Vault, Expenses, Members, Settings). The map becomes a full-screen tab or a bottom sheet. Modals become bottom sheets.
  - Tablet/laptop: current multi-pane layout (nav rail + timeline + map).
  - Minimum 44px touch targets. Test on a real iPhone and Android, not only DevTools.

---

## 5. Cross-cutting: security, cost, quality

- **Secrets:** remove everything from the bundle except a Maps JS key **restricted by HTTP referrer** + Firebase web config (public by design). Server keys go only in Vercel env vars.
- **API protection:** every `/api` route verifies the Firebase ID token, checks trip membership (and admin role where needed), validates input with Zod, and rate-limits per user (a simple Firestore counter, or Upstash Redis).
- **Cost control:**
  - Google Maps Platform bills per call. Set daily quota caps + budget alerts, and request **field masks** (only the fields you need).
  - Cache place results (respect Google's caching terms: `placeId` can be stored indefinitely, most other content only temporarily).
  - Cache AI results in `placesCache`.
  - Gemini: use a Flash-class model, and cap tokens per request.
- **Privacy (passports!):** a consent screen, per-user visibility, a delete-my-data option, and a short privacy policy page. This matters if judges ask.
- **Testing:**
  - **Vitest** for pure logic: vote tally, merged prefs, scheduler, prayer pairing, settle-up, doc cross-check.
  - **Firebase Emulator** for security-rules tests.
  - **Playwright** e2e on desktop + iPhone/Pixel viewports.
- **CI:** GitHub Action runs `tsc`, lint and tests on each PR. Vercel handles preview + production deploys. Delete the GitHub Pages workflow.
- **Observability:** Sentry (free tier) for client + functions. Log AI job failures to `jobs/`.
- **Environments:** two Firebase projects (`safar-dev`, `safar-prod`), mapped to Vercel Preview vs Production env vars.

---

## 6. Phased to-do list

Estimates assume 3 people working part-time. Each phase ends with something usable and deployed.

### Phase 0 — Foundations (week 1)
- [x] Create your own Firebase project(s): Auth (Google + email), Firestore, Storage (Blaze + budget alert). Verified with `npm run check:keys` (21/21).
- [x] Move Firebase config from `firebase-applet-config.json` → `VITE_FIREBASE_*` env vars. Delete the JSON.
- [x] Google Cloud: enable Maps JS, Places API (New), Routes API. Create a **browser key** (referrer-restricted) and a **server key** (API-restricted). Set quotas.
- [x] Get a Gemini API key (+ LiteAPI, SerpApi, Foursquare, AviationStack, Sentry, Upstash — all verified by `npm run check:keys`).
- [x] Add all `.env.local` values to Vercel → Settings → Environment Variables (Production + Preview). Verified: production `/api/health` reports every server integration configured.
- [x] Add deps: `react-router`, `zod`, `zustand`, `@dnd-kit/core`, `vite-plugin-pwa`, `firebase-admin` (api only), `vitest`, `@sentry/react`. (`@playwright/test` comes in Phase 10.)
- [x] Set up an `/api` folder with a shared `withAuth(handler, {tripRole})` helper (verify ID token + membership).
- [x] Replace `deploy.yml` with a CI workflow (typecheck + test).
- [x] **New domain model** in `src/domain/` (Zod). _Components migrate onto it phase by phase; old `types.ts` / `types/itinerary.ts` are deleted once unused._
- [x] React Router installed; every path renders the prototype for now. Real routes land in Phase 1+: `/login`, `/trips`, `/join/:token`, `/t/:tripId/{timeline,ideas,food,hotels,map,vault,expenses,members,settings}`. Keep `/pitch`.
- [x] Rename `package.json` `name` from `react-example` → `safar`.

### Phase 1 — Real users, real trips (week 2)
- [x] Login/signup screens (Google + email + password reset). The fake user switcher now only exists in the `/demo` prototype.
- [x] `users/{uid}` profile on first login.
- [x] Create-trip flow: name, dates, worldwide destinations via Places Autocomplete (server adds the IANA timezone), currency.
- [x] My Trips page.
- [x] Invite links (create / list / revoke, copy + WhatsApp + native share) + join page + members list. Admin can remove members or transfer admin; members can leave.
- [x] **Firestore + Storage security rules v2**, deployed with `npm run deploy:rules`. Verified against the live project by `npm run e2e:phase1` (24 checks: API + rules). _(Emulator-based rules tests need Java 21; add them in Phase 10 CI.)_
- [x] Per-trip realtime hooks (`useDoc` / `useQuery`, Zod-validated).
- [x] Activity feed (`activity/`).
- [x] API behind a single Vercel function (`api/router.ts`), because Hobby allows at most 12 functions per deployment.
- [ ] Delete `multiplayerSync.ts` / `firestoreService.ts` / mock data → when the `/demo` prototype is retired (its screens get rebuilt on live data in Phases 4–9).

### Phase 2 — Mobile shell + PWA (week 3)
- [x] Responsive app shell: bottom tab bar on phones, top tabs on desktop (built in Phase 1).
- [x] Every live screen works at 375–390px with no horizontal scroll. _Prototype screens (timeline, idea board, radar, vault) are rebuilt mobile-first in their own phases._
- [x] `vite-plugin-pwa`: manifest (standalone, `start_url: /trips`), icons (192/512, maskable 512, apple-touch 180, SVG favicon), Workbox service worker, "New version — Update" toast, hourly update check.
- [x] Install UX: one-tap "Install app" on Android/desktop Chromium (`beforeinstallprompt`); iOS "Share → Add to Home Screen" instructions; dismiss remembered for 14 days.
- [x] Safe-area insets, `viewport-fit=cover`, iOS home-screen meta tags, no overscroll bounce in the installed app.
- [x] Offline: Firestore IndexedDB cache + service-worker app shell → trips open with no signal (verified: offline reload of a trip). Offline bar + friendly "needs a connection" API errors.
- [x] Google sign-in inside the installed app: same-origin redirect via Vercel proxy of `/__/auth/*` (Firebase "redirect best practices" option 3).
- [x] Performance: `/demo` prototype lazy-loaded (main bundle 470 KB → 54 KB); pitch/prototype images + chunks excluded from the offline precache (4.4 MB → 2.0 MB); fixed a Rollup helper that forced the PDF chunk to load on startup.
- [ ] Test install on a real iPhone and a real Android phone (manual).

### Phase 3 — Bookings + preferences (week 4)
- [x] Storage rules (private per-user trip folder, PDF/photos ≤ 10 MB) + upload with progress (camera/file picker on mobile).
- [x] `bookings/parse`: Gemini reads an uploaded PDF/photo or pasted email → structured legs; server resolves every airport/station/hotel via Places and matches printed passenger names to trip members. Retries + fallback model when Gemini is overloaded (503).
- [x] Review/edit every AI draft before saving (warnings for unclear fields). Nothing is saved without a human confirming.
- [x] Manual booking entry (same editor); edit + delete (creator or admin).
- [x] Times: stored as the ticket's local wall-clock + real UTC offset from the Time Zone API for that date (DST-aware), e.g. `23:30+08:00 → 07:40+09:00`.
- [x] Confirmed bookings become **locked timeline anchors** (`schedule/`): same-day span, or depart/arrive and check-in/check-out moments.
- [x] Preferences page (hotel budget range, daily spend, halal toggle + tier, prayer breaks, pace, interests, hotel priorities) — saved directly by the member (rules allow only their own `prefs`).
- [x] Group summary on the Group tab: overlapping hotel budget (or conflict), tightest daily budget, strictest halal tier for shared meals, prayer count, slowest pace, top interests + warnings. Pure `mergePrefs()` with unit tests.
- [x] Overview nudges: "Set your preferences", "Add your flight or train".
- [x] Verified: `npm run e2e:phase3` (17 checks, real Gemini/Maps/Firebase) + browser flow on a phone viewport.

### Phase 4 — Idea Board + voting (weeks 5–6) ⭐ core loop
- [x] Add ideas three ways: paste a TikTok / Instagram / Xiaohongshu / YouTube link (caption via oEmbed or Open Graph; allow-listed hosts only, no arbitrary server fetches), upload a screenshot or paste a caption (Gemini reads it), or search any place.
- [x] Gemini extracts named places → Google Places text search biased to the trip's destinations → pick list with distance warnings; duplicates are detected per trip.
- [x] **Halal Radar** per place (cached 14 days, shared across trips): Google `halal_restaurant` type / name, Foursquare categories, OSM `diet:halal` + one Gemini pass over details & reviews. Listings outrank AI; "certified" never claimed without a named certifier; non-food places get Muslim-friendliness checks (alcohol, gambling, mixed bathing…).
- [x] Review verdict (highly recommended / mixed / skip) with specific pros/cons from Google reviews, in the same Gemini call.
- [x] Community halal reports (one per user per place) → trust-ordered consensus in `halalSummary` (≥2 agreeing, 60% weight, old reports count half; "disputed" otherwise). UI order: community > listings > AI estimate, always showing the basis.
- [x] Voting 👍/👎 with optional reason, change or take back; unanimous 👍 → Backlog, unanimous 👎 → Rejected, split → "Split votes" (Split Track input for Phase 7). Leaving/removed members no longer block decisions.
- [x] Admin: close voting early (non-voters abstain), move to backlog, reject, reopen. Delete by suggester or admin.
- [x] Board with Voting / Backlog / Split votes / Rejected filters, "waiting for …", live updates, Google attribution + photo credits.
- [x] AI reliability: Gemini model chain (Flash-Lite first, `GEMINI_MODELS`), then **Groq** as a free backup (text: gpt-oss-120b; images: qwen3.8-27b vision; PDFs converted to text). Per-attempt/total time budgets, SDK retries off, rate-limited models skipped instantly. Verified: all Phase 3/4 e2e checks + image parsing pass with Gemini switched off.
- [ ] Deferred to Phase 8: certificate photo upload + moderator verification, reporter trust scores.
- [x] Places content refresh: `POST ideas/refresh` re-fetches place details older than 30 days (Google caching terms), triggered once per Idea Board visit (≤ 8 places per call).

### Phase 5 — Timeline + manual arrange (week 7)
- [x] Day-by-day timeline from `schedule/` (new `/t/:tripId/timeline` page on the real model; the prototype `ItineraryFeed` stays in `/demo`). Day chips, bookings shown as locked anchors.
- [x] dnd-kit: drag from backlog → the day list or any day chip; reorder within a day (re-timed back to back around bookings by the pure `reflowDay()`). Phones: tap "Add" / tap a stop for a "Move to…" sheet (day, start, length, take off). Server routes `schedule/{add,update,reorder,remove}`; idea status follows (`backlog` ⇄ `scheduled`).
- [x] Transit time between consecutive items (Routes API: walk ≤ 1.5 km, else transit, else drive). Cached on the item (reused while the previous stop is unchanged, ≤ 30 days).
- [x] Opening-hours conflict warnings (+ overlaps, too-tight transfers, closed that day) via `dayWarnings()`.
- [x] Map shows the day's route (numbered pins + line, `DayMap`).
- [x] Verified: `npm run e2e:phase5` (16 checks, real Firebase/Places/Routes) + unit tests for the timeline maths.
- [ ] Check the page on a real phone (drag with touch, sheets) — manual.

### Phase 6 — AI Arrange + prayer pairing (weeks 8–9)
- [x] **Scheduling engine** `src/domain/arrange.ts` (pure, unit-tested): `dayFrames()` (bookings → each day's usable hours, hotel base, blocked journeys, local prayer times), `timeSequence()` (travel, opening hours, locked bookings, meal windows, prayer breaks), `arrangeTrip()`, `prayersInGaps()`.
- [x] Scheduler: k-means clusters → days (nearest hotel) → capacity/pace cap → nearest neighbour + 2-opt → meal/prayer-aware local search → misfits tried on every other day → unplaced list with a reason. Pace sets day end + max stops (relaxed 18:30/3, moderate 20:30/5, fast 22:00/7).
- [x] Preview → Apply → Undo (`schedule/arrange|apply|undo|discard`, admin). The preview is a `jobs/` doc (it runs in ~1 s, so no background job is needed); Apply stores the old timeline for Undo. Gemini adds one sentence per day (skipped if busy).
- [x] Prayer pairing: times computed offline (`adhan`, country method) at the day's base in the nearest destination's timezone. Breaks (20 min + walk) go after the stop before each prayer, or first on arrival when the prayer would run out mid-visit. Place = the stop's known nearest mosque/musalla (Halal Radar), else a Places lookup. Only for members with prayer reminders; others see "free time". Re-run automatically after every manual change (in free gaps, stops never move); a banner shows any prayer with no free 30 min.
- [x] Reorder uses the same engine (opening hours, bookings, prayers).
- [x] Verified: `npm run e2e:phase6` (16 checks, real Firebase/Gemini/Places/Routes).
- [ ] Legs in the preview are straight-line estimates (the real Routes legs are fetched after Apply). A Routes distance matrix would sharpen the order.
- [ ] Filler suggestions for non-praying members are "free time" only (no specific place yet).
- [ ] Delete `aiPlannerService.ts` mocks → when `/demo` is retired.

### Phase 7 — Voting, middle grounds & Split Tracks (week 10) — "Option 3"
Rules live in `src/domain/voting.ts` + `split.ts` (unit-tested); API in `api/_routes/decisions.ts`; verified by `npm run e2e:voting` (19 checks) and `e2e:phase6`.
- [x] **Vote:** 👎 needs a reason (chips or typed). 👍 despite a conflict (not halal enough, pork, alcohol…) must be confirmed with a reason — the staff phone check sits in that popup and on voting cards for members who need halal. If the conflict changes later, the member is asked again ("Needs you").
- [x] **Who votes / when it closes:** members at the time the idea was added (later joiners may vote, aren't waited for); closes when all voted, after 24 h, or when the admin closes it (non-voters abstain). Until then votes can change; taking a vote back means "wait for me" again.
- [x] **Split votes:** the people who voted 👎 pick a middle ground within 24 h — up to 2 nearby alternatives (halal-listed for halal needs; "something different" for not interested / been before), a timing option (between prayers), "I'll join after all", or free time. "More" swaps unpicked places.
- [x] **Admin decides once:** sees the groups that would form (who goes where, anyone on their own, a requested time) → Accept (builds up to 3 groups + free time; undecided people get free time) · Keep as backup · Reject. Backup is a new status (plan B); reopen puts it back to a vote.
- [x] **After acceptance:** "Can't make it? Step out" → alternative / free time without approval; "Rejoin the main group". Empty groups disappear; with no one outside the main group the split ends.
- [x] **Leaving / removal:** votes and choices removed, open ideas re-tallied (may settle), removed from groups and timeline stops.
- [x] Comments on idea cards; "Needs you" strip (Overview + Ideas) and a badge on the Ideas tab.
- [x] Timeline + map: groups in their own colours side by side, 🚩 meeting time, dashed side trips, 🕌 prayer pins, tap a stop to focus it on the map.
- [ ] Push notifications + precise 12 h reminders (needs an FCM web-push key and QStash) — in-app badges for now.

### Phase 8 — Hotels + Restaurant tab (week 11)
- [ ] `HotelRatesProvider` interface + LiteAPI adapter (search by lat/lng → rates for trip dates/occupancy/currency).
- [ ] `/api/hotels/recommend` scoring (merged budget, rating, transit, mosque + halal food nearby) + Gemini explanation. Hotel voting.
- [ ] Optional SerpApi Google Hotels cross-check (Booking.com/Agoda prices + links), cached, only on the detail view.
- [ ] `/api/restaurants/nearby` with 3-tier tabs, walking distance, open now, "Add to Idea Board".
- [ ] Replace "live wait times" with an honest busy estimate or member reports. Menu photo upload + AI flagging.
- [ ] Delete `halalRadarData.ts` / `prayerFacilitiesData.ts` mocks and the city presets in `prayerTimeService.ts`.

### Phase 9 — Extras (weeks 12–13)
- [ ] **Vault:** private uploads, extraction, deterministic cross-check rules → `checks/`, share toggle, delete. Consent + privacy page.
- [ ] **Expenses:** add/split/FX, balances, settle-up, budget vs. actual. Unit tests for the maths.
- [ ] **Emergency Resync:** form + upload → resync job → diff preview → apply → notify.
- [ ] Optional: FCM push notifications (votes needed, split proposed, emergency).

### Phase 10 — Hardening & launch (week 14)
- [ ] Playwright e2e for the full flow on desktop + mobile viewports.
- [ ] Rules tests green. Rate limits on every `/api` route. Quotas and budget alerts verified.
- [ ] Sentry. Error and empty states on every screen (no trip, no ideas, API down, offline).
- [ ] Lighthouse PWA/perf pass. Lazy-load heavy screens (map, vault, pdf).
- [ ] Seed a **demo trip** via a script (for judges). It's real data in the DB, not hardcoded in the bundle.
- [ ] Update README architecture section to match reality.

---

## 7. If time is short: MVP cut

Ship in this order. Each line is independently demo-able:

1. Phases 0–2 → real accounts, trips, invites, installable on phones.
2. Phase 4 → Idea Board with Halal Radar + voting (the unique selling point).
3. Phase 5 → manual timeline.
4. Phase 6 → AI Arrange + prayer pairing.
5. Phase 7 → Split Tracks.
6. The rest.

## 8. Decisions (settled 2026-09-24)

1. **Hotel prices:** real pricing API. LiteAPI is the primary; SerpApi Google Hotels is the optional price cross-check with Booking.com/Agoda links (§F4).
2. **Hosting/backend:** stay on Vercel (frontend + `/api` functions) + Firebase (Auth/Firestore/Storage).
3. **Halal verification:** the Signal Stack + community rating system (§3a).
4. **Coverage:** worldwide from day one (§3b). No curated city presets.

## 9. Keys & accounts checklist

Put secrets in **`.env.local`** (git-ignored) and in **Vercel → Settings → Environment Variables**. Never commit them or paste them in chat.

| Env var | Where to get it | Client or server | Needed from |
| :--- | :--- | :--- | :--- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Firebase console → Project settings → Your apps → Web app | Client (public by design) | Phase 0 |
| `FIREBASE_SERVICE_ACCOUNT` (base64 of the JSON) | Firebase console → Project settings → Service accounts → Generate new private key | **Server only** | Phase 0 |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud → Credentials. Restrict to HTTP referrers (your Vercel domain + localhost) and to the Maps JS + Places APIs | Client | Phase 0 |
| `GOOGLE_MAPS_SERVER_KEY` | Same console, a second key. Restrict to Places API (New), Routes API, Time Zone API. No referrer restriction | **Server only** | Phase 0 |
| `GEMINI_API_KEY` | Google AI Studio → Get API key | **Server only** | Phase 3 |
| `LITEAPI_KEY` | liteapi.travel dashboard → sandbox key first; production after adding a card | **Server only** | Phase 8 |
| `SERPAPI_KEY` (optional) | serpapi.com (free 250/month) | **Server only** | Phase 8 |
| `FOURSQUARE_API_KEY` (optional) | foursquare.com/developers → Places API | **Server only** | Phase 4 |
| `FLIGHT_STATUS_API_KEY` (optional) | AeroDataBox (via RapidAPI) or AviationStack | **Server only** | Phase 9 |
| `SENTRY_DSN` (optional) | sentry.io | Client + server | Phase 10 |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` (optional, rate limiting) | upstash.com (free tier) | **Server only** | Phase 10 |

No key is needed for Aladhan, Open-Meteo, OSM Overpass or Frankfurter.
