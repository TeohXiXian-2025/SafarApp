import { Check, Film, ImageUp, Link2, Loader2, MapPin, Paperclip, Search, Sparkles, Type, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PlacePicker } from '../../components/live/PlaceSearch';
import type { DestinationInput, IdeaSource, PlaceRef } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { extractAudio, extractFrames } from '../../lib/recording';
import { deleteFile, uploadTripFile } from '../../lib/storage';
import { Button, cx, ErrorBanner, Sheet } from '../../ui';
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
  used?: { provider: string | null; images: number; transcript: boolean };
  needsScreenshot?: boolean;
  message?: string;
}

type Tab = 'link' | 'media' | 'search';

/** Screenshots + recording frames sent per import (the AI reads them in batches). */
const MAX_IMAGES = 8;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name);

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

export function AddIdeaSheet({ open, onClose, initialText }: { open: boolean; onClose: () => void; initialText?: string }) {
  const { trip, me } = useTrip();
  const [tab, setTab] = useState<Tab>('link');
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [searchPick, setSearchPick] = useState<DestinationInput>();
  const fileInput = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  // Shared from another app (Android share sheet) → prefill and read straight away.
  useEffect(() => {
    if (open && initialText && !autoRan.current) {
      autoRan.current = true;
      setTab('link');
      setUrl(initialText);
      void run({ url: initialText });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText]);

  const reset = () => {
    setUrl('');
    setCaption('');
    setAttachments([]);
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

  /** Uploads screenshots as-is; turns a screen recording into key frames + audio (in the browser). */
  const prepare = async (files: File[]): Promise<{ storagePaths: string[]; audioPath?: string }> => {
    const storagePaths: string[] = [];
    let audioPath: string | undefined;
    for (const f of files) {
      if (storagePaths.length >= MAX_IMAGES) break;
      if (isVideo(f)) {
        if (f.size > MAX_VIDEO_BYTES) throw new Error('That recording is too large — keep it under ~2 minutes.');
        setWorking('Picking key moments from your recording…');
        const frames = await extractFrames(f, {
          maxFrames: MAX_IMAGES - storagePaths.length,
          onProgress: (p) => setWorking(`Picking key moments from your recording… ${Math.round(p * 100)}%`),
        });
        for (const [i, fr] of frames.entries()) {
          setWorking(`Uploading moment ${i + 1} of ${frames.length}…`);
          storagePaths.push(await uploadTripFile(trip.id, me.uid, 'ideas', new File([fr], `frame-${i + 1}.jpg`, { type: 'image/jpeg' })));
        }
        if (!audioPath) {
          setWorking('Getting the sound from your recording…');
          const audio = await extractAudio(f);
          if (audio) audioPath = await uploadTripFile(trip.id, me.uid, 'ideas', new File([audio], 'recording-audio.wav', { type: 'audio/wav' }));
        }
      } else {
        setWorking(`Uploading screenshot ${storagePaths.length + 1}…`);
        storagePaths.push(await uploadTripFile(trip.id, me.uid, 'ideas', f));
      }
    }
    setUploaded((u) => [...u, ...storagePaths, ...(audioPath ? [audioPath] : [])]);
    return { storagePaths, ...(audioPath ? { audioPath } : {}) };
  };

  const run = async (body: { url?: string; text?: string }, files: File[] = []) => {
    setError('');
    setNotice('');
    setResult(null);
    try {
      const media = files.length ? await prepare(files) : { storagePaths: [] as string[] };
      const hasMedia = media.storagePaths.length > 0 || !!media.audioPath;
      setWorking(body.url ? 'Reading the post with AI…' : hasMedia ? 'Reading your screenshots with AI…' : 'Reading the caption with AI…');
      const res = await api.post<ImportResponse>(
        'ideas/import',
        { ...body, ...(media.storagePaths.length ? { storagePaths: media.storagePaths } : {}), ...(media.audioPath ? { audioPath: media.audioPath } : {}) },
        { tripId: trip.id },
      );
      if (res.candidates.length) {
        setResult(res);
        setPicked(new Set(res.candidates.map((c) => c.place.placeId!)));
      } else if (res.needsScreenshot) {
        setNotice(res.message ?? 'Upload a screen recording or screenshots of the post instead.');
        setTab('media');
      } else {
        setError(res.message ?? "We couldn't find any specific places. Try a screen recording or screenshots that show the place names.");
      }
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setWorking(null);
    }
  };

  const addPicked = async () => {
    if (!result) return;
    setWorking('Adding to the Idea Board…');
    try {
      const items = result.candidates.filter((c) => picked.has(c.place.placeId!)).map((c) => ({ placeId: c.place.placeId!, source: result.source }));
      const r = await addIdeas(trip.id, items);
      setUploaded([]); // keep the uploads: they're the ideas' source
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

  const onPickFiles = (files: File[]) => {
    const videos = files.filter(isVideo);
    const next = [...attachments, ...files].filter((f, i, all) => (isVideo(f) ? all.findIndex(isVideo) === i : true));
    if (videos.length > 1) setNotice('Only one screen recording per import — the first one is used.');
    if (tab === 'media') void run(caption.trim().length >= 8 ? { text: caption } : {}, next);
    else setAttachments(next.slice(0, MAX_IMAGES));
  };

  const TABS: { key: Tab; label: string; icon: typeof Link2 }[] = [
    { key: 'link', label: 'Paste link', icon: Link2 },
    { key: 'media', label: 'Recording / screenshots', icon: Film },
    { key: 'search', label: 'Search', icon: Search },
  ];

  return (
    <Sheet open={open} onClose={close} title="Add to the Idea Board" wide={!!result}>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onPickFiles(files);
        }}
      />

      {working ? (
        <div className="py-10 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-[#00685F]" />
          <p className="text-sm font-semibold text-[#161C23] text-center">{working}</p>
          {/AI/.test(working) && <p className="text-xs text-[#6D7A77]">Usually 5–30 seconds.</p>}
        </div>
      ) : result ? (
        <div className="space-y-3">
          <p className="text-sm text-[#6D7A77] flex items-start gap-2">
            <Sparkles className="w-4 h-4 mt-0.5 text-[#00685F] shrink-0" />
            <span>
              Found {result.candidates.length} place{result.candidates.length === 1 ? '' : 's'}
              {result.used?.images ? ` (read ${result.used.images} photo${result.used.images === 1 ? '' : 's'}` : ''}
              {result.used?.transcript ? `${result.used.images ? ' and' : ' (heard'} the video's audio)` : result.used?.images ? ')' : ''}. Untick any you don't want.
            </span>
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
                className={cx('flex items-center justify-center gap-1.5 min-h-10 px-1 rounded-lg text-xs sm:text-sm font-semibold', tab === t.key ? 'bg-white text-[#00685F] shadow-xs' : 'text-[#6D7A77]')}
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
                void run({ url }, attachments);
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
                TikTok, Instagram, YouTube or Xiaohongshu (小红书). For Xiaohongshu, tap <b>Share → Copy link</b> in the app and paste everything it copies.
              </p>

              <div className="space-y-2">
                <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#00685F]">
                  <Paperclip className="w-4 h-4" /> Also attach screenshots or a screen recording (optional)
                </button>
                {attachments.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {attachments.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-[#F3EFE9] text-xs font-semibold text-[#161C23]">
                        {isVideo(f) ? <Film className="w-3.5 h-3.5" /> : <ImageUp className="w-3.5 h-3.5" />}
                        <span className="max-w-[9rem] truncate">{f.name}</span>
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))} className="w-5 h-5 rounded-full hover:bg-black/10 inline-flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={url.trim().length < 10}>
                <Sparkles className="w-4 h-4" /> Find places
              </Button>
            </form>
          )}

          {tab === 'media' && (
            <div className="space-y-3">
              <Button variant="secondary" className="w-full" onClick={() => fileInput.current?.click()}>
                <Film className="w-4 h-4" /> Upload a screen recording or screenshots
              </Button>
              <ul className="text-xs text-[#6D7A77] space-y-1 list-disc pl-4">
                <li>
                  <b>Screen recording</b> (best): record your screen while you play the reel or swipe through the note's photos. We pick the key moments and
                  listen for place names — up to ~2 minutes.
                </li>
                <li>
                  <b>Screenshots</b>: up to {MAX_IMAGES} at once.
                </li>
              </ul>
              <div className="flex items-center gap-3 text-xs text-[#9AA5A3]">
                <span className="h-px flex-1 bg-[#E7DFD5]" /> or paste the caption <span className="h-px flex-1 bg-[#E7DFD5]" />
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Paste the post's caption or a list of places…"
                aria-label="Caption"
                className="w-full rounded-xl border border-[#E7DFD5] bg-white p-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#00685F]/40"
              />
              <Button className="w-full" disabled={caption.trim().length < 8} onClick={() => run({ text: caption })}>
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
