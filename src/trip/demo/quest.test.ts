import { describe, expect, it } from 'vitest';
import { QUEST, questProgress, type QuestInput } from './quest';

const input = (): QuestInput => ({
  uid: 'demo-user',
  bookings: [],
  ideas: [],
  jobs: [],
  expenses: [],
  incidents: [],
  schedule: [],
  seen: new Set(['home', 'members', 'members#invite', 'members#preferences', 'ideas#vote', 'ideas#conflict', 'timeline']),
  clicked: new Set(),
  hasPassport: true,
});

describe('demo quest progress', () => {
  it('starts at step 1 even after pages have been visited', () => {
    const q = input();
    expect(questProgress(q).count).toBe(0);
    expect(questProgress(q).current?.id).toBe('start');

    q.clicked.add('start');
    expect(questProgress(q).current?.id).toBe('group');
    q.clicked.add('group');
    expect(questProgress(q).current?.id).toBe('invite');
  });

  it('provides a highlighted control for every interactive step', () => {
    expect(QUEST.filter((step) => step.id !== 'final').every((step) => !!step.target)).toBe(true);
  });

  it('waits for the generated plan to be applied', () => {
    const q = input();
    q.clicked.add('autoPlan');
    expect(questProgress(q).done.has('autoPlan')).toBe(false);

    q.jobs = [{ status: 'applied' } as QuestInput['jobs'][number]];
    expect(questProgress(q).done.has('autoPlan')).toBe(true);
  });
});
