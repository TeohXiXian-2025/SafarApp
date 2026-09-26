import { useState } from 'react';
import type { JourneyPrayer } from '../domain';

const NAME: Record<JourneyPrayer['prayer'], string> = { fajr: 'Subuh', dhuhr: 'Zuhur', asr: 'Asar', maghrib: 'Maghrib', isha: 'Isyak' };

/**
 * 🕌 Prayers whose time falls during a journey: the prayer, its time (saying
 * whose clock) and one short thing to do. Prayers before boarding or after
 * getting out are normal prayer cards on the timeline. ⓘ = the details.
 */
export function JourneyPrayerList({ list }: { list: JourneyPrayer[] }) {
  const [more, setMore] = useState(false);
  return (
    <div className="mt-1 rounded-lg bg-[#FDF6E3] border border-[#EAD9A8] px-2 py-1.5 text-xs text-[#6B5A2E] space-y-0.5" onClick={(e) => e.stopPropagation()}>
      {list.map((p) => (
        <p key={p.prayer} className="whitespace-normal">
          🕌 <b className="text-[#7A5500]">{NAME[p.prayer]}</b> · {p.when} — {p.fix}
        </p>
      ))}
      <button type="button" onClick={() => setMore((v) => !v)} className="text-[11px] font-semibold text-[#8A6A1F] underline underline-offset-2" aria-expanded={more}>
        ⓘ {more ? 'Less' : 'Details'}
      </button>
      {more && (
        <div className="space-y-1 text-[11px] text-[#6D7A77] whitespace-normal">
          {list.map((p) => (
            <p key={p.prayer}>{p.text}</p>
          ))}
          <p>A time “in the air” is where the plane is then, so it won't match either airport's prayer times. Travellers may combine (jamak) and shorten (qasar) — follow your madhhab or ask your ustaz if unsure.</p>
        </div>
      )}
    </div>
  );
}
