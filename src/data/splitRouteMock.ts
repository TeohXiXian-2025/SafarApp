import { GroupMember, SplitPlan } from '../types/itinerary';

// ─────────────────────────────────────────────────────────────
// Group member avatars (kept in one place for reuse)
// ─────────────────────────────────────────────────────────────
const AMINA_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCMF4QQmYrpQ8HzjKhko22Jih1K3Y-q9rsjUNXYRcpuQRJZI9-kTyAVgy2hXl4ubqoeftdJqglilA_c73YAr4sRGffw_2BHxAK3cZh_1Z9KUpaNPheUdZPiBanGXDd2ZbeGKWGxkp7B73A4r9z9_CGzj6xnfS-tKgUcB7WVZAIfFAP6bubKyIQy9r70Msd0Wzbb7MLscKojguDl97TQqJtERYKuskyLaCccThAFvloV5IFKf7Nz5Sog';
const TARIQ_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC133IKxAgCTGR47vbYwhl60DtevMKEWGqeUD_gsiOvGr5LbKvRW65h-ix4T-EGpNb5ufA8gSXyIQsYUlyViFwPgsiuUl0TeCh0Jt_1EIOaofnpjshWSZCeeEY7lhwNB2oULddS51XyV2UEPqUVYIWLDNlZktWYS4WTr2LumMH5Q2_YdEx8VMMz6MO6YkRLQHJnzhqODkTp5ao_y35AtByaK7UwFfnI-irUQ_65eUt7NHbbNZPJ7DHj';
const FATIMA_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBAChZK1TxxHFvMqjiu_YnzbmK2tokcHpgsvjINABpSt5upTsGqY4k2txbpGttoCGAmuDUYvcLSENXqem2Wd0gxiwIJnDQ-b0I1zHY2NLOSNwJWClnWqFilMsMTnpVQoW4zNUXpFv7j4RzZ6unHDRs3MMP88ION-YkhG1YnVMV3-0Golz5G7KiX5jyw9790kljHvG8ZM4HLD5_HioEwSGtasRT8DefnsKfDjM7X5UFSjVV12Prrjm9V';
const JOHN_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

export const MOCK_GROUP_MEMBERS: GroupMember[] = [
  { id: 'amina', name: 'Amina', avatarUrl: AMINA_AVATAR, dietaryRestriction: 'Halal' },
  { id: 'tariq', name: 'Tariq', avatarUrl: TARIQ_AVATAR, dietaryRestriction: 'Halal' },
  { id: 'fatima', name: 'Fatima', avatarUrl: FATIMA_AVATAR, dietaryRestriction: 'Halal' },
  { id: 'john', name: 'John', avatarUrl: JOHN_AVATAR, dietaryRestriction: 'None' },
];

// ─────────────────────────────────────────────────────────────
// The "Ichiran vs. Halal" lunch contradiction, resolved via split
// ─────────────────────────────────────────────────────────────
export const MOCK_SPLIT_PLAN: SplitPlan = {
  id: 'split-asakusa-lunch',
  timeSlot: '1:15 PM – 2:15 PM',
  duration: '1 hr',
  reason:
    "Ichiran's signature tonkotsu broth is pork-based, which conflicts with the Halal requirements set for Amina, Tariq and Fatima. Instead of forcing a compromise, the AI splits the group for lunch and re-syncs everyone at Senso-ji.",
  optionA: {
    name: 'Narita-ya Halal Ramen Asakusa',
    tag: '100% Halal Certified',
    tagColor: 'green',
    rating: 4.7,
    reviewsCount: 1420,
    address: '2 Chome-7-13 Asakusa, Taito City, Tokyo',
    distanceFromCurrent: '350m (4 min walk)',
    walkingToSyncPoint: '6 min walk to Senso-ji',
    imageUrl:
      'https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=800&q=80',
    assignedMembers: [
      { id: 'amina', name: 'Amina', avatarUrl: AMINA_AVATAR, dietaryRestriction: 'Halal' },
      { id: 'tariq', name: 'Tariq', avatarUrl: TARIQ_AVATAR, dietaryRestriction: 'Halal' },
      { id: 'fatima', name: 'Fatima', avatarUrl: FATIMA_AVATAR, dietaryRestriction: 'Halal' },
    ],
    cuisineType: 'Halal Chicken Paitan Ramen',
    priceRange: '$$',
  },
  optionB: {
    name: 'Ichiran Ramen Asakusa',
    tag: 'Original Tonkotsu',
    tagColor: 'gray',
    rating: 4.5,
    reviewsCount: 8230,
    address: '1-1-16 Asakusa, Taito City, Tokyo',
    distanceFromCurrent: '220m (3 min walk)',
    walkingToSyncPoint: '8 min walk to Senso-ji',
    imageUrl:
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
    assignedMembers: [
      { id: 'john', name: 'John', avatarUrl: JOHN_AVATAR, dietaryRestriction: 'None' },
    ],
    cuisineType: 'Pork Tonkotsu Ramen',
    priceRange: '$$',
  },
  syncPoint: {
    locationName: 'Senso-ji Temple',
    meetingTime: '2:30 PM',
    address: '2 Chome-3-1 Asakusa, Taito City, Tokyo',
    bufferMinutes: 15,
    landmarkTip: 'Meet at Kaminarimon Gate entrance — look for the giant red lantern.',
  },
  alternativeSuggestions: [
    {
      id: 'alt-halal-together',
      title: 'Stay together at a Halal-certified Japanese spot',
      description:
        'Ayam-Ya Halal Ramen serves an authentic chicken-based tonkotsu-style broth with full Halal certification, so nobody has to split up.',
    },
    {
      id: 'alt-market',
      title: 'Switch to a shared street-food market',
      description:
        'Nakamise-dori has stalls with grilled corn, karaage and mochi — everyone picks their own safe option while staying together.',
    },
  ],
};
