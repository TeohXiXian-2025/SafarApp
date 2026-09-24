import { describe, expect, it } from 'vitest';
import { tierSatisfies } from './common';
import { CreateTripInput } from './trip';
import { paths } from './paths';

describe('tierSatisfies', () => {
  it('accepts equal or stricter tiers', () => {
    expect(tierSatisfies('certified', 'certified')).toBe(true);
    expect(tierSatisfies('certified', 'pork_free')).toBe(true);
    expect(tierSatisfies('muslim_owned', 'pork_free')).toBe(true);
  });
  it('rejects looser tiers', () => {
    expect(tierSatisfies('pork_free', 'certified')).toBe(false);
    expect(tierSatisfies('not_halal', 'pork_free')).toBe(false);
  });
});

describe('CreateTripInput', () => {
  const base = {
    name: 'Tokyo 2026',
    destinations: [{ name: 'Tokyo', location: { lat: 35.68, lng: 139.76 }, timezone: 'Asia/Tokyo' }],
    startDate: '2026-12-01',
    endDate: '2026-12-07',
    currency: 'MYR',
  };
  it('accepts a valid trip', () => {
    expect(CreateTripInput.safeParse(base).success).toBe(true);
  });
  it('rejects end before start', () => {
    expect(CreateTripInput.safeParse({ ...base, endDate: '2026-11-30' }).success).toBe(false);
  });
});

describe('paths.placeKey', () => {
  it('prefers Google place ids, falls back to OSM', () => {
    expect(paths.placeKey({ placeId: 'ChIJ123' })).toBe('g_ChIJ123');
    expect(paths.placeKey({ osmId: 'node/42' })).toBe('osm_node_42');
  });
});
