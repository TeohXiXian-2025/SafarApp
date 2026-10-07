import { describe, expect, it } from 'vitest';
import { resetDemoCacheOnce } from './resetCache';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: (key) => { items.delete(key); },
    clear: () => { items.clear(); },
  };
}

describe('one-time demo cache reset', () => {
  it('clears only demo trip keys in local and session storage', () => {
    const local = memoryStorage();
    const session = memoryStorage();
    local.setItem('safar:quest-clicked:demo_abc', '["start"]');
    local.setItem('safar:quest-skipped:demo_old', '["vote"]');
    local.setItem('safar:lastCurrency:demo_abc', 'JPY');
    local.setItem('safar:quest-clicked:real_trip', '["start"]');
    local.setItem('firebase:authUser', 'keep');
    session.setItem('safar:quest-seen:demo_abc', '["members"]');

    expect(resetDemoCacheOnce(local, session)).toBe(true);
    expect(local.getItem('safar:quest-clicked:demo_abc')).toBeNull();
    expect(local.getItem('safar:quest-skipped:demo_old')).toBeNull();
    expect(local.getItem('safar:lastCurrency:demo_abc')).toBeNull();
    expect(session.getItem('safar:quest-seen:demo_abc')).toBeNull();
    expect(local.getItem('safar:quest-clicked:real_trip')).toBe('["start"]');
    expect(local.getItem('firebase:authUser')).toBe('keep');

    local.setItem('safar:quest-clicked:demo_abc', '["start"]');
    expect(resetDemoCacheOnce(local, session)).toBe(false);
    expect(local.getItem('safar:quest-clicked:demo_abc')).toBe('["start"]');
  });
});
