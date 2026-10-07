// The demo trip: a ready-made December trip to Japan that anyone can try
// without an account. The visitor plays Aisyah, who plans for her mother,
// her brother and his friend; the three others are "travel mates" run by the
// server, who vote and choose through the same rules as real people.
// Everything in the demo kit files (public/demo-kit) agrees with this story.

/** Demo trip ids start with this — the server can tell a demo trip without reading it. */
export const DEMO_TRIP_PREFIX = 'demo_';
export const isDemoTrip = (tripId: string) => tripId.startsWith(DEMO_TRIP_PREFIX);

/** A demo trip (and its guest account) is deleted this long after it starts, unless kept. */
export const DEMO_TTL_MS = 48 * 3_600_000;
export const DEMO_DATA_VERSION = 1;

/** The travel mates' fixed ids (real accounts nobody can sign in to). */
export const DEMO_MATES = {
  aminah: 'safar-demo-aminah',
  farid: 'safar-demo-farid',
  daniel: 'safar-demo-daniel',
} as const;
export const isDemoMate = (uid: string) => uid.startsWith('safar-demo-');

/** The name the visitor plays (it is also the name on the demo tickets and passport). */
export const DEMO_PLAYER = 'Aisyah';

export interface DemoFile {
  file: string;
  label: string;
  /** What it is, in a few words. */
  what: string;
}

/** The files the visitor uploads during the quest (served from /demo-kit/). */
export const DEMO_KIT: Record<string, DemoFile> = {
  flight: { file: '01-flight-e-ticket-MH-6KQ2PX.pdf', label: 'Flight e-ticket', what: 'MH 88 KUL → Tokyo, MH 53 Osaka → KUL' },
  hotelTokyo: { file: '02-hotel-Richmond-Asakusa.pdf', label: 'Tokyo hotel', what: 'Richmond Asakusa, 7–10 Dec' },
  train: { file: '03-shinkansen-Nozomi-21.png', label: 'Shinkansen ticket', what: 'Nozomi 21 Tokyo → Kyoto, 10 Dec' },
  hotelKyoto: { file: '04-hotel-Granvia-Kyoto.pdf', label: 'Kyoto hotel', what: 'Hotel Granvia Kyoto, 10–13 Dec' },
  passport: { file: '06-passport-SPECIMEN-Aisyah.png', label: 'Passport (specimen)', what: "Aisyah's passport" },
  receipt: { file: '07-receipt-Panga-dinner.png', label: 'Dinner receipt', what: 'Halal wagyu dinner, ¥38,720' },
  delay: { file: '08-train-delay-notice.png', label: 'Delay message', what: 'Nozomi 21 running 90 min late' },
};
/**
 * The Instagram reel Farid shares in the quest — a real public post
 * (Arashiyama, Kinkaku-ji, Nishiki Market). Pasted as a link into Ideas.
 */
export const DEMO_POST_URL = 'https://www.instagram.com/morgane_bblt/reel/C7bkjq_xL5M/';

export const demoKitUrl = (f: DemoFile) => `/demo-kit/${f.file}`;

/** The idea already waiting for the visitor's vote (Daniel's pick; the others can't eat there). */
export const DEMO_SPLIT_PLACE = 'Ichiran';
