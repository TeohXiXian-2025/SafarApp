import { AlertTriangle, ClipboardPaste, FileUp, Loader2, PencilLine, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { BookingDraft, Member } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { deleteFile, UPLOAD_ACCEPT, uploadTripFile } from '../../lib/storage';
import { Button, Card, ErrorBanner, Sheet } from '../../ui';
import { BookingEditor, draftProblem, type EditableDraft } from './BookingEditor';
import { KIND } from './format';

type Source = 'upload' | 'text' | 'manual';

interface ReviewItem {
  key: string;
  draft: EditableDraft;
  warnings: string[];
  error?: string;
  saved?: boolean;
}

interface ParseResponse {
  confidence: number;
  drafts: { draft: EditableDraft; warnings: string[] }[];
}

type Step =
  | { name: 'choose' }
  | { name: 'paste' }
  | { name: 'working'; label: string; progress?: number }
  | { name: 'review' };

export function AddBookingSheet({
  open,
  onClose,
  tripId,
  me,
  members,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  me: Member;
  members: Member[];
}) {
  const [step, setStep] = useState<Step>({ name: 'choose' });
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [source, setSource] = useState<Source>('manual');
  const [fileRef, setFileRef] = useState<string>();
  const [confidence, setConfidence] = useState<number>();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep({ name: 'choose' });
    setItems([]);
    setText('');
    setError('');
    setFileRef(undefined);
    setConfidence(undefined);
  };
  const close = () => {
    // An upload that never became a booking shouldn't linger in storage.
    if (fileRef && !items.some((i) => i.saved)) void deleteFile(fileRef);
    reset();
    onClose();
  };

  const toReview = (res: ParseResponse, src: Source) => {
    setSource(src);
    setConfidence(res.confidence);
    if (!res.drafts.length) {
      setError("We couldn't find any flight, train, bus, ferry or hotel details. Try a clearer photo, or enter it manually.");
      setStep({ name: 'choose' });
      return;
    }
    setItems(res.drafts.map((d, i) => ({ key: `d${i}`, draft: d.draft, warnings: d.warnings })));
    setStep({ name: 'review' });
  };

  const onFile = async (file: File) => {
    setError('');
    try {
      setStep({ name: 'working', label: 'Uploading…', progress: 0 });
      const path = await uploadTripFile(tripId, me.uid, 'bookings', file, (p) =>
        setStep({ name: 'working', label: 'Uploading…', progress: p }),
      );
      setFileRef(path);
      setStep({ name: 'working', label: 'Reading your ticket with AI…' });
      toReview(await api.post<ParseResponse>('bookings/parse', { storagePath: path }, { tripId }), 'upload');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStep({ name: 'choose' });
    }
  };

  const onPaste = async () => {
    setError('');
    setStep({ name: 'working', label: 'Reading your confirmation with AI…' });
    try {
      toReview(await api.post<ParseResponse>('bookings/parse', { text }, { tripId }), 'text');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
      setStep({ name: 'paste' });
    }
  };

  const startManual = () => {
    setSource('manual');
    setItems([{ key: 'm0', draft: { kind: 'flight', travellerUids: [me.uid], passengerNames: [] }, warnings: [] }]);
    setStep({ name: 'review' });
  };

  const saveAll = async () => {
    setSaving(true);
    const next = [...items];
    for (const item of next) {
      if (item.saved) continue;
      const problem = draftProblem(item.draft);
      if (problem) {
        item.error = problem;
        continue;
      }
      try {
        await api.post(
          'bookings/create',
          { draft: item.draft as BookingDraft, source, ...(fileRef ? { fileRef } : {}), ...(confidence !== undefined ? { parseConfidence: confidence } : {}) },
          { tripId },
        );
        item.saved = true;
        item.error = undefined;
      } catch (e) {
        item.error = e instanceof ApiError ? e.message : 'Could not save.';
      }
      setItems([...next]);
    }
    setItems([...next]);
    setSaving(false);
    if (next.every((i) => i.saved)) {
      reset();
      onClose();
    }
  };

  const pending = items.filter((i) => !i.saved);

  return (
    <Sheet open={open} onClose={close} title="Add a booking" wide={step.name === 'review'}>
      <input
        ref={fileInput}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onFile(f);
        }}
      />

      {step.name === 'choose' && (
        <div className="space-y-3">
          <ErrorBanner>{error}</ErrorBanner>
          <Option
            icon={<FileUp className="w-5 h-5" />}
            title="Upload a ticket"
            text="E-ticket PDF, boarding pass or a screenshot/photo. AI fills in the details."
            onClick={() => fileInput.current?.click()}
          />
          <Option
            icon={<ClipboardPaste className="w-5 h-5" />}
            title="Paste a confirmation email"
            text="Copy the text of your booking email and paste it."
            onClick={() => setStep({ name: 'paste' })}
          />
          <Option icon={<PencilLine className="w-5 h-5" />} title="Enter it manually" text="Type in the flight, train or hotel yourself." onClick={startManual} />
          <p className="text-xs text-[#6D7A77]">Uploads are private to you. Only the details you confirm are shared with the group.</p>
        </div>
      )}

      {step.name === 'paste' && (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            maxLength={20000}
            placeholder="Paste the confirmation email here…"
            className="w-full rounded-xl border border-[#E7DFD5] bg-white p-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#00685F]/40"
          />
          <ErrorBanner>{error}</ErrorBanner>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep({ name: 'choose' })}>
              Back
            </Button>
            <Button className="flex-1" disabled={text.trim().length < 20} onClick={onPaste}>
              <Sparkles className="w-4 h-4" /> Read with AI
            </Button>
          </div>
        </div>
      )}

      {step.name === 'working' && (
        <div className="py-10 flex flex-col items-center gap-3 text-[#6D7A77]">
          <Loader2 className="w-7 h-7 animate-spin text-[#00685F]" />
          <p className="text-sm font-semibold text-[#161C23]">{step.label}</p>
          {step.progress !== undefined ? (
            <div className="w-48 h-1.5 rounded-full bg-[#E7DFD5] overflow-hidden">
              <div className="h-full bg-[#00685F] transition-all" style={{ width: `${Math.round(step.progress * 100)}%` }} />
            </div>
          ) : (
            <p className="text-xs">This usually takes 5–20 seconds.</p>
          )}
        </div>
      )}

      {step.name === 'review' && (
        <div className="space-y-4">
          {source !== 'manual' && (
            <p className="text-sm text-[#6D7A77] flex items-start gap-2">
              <Sparkles className="w-4 h-4 mt-0.5 text-[#00685F] shrink-0" />
              AI found {items.length} booking{items.length === 1 ? '' : 's'}. Check every detail before saving — times are local to each place.
            </p>
          )}
          {items.map((item, idx) =>
            item.saved ? (
              <Card key={item.key} className="p-3 text-sm text-[#00685F] font-semibold">
                ✓ Saved {KIND[item.draft.kind ?? 'flight'].label.toLowerCase()} {item.draft.to?.name ? `to ${item.draft.to.name}` : ''}
              </Card>
            ) : (
              <Card key={item.key} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#6D7A77]">
                    Booking {idx + 1} of {items.length}
                  </p>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((i) => i.key !== item.key))}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#B3261E]"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Skip this one
                    </button>
                  )}
                </div>
                {item.warnings.map((w) => (
                  <p key={w} className="flex items-start gap-2 text-xs text-[#96590B] bg-[#FDF3E1] rounded-lg px-2.5 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
                <BookingEditor
                  value={item.draft}
                  members={members}
                  onChange={(d) => setItems(items.map((i) => (i.key === item.key ? { ...i, draft: d, error: undefined } : i)))}
                />
                <ErrorBanner>{item.error}</ErrorBanner>
              </Card>
            ),
          )}
          <div className="flex gap-3 sticky bottom-0 bg-[#FAF8F5] pt-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button className="flex-1" loading={saving} onClick={saveAll} disabled={!pending.length}>
              Save {pending.length > 1 ? `${pending.length} bookings` : 'booking'}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Option({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-3 p-4 rounded-2xl border border-[#E7DFD5] bg-white text-left hover:border-[#00685F]/50 transition-colors"
    >
      <span className="w-10 h-10 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center shrink-0">{icon}</span>
      <span>
        <span className="block font-bold text-[#161C23]">{title}</span>
        <span className="block text-sm text-[#6D7A77]">{text}</span>
      </span>
    </button>
  );
}
