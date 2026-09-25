import { describe, expect, it } from 'vitest';
import { foodVerdict, nameSaysHalal } from './food';

const summary = (over = {}) => ({ reportCount: 2, flags: {}, ...over });
const ai = (over = {}) => ({ verdict: 'unknown' as const, flags: {}, source: 'ai_estimate' as const, ...over });

describe('foodVerdict', () => {
  it('community reports win, with the certificate named', () => {
    expect(foodVerdict({ community: summary({ tier: 'certified', certificate: { certifier: 'JAKIM' } }), listed: null })).toMatchObject({ bucket: 'certified', text: 'Certified · JAKIM' });
    expect(foodVerdict({ community: summary({ tier: 'not_halal' }), listed: 'google' }).bucket).toBe('not_halal');
  });

  it('pork found by the radar beats a halal listing', () => {
    expect(foodVerdict({ analysis: ai({ flags: { servesPork: true } }), listed: 'google' })).toMatchObject({ bucket: 'not_halal', text: 'Serves pork' });
  });

  it('listings count as halal; no pork without a listing is pork-free', () => {
    expect(foodVerdict({ listed: 'osm' })).toMatchObject({ bucket: 'halal', basis: 'OpenStreetMap' });
    expect(foodVerdict({ analysis: ai({ flags: { servesPork: false } }) }).bucket).toBe('pork_free');
  });

  it('says plainly when nothing is known', () => {
    expect(foodVerdict({})).toMatchObject({ bucket: 'unknown', text: 'Not checked yet' });
    expect(foodVerdict({ analysis: ai() })).toMatchObject({ bucket: 'unknown', text: 'Halal not confirmed' });
  });

  it('spots halal in names in several languages', () => {
    for (const n of ['Nasi Kandar Halal', 'Muslim Food Seoul', '清真兰州拉面', 'ハラールラーメン', '할랄가이즈']) expect(nameSaysHalal(n), n).toBe(true);
    expect(nameSaysHalal('Halalan Cafe')).toBe(false);
  });
});

describe('AI pre-screen guesses', () => {
  it('a likely-halal guess never counts as Halal, and any real check wins', () => {
    const g = { verdict: 'likely_halal' as const, reason: 'Nasi kandar (Malaysian Muslim cuisine)' };
    expect(foodVerdict({ guess: g }).bucket).toBe('likely');
    expect(foodVerdict({ guess: g, listed: 'google' }).bucket).toBe('halal');
    expect(foodVerdict({ guess: { verdict: 'likely_pork', reason: 'Char siu' } }).bucket).toBe('not_halal');
    expect(foodVerdict({ guess: { verdict: 'unknown', reason: '' } }).bucket).toBe('unknown');
  });
});
