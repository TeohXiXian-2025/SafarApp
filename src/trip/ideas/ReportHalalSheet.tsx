import { useState } from 'react';
import type { HalalSummary, HalalTier, Idea } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { Button, ErrorBanner, Field, Input, Sheet, Toggle } from '../../ui';
import { useTrip } from '../TripLayout';

const OPTIONS: { tier: HalalTier; label: string; hint: string }[] = [
  { tier: 'certified', label: 'Certified halal', hint: 'I saw a halal certificate or logo from a certifying body' },
  { tier: 'muslim_owned', label: 'Muslim-owned / fully halal', hint: 'Halal kitchen, no certificate seen' },
  { tier: 'pork_free', label: 'Pork-free, not halal', hint: "No pork, but meat isn't halal" },
  { tier: 'not_halal', label: 'Not halal', hint: 'Serves pork or non-halal meat' },
];

/** A traveller's own report about a restaurant — feeds the community consensus for everyone. */
export function ReportHalalSheet({ idea, community, onClose }: { idea: Idea; community: HalalSummary | null; onClose: () => void }) {
  const { trip } = useTrip();
  const [tier, setTier] = useState<HalalTier | null>(null);
  const [alcohol, setAlcohol] = useState(false);
  const [halalOptions, setHalalOptions] = useState(false);
  const [prayer, setPrayer] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!tier) return setError('Choose what you know about this place.');
    setSaving(true);
    setError('');
    try {
      await api.post(
        'halal/report',
        { ideaId: idea.id, tier, flags: { servesAlcohol: alcohol, halalMenuOptions: halalOptions, prayerSpaceOnSite: prayer }, ...(note.trim() ? { note: note.trim() } : {}) },
        { tripId: trip.id },
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your report.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Halal status of ${idea.place.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-[#6D7A77]">
          Only report what you've seen yourself. Your report is combined with other travellers' — {community?.reportCount ?? 0} so far.
        </p>
        <Field label="What did you find?" group>
          <div className="space-y-2" role="radiogroup">
            {OPTIONS.map((o) => (
              <label key={o.tier} className="flex items-start gap-3 p-3 rounded-xl border border-[#E7DFD5] bg-white cursor-pointer has-[:checked]:border-[#00685F] has-[:checked]:bg-[#00685F]/5">
                <input type="radio" name="tier" checked={tier === o.tier} onChange={() => setTier(o.tier)} className="accent-[#00685F] w-4 h-4 mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-[#161C23]">{o.label}</span>
                  <span className="block text-xs text-[#6D7A77]">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        <div className="space-y-3">
          <Toggle checked={alcohol} onChange={setAlcohol} label="Serves alcohol" />
          <Toggle checked={halalOptions} onChange={setHalalOptions} label="Has a separate halal menu" />
          <Toggle checked={prayer} onChange={setPrayer} label="Has a prayer space" />
        </div>
        <Field label="Note (optional)" hint="e.g. which certifying body, or what staff told you">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} onClick={save}>
            Submit report
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
