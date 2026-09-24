import { Check, ImageUp, Link2, Loader2, MapPin, Search, Sparkles, Type } from 'lucide-react';
import { useRef, useState } from 'react';
import { PlacePicker } from '../../components/live/PlaceSearch';
import type { DestinationInput, IdeaSource, PlaceRef } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { deleteFile, uploadTripFile } from '../../lib/storage';
import { Button, cx, ErrorBanner, Input, Sheet } from '../../ui';
import { useTrip } from '../TripLayout';

interface Candidate {
  place: PlaceRef;
  category: string;
  what?: string;
  distanceKm: number;
  nearest: string;
}
interface ImportResponse {
  source: IdeaSource;
  candidates: Candidate[];
  unresolved: string[];
  skippedRegions?: string[];
  needsScreenshot?: boolean;
  message?: string;
}

type Tab = 'link' | 'screenshot' | 'search';

const MAX_SHOTS = 4;

/** Adds ideas and kicks off the Halal Radar/review check (not awaited). */
async function addIdeas(tripId: string, items: { placeId: string; source: IdeaSource }[]) {
  const ids: string[] = [];
  for (const it of items) {
    const res = await api.post<{ id: string; duplicate: boolean }>('ideas/add', it, { tripId });
    if (!res.duplicate) ids.push(res.id);
  }
  for (const id of ids) void api.post('ideas/analyze', { ideaId: id }, { tripId }).catch(() => {});
  return { added: ids.length, duplicates: items.length - ids.length };
}

