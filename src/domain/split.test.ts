import { describe, expect, it } from 'vitest';
import { aloneIn, reunionAfter, splitExplanation } from './split';

const members = [{ uid: 'ali', displayName: 'Ali' }, { uid: 'bob', displayName: 'Bob' }, { uid: 'cara', displayName: 'Cara' }, { uid: 'dan', displayName: 'Dan' }];

describe('reunionAfter', () => {
  it('waits for the slowest group, walking there and back included', () => {
    expect(reunionAfter([{ key: 'A', walkMin: 0, durationMin: 90 }, { key: 'B', walkMin: 8, durationMin: 60 }])).toBe(90);
    expect(reunionAfter([{ key: 'A', walkMin: 0, durationMin: 60 }, { key: 'B', walkMin: 8, durationMin: 60 }, { key: 'C', walkMin: 12, durationMin: 75 }])).toBe(100);
  });

  it('free time lasts as long as the main visit', () => {
    expect(reunionAfter([{ key: 'A', walkMin: 0, durationMin: 75 }, { key: 'F', walkMin: 0, durationMin: 75 }])).toBe(75);
  });
});

describe('splitExplanation', () => {
  it('describes every group and the meeting point', () => {
    const text = splitExplanation(
      [
        { key: 'A', label: 'Ramen Ya', memberUids: ['bob', 'cara'], walkMin: 0 },
        { key: 'B', label: 'Halal Ramen', memberUids: ['ali'], walkMin: 6 },
        { key: 'F', label: 'Free time', memberUids: ['dan'], walkMin: 0 },
      ],
      members,
      90,
    );
    expect(text).toBe('Bob and Cara go to Ramen Ya. Ali goes to Halal Ramen, 6 min walk away. Dan has free time nearby. Everyone meets back at Ramen Ya after 1 h 30 min.');
  });

  it('flags people who would be on their own', () => {
    expect(aloneIn([{ key: 'A', memberUids: ['bob'] }, { key: 'B', memberUids: ['ali'] }, { key: 'C', memberUids: ['cara', 'dan'] }]).map((t) => t.key)).toEqual(['B']);
  });
});
