// ============================================================
// Safar OS — Halal Radar Mock Data
// Realistic restaurant seed data near Tokyo & Kyoto itinerary stops
// ============================================================

import { HalalRestaurant, HalalStatus } from '../types/halalRadar';

/**
 * 12 mock restaurants placed near real Tokyo & Kyoto landmarks
 * to match the existing trip context in useTripState.
 */
export const MOCK_HALAL_RESTAURANTS: HalalRestaurant[] = [
  // ─── Tokyo Area ────────────────────────────────────────
  {
    id: 'hr-001',
    name: 'Naritakaya Halal Wagyu',
    cuisine: 'Japanese BBQ (Yakiniku)',
    imageUrl:
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.CERTIFIED_HALAL,
    menuVerified: true,
    liveWaitTime: 12,
    coordinates: { lat: 35.6595, lng: 139.7004 }, // Near Shibuya
    rating: 4.8,
    reviewCount: 1420,
    address: '2-24-12 Dogenzaka, Shibuya-ku, Tokyo',
    phone: '+81-3-5489-1290',
    openingHours: '11:00 AM – 10:00 PM',
    certifyingBody: 'Japan Halal Foundation',
    menuHighlights: [
      'A5 Wagyu Yakiniku Set',
      'Halal Chicken Katsu Don',
      'Miso Grilled Lamb',
      'Matcha Ice Cream',
    ],
    priceRange: '$$$',
  },
  {
    id: 'hr-002',
    name: 'Gyumon Asakusa',
    cuisine: 'Halal Ramen & Gyudon',
    imageUrl:
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.CERTIFIED_HALAL,
    menuVerified: true,
    liveWaitTime: 5,
    coordinates: { lat: 35.7148, lng: 139.7967 }, // Near Senso-ji
    rating: 4.6,
    reviewCount: 890,
    address: '1-36-5 Asakusa, Taito-ku, Tokyo',
    phone: '+81-3-6231-6629',
    openingHours: '10:30 AM – 9:30 PM',
    certifyingBody: 'Japan Islamic Trust',
    menuHighlights: [
      'Tonkotsu-Style Halal Ramen',
      'Gyudon (Beef Bowl)',
      'Chicken Karaage',
      'Edamame & Miso Soup',
    ],
    priceRange: '$$',
  },
  {
    id: 'hr-003',
    name: 'Istanbul Kebab House',
    cuisine: 'Turkish & Middle Eastern',
    imageUrl:
      'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.MUSLIM_OWNED,
    menuVerified: true,
    liveWaitTime: 3,
    coordinates: { lat: 35.6938, lng: 139.7034 }, // Near Shinjuku
    rating: 4.4,
    reviewCount: 620,
    address: '3-17-8 Shinjuku, Shinjuku-ku, Tokyo',
    openingHours: '11:00 AM – 11:00 PM',
    menuHighlights: [
      'Döner Kebab Plate',
      'Adana Kebab',
      'Hummus & Pita',
      'Baklava',
    ],
    priceRange: '$$',
  },
  {
    id: 'hr-004',
    name: 'CoCo Ichibanya Halal Akihabara',
    cuisine: 'Japanese Curry',
    imageUrl:
      'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.CERTIFIED_HALAL,
    menuVerified: true,
    liveWaitTime: 8,
    coordinates: { lat: 35.6983, lng: 139.7731 }, // Near Akihabara
    rating: 4.5,
    reviewCount: 2100,
    address: '1-6 Kandasudacho, Chiyoda-ku, Tokyo',
    phone: '+81-3-3526-7560',
    openingHours: '11:00 AM – 10:00 PM',
    certifyingBody: 'Japan Halal Foundation',
    menuHighlights: [
      'Chicken Katsu Curry',
      'Vegetable Curry',
      'Beef Hamburger Curry',
      'Naan Set',
    ],
    priceRange: '$$',
  },
  {
    id: 'hr-005',
    name: 'Sekai Cafe Oshiage',
    cuisine: 'Japanese Fusion (Halal/Vegan)',
    imageUrl:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.MUSLIM_OWNED,
    menuVerified: true,
    liveWaitTime: 0,
    coordinates: { lat: 35.7101, lng: 139.8107 }, // Near Tokyo Skytree
    rating: 4.3,
    reviewCount: 450,
    address: '1-13-8 Narihira, Sumida-ku, Tokyo',
    openingHours: '9:00 AM – 6:00 PM',
    menuHighlights: [
      'Halal Bento Box',
      'Vegan Ramen',
      'Matcha Latte',
      'Onigiri Set',
    ],
    priceRange: '$',
  },
  {
    id: 'hr-006',
    name: 'Sukiya Tsukiji (Pork-Free)',
    cuisine: 'Japanese Fast Food',
    imageUrl:
      'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.PORK_FREE,
    menuVerified: false,
    liveWaitTime: 2,
    coordinates: { lat: 35.6654, lng: 139.7707 }, // Near Tsukiji
    rating: 3.9,
    reviewCount: 340,
    address: '4-13-18 Tsukiji, Chuo-ku, Tokyo',
    openingHours: 'Open 24 Hours',
    menuHighlights: [
      'Beef Gyudon',
      'Seafood Don',
      'Teriyaki Chicken Bowl',
      'Egg & Rice Set',
    ],
    priceRange: '$',
  },

  // ─── Kyoto Area ────────────────────────────────────────
  {
    id: 'hr-007',
    name: 'Matsuri Halal Kitchen',
    cuisine: 'Kaiseki (Traditional Japanese)',
    imageUrl:
      'https://images.unsplash.com/photo-1580442151529-343f2f6e0e27?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.CERTIFIED_HALAL,
    menuVerified: true,
    liveWaitTime: 20,
    coordinates: { lat: 35.0039, lng: 135.7688 }, // Near Kiyomizu-dera
    rating: 4.9,
    reviewCount: 780,
    address: '1-287 Kiyomizu, Higashiyama-ku, Kyoto',
    phone: '+81-75-541-7788',
    openingHours: '11:30 AM – 9:00 PM',
    certifyingBody: 'Japan Halal Foundation',
    menuHighlights: [
      'Halal Kaiseki Course (7 dishes)',
      'Matcha Soba',
      'Wagyu Sukiyaki',
      'Sakura Mochi',
    ],
    priceRange: '$$$$',
  },
  {
    id: 'hr-008',
    name: "Ali's Curry House Kyoto",
    cuisine: 'Indian & Pakistani',
    imageUrl:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.MUSLIM_OWNED,
    menuVerified: true,
    liveWaitTime: 7,
    coordinates: { lat: 35.0116, lng: 135.7681 }, // Near Gion
    rating: 4.5,
    reviewCount: 560,
    address: '570-150 Gionmachi Minamigawa, Higashiyama-ku, Kyoto',
    openingHours: '11:00 AM – 10:00 PM',
    menuHighlights: [
      'Butter Chicken Curry',
      'Lamb Biryani',
      'Garlic Naan',
      'Mango Lassi',
    ],
    priceRange: '$$',
  },
  {
    id: 'hr-009',
    name: 'Kyoto Halal Ramen Honke',
    cuisine: 'Halal Ramen',
    imageUrl:
      'https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.CERTIFIED_HALAL,
    menuVerified: true,
    liveWaitTime: 15,
    coordinates: { lat: 34.9856, lng: 135.7590 }, // Near Fushimi Inari
    rating: 4.7,
    reviewCount: 1050,
    address: '34 Fukakusa, Fushimi-ku, Kyoto',
    phone: '+81-75-642-8890',
    openingHours: '11:00 AM – 8:30 PM',
    certifyingBody: 'Malaysia JAKIM',
    menuHighlights: [
      'Shoyu Halal Ramen',
      'Miso Ramen',
      'Gyoza (Halal Chicken)',
      'Chashu Chicken Don',
    ],
    priceRange: '$$',
  },
  {
    id: 'hr-010',
    name: 'Arashiyama Tofu House',
    cuisine: 'Japanese Vegetarian/Vegan',
    imageUrl:
      'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.PORK_FREE,
    menuVerified: false,
    liveWaitTime: 10,
    coordinates: { lat: 35.0145, lng: 135.6728 }, // Near Bamboo Grove
    rating: 4.2,
    reviewCount: 290,
    address: '45 Sagatenryuji, Ukyo-ku, Kyoto',
    openingHours: '10:00 AM – 5:00 PM',
    menuHighlights: [
      'Yudofu Set (Hot Tofu)',
      'Shojin Ryori Course',
      'Tofu Dengaku',
      'Green Tea & Wagashi',
    ],
    priceRange: '$$',
  },
  {
    id: 'hr-011',
    name: 'Noor Kebab Kyoto Station',
    cuisine: 'Turkish Fast Food',
    imageUrl:
      'https://images.unsplash.com/photo-1561651188-d207bbec4ec3?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.MUSLIM_OWNED,
    menuVerified: true,
    liveWaitTime: 4,
    coordinates: { lat: 34.9858, lng: 135.7588 }, // Near Kyoto Station
    rating: 4.1,
    reviewCount: 380,
    address: 'Kyoto Station Building B1F, Shimogyo-ku, Kyoto',
    openingHours: '10:00 AM – 9:00 PM',
    menuHighlights: [
      'Chicken Döner Wrap',
      'Lamb Kebab Plate',
      'Falafel Wrap',
      'Ayran',
    ],
    priceRange: '$',
  },
  {
    id: 'hr-012',
    name: 'Yoshinoya Kyoto (Pork-Free Menu)',
    cuisine: 'Japanese Fast Food',
    imageUrl:
      'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=600&q=80',
    status: HalalStatus.PORK_FREE,
    menuVerified: false,
    liveWaitTime: 0,
    coordinates: { lat: 35.0094, lng: 135.7556 }, // Near Nijo Castle
    rating: 3.8,
    reviewCount: 210,
    address: '248 Nishiiru, Oike-dori, Nakagyo-ku, Kyoto',
    openingHours: 'Open 24 Hours',
    menuHighlights: [
      'Beef Gyudon (No Pork)',
      'Chicken Teriyaki Don',
      'Salmon Set',
      'Miso Soup & Rice',
    ],
    priceRange: '$',
  },
];

/**
 * Returns all mock halal restaurants.
 * In production, this would be replaced with a Firestore query.
 */
export function getAllHalalRestaurants(): HalalRestaurant[] {
  return MOCK_HALAL_RESTAURANTS;
}

/**
 * Returns mock restaurants filtered by halal status tier.
 */
export function getRestaurantsByTier(tier: HalalStatus): HalalRestaurant[] {
  return MOCK_HALAL_RESTAURANTS.filter((r) => r.status === tier);
}
