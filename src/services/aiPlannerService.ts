import { AIPlanSolution, GroupConflict, TripState } from '../types/itinerary';
import { PlanningContext } from './groupConflictEngine';

export function generateWinWinPlans(conflict: GroupConflict, context: PlanningContext): AIPlanSolution[] {
  // In a real application, this would call an LLM with the context and conflict.
  // For this MVP, we return deterministically mocked responses.
  
  const conflictStop = context.itineraryStops.find(s => s.id === conflict.activityId);
  if (!conflictStop) return [];

  // Mocked solutions for FOOD_PREFERENCE (Halal vs Japanese) at Lunch
  return [
    {
      id: `sol-${Date.now()}-stay-together`,
      type: 'STAY_TOGETHER',
      title: 'Stay Together (Compromise)',
      description: 'Dine at a Halal-certified Japanese restaurant to satisfy both groups simultaneously.',
      score: 82,
      tradeoffs: [
        '✓ Keeps the entire group together',
        '✓ Satisfies both Halal and Japanese preferences',
        '⚠ Restaurant is a 15 min walk from the current itinerary path',
        '⚠ Limited menu options compared to specialized restaurants',
      ],
      reasoning: 'The AI found "Ayam-Ya Halal Ramen" which serves authentic Japanese food while maintaining Halal certification. It requires a slight detour but maximizes group cohesion.',
      additionalTravelMinutes: 15,
      proposedStops: [
        {
          ...conflictStop,
          id: `${conflictStop.id}-compromise`,
          title: 'Lunch at Ayam-Ya Halal Ramen',
          description: 'A compromise location serving authentic Japanese ramen with Halal certification, satisfying both Group A and Group B.',
          halalTier: 'certified',
          tags: ['Halal', 'Ramen', 'Compromise'],
        }
      ]
    },
    {
      id: `sol-${Date.now()}-smart-split`,
      type: 'SMART_SPLIT',
      title: 'Smart Split (Hero Option)',
      description: 'Groups split for lunch to eat their preferred cuisines, then reunite at the next activity.',
      score: 94,
      tradeoffs: [
        '✓ Zero compromise on food preferences',
        '✓ Minimal disruption to the timeline',
        '✓ Automatic reunion coordination',
        '⚠ Groups are separated for 90 minutes',
      ],
      reasoning: 'By splitting temporarily, Group A can visit the highly-rated Halal Yakiniku Panga, while Group B can enjoy traditional non-Halal sushi nearby. They will automatically reunite at the next shared activity.',
      splitDurationMinutes: 90,
      reunionPointStopId: context.itineraryStops[context.itineraryStops.findIndex(s => s.id === conflict.activityId) + 1]?.id,
      proposedStops: [
        {
          ...conflictStop,
          id: `${conflictStop.id}-group-a`,
          title: 'Lunch for Group A: Yakiniku Panga',
          description: 'Premium Halal Wagyu Yakiniku.',
          halalTier: 'certified',
          isCustomNode: true,
          groupId: 'group-a',
          tags: ['Halal', 'Wagyu', 'Group A'],
        },
        {
          ...conflictStop,
          id: `${conflictStop.id}-group-b`,
          title: 'Lunch for Group B: Sushi Zanmai',
          description: 'Authentic Japanese Sushi.',
          halalTier: 'pork_free',
          isCustomNode: true,
          groupId: 'group-b',
          tags: ['Sushi', 'Japanese', 'Group B'],
        }
      ]
    },
    {
      id: `sol-${Date.now()}-alternative`,
      type: 'ALTERNATIVE_ACTIVITY',
      title: 'Alternative Shared Activity',
      description: 'Skip the sit-down lunch and visit Nishiki Market instead, where everyone can graze on their own safe options.',
      score: 91,
      tradeoffs: [
        '✓ Keeps the group in the same general area',
        '✓ High variety of choices',
        '⚠ Can be crowded and difficult to navigate as a large group',
        '⚠ No guaranteed seating for resting',
      ],
      reasoning: 'Nishiki Market offers a wide variety of street food. Group A can find Halal-friendly snacks (like seafood and roasted chestnuts) while Group B enjoys traditional Kyoto street food.',
      additionalTravelMinutes: 0,
      proposedStops: [
        {
          ...conflictStop,
          id: `${conflictStop.id}-alt`,
          title: 'Nishiki Market Street Food',
          description: 'A bustling market where everyone can find food that fits their dietary needs while staying in the same general area.',
          category: 'ATTRACTION',
          tags: ['Street Food', 'Market', 'Flexible'],
        }
      ]
    }
  ];
}
