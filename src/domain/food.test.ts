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

describe('placeRule — free signals so few places stay "not sure"', () => {
  const r = (name: string, types: string[], country: string) => foodVerdict({ place: { name, types }, country }).bucket;
  it('Japan: no halal sign = not halal; pork-ish food = not halal; often-halal cuisines = likely', () => {
    expect(r('Rokurinsha', ['ramen_restaurant', 'restaurant'], 'JP')).toBe('not_halal');
    expect(r("McDonald's Meidaimae", ['fast_food_restaurant', 'cafe', 'restaurant'], 'JP')).toBe('not_halal');
    expect(r('Island Kitchen', ['chicken_restaurant', 'restaurant'], 'JP')).toBe('not_halal');
    expect(r('Saray Kebab', ['turkish_restaurant', 'restaurant'], 'JP')).toBe('likely');
    expect(r('Sushi Zanmai', ['sushi_restaurant', 'restaurant'], 'JP')).toBe('friendly');
    expect(r('T’s Tantan Vegan', ['vegan_restaurant', 'restaurant'], 'JP')).toBe('friendly');
    expect(r('Blue Bottle Coffee', ['cafe', 'coffee_shop'], 'JP')).toBe('unknown');
  });
  it('Malaysia: most places likely halal; pork words and Chinese kitchens are not', () => {
    expect(r('Serai Chicken Rice', ['chicken_restaurant', 'restaurant'], 'MY')).toBe('likely');
    expect(r('Ayam BBQ Pak Mat', ['barbecue_restaurant', 'restaurant'], 'MY')).toBe('likely');
    expect(r('Sun Fong Bak Kut Teh', ['restaurant'], 'MY')).toBe('not_halal');
    expect(r('Restoran Pik Wah', ['chinese_restaurant', 'restaurant'], 'MY')).toBe('unknown');
    expect(r('古厝咖啡屋 Kopi House', ['restaurant'], 'MY')).toBe('unknown');
  });
  it('a listing or a traveller report always beats the rule', () => {
    expect(foodVerdict({ listed: 'google', place: { name: 'Chabuzen', types: ['ramen_restaurant'] }, country: 'JP' }).bucket).toBe('halal');
  });
});
