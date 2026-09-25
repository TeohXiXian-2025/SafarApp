import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '../../auth/auth';
import type { HalalSummary, HalalTier, Idea } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { uploadTripFile } from '../../lib/storage';
import { Button, ErrorBanner, Field, Input, Sheet, Toggle } from '../../ui';
import { useTrip } from '../TripLayout';

const OPTIONS: { tier: HalalTier; label: string; hint: string }[] = [
  { tier: 'certified', label: 'Certified halal', hint: 'I saw a halal certificate or logo from a certifying body' },
  { tier: 'muslim_owned', label: 'Muslim-owned / fully halal', hint: 'Halal kitchen, no certificate seen' },
  { tier: 'pork_free', label: 'Pork-free, not halal', hint: "No pork, but meat isn't halal" },
  { tier: 'not_halal', label: 'Not halal', hint: 'Serves pork or non-halal meat' },
];

interface PhotoResult {
  read: { summary: string; certifier?: string; number?: string; expiresOn?: string; porkItems: string[]; alcoholItems: string[] };
  saved: boolean;
  tier: HalalTier | null;
  problems: string[];
}

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
  const uid = useAuth((s) => s.user?.uid);
  const [photoBusy, setPhotoBusy] = useState<'certificate' | 'menu' | null>(null);
  const [photoResult, setPhotoResult] = useState<PhotoResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const kindRef = useRef<'certificate' | 'menu'>('certificate');

  // A photo is read by the AI and saved as your report straight away (you can still adjust it below).
  const readPhoto = async (file: File) => {
    const kind = kindRef.current;
    setPhotoBusy(kind);
    setError('');
    setPhotoResult(null);
    try {
      const path = await uploadTripFile(trip.id, uid!, 'halal', file);
      const r = await api.post<PhotoResult>('halal/photo', { ideaId: idea.id, storagePath: path, kind }, { tripId: trip.id });
      setPhotoResult(r);
      if (r.tier) setTier(r.tier);
      if (r.read.alcoholItems.length) setAlcohol(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Could not read the photo.');
    } finally {
      setPhotoBusy(null);
    }
  };
  const pick = (kind: 'certificate' | 'menu') => {
    kindRef.current = kind;
    fileInput.current?.click();
  };

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
          Only report what you've seen yourself. Your report is combined with other travellers' — {community?.reportCount ?? 0} so far — and helps every Safar
          group that plans a visit here, not just this trip.
        </p>
        <div className="rounded-xl border border-[#C4E0DD] bg-[#EAF4F3] p-3 space-y-2">
          <p className="text-sm font-semibold text-[#00685F]">Best evidence: a photo</p>
          <p className="text-xs text-[#3E4947]">Snap the halal certificate on the wall, or the menu. The AI reads the certifier, number and expiry — or spots pork and alcohol on the menu. When a second traveller confirms, it counts as verified.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-9" loading={photoBusy === 'certificate'} disabled={!!photoBusy} onClick={() => pick('certificate')}>
              <Camera className="w-4 h-4" /> Certificate
            </Button>
            <Button variant="secondary" className="min-h-9" loading={photoBusy === 'menu'} disabled={!!photoBusy} onClick={() => pick('menu')}>
              <Camera className="w-4 h-4" /> Menu
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void readPhoto(f);
            }}
          />
          {photoResult && (
            <div className="rounded-lg bg-white border border-[#E7DFD5] p-2.5 text-xs space-y-1">
              <p className="font-semibold text-[#161C23]">{photoResult.read.summary}</p>
              {photoResult.read.certifier && (
                <p>
                  Certifier: <b>{photoResult.read.certifier}</b>
                  {photoResult.read.number && ` · No. ${photoResult.read.number}`}
                  {photoResult.read.expiresOn && ` · valid until ${photoResult.read.expiresOn}`}
                </p>
              )}
              {!!photoResult.read.porkItems.length && <p className="text-[#B3261E]">Pork on the menu: {photoResult.read.porkItems.join(', ')}</p>}
              {!!photoResult.read.alcoholItems.length && <p className="text-[#96590B]">Alcohol: {photoResult.read.alcoholItems.join(', ')}</p>}
              {photoResult.problems.map((p) => (
                <p key={p} className="text-[#96590B]">⚠️ {p}</p>
              ))}
              <p className="text-[#0B6B45]">{photoResult.saved ? '✓ Saved as your report.' : 'Not saved — pick what you found below.'}</p>
            </div>
          )}
        </div>
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