export function AddIdeaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { trip, me } = useTrip();
  const [tab, setTab] = useState<Tab>('link');
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [working, setWorking] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [searchPick, setSearchPick] = useState<DestinationInput>();
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setUrl('');
    setCaption('');
    setResult(null);
    setPicked(new Set());
    setError('');
    setNotice('');
    setSearchPick(undefined);
    setWorking(null);
  };
  const close = () => {
    uploaded.forEach((p) => void deleteFile(p));
    setUploaded([]);
    reset();
    onClose();
  };

  const runImport = async (body: object, label: string) => {
    setError('');
    setNotice('');
    setResult(null);
    setWorking(label);
    try {
      const res = await api.post<ImportResponse>('ideas/import', body, { tripId: trip.id });
      if (res.candidates.length) {
        setResult(res);
        setPicked(new Set(res.candidates.map((c) => c.place.placeId!)));
      } else if (res.needsScreenshot) {
        setNotice(res.message ?? 'Upload screenshots of the post instead.');
        setTab('screenshot');
      } else {
        setError(res.message ?? "We couldn't find any specific places. Try screenshots that show the place names, or search the place.");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setWorking(null);
    }
  };

  const onScreenshots = async (files: File[]) => {
    const chosen = files.slice(0, MAX_SHOTS);
    try {
      const paths: string[] = [];
      for (const [i, f] of chosen.entries()) {
        setWorking(`Uploading screenshot ${i + 1} of ${chosen.length}…`);
        paths.push(await uploadTripFile(trip.id, me.uid, 'ideas', f));
      }
      setUploaded(paths);
      await runImport({ storagePaths: paths }, `Reading ${chosen.length > 1 ? `${chosen.length} screenshots` : 'your screenshot'} with AI…`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      setWorking(null);
    }
  };

  const addPicked = async () => {
    if (!result) return;
    setWorking('Adding to the Idea Board…');
    try {
      const items = result.candidates.filter((c) => picked.has(c.place.placeId!)).map((c) => ({ placeId: c.place.placeId!, source: result.source }));
      const r = await addIdeas(trip.id, items);
      setUploaded([]); // keep the screenshots: they're the ideas' source
      reset();
      onClose();
      if (r.duplicates) alert(`${r.duplicates} of them ${r.duplicates === 1 ? 'was' : 'were'} already on the board.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add.');
      setWorking(null);
    }
  };

  const addSearched = async () => {
    if (!searchPick?.placeId) return;
    setWorking('Adding to the Idea Board…');
    try {
      const r = await addIdeas(trip.id, [{ placeId: searchPick.placeId, source: { type: 'manual' } }]);
      reset();
      onClose();
      if (r.duplicates) alert('That place is already on the board.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add.');
      setWorking(null);
    }
  };

  const TABS: { key: Tab; label: string; icon: typeof Link2 }[] = [
    { key: 'link', label: 'Paste link', icon: Link2 },
    { key: 'screenshot', label: 'Screenshot / caption', icon: ImageUp },
    { key: 'search', label: 'Search', icon: Search },
  ];

  return (
    <Sheet open={open} onClose={close} title="Add to the Idea Board" wide={!!result}>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void onScreenshots(files);
        }}
      />

      {working ? (
        <div className="py-10 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-[#00685F]" />
          <p className="text-sm font-semibold text-[#161C23]">{working}</p>
          {/AI/.test(working) && <p className="text-xs text-[#6D7A77]">Usually 5–20 seconds.</p>}
        </div>
      ) : result ? (
        <div className="space-y-3">
          <p className="text-sm text-[#6D7A77] flex items-start gap-2">
            <Sparkles className="w-4 h-4 mt-0.5 text-[#00685F] shrink-0" /> Found {result.candidates.length} place{result.candidates.length === 1 ? '' : 's'}. Untick any you don't want.
          </p>
          <ul className="space-y-2">
            {result.candidates.map((c) => {
              const id = c.place.placeId!;
              const on = picked.has(id);
              const far = c.distanceKm > 80;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))))}
                    className={cx('w-full flex items-start gap-3 p-3 rounded-xl border text-left', on ? 'border-[#00685F] bg-[#00685F]/5' : 'border-[#E7DFD5] bg-white')}
                  >
                    <span className={cx('w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center shrink-0', on ? 'bg-[#00685F] border-[#00685F] text-white' : 'border-[#C9C1B6]')}>
                      {on && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-[#161C23]">{c.place.name}</span>
                      {c.what && <span className="block text-xs text-[#00685F]">{c.what}</span>}
                      <span className="block text-xs text-[#6D7A77] truncate">
                        <MapPin className="inline w-3 h-3 -mt-0.5" /> {c.place.address}
                      </span>
                      {far && <span className="block text-xs text-[#96590B]">{c.distanceKm} km from {c.nearest} — check it's the right place</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!!result.unresolved.length && <p className="text-xs text-[#6D7A77]">Couldn't find on the map: {result.unresolved.join(', ')}.</p>}
          <ErrorBanner>{error}</ErrorBanner>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={reset}>
              Back
            </Button>
            <Button className="flex-1" disabled={!picked.size} onClick={addPicked}>
              Add {picked.size || ''} to the board
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#F3EFE9]" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => (setTab(t.key), setError(''))}
                className={cx('flex items-center justify-center gap-1.5 min-h-10 rounded-lg text-xs sm:text-sm font-semibold', tab === t.key ? 'bg-white text-[#00685F] shadow-xs' : 'text-[#6D7A77]')}
              >
                <t.icon className="w-4 h-4 shrink-0" /> <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>

          {notice && <p className="text-sm text-[#96590B] bg-[#FDF3E1] rounded-xl px-3 py-2">{notice}</p>}

          {tab === 'link' && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void runImport({ url }, 'Reading the post with AI…');
              }}
            >
              <textarea
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="https://www.instagram.com/reel/…  or paste Xiaohongshu's copied share text"
                aria-label="Post link or share text"
                className="w-full rounded-xl border border-[#E7DFD5] bg-white p-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#00685F]/40"
              />
              <p className="text-xs text-[#6D7A77]">
                TikTok, Instagram, YouTube or Xiaohongshu (小红书). For Xiaohongshu, tap <b>Share → Copy link</b> in the app and paste everything it copies — the post's
                text is what we read.
              </p>
              <Button type="submit" className="w-full" disabled={url.trim().length < 10}>
                <Sparkles className="w-4 h-4" /> Find places
              </Button>
            </form>
          )}

          {tab === 'screenshot' && (
            <div className="space-y-3">
              <Button variant="secondary" className="w-full" onClick={() => fileInput.current?.click()}>
                <ImageUp className="w-4 h-4" /> Upload screenshots (up to {MAX_SHOTS})
              </Button>
              <p className="text-xs text-[#6D7A77]">
                For reels and Xiaohongshu notes: screenshot the photos or video moments that show each place's name.
              </p>
              <div className="flex items-center gap-3 text-xs text-[#9AA5A3]">
                <span className="h-px flex-1 bg-[#E7DFD5]" /> or paste the caption <span className="h-px flex-1 bg-[#E7DFD5]" />
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Paste the post's caption or a list of places…"
                aria-label="Caption"
                className="w-full rounded-xl border border-[#E7DFD5] bg-white p-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#00685F]/40"
              />
              <Button className="w-full" disabled={caption.trim().length < 8} onClick={() => runImport({ text: caption }, 'Reading the caption with AI…')}>
                <Type className="w-4 h-4" /> Find places in caption
              </Button>
            </div>
          )}

          {tab === 'search' && (
            <div className="space-y-3">
              <PlacePicker value={searchPick} onChange={setSearchPick} placeholder="Restaurant, attraction, shop…" />
              <Button className="w-full" disabled={!searchPick?.placeId} onClick={addSearched}>
                Add to the board
              </Button>
            </div>
          )}

          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
    </Sheet>
  );
}
