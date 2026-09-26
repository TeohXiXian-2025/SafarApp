import type { JourneyPrayer } from '../domain';
/** 🕌 Where to pray around a journey — a traveller's options, not a ruling. */
export function JourneyPrayerList({ list }: { list: JourneyPrayer[] }) {
  return (
    <details className="mt-1 text-xs text-[#0F5E57]" onClick={(e) => e.stopPropagation()}>
      <summary className="cursor-pointer font-semibold">🕌 {list.length} prayer{list.length > 1 ? 's' : ''} during this journey — what to do</summary>
      <ul className="mt-1 space-y-1 pl-4 list-disc whitespace-normal">
        {list.map((p) => (
          <li key={p.prayer}>{p.text}</li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-[#6D7A77] whitespace-normal">Prayers before boarding or after you land are on the timeline as normal prayer times. A time “in the air” is where the plane is then, so it's earlier or later than at either airport — it won't match the prayer times on the ground. Travellers may combine (jamak) and shorten (qasar) prayers — follow your own madhhab or ask your ustaz if unsure.</p>
    </details>
  );
}
