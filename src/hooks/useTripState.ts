import { useReducer, useCallback } from 'react';
import {
  TripState,
  TripAction,
  GeoCoordinate,
  MapLayer,
  ItineraryStop,
  ItineraryDay,
  DEFAULT_PRAYER_SETTINGS,
  PrayerSettings,
} from '../types/itinerary';

// =====================================================
// Complete Tokyo & Kyoto Itinerary (Wanderlog Format)
// =====================================================
export const INITIAL_TRIP_STATE: TripState = {
  tripId: 'tokyo-kyoto-2026',
  title: 'Trip to Tokyo & Kyoto 🇯🇵',
  destination: 'Tokyo & Kyoto, Japan',
  dateRange: { start: '2026-09-10', end: '2026-09-12' },
  currentLeadId: 'amina',
  activeDayId: 'day-1',
  selectedStopId: null,
  hoveredStopId: null,
  activeMapLayer: 'all',
  navRailCollapsed: false,
  aiAssistantOpen: false,
  prayerSettings: DEFAULT_PRAYER_SETTINGS,
  members: [
    {
      id: 'amina',
      name: 'Amina',
      avatar:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCMF4QQmYrpQ8HzjKhko22Jih1K3Y-q9rsjUNXYRcpuQRJZI9-kTyAVgy2hXl4ubqoeftdJqglilA_c73YAr4sRGffw_2BHxAK3cZh_1Z9KUpaNPheUdZPiBanGXDd2ZbeGKWGxkp7B73A4r9z9_CGzj6xnfS-tKgUcB7WVZAIfFAP6bubKyIQy9r70Msd0Wzbb7MLscKojguDl97TQqJtERYKuskyLaCccThAFvloV5IFKf7Nz5Sog',
      role: 'Team Lead 👑',
      isLead: true,
      status: 'active',
      faithDietary: 'strictly_halal',
    },
    {
      id: 'tariq',
      name: 'Tariq',
      avatar:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC133IKxAgCTGR47vbYwhl60DtevMKEWGqeUD_gsiOvGr5LbKvRW65h-ix4T-EGpNb5ufA8gSXyIQsYUlyViFwPgsiuUl0TeCh0Jt_1EIOaofnpjshWSZCeeEY7lhwNB2oULddS51XyV2UEPqUVYIWLDNlZktWYS4WTr2LumMH5Q2_YdEx8VMMz6MO6YkRLQHJnzhqODkTp5ao_y35AtByaK7UwFfnI-irUQ_65eUt7NHbbNZPJ7DHj',
      role: 'Tripmate (Logistics)',
      isLead: false,
      status: 'active',
      faithDietary: 'muslim_owned',
    },
    {
      id: 'fatima',
      name: 'Fatima',
      avatar:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBAChZK1TxxHFvMqjiu_YnzbmK2tokcHpgsvjINABpSt5upTsGqY4k2txbpGttoCGAmuDUYvcLSENXqem2Wd0gxiwIJnDQ-b0I1zHY2NLOSNwJWClnWqFilMsMTnpVQoW4zNUXpFv7j4RzZ6unHDRs3MMP88ION-YkhG1YnVMV3-0Golz5G7KiX5jyw9790kljHvG8ZM4HLD5_HioEwSGtasRT8DefnsKfDjM7X5UFSjVV12Prrjm9V',
      role: 'Tripmate (Foodie)',
      isLead: false,
      status: 'active',
      faithDietary: 'strictly_halal',
    },
    {
      id: 'john',
      name: 'John',
      avatar:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      role: 'Tripmate (Non-Muslim)',
      isLead: false,
      status: 'idle',
      faithDietary: 'non_muslim',
    },
  ],
  mapViewport: {
    center: { lat: 35.6700, lng: 139.8100 },
    zoom: 12,
  },
  unassignedPlaces: [
    {
      id: 'wish-1',
      title: 'Starbucks Coffee Company',
      address: 'Tokyo, Japan',
      coordinate: { lat: 35.6600, lng: 139.7020 },
      category: 'FOOD',
      tags: ['Coffee', 'Breakfast', 'Pastries'],
      addedBy: 'fatima',
    },
    {
      id: 'wish-2',
      title: 'Half Moon Bay Distillery',
      address: 'Half Moon Bay, CA',
      coordinate: { lat: 37.4636, lng: -122.4286 },
      category: 'ATTRACTION',
      tags: ['Tasting', 'Artisan', 'Distillery'],
      addedBy: 'john',
    },
    {
      id: 'wish-3',
      title: 'Venice Beach',
      address: 'Half Moon Bay State Beach, CA',
      coordinate: { lat: 37.4786, lng: -122.4497 },
      category: 'ATTRACTION',
      tags: ['Beach', 'Fishing', 'Picnic', 'Campground'],
      addedBy: 'tariq',
    },
    {
      id: 'wish-4',
      title: 'Mavericks Beach',
      address: 'Half Moon Bay, CA',
      coordinate: { lat: 37.4950, lng: -122.4990 },
      category: 'ATTRACTION',
      tags: ['Big-Wave Surfing', 'Scenic', 'Legendary'],
      addedBy: 'tariq',
    },
  ],
  days: [
    // =========================================================================
    // DAY 1: Thursday, September 10th — Tokyo Disney, teamLab & Skytree Line
    // Color: Cyan (#0284C7 / #00BCD4)
    // Distance & Time: 1 hr 15 mins, 16.4 mi
    // =========================================================================
    {
      id: 'day-1',
      dayNumber: 1,
      date: '2026-09-10',
      dateLabel: '09.10 周四 · Day 1',
      themeTitle: 'Tokyo Disney & Skytree Line',
      subtitle: '迪士尼与晴空塔经典线',
      city: 'Tokyo',
      color: '#0284C7', // Cyan to identify Day 1 itinerary
      distanceMiles: '16.4 mi',
      durationSummary: '1 hr 15 mins',
      routeSummary: 'Disneyland → DisneySea → teamLab Planets → Tsukiji → Skytree',
      centerCoordinate: { lat: 35.6700, lng: 139.8100 },
      salahTimes: [
        { name: 'Fajr', time: '04:10 AM', isPassed: true },
        { name: 'Dhuhr', time: '11:54 AM', isPassed: true },
        { name: 'Asr', time: '03:28 PM', isPassed: true },
        { name: 'Maghrib', time: '06:10 PM', isNext: true },
        { name: 'Isha', time: '07:31 PM' },
      ],
      stops: [
        {
          id: 's1-fajr',
          dayId: 'day-1',
          orderIndex: 0,
          title: 'Fajr Prayer (Dawn)',
          description: 'Dawn morning prayer in Tokyo hotel before embarking on Day 1 journey.',
          address: 'Tokyo Bay Hotel Musalla Space',
          coordinate: { lat: 35.6280, lng: 139.8780 },
          timeWindow: { start: '04:10 AM', end: '04:45 AM' },
          durationMinutes: 35,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Qibla: 293° WNW',
          tags: ['Fajr', 'Dawn', 'Hotel Musalla'],
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 500,
            durationMinutes: 10,
          },
        },
        {
          id: 's1-1',
          dayId: 'day-1',
          orderIndex: 1,
          title: 'Tokyo Disneyland',
          description:
            'Open 8AM–10PM • Tokyo offshoot of the iconic theme park known for its rides, live shows & costumed characters.',
          address: '1-1 Maihama, Urayasu, Chiba 279-0031',
          coordinate: { lat: 35.6329, lng: 139.8804 },
          timeWindow: { start: '08:00 AM', end: '10:00 AM' },
          durationMinutes: 120,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Theme Park', 'Iconic', 'Disney'],
          imageUrl:
            'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 400,
            durationMinutes: 5, // 5 min · 0.25 mi from PDF
          },
        },
        {
          id: 's1-2',
          dayId: 'day-1',
          orderIndex: 2,
          title: 'Tokyo Disney Resort',
          description:
            'Large entertainment complex encompassing world-class Disney theme parks, themed shopping centers, and scenic promenades.',
          address: 'Maihama, Urayasu, Chiba 279-0031',
          coordinate: { lat: 35.6300, lng: 139.8830 },
          timeWindow: { start: '10:05 AM', end: '11:25 AM' },
          durationMinutes: 80,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Resort', 'Entertainment', 'Shopping'],
          imageUrl:
            'https://images.unsplash.com/photo-1579899388302-39281e5f8a0a?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 2700,
            durationMinutes: 32, // 32 min · 1.7 mi from PDF
          },
        },
        {
          id: 's1-3',
          dayId: 'day-1',
          orderIndex: 3,
          title: 'Tokyo DisneySea',
          description:
            'Open 9AM–9PM • Part of the Disney resort, this large park has 7 themed ports of call with rides, shows & dining.',
          address: '1-13 Maihama, Urayasu, Chiba 279-8511',
          coordinate: { lat: 35.6267, lng: 139.8850 },
          timeWindow: { start: '11:30 AM', end: '12:45 PM' },
          durationMinutes: 75,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Theme Park', 'DisneySea', 'Nautical'],
          imageUrl:
            'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 200,
            durationMinutes: 3,
          },
        },
        {
          id: 's1-dhuhr',
          dayId: 'day-1',
          orderIndex: 4,
          title: 'Dhuhr Prayer — Disney Guest Musalla',
          description:
            'Midday prayer at the quiet designated prayer space available via Disney Guest Relations. Wudu access provided.',
          address: 'Tokyo Disney Resort Main Guest Relations, Maihama',
          coordinate: { lat: 35.6290, lng: 139.8820 },
          timeWindow: { start: '12:45 PM', end: '01:15 PM' },
          durationMinutes: 30,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Wudu + Quiet Room Available',
          tags: ['Dhuhr', 'Prayer Room', 'Halal'],
          transitToNext: {
            mode: 'DRIVE',
            distanceMeters: 11700,
            durationMinutes: 14, // 14 min · 7.3 mi from PDF
          },
        },
        {
          id: 's1-4',
          dayId: 'day-1',
          orderIndex: 5,
          title: 'teamLab Planets TOKYO DMM',
          description:
            'Sensory body-immersive digital art museum in Toyosu where visitors walk barefoot through vibrant water and living orchid installations.',
          address: '6-1-16 Toyosu, Koto City, Tokyo 135-0061',
          coordinate: { lat: 35.6492, lng: 139.7898 },
          timeWindow: { start: '01:30 PM', end: '03:00 PM' },
          durationMinutes: 90,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Digital Art', 'Interactive', 'Sensory'],
          imageUrl:
            'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'DRIVE',
            distanceMeters: 3000,
            durationMinutes: 4, // 4 min · 1.9 mi from PDF
          },
        },
        {
          id: 's1-5',
          dayId: 'day-1',
          orderIndex: 6,
          title: 'Fish Market Tsukiji Outer Market',
          description:
            'From the web: Sprawling wholesale fish market with an array of seafood & viewing areas for a popular tuna auction.',
          address: '4 Chome-16-2 Tsukiji, Chuo City, Tokyo 104-0045',
          coordinate: { lat: 35.6655, lng: 139.7708 },
          timeWindow: { start: '03:10 PM', end: '04:15 PM' },
          durationMinutes: 65,
          category: 'FOOD',
          status: 'CONFIRMED',
          halalTier: 'pork_free',
          halalBadge: 'Fresh Halal-Friendly Seafood',
          tags: ['Seafood', 'Market', 'Street Food'],
          imageUrl:
            'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 150,
            durationMinutes: 2,
          },
        },
        {
          id: 's1-asr',
          dayId: 'day-1',
          orderIndex: 7,
          title: 'Asr Prayer — Tsukiji Musalla Space',
          description:
            'Afternoon Asr prayer near Tsukiji Outer Market. Wudu facilities with clean prayer mats.',
          address: 'Chuo City, Tsukiji 4-Chome, Tokyo',
          coordinate: { lat: 35.6660, lng: 139.7712 },
          timeWindow: { start: '04:15 PM', end: '04:45 PM' },
          durationMinutes: 30,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Wudu Facilities',
          tags: ['Asr', 'Prayer', 'Tsukiji'],
          transitToNext: {
            mode: 'DRIVE',
            distanceMeters: 7900,
            durationMinutes: 10, // 10 min · 4.9 mi from PDF
          },
        },
        {
          id: 's1-6',
          dayId: 'day-1',
          orderIndex: 8,
          title: 'Tokyo Skytree',
          description:
            'Open 10AM–10PM • World\'s tallest freestanding broadcasting tower with an observation deck boasting 360-degree views.',
          address: '1 Chome-1-2 Oshiage, Sumida City, Tokyo 131-0045',
          coordinate: { lat: 35.7101, lng: 139.8107 },
          timeWindow: { start: '05:00 PM', end: '06:10 PM' },
          durationMinutes: 70,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Observation Deck', 'Panoramic', 'Iconic'],
          imageUrl:
            'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 370,
            durationMinutes: 5, // 5 min · 0.23 mi from PDF
          },
        },
        {
          id: 's1-maghrib',
          dayId: 'day-1',
          orderIndex: 9,
          title: 'Maghrib Prayer — Skytree Solamachi Prayer Room',
          description:
            'Official prayer room on Tokyo Solamachi 5th Floor with separate wudu for men and women, Qibla compass pointer.',
          address: 'Tokyo Solamachi 5F, Sumida City, Tokyo',
          coordinate: { lat: 35.7104, lng: 139.8120 },
          timeWindow: { start: '06:10 PM', end: '06:40 PM' },
          durationMinutes: 30,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Official Solamachi Musalla · Wudu Inside',
          tags: ['Maghrib', 'Official Prayer Room', 'Qibla 293°'],
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 100,
            durationMinutes: 2,
          },
        },
        {
          id: 's1-7',
          dayId: 'day-1',
          orderIndex: 10,
          title: 'Tokyo Solamachi',
          description:
            'Open 10AM–9PM • Multilevel retail complex with 300+ stores & restaurants located in the Tokyo Skytree tower.',
          address: '1-1-2 Oshiage, Sumida City, Tokyo 131-0045',
          coordinate: { lat: 35.7106, lng: 139.8125 },
          timeWindow: { start: '06:45 PM', end: '07:30 PM' },
          durationMinutes: 45,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Shopping', 'Souvenirs', 'Dining'],
          imageUrl:
            'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 420,
            durationMinutes: 5, // 5 min · 0.26 mi from PDF
          },
        },
        {
          id: 's1-8',
          dayId: 'day-1',
          orderIndex: 11,
          title: 'Postal Museum Japan',
          description:
            'Specialized museum inside Tokyo Solamachi 9F showcasing the rich history of Japan postal communications, stamp art, and global postal heritage.',
          address: 'Tokyo Solamachi 9F, 1-1-2 Oshiage, Sumida City',
          coordinate: { lat: 35.7103, lng: 139.8130 },
          timeWindow: { start: '07:35 PM', end: '08:15 PM' },
          durationMinutes: 40,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Museum', 'History', 'Stamps'],
          imageUrl:
            'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 100,
            durationMinutes: 2,
          },
        },
        {
          id: 's1-isha',
          dayId: 'day-1',
          orderIndex: 12,
          title: 'Isha Prayer — Nightfall Prayer',
          description:
            'Evening Isha prayer completing the Day 1 itinerary. Solamachi Prayer Room 5F or Hotel Musalla.',
          address: 'Tokyo Solamachi 5F Prayer Room / Hotel Musalla',
          coordinate: { lat: 35.7104, lng: 139.8120 },
          timeWindow: { start: '08:15 PM', end: '08:45 PM' },
          durationMinutes: 30,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Wudu Facilities Available',
          tags: ['Isha', 'Night Prayer', 'Day Complete'],
        },
      ],
    },

    // =========================================================================
    // DAY 2: Friday, September 11th — Asakusa, Meiji Jingu & Shibuya Line
    // Color: Orange (#F97316)
    // Distance & Time: 1 hr 10 mins, 12.8 mi
    // =========================================================================
    {
      id: 'day-2',
      dayNumber: 2,
      date: '2026-09-11',
      dateLabel: '09.11 周五 · Day 2',
      themeTitle: 'Asakusa, Meiji Jingu & Shibuya Line',
      subtitle: '浅草寺与明治神宫涉谷线',
      city: 'Tokyo',
      color: '#F97316', // Orange color badge matching screenshot 09.02
      distanceMiles: '12.8 mi',
      durationSummary: '1 hr 10 mins',
      routeSummary: 'Sensō-ji → Asakusa → Meiji Jingu Gyoen → Shibuya Tsutaya',
      centerCoordinate: { lat: 35.6800, lng: 139.7500 },
      salahTimes: [
        { name: 'Fajr', time: '04:10 AM', isPassed: true },
        { name: 'Dhuhr', time: '11:54 AM', isPassed: true },
        { name: 'Asr', time: '03:28 PM', isPassed: true },
        { name: 'Maghrib', time: '06:10 PM', isNext: true },
        { name: 'Isha', time: '07:31 PM' },
      ],
      stops: [
        {
          id: 's2-fajr',
          dayId: 'day-2',
          orderIndex: 0,
          title: 'Fajr Prayer (Dawn)',
          description: 'Dawn prayer before departing for historic Asakusa.',
          address: 'Tokyo Hotel Musalla',
          coordinate: { lat: 35.7100, lng: 139.7900 },
          timeWindow: { start: '04:10 AM', end: '04:45 AM' },
          durationMinutes: 35,
          category: 'PRAYER',
          status: 'CONFIRMED',
          tags: ['Fajr', 'Dawn'],
        },
        {
          id: 's2-1',
          dayId: 'day-2',
          orderIndex: 1,
          title: 'Sensō-ji',
          description:
            'From the web: Completed in 645, this temple, Tokyo\'s oldest, was built to honor Kannon, the goddess of mercy.',
          address: '2-3-1 Asakusa, Taito City, Tokyo 111-0032',
          coordinate: { lat: 35.7148, lng: 139.7967 },
          timeWindow: { start: '08:30 AM', end: '10:00 AM' },
          durationMinutes: 90,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Historic', 'Oldest Temple', 'Kaminarimon Gate'],
          imageUrl:
            'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 300,
            durationMinutes: 4,
          },
        },
        {
          id: 's2-2',
          dayId: 'day-2',
          orderIndex: 2,
          title: 'Asakusa Traditional District',
          description:
            'From the web: Traditional district featuring an ancient Buddhist temple, street-food stalls, craft shops & more.',
          address: 'Asakusa, Taito City, Tokyo 111-0032',
          coordinate: { lat: 35.7119, lng: 139.7983 },
          timeWindow: { start: '10:05 AM', end: '11:40 AM' },
          durationMinutes: 95,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Traditional', 'Craft Shops', 'Street Food'],
          imageUrl:
            'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 850,
            durationMinutes: 11,
          },
        },
        {
          id: 's2-dhuhr',
          dayId: 'day-2',
          orderIndex: 3,
          title: 'Dhuhr & Jumu\'ah Prayer — Asakusa Mosque (Dar Al-Arqam)',
          description:
            'Friday congregational Jumu\'ah prayer at Asakusa Mosque. Multi-floor masjid with complete wudu ablution area and women\'s prayer hall.',
          address: '1 Chome-9-12 Higashiasakusa, Taito City, Tokyo',
          coordinate: { lat: 35.7188, lng: 139.8035 },
          timeWindow: { start: '11:50 AM', end: '01:00 PM' },
          durationMinutes: 70,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Friday Jumu\'ah · Full Wudu',
          tags: ['Jumuah', 'Mosque', 'Wudu'],
          transitToNext: {
            mode: 'TRANSIT',
            distanceMeters: 11500,
            durationMinutes: 28,
          },
        },
        {
          id: 's2-3',
          dayId: 'day-2',
          orderIndex: 4,
          title: 'Meiji Jingu Gyoen',
          description:
            'From the web: Tranquil grounds featuring a vibrant iris garden, a teahouse, fishing stand & arbor.',
          address: '1-1 Yoyogikamizonacho, Shibuya City, Tokyo 151-8557',
          coordinate: { lat: 35.6764, lng: 139.6993 },
          timeWindow: { start: '01:30 PM', end: '03:15 PM' },
          durationMinutes: 105,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Garden', 'Tranquil', 'Iris Garden', 'Teahouse'],
          imageUrl:
            'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'TRANSIT',
            distanceMeters: 2200,
            durationMinutes: 12,
          },
        },
        {
          id: 's2-asr',
          dayId: 'day-2',
          orderIndex: 5,
          title: 'Asr Prayer — Tokyo Camii & Turkish Culture Center',
          description:
            'Afternoon Asr prayer at the majestic Tokyo Camii, the largest Ottoman-style mosque in Japan. Halal market on 1st floor.',
          address: '1-19 Oyama-cho, Shibuya City, Tokyo 151-0065',
          coordinate: { lat: 35.6682, lng: 139.6767 },
          timeWindow: { start: '03:28 PM', end: '04:10 PM' },
          durationMinutes: 42,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Tokyo Camii Ottoman Masjid',
          tags: ['Mosque', 'Asr', 'Halal Market'],
          transitToNext: {
            mode: 'TRANSIT',
            distanceMeters: 3100,
            durationMinutes: 15,
          },
        },
        {
          id: 's2-4',
          dayId: 'day-2',
          orderIndex: 6,
          title: 'Starbucks Coffee - Shibuya Tsutaya',
          description:
            'From the web: Welcoming coffeehouse with handcrafted coffee, espresso & tea, plus breakfast, lunch & pastries. Iconic bird\'s-eye vantage over Shibuya Crossing.',
          address: '21-6 Udagawacho, Q-front 1F/2F, Shibuya City, Tokyo',
          coordinate: { lat: 35.6595, lng: 139.7006 },
          timeWindow: { start: '04:30 PM', end: '06:00 PM' },
          durationMinutes: 90,
          category: 'FOOD',
          status: 'CONFIRMED',
          halalTier: 'pork_free',
          tags: ['Coffee', 'Shibuya Crossing View', 'Iconic Cafe'],
          imageUrl:
            'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 600,
            durationMinutes: 8,
          },
        },
        {
          id: 's2-maghrib',
          dayId: 'day-2',
          orderIndex: 7,
          title: 'Maghrib Prayer — Shibuya Halal Musalla',
          description:
            'Sunset Maghrib prayer space near Shibuya station with wudu area, preceding halal dinner.',
          address: 'Shibuya City, Tokyo',
          coordinate: { lat: 35.6558, lng: 139.7032 },
          timeWindow: { start: '06:10 PM', end: '06:45 PM' },
          durationMinutes: 35,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Wudu Facilities Available',
          tags: ['Maghrib', 'Musalla'],
          transitToNext: {
            mode: 'TRANSIT',
            distanceMeters: 7500,
            durationMinutes: 20,
          },
        },
        {
          id: 's2-isha',
          dayId: 'day-2',
          orderIndex: 8,
          title: 'Isha Prayer & Shinkansen to Kyoto',
          description:
            'Nightfall Isha prayer before boarding the Tokaido Shinkansen bullet train to Kyoto.',
          address: 'Tokyo Station Musalla, Chiyoda City, Tokyo',
          coordinate: { lat: 35.6812, lng: 139.7671 },
          timeWindow: { start: '07:31 PM', end: '08:15 PM' },
          durationMinutes: 44,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Shinkansen Station Musalla',
          tags: ['Isha', 'Kyoto Transfer', 'Shinkansen'],
        },
      ],
    },

    // =========================================================================
    // DAY 3: Saturday, September 12th — Kyoto Shrines, Temples & Arashiyama
    // Color: Purple (#8B5CF6)
    // Distance & Time: 1 hr 33 mins, 15 mi (matching PDF Page 3)
    // =========================================================================
    {
      id: 'day-3',
      dayNumber: 3,
      date: '2026-09-12',
      dateLabel: '09.12 周六 · Day 3',
      themeTitle: 'Kyoto Shrines & Arashiyama Forest Line',
      subtitle: '伏见稻荷与岚山竹林经典线',
      city: 'Kyoto',
      color: '#8B5CF6', // Purple color badge matching screenshot
      distanceMiles: '15.0 mi',
      durationSummary: '1 hr 33 mins',
      routeSummary: 'Fushimi Inari → Kiyomizu-dera → Kyoto Tower → Arashiyama Grove',
      centerCoordinate: { lat: 35.0000, lng: 135.7300 },
      salahTimes: [
        { name: 'Fajr', time: '04:10 AM', isPassed: true },
        { name: 'Dhuhr', time: '11:54 AM', isPassed: true },
        { name: 'Asr', time: '03:28 PM', isPassed: true },
        { name: 'Maghrib', time: '06:10 PM', isNext: true },
        { name: 'Isha', time: '07:31 PM' },
      ],
      stops: [
        {
          id: 's3-fajr',
          dayId: 'day-3',
          orderIndex: 0,
          title: 'Fajr Prayer (Dawn)',
          description: 'Early morning dawn prayer in Kyoto before sunrise hike at Mt. Inari.',
          address: 'Kyoto Hotel Musalla, Shimogyo Ward',
          coordinate: { lat: 34.9850, lng: 135.7580 },
          timeWindow: { start: '04:10 AM', end: '04:45 AM' },
          durationMinutes: 35,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Qibla: 287° WNW',
          tags: ['Fajr', 'Dawn', 'Kyoto'],
          transitToNext: {
            mode: 'TRANSIT',
            distanceMeters: 4200,
            durationMinutes: 18,
          },
        },
        {
          id: 's3-1',
          dayId: 'day-3',
          orderIndex: 1,
          title: 'Fushimi Inari Taisha',
          description:
            'Open 24 hours • Mountainside Shinto shrine dating from 711 A.D. featuring a path with hundreds of traditional gates.',
          address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto 612-0882',
          coordinate: { lat: 34.9671, lng: 135.7727 },
          timeWindow: { start: '07:00 AM', end: '09:15 AM' },
          durationMinutes: 135,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Torii Gates', 'Hike', 'Shinto Shrine', 'Iconic'],
          imageUrl:
            'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'DRIVE',
            distanceMeters: 5800,
            durationMinutes: 13, // 13 min · 3.6 mi from PDF
          },
        },
        {
          id: 's3-2',
          dayId: 'day-3',
          orderIndex: 2,
          title: 'Kiyomizu-dera',
          description:
            'Open 6AM–6PM • Iconic Buddhist temple on Mount Otowa known for the scenic views afforded from its sizable veranda.',
          address: '1 Chome-294 Kiyomizu, Higashiyama Ward, Kyoto 605-0862',
          coordinate: { lat: 34.9949, lng: 135.7850 },
          timeWindow: { start: '09:30 AM', end: '11:15 AM' },
          durationMinutes: 105,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['UNESCO', 'Scenic Veranda', 'Mt Otowa', 'Historic'],
          imageUrl:
            'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'DRIVE',
            distanceMeters: 4000,
            durationMinutes: 10, // 10 min · 2.5 mi from PDF
          },
        },
        {
          id: 's3-dhuhr',
          dayId: 'day-3',
          orderIndex: 3,
          title: 'Dhuhr Prayer — Kyoto Islamic Cultural Center (Kyoto Masjid)',
          description:
            'Midday Dhuhr prayer at Kyoto\'s central Islamic Cultural Center. Complete wudu ablution area, library, and Halal information desk.',
          address: '92 Miyagakicho, Kamigyo Ward, Kyoto 602-0853',
          coordinate: { lat: 35.0210, lng: 135.7710 },
          timeWindow: { start: '11:54 AM', end: '12:35 PM' },
          durationMinutes: 41,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Kyoto Central Masjid · Full Wudu',
          tags: ['Dhuhr', 'Kyoto Masjid', 'Halal Info'],
          transitToNext: {
            mode: 'DRIVE',
            distanceMeters: 3800,
            durationMinutes: 12,
          },
        },
        {
          id: 's3-3',
          dayId: 'day-3',
          orderIndex: 4,
          title: 'Nidec Kyoto Tower',
          description:
            'Open 10AM–9PM • Tower with an observation deck offering binoculars & touch-screen guides, plus a food court.',
          address: '721-1 Higashishiokojicho, Shimogyo Ward, Kyoto 600-8216',
          coordinate: { lat: 34.9875, lng: 135.7593 },
          timeWindow: { start: '12:45 PM', end: '01:45 PM' },
          durationMinutes: 60,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Observation Deck', 'Kyoto Skyline', 'Panoramic'],
          imageUrl:
            'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 1770,
            durationMinutes: 22, // 22 min · 1.1 mi from PDF
          },
        },
        {
          id: 's3-4',
          dayId: 'day-3',
          orderIndex: 5,
          title: 'To-ji Temple',
          description:
            'Open 8AM–5PM • Historic Buddhist temple with a 5-story wooden pagoda & sculptures of deities from the 8th century.',
          address: '1 Kujocho, Minami Ward, Kyoto 601-8473',
          coordinate: { lat: 34.9811, lng: 135.7476 },
          timeWindow: { start: '02:00 PM', end: '02:50 PM' },
          durationMinutes: 50,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['5-Story Pagoda', 'UNESCO', '8th Century Deities'],
          imageUrl:
            'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 1600,
            durationMinutes: 20, // 20 min · 1 mi from PDF
          },
        },
        {
          id: 's3-5',
          dayId: 'day-3',
          orderIndex: 6,
          title: 'Kyoto Railway Museum',
          description:
            'Open 10AM–5PM • Contemporary space with exhibits on the railway & an array of locomotives & trains on display.',
          address: 'Kankijicho, Shimogyo Ward, Kyoto 600-8835',
          coordinate: { lat: 34.9872, lng: 135.7428 },
          timeWindow: { start: '03:00 PM', end: '04:00 PM' },
          durationMinutes: 60,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Railway Museum', 'Locomotives', 'Shinkansen Exhibit'],
          imageUrl:
            'https://images.unsplash.com/photo-1553775927-a071d5a6a39a?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 250,
            durationMinutes: 3,
          },
        },
        {
          id: 's3-asr',
          dayId: 'day-3',
          orderIndex: 7,
          title: 'Asr Prayer — Umekoji Park Quiet Musalla',
          description:
            'Afternoon Asr prayer in the tranquil Umekoji Park setting adjacent to the Railway Museum.',
          address: 'Umekoji Park, Shimogyo Ward, Kyoto',
          coordinate: { lat: 34.9868, lng: 135.7435 },
          timeWindow: { start: '03:28 PM', end: '03:55 PM' },
          durationMinutes: 27,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Wudu Facilities · Qibla 287°',
          tags: ['Asr', 'Umekoji', 'Park Musalla'],
          transitToNext: {
            mode: 'DRIVE',
            distanceMeters: 9800,
            durationMinutes: 16, // 16 min · 6.1 mi from PDF
          },
        },
        {
          id: 's3-6',
          dayId: 'day-3',
          orderIndex: 8,
          title: 'Arashiyama Bamboo Forest',
          description:
            'Open 24 hours • A popular sightseeing path runs uphill through this forest of towering bamboo stalks.',
          address: 'Sagaogurayama Tabuchiyamacho, Ukyo Ward, Kyoto 616-8394',
          coordinate: { lat: 35.0165, lng: 135.6713 },
          timeWindow: { start: '04:20 PM', end: '05:15 PM' },
          durationMinutes: 55,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Bamboo Stalks', 'Scenic Trail', 'Nature'],
          imageUrl:
            'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 150,
            durationMinutes: 2, // 2 min · 500 ft from PDF
          },
        },
        {
          id: 's3-7',
          dayId: 'day-3',
          orderIndex: 9,
          title: 'Okochi Sanso Garden',
          description:
            'Open 9AM–4:30PM • Elegant, tranquil Japanese gardens with scenic views & a tea house serving matcha & sweets.',
          address: '8 Tabuchiyamacho, Sagaogurayama, Ukyo Ward, Kyoto 616-8394',
          coordinate: { lat: 35.0185, lng: 135.6698 },
          timeWindow: { start: '05:18 PM', end: '05:55 PM' },
          durationMinutes: 37,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Japanese Garden', 'Matcha Tea', 'Scenic Mountain View'],
          imageUrl:
            'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 220,
            durationMinutes: 3, // 3 min · 0.14 mi from PDF
          },
        },
        {
          id: 's3-maghrib',
          dayId: 'day-3',
          orderIndex: 10,
          title: 'Maghrib Prayer — Arashiyama Reflection Musalla',
          description:
            'Sunset Maghrib prayer amidst the peaceful ambiance of Arashiyama nature reserve.',
          address: 'Arashiyama Ukyo Ward, Kyoto',
          coordinate: { lat: 35.0150, lng: 135.6710 },
          timeWindow: { start: '06:10 PM', end: '06:35 PM' },
          durationMinutes: 25,
          category: 'PRAYER',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: 'Qibla: 287° WNW',
          tags: ['Maghrib', 'Sunset', 'Arashiyama'],
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 300,
            durationMinutes: 4,
          },
        },
        {
          id: 's3-8',
          dayId: 'day-3',
          orderIndex: 11,
          title: 'Arashiyama Park Kameyama Area',
          description:
            'Open 24 hours • Established scenic area known for cherry blossoms in the spring & maple trees in the fall.',
          address: 'Saganakanoshimacho, Ukyo Ward, Kyoto 616-8383',
          coordinate: { lat: 35.0125, lng: 135.6720 },
          timeWindow: { start: '06:40 PM', end: '07:15 PM' },
          durationMinutes: 35,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Scenic Area', 'Maple Trees', 'River Vista'],
          imageUrl:
            'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'WALK',
            distanceMeters: 610,
            durationMinutes: 7, // 7 min · 0.38 mi from PDF
          },
        },
        {
          id: 's3-9',
          dayId: 'day-3',
          orderIndex: 12,
          title: 'Nonomiya Shrine Black Torii gate',
          description:
            'Ancient forest shrine mentioned in The Tale of Genji, famed for its rare and sacred Kuroki-no-Torii (unpeeled oak bark black torii gate).',
          address: '1 Nonomiyacho, Sagatenryuji, Ukyo Ward, Kyoto 616-8393',
          coordinate: { lat: 35.0178, lng: 135.6740 },
          timeWindow: { start: '07:25 PM', end: '07:55 PM' },
          durationMinutes: 30,
          category: 'ATTRACTION',
          status: 'CONFIRMED',
          tags: ['Black Torii Gate', 'Ancient Shrine', 'Tale of Genji'],
          imageUrl:
            'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=600&q=80',
          transitToNext: {
            mode: 'TRANSIT',
            distanceMeters: 8000,
            durationMinutes: 20,
          },
        },
        {
          id: 's3-isha',
          dayId: 'day-3',
          orderIndex: 13,
          title: 'Isha Prayer & Halal Dinner — Ayam-Ya Halal Ramen Karasuma',
          description:
            'Nightfall Isha prayer followed by 100% Halal certified Tori Paitan ramen dinner. Dedicated 2nd-floor musalla with wudu and Qibla indicator.',
          address: 'Shimogyo Ward, Kyoto 600-8431',
          coordinate: { lat: 35.0021, lng: 135.7588 },
          timeWindow: { start: '08:15 PM', end: '09:30 PM' },
          durationMinutes: 75,
          category: 'FOOD',
          status: 'CONFIRMED',
          halalTier: 'certified',
          halalBadge: '100% Halal Certified · Dedicated Musalla 2F',
          tags: ['Halal Ramen', 'Isha Prayer', 'Musalla Upstairs'],
          rating: 4.9,
          cost: 1600,
          costCurrency: '¥',
        },
      ],
    },
  ],
};

