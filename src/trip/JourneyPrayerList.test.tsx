import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { JourneyPrayer } from '../domain';
import { JourneyPrayerList } from './JourneyPrayerList';

const list: JourneyPrayer[] = [
  { prayer: 'dhuhr', where: 'on_board', when: '12:13 PM Kuala Lumpur time', fix: 'pray seated on board', text: 'Pray during the flight.' },
  { prayer: 'asr', where: 'on_board', when: '2:22 PM Kuala Lumpur time', fix: 'pray seated on board', text: 'Pray during the flight.' },
];

describe('journey prayer list', () => {
  it('starts collapsed in a Plan schedule row', () => {
    const html = renderToStaticMarkup(<JourneyPrayerList list={list} collapsible />);
    expect(html).toContain('2 prayer times during journey');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('12:13 PM Kuala Lumpur time');
    expect(html).not.toContain('Details');
  });

  it('keeps the Bookings card prayer lines visible', () => {
    const html = renderToStaticMarkup(<JourneyPrayerList list={list} />);
    expect(html).toContain('12:13 PM Kuala Lumpur time');
    expect(html).toContain('Details');
  });
});
