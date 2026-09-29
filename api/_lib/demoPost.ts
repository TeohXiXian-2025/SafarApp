// The Instagram link in the demo trip's Trip Quest (DEMO_POST_URL) was read
// once with the real importer (ScrapeCreators: caption + video transcript →
// the AI → the map), and that answer is kept here. A demo trip importing that
// exact link gets it back at once: no paid post reader or AI call per visitor
// (the demo allows 150 trips a day; the reader 500 posts a month). Any other
// link — and the same link on a real trip — is read live as usual.
//
// Recorded 29 Sep 2026. The reel names the district "Arashiyama"; the map
// lookup matched a road there, so that one is kept as the bamboo grove the AI
// described ("scenic bamboo grove") — its Google place.
import { DEMO_POST_URL } from '../../src/domain/index.js';

export const DEMO_POST_IMPORT = {
  source: {
    type: 'instagram',
    url: DEMO_POST_URL,
    author: 'morgane_bblt',
    caption: 'Japon 🇯🇵 KYOTO ~ Arashiyama, Kinkaku-ji, Nishiki market...',
  },
  candidates: [
    {
      place: {
        placeId: 'ChIJrYtcv-urAWAR3XzWvXv8n_s',
        name: 'Arashiyama Bamboo Forest',
        address: 'Sagaogurayama Tabuchiyamacho, Ukyo Ward, Kyoto, 616-8394, Japan',
        location: { lat: 35.0168187, lng: 135.6713013 },
      },
      category: 'nature',
      what: 'Scenic bamboo grove and tourist district',
      distanceKm: 8,
      nearest: 'Kyoto',
    },
    {
      place: {
        placeId: 'ChIJvUbrwCCoAWARX2QiHCsn5A4',
        name: 'Kinkaku-ji',
        address: '1 Kinkakujichō, Kita Ward, Kyoto, 603-8361, Japan',
        location: { lat: 35.03937, lng: 135.7292431 },
      },
      category: 'culture',
      what: 'Golden pavilion temple and scenic pond view',
      distanceKm: 7,
      nearest: 'Kyoto',
    },
    {
      place: {
        placeId: 'ChIJT8uMzZwIAWARnGzsARCjnrY',
        name: 'Nishiki Market',
        address: 'Higashiuoyacho, Nakagyo Ward, Kyoto, 604-8055, Japan',
        location: { lat: 35.0050258, lng: 135.764723 },
      },
      category: 'shopping',
      what: 'Traditional food market with local street food',
      distanceKm: 2,
      nearest: 'Kyoto',
    },
  ],
  unresolved: [],
  skippedRegions: [],
  used: { provider: 'scrapecreators', images: 1, transcript: true, skipped: null },
};

/** The same post, however it was pasted (www or not, ?igsh= share ids, /reel/ or /p/). */
export function isDemoPost(url: string): boolean {
  const code = (u: string) => u.match(/instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p)\/([\w-]+)/i)?.[1];
  const want = code(DEMO_POST_URL);
  return !!want && code(url) === want;
}
