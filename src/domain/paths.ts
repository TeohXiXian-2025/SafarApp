// Single source of truth for Firestore / Storage paths.
// Keep in sync with firestore.rules and storage.rules.

export const paths = {
  user: (uid: string) => `users/${uid}`,

  trips: () => 'trips',
  trip: (tripId: string) => `trips/${tripId}`,
  members: (tripId: string) => `trips/${tripId}/members`,
  member: (tripId: string, uid: string) => `trips/${tripId}/members/${uid}`,
  invites: (tripId: string) => `trips/${tripId}/invites`,
  bookings: (tripId: string) => `trips/${tripId}/bookings`,
  ideas: (tripId: string) => `trips/${tripId}/ideas`,
  idea: (tripId: string, ideaId: string) => `trips/${tripId}/ideas/${ideaId}`,
  votes: (tripId: string, ideaId: string) => `trips/${tripId}/ideas/${ideaId}/votes`,
  vote: (tripId: string, ideaId: string, uid: string) => `trips/${tripId}/ideas/${ideaId}/votes/${uid}`,
  splits: (tripId: string) => `trips/${tripId}/splits`,
  schedule: (tripId: string) => `trips/${tripId}/schedule`,
  expenses: (tripId: string) => `trips/${tripId}/expenses`,
  documents: (tripId: string) => `trips/${tripId}/documents`,
  checks: (tripId: string) => `trips/${tripId}/checks`,
  incidents: (tripId: string) => `trips/${tripId}/incidents`,
  jobs: (tripId: string) => `trips/${tripId}/jobs`,
  job: (tripId: string, jobId: string) => `trips/${tripId}/jobs/${jobId}`,
  activity: (tripId: string) => `trips/${tripId}/activity`,

  /** Top-level invite index so /join/:token can find the trip. */
  inviteToken: (token: string) => `inviteTokens/${token}`,

  // Shared across all trips (worldwide halal knowledge)
  placeKey: (p: { placeId?: string; osmId?: string }) =>
    p.placeId ? `g_${p.placeId}` : `osm_${(p.osmId ?? '').replace('/', '_')}`,
  halalSummary: (placeKey: string) => `halalSummary/${placeKey}`,
  halalReports: (placeKey: string) => `halalReports/${placeKey}/reports`,
  halalReport: (placeKey: string, uid: string) => `halalReports/${placeKey}/reports/${uid}`,
  certifiers: () => 'certifiers',
} as const;

export const storagePaths = {
  tripUserFile: (tripId: string, uid: string, fileName: string) => `trips/${tripId}/users/${uid}/${fileName}`,
  halalEvidence: (placeKey: string, uid: string, fileName: string) => `halal/${placeKey}/${uid}/${fileName}`,
} as const;
