import type { JourneyPrayer } from '../domain';
/** 🕌 Where to pray around a journey — a traveller's options, not a ruling. */
export function JourneyPrayerList({ list }: { list: JourneyPrayer[] }) {
  return (
    <details className="mt-1 text-xs text-[#0F5E57]" onClick={(e) => e.stopPropagation()}>
      <summary className="cursor-pointer font-semibold">🕌 {list.length} prayer{list.length > 1 ? 's' : ''} around this journey — where to pray</summary>
      <ul className="mt-1 space-y-1 pl-4 list-disc whitespace-normal">
        {list.map((p) => (
          <li key={p.prayer}>{p.text}</li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-[#6D7A77] whitespace-normal">Travellers may combine (jamak) and shorten (qasar) prayers. Follow your own madhhab or ask your ustaz if unsure.</p>
    </details>
  );
}
