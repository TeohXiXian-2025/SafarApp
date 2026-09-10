import { CityCoordinateSystem, PrayerFacility } from '../types';

export const PRAYER_COORDINATE_SYSTEMS: Record<string, CityCoordinateSystem> = {
  Kyoto: {
    city: 'Kyoto',
    country: 'Japan',
    centerLat: 35.0116,
    centerLng: 135.7681,
    qiblaDegree: 289,
    qiblaDirectionText: '289° WNW',
    mapBounds: {
      minLat: 34.98,
      maxLat: 35.03,
      minLng: 135.66,
      maxLng: 135.79,
    },
    facilities: [
      {
        id: 'pf-kyoto-1',
        name: 'Kyoto Islamic Cultural Center (Masjid Kyoto)',
        type: 'mosque',
        city: 'Kyoto',
        address: '92-2 Miyagakicho, Kamigyo Ward, Kyoto 602-0853',
        lat: 35.0287,
        lng: 135.7725,
        mapX: 52,
        mapY: 22,
        distance: '1.2 km',
        walkMinutes: 14,
        nearestActivityTitle: 'Arashiyama Bamboo Grove',
        wuduFacilities: 'heated_wudu',
        hasSistersSection: true,
        hasJummah: true,
        qiblaBearing: '289° WNW',
        openingHours: '05:00 – 22:00 Daily',
        verifiedSource: 'Safar OS Verified · Kyoto Halal Council',
        capacityText: 'Large (250+ capacity)',
        notes: 'Main central mosque of Kyoto. Spacious heated ablution facilities, dedicated women’s mezzanine floor, and Friday Jummah prayers with English/Japanese khutbah.',
        rating: 4.9,
      },
      {
        id: 'pf-kyoto-2',
        name: 'Gion Kawaramachi Musalla & Tatami Space',
        type: 'musalla',
        city: 'Kyoto',
        address: 'Gionmachi Kitagawa 2F, Higashiyama Ward, Kyoto',
        lat: 35.0041,
        lng: 135.7725,
        mapX: 62,
        mapY: 50,
        distance: '280m',
        walkMinutes: 4,
        nearestActivityTitle: 'Halal Wagyu Yakiniku Panga Gion',
        wuduFacilities: 'dedicated_wudu',
        hasSistersSection: true,
        hasJummah: false,
        qiblaBearing: '289° WNW',
        openingHours: '10:00 – 21:00 Daily',
        verifiedSource: 'Safar OS Community Verified',
        capacityText: 'Medium (30 people)',
        notes: 'Directly across from Shijo-Dori, 4 mins walk from Wagyu Panga. Traditional tatami prayer space with wudu washlet and quiet family curtain dividers.',
        rating: 4.8,
      },
      {
        id: 'pf-kyoto-3',
        name: 'Kiyomizu Rest Pavilion Quiet Prayer Space',
        type: 'quiet_space',
        city: 'Kyoto',
        address: 'Matsubara-dori Kiyomizu 2-chome, Higashiyama Ward',
        lat: 34.9962,
        lng: 135.782,
        mapX: 84,
        mapY: 72,
        distance: '320m',
        walkMinutes: 5,
        nearestActivityTitle: 'Kiyomizu-dera Temple',
        wuduFacilities: 'washroom_wudu',
        hasSistersSection: true,
        hasJummah: false,
        qiblaBearing: '289° WNW',
        openingHours: '09:00 – 18:00',
        verifiedSource: 'Kyoto Muslim Friendly Tourism Association',
        capacityText: 'Cozy (12 people)',
        notes: 'Discreet, serene carpeted corner with mobile folding screens, clean prayer rugs, and clear Qibla compass markers on the ceiling.',
        rating: 4.7,
      },
      {
        id: 'pf-kyoto-4',
        name: 'Saga-Arashiyama Station Multipurpose Prayer Corner',
        type: 'station_musalla',
        city: 'Kyoto',
        address: 'JR Saga-Arashiyama Station West Concourse, Ukyo Ward',
        lat: 35.018,
        lng: 135.679,
        mapX: 22,
        mapY: 38,
        distance: '450m',
        walkMinutes: 6,
        nearestActivityTitle: 'Yojiya Cafe Saga',
        wuduFacilities: 'dedicated_wudu',
        hasSistersSection: true,
        hasJummah: false,
        qiblaBearing: '289° WNW',
        openingHours: '06:00 – 23:00',
        verifiedSource: 'JR West Accessibility & Muslim Welcome Program',
        capacityText: 'Compact (8 people)',
        notes: 'Step-free access, automated sliding privacy door, modern bidet wudu station, and prayer garment (telekung/mukena) storage cabinet.',
        rating: 4.6,
      },
      {
        id: 'pf-kyoto-5',
        name: 'Kyoto Station Hachijo Musalla (B1F)',
        type: 'station_musalla',
        city: 'Kyoto',
        address: 'Hachijo Gate B1F, Shimogyo Ward, Kyoto',
        lat: 34.9858,
        lng: 135.7588,
        mapX: 44,
        mapY: 88,
        distance: '850m',
        walkMinutes: 10,
        nearestActivityTitle: 'Kyoto Transit Hub',
        wuduFacilities: 'heated_wudu',
        hasSistersSection: true,
        hasJummah: false,
        qiblaBearing: '289° WNW',
        openingHours: 'Open 24/7 (Intercom at night)',
        verifiedSource: 'Kyoto City Tourism Bureau',
        capacityText: 'Medium (25 people)',
        notes: 'Official tourist information center prayer room. Separate men and women prayer halls, electronic prayer time clocks, and luggage storage lockers.',
        rating: 4.9,
      },
    ],
  },
  Osaka: {
    city: 'Osaka',
    country: 'Japan',
    centerLat: 34.6937,
    centerLng: 135.5023,
    qiblaDegree: 288,
    qiblaDirectionText: '288° WNW',
    mapBounds: {
      minLat: 34.65,
      maxLat: 34.73,
      minLng: 35.48,
      maxLng: 35.53,
    },
    facilities: [
      {
        id: 'pf-osaka-1',
        name: 'Osaka Central Masjid (Kobe / Osaka)',
        type: 'mosque',
        city: 'Osaka',
        address: '4-2-13 Nakano-cho, Miyakojima-ku, Osaka',
        lat: 34.7145,
        lng: 135.512,
        mapX: 54,
        mapY: 28,
        distance: '1.5 km',
        walkMinutes: 18,
        nearestActivityTitle: 'Kansai Airport Hotel Check-in',
        wuduFacilities: 'heated_wudu',
        hasSistersSection: true,
        hasJummah: true,
        qiblaBearing: '288° WNW',
        openingHours: '05:00 – 22:30 Daily',
        verifiedSource: 'Safar OS Verified',
        capacityText: 'Large (350+ capacity)',
        notes: 'Historic prominent mosque with full Friday congregational prayers, halal grocery store, and spacious wudu areas.',
        rating: 4.9,
      },
      {
        id: 'pf-osaka-2',
        name: 'Namba City Mall Prayer Room (South B1F)',
        type: 'station_musalla',
        city: 'Osaka',
        address: '5-1-60 Namba, Chuo Ward, Osaka',
        lat: 34.6631,
        lng: 135.5015,
        mapX: 48,
        mapY: 65,
        distance: '350m',
        walkMinutes: 5,
        nearestActivityTitle: 'Halal Ramen Honolu Osaka',
        wuduFacilities: 'dedicated_wudu',
        hasSistersSection: true,
        hasJummah: false,
        qiblaBearing: '288° WNW',
        openingHours: '10:00 – 21:00',
        verifiedSource: 'Nankai Railway Muslim Guide',
        capacityText: 'Medium (20 people)',
        notes: 'Convenient central location in Namba. Clean ablution area with hot water washlets and dedicated sisters section.',
        rating: 4.8,
      },
      {
        id: 'pf-osaka-3',
        name: 'Dotonbori Tourist Information Musalla',
        type: 'musalla',
        city: 'Osaka',
        address: '1-7-21 Dotonbori, Chuo Ward, Osaka',
        lat: 34.6687,
        lng: 135.5028,
        mapX: 50,
        mapY: 52,
        distance: '210m',
        walkMinutes: 3,
        nearestActivityTitle: 'Arrival & Dotonbori Halal Food Walk',
        wuduFacilities: 'washroom_wudu',
        hasSistersSection: true,
        hasJummah: false,
        qiblaBearing: '288° WNW',
        openingHours: '09:00 – 22:00',
        verifiedSource: 'Osaka Convention & Tourism Bureau',
        capacityText: 'Compact (10 people)',
        notes: 'Right along the Dotonbori Canal walk, 3 mins from Halal street vendors. Fully air-conditioned with prayer mats.',
        rating: 4.7,
      },
    ],
  },
  Nara: {
    city: 'Nara',
    country: 'Japan',
    centerLat: 34.6851,
    centerLng: 135.8048,
    qiblaDegree: 289,
    qiblaDirectionText: '289° WNW',
    mapBounds: {
      minLat: 34.66,
      maxLat: 34.7,
      minLng: 135.78,
      maxLng: 135.83,
    },
    facilities: [
      {
        id: 'pf-nara-1',
        name: 'Nara Muslim Community Prayer Room',
        type: 'musalla',
        city: 'Nara',
        address: 'Sanjo-dori 12-4, Nara City 630-8226',
        lat: 34.682,
        lng: 135.82,
        mapX: 55,
        mapY: 48,
        distance: '480m',
        walkMinutes: 6,
        nearestActivityTitle: 'Nara Deer Park & Todai-ji Temple',
        wuduFacilities: 'dedicated_wudu',
        hasSistersSection: true,
        hasJummah: false,
        qiblaBearing: '289° WNW',
        openingHours: '10:00 – 20:00',
        verifiedSource: 'Nara Halal Friendly Association',
        capacityText: 'Medium (20 people)',
        notes: 'Located near Kintetsu Nara station, easy walk from the Deer Park. Wudu sinks and clean rugs provided.',
        rating: 4.7,
      },
    ],
  },
  Mecca: {
    city: 'Mecca',
    country: 'Saudi Arabia',
    centerLat: 21.4225,
    centerLng: 39.8262,
    qiblaDegree: 0,
    qiblaDirectionText: 'Kaaba Epicenter',
    mapBounds: {
      minLat: 21.4,
      maxLat: 21.45,
      minLng: 39.8,
      maxLng: 39.85,
    },
    facilities: [
      {
        id: 'pf-mecca-1',
        name: 'Masjid al-Haram (The Grand Mosque)',
        type: 'mosque',
        city: 'Mecca',
        address: 'Al Haram, Makkah 24231',
        lat: 21.4225,
        lng: 39.8262,
        mapX: 50,
        mapY: 50,
        distance: '0m',
        walkMinutes: 1,
        nearestActivityTitle: 'Tawaf & Umrah Rites',
        wuduFacilities: 'heated_wudu',
        hasSistersSection: true,
        hasJummah: true,
        qiblaBearing: 'Direct Kaaba Facing',
        openingHours: 'Open 24/7 (Continuous)',
        verifiedSource: 'Presidency for the Affairs of the Two Holy Mosques',
        capacityText: 'Supreme (2.5M capacity)',
        notes: 'The holiest site in Islam. Extensive subterranean ablution complexes, Zamzam taps, automated elevators, and nursing rooms.',
        rating: 5.0,
      },
      {
        id: 'pf-mecca-2',
        name: 'Masjid Aisha (Al-Taneem Mosque)',
        type: 'mosque',
        city: 'Mecca',
        address: 'Al Madinah Al Munawwarah Rd, At Taneem',
        lat: 21.4647,
        lng: 39.7994,
        mapX: 30,
        mapY: 20,
        distance: '7.5 km',
        walkMinutes: 12,
        nearestActivityTitle: 'Ihram Renewal & Miqat',
        wuduFacilities: 'heated_wudu',
        hasSistersSection: true,
        hasJummah: true,
        qiblaBearing: 'Facing Kaaba',
        openingHours: 'Open 24/7',
        verifiedSource: 'Saudi Ministry of Islamic Affairs',
        capacityText: 'Large (15,000 capacity)',
        notes: 'Primary Miqat point for inhabitants and visitors entering Ihram for subsequent Umrahs. Abundant shower and ablution facilities.',
        rating: 4.9,
      },
      {
        id: 'pf-mecca-3',
        name: 'Masjid Al-Rayah (Flag Mosque)',
        type: 'mosque',
        city: 'Mecca',
        address: 'Al Jumaizah, Makkah',
        lat: 21.4345,
        lng: 39.832,
        mapX: 60,
        mapY: 38,
        distance: '1.2 km',
        walkMinutes: 15,
        nearestActivityTitle: 'Historic Makkah Trail',
        wuduFacilities: 'heated_wudu',
        hasSistersSection: true,
        hasJummah: true,
        qiblaBearing: 'Facing Kaaba',
        openingHours: 'Open for all 5 daily prayers',
        verifiedSource: 'Historic Makkah Landmarks',
        capacityText: 'Medium (500 capacity)',
        notes: 'Historical mosque where the Prophet (PBUH) planted his flag during the conquest of Makkah.',
        rating: 4.8,
      },
    ],
  },
  Istanbul: {
    city: 'Istanbul',
    country: 'Turkey',
    centerLat: 41.0082,
    centerLng: 28.9784,
    qiblaDegree: 148,
    qiblaDirectionText: '148° SSE',
    mapBounds: {
      minLat: 41.0,
      maxLat: 41.03,
      minLng: 28.95,
      maxLng: 29.0,
    },
    facilities: [
      {
        id: 'pf-ist-1',
        name: 'Hagia Sophia Grand Mosque (Ayasofya-i Kebir)',
        type: 'mosque',
        city: 'Istanbul',
        address: 'Sultan Ahmet, Ayasofya Meydanı No:1, Fatih/İstanbul',
        lat: 41.0086,
        lng: 28.9802,
        mapX: 55,
        mapY: 48,
        distance: '180m',
        walkMinutes: 2,
        nearestActivityTitle: 'Sultanahmet Historical Square',
        wuduFacilities: 'heated_wudu',
        hasSistersSection: true,
        hasJummah: true,
        qiblaBearing: '148° SSE',
        openingHours: 'Open for all 5 prayers',
        verifiedSource: 'Diyanet Affairs Turkey',
        capacityText: 'Grand (3,000 capacity)',
        notes: 'Architectural masterpiece. Active congregational prayers with dedicated tourist and worshipper corridors.',
        rating: 4.9,
      },
      {
        id: 'pf-ist-2',
        name: 'The Blue Mosque (Sultan Ahmed Mosque)',
        type: 'mosque',
        city: 'Istanbul',
        address: 'Binbirdirek, At Meydanı Cd No:10, Fatih/İstanbul',
        lat: 41.0054,
        lng: 28.9768,
        mapX: 48,
        mapY: 58,
        distance: '240m',
        walkMinutes: 3,
        nearestActivityTitle: 'Historic Hippodrome & Spice Bazaar',
        wuduFacilities: 'heated_wudu',
        hasSistersSection: true,
        hasJummah: true,
        qiblaBearing: '148° SSE',
        openingHours: 'Open daily around prayer times',
        verifiedSource: 'Diyanet Affairs Turkey',
        capacityText: 'Grand (10,000 capacity)',
        notes: 'Famous six minarets and blue Iznik tiles. Heated outdoor courtyard ablution fountains and serene carpeted interior.',
        rating: 4.9,
      },
    ],
  },
};

