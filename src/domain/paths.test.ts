import { describe, expect, it } from 'vitest';
import { paths } from './paths';

describe('paths.placeKey', () => {
  it('keys a place by whichever source it came from', () => {
    expect(paths.placeKey({ placeId: 'ChIJ123' })).toBe('g_ChIJ123');
    // A backup-source place (OpenStreetMap via Overpass / Geoapify) is keyed by its OpenStreetMap id.
    expect(paths.placeKey({ placeId: 'osm_node_2398283841' })).toBe('osm_node_2398283841');
    expect(paths.placeKey({ osmId: 'way/230308615' })).toBe('osm_way_230308615');
    // No id at all (e.g. a Geoapify place without one): by where it is.
    expect(paths.placeKey({ placeId: 'geo_abc', location: { lat: 35.71481, lng: 139.79672 } })).toBe('at_35.71481_139.79672');
  });
});