// Reducer function for TripState
export function tripReducer(state: TripState, action: TripAction): TripState {
  switch (action.type) {
    case 'SET_ACTIVE_DAY': {
      const day = state.days.find((d) => d.id === action.dayId);
      return {
        ...state,
        activeDayId: action.dayId,
        selectedStopId: null,
        hoveredStopId: null,
        mapViewport: day?.centerCoordinate
          ? { center: day.centerCoordinate, zoom: action.dayId === 'overview' ? 10 : 13 }
          : state.mapViewport,
      };
    }
    case 'SET_SELECTED_STOP': {
      if (!action.stopId) return { ...state, selectedStopId: null };
      const stop = state.days
        .flatMap((d) => d.stops)
        .find((s) => s.id === action.stopId);
      return {
        ...state,
        selectedStopId: action.stopId,
        mapViewport: stop?.coordinate
          ? { center: stop.coordinate, zoom: 15 }
          : state.mapViewport,
      };
    }
    case 'SET_HOVERED_STOP':
      return { ...state, hoveredStopId: action.stopId };
    case 'SET_MAP_VIEWPORT':
      return {
        ...state,
        mapViewport: { center: action.center, zoom: action.zoom },
      };
    case 'TOGGLE_NAV_RAIL':
      return { ...state, navRailCollapsed: !state.navRailCollapsed };
    case 'SET_MAP_LAYER':
      return { ...state, activeMapLayer: action.layer };
    case 'ADD_STOP': {
      const days = state.days.map((d) =>
        d.id === action.dayId ? { ...d, stops: [...d.stops, action.stop] } : d
      );
      return { ...state, days };
    }
    case 'REORDER_STOPS': {
      const days = state.days.map((d) =>
        d.id === action.dayId ? { ...d, stops: action.stops } : d
      );
      return { ...state, days };
    }
    case 'UPDATE_STOP': {
      const days = state.days.map((d) =>
        d.id === action.dayId
          ? {
              ...d,
              stops: d.stops.map((s) =>
                s.id === action.stop.id ? action.stop : s
              ),
            }
          : d
      );
      return { ...state, days };
    }
    case 'REMOVE_STOP': {
      const days = state.days.map((d) =>
        d.id === action.dayId
          ? { ...d, stops: d.stops.filter((s) => s.id !== action.stopId) }
          : d
      );
      return { ...state, days };
    }
    case 'TOGGLE_AI_ASSISTANT':
      return { ...state, aiAssistantOpen: !state.aiAssistantOpen };
    case 'INSERT_PRAYER_BREAK': {
      const days = state.days.map((d) => {
        if (d.id !== action.dayId) return d;
        const afterIndex = d.stops.findIndex((s) => s.id === action.afterStopId);
        if (afterIndex === -1) return { ...d, stops: [...d.stops, action.prayerStop] };
        const newStops = [...d.stops];
        newStops.splice(afterIndex + 1, 0, action.prayerStop);
        // Re-index orderIndex
        return { ...d, stops: newStops.map((s, i) => ({ ...s, orderIndex: i })) };
      });
      return { ...state, days };
    }
    case 'UPDATE_PRAYER_SETTINGS':
      return {
        ...state,
        prayerSettings: { ...state.prayerSettings, ...action.settings },
      };
    case 'DISMISS_PRAYER_CONFLICT':
      // Handled at component level via local state
      return state;
    default:
      return state;
  }
}