/**
 * Returns the prayer coordinate system and mock facilities for a given city or destination name
 */
export function getPrayerCoordinateSystem(cityOrDestination?: string): CityCoordinateSystem {
  if (!cityOrDestination) {
    return PRAYER_COORDINATE_SYSTEMS['Kyoto'];
  }

  const query = cityOrDestination.toLowerCase();

  if (query.includes('kyoto') || query.includes('japan')) {
    return PRAYER_COORDINATE_SYSTEMS['Kyoto'];
  }
  if (query.includes('osaka') || query.includes('kansai') || query.includes('dotonbori')) {
    return PRAYER_COORDINATE_SYSTEMS['Osaka'];
  }
  if (query.includes('nara')) {
    return PRAYER_COORDINATE_SYSTEMS['Nara'];
  }
  if (query.includes('mecca') || query.includes('makkah') || query.includes('umrah') || query.includes('madinah')) {
    return PRAYER_COORDINATE_SYSTEMS['Mecca'];
  }
  if (query.includes('istanbul') || query.includes('turkey') || query.includes('turkiye')) {
    return PRAYER_COORDINATE_SYSTEMS['Istanbul'];
  }

  // Default to Kyoto coordinate system
  return PRAYER_COORDINATE_SYSTEMS['Kyoto'];
}

/**
 * Find the closest prayer facility to an activity or coordinates
 */
export function findNearestPrayerFacility(
  facilities: PrayerFacility[],
  activityLat?: number,
  activityLng?: number,
  activityTitle?: string
): PrayerFacility | null {
  if (!facilities.length) return null;

  // If activity title directly matches facility nearest activity
  if (activityTitle) {
    const directMatch = facilities.find(
      (f) => f.nearestActivityTitle && activityTitle.toLowerCase().includes(f.nearestActivityTitle.toLowerCase().split(' ')[0])
    );
    if (directMatch) return directMatch;
  }

  // If coordinates provided, compute closest Euclidean distance
  if (activityLat && activityLng) {
    let closest = facilities[0];
    let minDistanceSq = Number.MAX_VALUE;

    for (const f of facilities) {
      const dLat = f.lat - activityLat;
      const dLng = f.lng - activityLng;
      const distSq = dLat * dLat + dLng * dLng;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closest = f;
      }
    }
    return closest;
  }

  return facilities[0];
}
