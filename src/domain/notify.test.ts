import { describe, expect, it } from 'vitest';
import { isQuiet, NotifyPrefs, shouldSend } from './notify';

const all = NotifyPrefs.parse({});
// 2026-12-07 15:00 UTC = 23:00 in Kuala Lumpur, 00:00 in Tokyo, 16:00 in Paris.
const at = new Date('2026-12-07T15:00:00Z');

describe('notifications', () => {
  it('everything is on by default', () => {
    expect(Object.values(all).every(Boolean)).toBe(true);
  });

  it('quiet hours follow the trip timezone', () => {
    expect(isQuiet('Asia/Kuala_Lumpur', at)).toBe(true);
    expect(isQuiet('Europe/Paris', at)).toBe(false);
  });

  it('holds non-urgent alerts at night but not deadlines', () => {
    expect(shouldSend('new_idea', all, 'Asia/Kuala_Lumpur', at)).toBe(false);
    expect(shouldSend('choose', all, 'Asia/Kuala_Lumpur', at)).toBe(true);
    expect(shouldSend('new_idea', all, 'Europe/Paris', at)).toBe(true);
  });

  it('respects what each person turned off', () => {
    expect(shouldSend('comment', { ...all, comment: false }, 'Europe/Paris', at)).toBe(false);
  });
});
