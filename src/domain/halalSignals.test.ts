import { describe, expect, it } from 'vitest';
import { scanText, scoreHalal, sgPostal } from './halalSignals';
import { summarizeReports } from './idea';

describe('scanText', () => {
  it('reads halal, pork-free and certifiers in several languages', () => {
    const s = scanText(['All our chicken is HALAL, certified by JAKIM', 'ハラール対応のラーメン', 'No pork no lard', 'Great 할랄 food']);
    expect(s.halal).toBe(3);
    expect(s.noPork).toBe(1);
    expect(s.certifier).toBe('JAKIM (Malaysia)');
  });
  it("doesn't count 'not halal' for it, and spots pork dishes", () => {
    const s = scanText(['Sadly not halal', 'The tonkotsu broth is rich']);
    expect(s.halal).toBe(0);
    expect(s.pork).toBe(1);
  });
});

describe('scoreHalal', () => {
  it('a certification directory listing ⇒ certified', () => {
    expect(scoreHalal({ directory: 'MUIS (Singapore)', googleHalalType: true }).tier).toBe('certified');
  });
  it('two independent listings ⇒ halal without the AI', () => {
    expect(scoreHalal({ googleHalalType: true, osmHalal: 'yes', ai: { tier: 'unknown', confidence: 0.2 } }).tier).toBe('muslim_owned');
  });
  it('pork on the website beats a halal listing', () => {
    expect(scoreHalal({ googleHalalType: true, website: { halal: 0, noPork: 0, muslimFriendly: 0, pork: 1, alcohol: 0 } }).tier).toBe('not_halal');
  });
  it('nothing to go on ⇒ no tier (ask, don’t guess)', () => {
    expect(scoreHalal({}).tier).toBeUndefined();
  });
});

describe('community reports', () => {
  it('one report is a lean, not a verdict', () => {
    const r = summarizeReports([{ tier: 'muslim_owned', flags: {}, updatedAt: Date.now() }]);
    expect(r.tier).toBeUndefined();
    expect(r.lean).toBe('muslim_owned');
  });
});

it('reads a Singapore postal code from a Google address', () => {
  expect(sgPostal('1 Kadayanallur St, #01-10, Singapore 069184')).toBe('069184');
});
