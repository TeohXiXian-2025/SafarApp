import { TripState, GroupConflict, ItineraryStop, TravelerGroup } from '../types/itinerary';

export interface PlanningContext {
  tripState: TripState;
  activeGroups: TravelerGroup[];
  itineraryStops: ItineraryStop[];
  currentCity: string;
}

export function getPlanningContext(state: TripState): PlanningContext {
  return {
    tripState: state,
    activeGroups: state.travelerGroups,
    itineraryStops: state.activeDayId === 'overview' 
      ? state.days.flatMap(d => d.stops) 
      : state.days.find(d => d.id === state.activeDayId)?.stops || [],
    currentCity: state.days.find(d => d.id === state.activeDayId)?.city || state.days[0].city,
  };
}

export function detectGroupConflicts(context: PlanningContext): GroupConflict[] {
  const conflicts: GroupConflict[] = [];

  // If group travel mode is off, no conflicts are evaluated
  if (!context.tripState.groupTravelMode) {
    return conflicts;
  }

  // Iterate over stops to detect simulated conflicts based on group preferences
  for (const stop of context.itineraryStops) {
    
    // DEMO SCENARIO: Conflict around Food
    // If the stop is a FOOD stop and groups have different preferences
    if (stop.category === 'FOOD') {
      const groupA = context.activeGroups.find(g => g.name === 'Group A');
      const groupB = context.activeGroups.find(g => g.name === 'Group B');
      
      // Look for a specific lunch stop to flag (e.g. at 12:00 in Kyoto)
      if (groupA && groupB && stop.timeWindow?.start?.includes('12:00 PM')) {
        conflicts.push({
          id: `conflict-${stop.id}-${Date.now()}`,
          type: 'FOOD_PREFERENCE',
          severity: 'high',
          activityId: stop.id,
          groupsInvolved: [groupA.id, groupB.id],
          description: `Different group preferences detected. 🟢 Group A (${groupA.preferences.join(', ')}) vs 🟣 Group B (${groupB.preferences.join(', ')})`,
          detectedAt: Date.now(),
        });
      }
    }
    
    // Future generic rules can be added here
    // e.g. checking Attraction tags against group preferences
  }

  return conflicts;
}