import { TripAction as TripActionType } from '../types/itinerary';

export function useTripState() {
  const [state, dispatch] = useReducer(tripReducer, INITIAL_TRIP_STATE);

  const setActiveDay = useCallback(
    (dayId: string) => dispatch({ type: 'SET_ACTIVE_DAY', dayId }),
    []
  );
  const setSelectedStop = useCallback(
    (stopId: string | null) => dispatch({ type: 'SET_SELECTED_STOP', stopId }),
    []
  );
  const setHoveredStop = useCallback(
    (stopId: string | null) => dispatch({ type: 'SET_HOVERED_STOP', stopId }),
    []
  );
  const setMapViewport = useCallback(
    (center: { lat: number; lng: number }, zoom: number) =>
      dispatch({ type: 'SET_MAP_VIEWPORT', center, zoom }),
    []
  );
  const toggleNavRail = useCallback(
    () => dispatch({ type: 'TOGGLE_NAV_RAIL' }),
    []
  );
  const setMapLayer = useCallback(
    (layer: TripState['activeMapLayer']) =>
      dispatch({ type: 'SET_MAP_LAYER', layer }),
    []
  );
  const addStop = useCallback(
    (dayId: string, stop: ItineraryStop) =>
      dispatch({ type: 'ADD_STOP', dayId, stop }),
    []
  );
  const reorderStops = useCallback(
    (dayId: string, stops: ItineraryStop[]) =>
      dispatch({ type: 'REORDER_STOPS', dayId, stops }),
    []
  );

  const activeDay = state.days.find((d) => d.id === state.activeDayId) ?? state.days[0];
  const activeStops = state.activeDayId === 'overview'
    ? state.days.flatMap((d) => d.stops)
    : activeDay?.stops ?? [];

  return {
    state,
    dispatch: dispatch as (action: TripActionType) => void,
    activeDay,
    activeStops,
    setActiveDay,
    setSelectedStop,
    setHoveredStop,
    setMapViewport,
    toggleNavRail,
    setMapLayer,
    addStop,
    reorderStops,
  };
}
