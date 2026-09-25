import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { HALAL_TIER_LABELS, HOTEL_PRIORITY_LABELS, INTEREST_OPTIONS, MemberPrefs, paths, type HalalTier } from '../domain';
import { db } from '../firebase/config';
import { Button, Card, Chip, ErrorBanner, Field, Input, Toggle } from '../ui';
import { useTrip } from './TripLayout';

const PACES: { key: MemberPrefs['pace']; label: string; hint: string }[] = [
  { key: 'relaxed', label: 'Relaxed', hint: '2–3 stops a day' },
  { key: 'moderate', label: 'Moderate', hint: '3–5 stops a day' },
  { key: 'fast', label: 'Packed', hint: 'See as much as possible' },
];
const TIERS: HalalTier[] = ['certified', 'muslim_owned', 'pork_free'];

const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Number(s)));

export function PreferencesPage() {
  const { trip, me } = useTrip();
  const navigate = useNavigate();
  const p = me.prefs;

  const [minHotel, setMinHotel] = useState(p?.hotelBudget ? String(p.hotelBudget.min) : '');
  const [maxHotel, setMaxHotel] = useState(p?.hotelBudget ? String(p.hotelBudget.max) : '');
  const [daily, setDaily] = useState(p?.dailyBudget !== undefined ? String(p.dailyBudget) : '');
  const [halalRequired, setHalalRequired] = useState(p?.halalRequired ?? false);
  const [halalTier, setHalalTier] = useState<HalalTier>(p?.halalTier ?? 'certified');
  const [prayerReminders, setPrayerReminders] = useState(p?.prayerReminders ?? true);
  const [pace, setPace] = useState<MemberPrefs['pace']>(p?.pace ?? 'moderate');
  const [interests, setInterests] = useState<string[]>(p?.interests ?? []);
  const [priorities, setPriorities] = useState<MemberPrefs['hotelPriorities']>(p?.hotelPriorities ?? []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    setError('');
    const min = num(minHotel);
    const max = num(maxHotel);
    if ((min === undefined) !== (max === undefined)) return setError('Enter both a minimum and a maximum hotel budget, or leave both empty.');
    if (min !== undefined && max !== undefined && min > max) return setError('Hotel minimum must be lower than the maximum.');

    const parsed = MemberPrefs.safeParse({
      ...(min !== undefined && max !== undefined ? { hotelBudget: { min, max } } : {}),
      ...(num(daily) !== undefined ? { dailyBudget: num(daily) } : {}),
      halalRequired,
      halalTier: halalRequired ? halalTier : 'not_halal',
      prayerReminders,
      pace,
      interests,
      hotelPriorities: priorities,
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);

    setSaving(true);
    try {
      // Offline-safe: Firestore queues the write and syncs when back online.
      void updateDoc(doc(db, paths.member(trip.id, me.uid)), { prefs: parsed.data }).catch((e) => setError(e.message));
      navigate('../members', { relative: 'path' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-[#161C23]">Your travel preferences</h1>
        <p className="text-sm text-[#6D7A77]">The group plan, hotel picks and restaurant suggestions balance everyone's answers.</p>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="font-bold text-[#161C23]">Budget ({trip.currency})</h2>
        <Field label="Hotel per night, per room" group>
          <div className="flex items-center gap-2">
            <Input inputMode="decimal" type="number" min={0} placeholder="Min" aria-label="Minimum per night" value={minHotel} onChange={(e) => setMinHotel(e.target.value)} />
            <span className="text-[#6D7A77]">–</span>
            <Input inputMode="decimal" type="number" min={0} placeholder="Max" aria-label="Maximum per night" value={maxHotel} onChange={(e) => setMaxHotel(e.target.value)} />
          </div>
        </Field>
        <Field label="Daily spend per person" hint="Food, tickets and local transport">
          <Input inputMode="decimal" type="number" min={0} placeholder="e.g. 200" value={daily} onChange={(e) => setDaily(e.target.value)} />
        </Field>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-bold text-[#161C23]">Food & prayer</h2>
        <Toggle checked={halalRequired} onChange={setHalalRequired} label="I need halal food" hint="Restaurants and food events are checked by the Halal Radar." />
        {halalRequired && (
          <div className="space-y-2" role="radiogroup" aria-label="Halal requirement">
            {TIERS.map((t) => (
              <label key={t} className="flex items-center gap-3 p-3 rounded-xl border border-[#E7DFD5] bg-white cursor-pointer has-[:checked]:border-[#00685F] has-[:checked]:bg-[#00685F]/5">
                <input type="radio" name="tier" checked={halalTier === t} onChange={() => setHalalTier(t)} className="accent-[#00685F] w-4 h-4" />
                <span className="text-sm font-semibold text-[#161C23]">{HALAL_TIER_LABELS[t]}</span>
              </label>
            ))}
          </div>
        )}
        <Toggle
          checked={prayerReminders}
          onChange={setPrayerReminders}
          label="Plan around the five daily prayers"
          hint="Adds prayer breaks with the nearest mosque or prayer room to the schedule."
        />
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-bold text-[#161C23]">Travel style</h2>
        <Field label="Pace" group>
          <div className="grid grid-cols-3 gap-2">
            {PACES.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={pace === x.key}
                onClick={() => setPace(x.key)}
                className={`p-2.5 rounded-xl border text-left ${pace === x.key ? 'border-[#00685F] bg-[#00685F]/5' : 'border-[#E7DFD5] bg-white'}`}
              >
                <span className="block text-sm font-bold text-[#161C23]">{x.label}</span>
                <span className="block text-[11px] text-[#6D7A77]">{x.hint}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Interests" group>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((i) => (
              <Chip key={i} selected={interests.includes(i)} onClick={() => setInterests(toggle(interests, i))}>
                {i}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="What matters in a hotel?" group>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(HOTEL_PRIORITY_LABELS) as MemberPrefs['hotelPriorities']).map((k) => (
              <Chip key={k} selected={priorities.includes(k)} onClick={() => setPriorities(toggle(priorities, k))}>
                {HOTEL_PRIORITY_LABELS[k]}
              </Chip>
            ))}
          </div>
        </Field>
      </Card>

      <ErrorBanner>{error}</ErrorBanner>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button className="flex-1" loading={saving} onClick={save}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}
