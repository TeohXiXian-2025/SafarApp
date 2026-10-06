import { AlertTriangle, BedDouble, BusFront, ClipboardPaste, FileText, FileUp, Loader2, PencilLine, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { VAULT_KINDS, type BookingDraft, type Member, type VaultFields, type VaultKind } from '../../domain';
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
  fileRef?: string;
  confidence?: number;
  source?: Source;
  error?: string;
  saved?: boolean;
}

interface ParseResponse {
  confidence: number;
  drafts: { draft: EditableDraft; warnings: string[] }[];
}

type Step =
  | { name: 'choose' }
  | { name: 'upload' }
  | { name: 'paste' }
  | { name: 'working'; label: string; progress?: number }
  | { name: 'review' };

type UploadCategory = 'transport' | 'hotels' | 'documents';

interface UploadResult {
  key: string;
  category: UploadCategory;
  fileName: string;
  status: 'uploading' | 'reading' | 'ready' | 'saved' | 'error';
  progress?: number;
  message?: string;
}

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
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const transportInput = useRef<HTMLInputElement>(null);
  const hotelsInput = useRef<HTMLInputElement>(null);
  const documentsInput = useRef<HTMLInputElement>(null);
  const freshUploads = useRef(new Set<string>());

  const reset = () => {
    setStep({ name: 'choose' });
    setItems([]);
    setUploadResults([]);
    setText('');
    setError('');
  };
  const close = () => {
    // Uploads that never became a booking or vault document shouldn't linger in storage.
    freshUploads.current.forEach((p) => void deleteFile(p));
    freshUploads.current.clear();
    reset();
    onClose();
  };

  const toReview = (res: ParseResponse, src: Source) => {
    setSource(src);
    if (!res.drafts.length) {
      setError("We couldn't find any flight, train, bus, ferry or hotel details. Try a clearer photo, or enter it manually.");
      setStep({ name: 'choose' });
      return;
    }
    setItems(res.drafts.map((d, i) => ({ key: `d${i}`, draft: d.draft, warnings: d.warnings })));
    setStep({ name: 'review' });
  };

  const updateUpload = (key: string, patch: Partial<UploadResult>) => {
    setUploadResults((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const onBookingFiles = async (category: Exclude<UploadCategory, 'documents'>, files: FileList | File[]) => {
    setError('');
    setSource('upload');
    for (const file of Array.from(files)) {
      const key = `${category}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploadResults((rows) => [...rows, { key, category, fileName: file.name, status: 'uploading', progress: 0 }]);
      try {
        const path = await uploadTripFile(tripId, me.uid, 'bookings', file, (p) => updateUpload(key, { progress: p }));
        freshUploads.current.add(path);
        updateUpload(key, { status: 'reading', progress: undefined, message: 'Reading with AI' });
        const parsed = await api.post<ParseResponse>('bookings/parse', { storagePath: path }, { tripId });
        const drafts = parsed.drafts.filter((d) => (category === 'hotels' ? d.draft.kind === 'hotel' : d.draft.kind !== 'hotel'));
        if (!drafts.length) {
          updateUpload(key, { status: 'error', message: category === 'hotels' ? 'No hotel booking found in this file.' : 'No transport booking found in this file.' });
          continue;
        }
        setItems((existing) => [
          ...existing,
          ...drafts.map((d, i) => ({
            key: `${key}-${i}`,
            draft: d.draft,
            warnings: d.warnings,
            fileRef: path,
            confidence: parsed.confidence,
            source: 'upload' as const,
          })),
        ]);
        updateUpload(key, { status: 'ready', message: `${drafts.length} booking${drafts.length === 1 ? '' : 's'} ready to review` });
      } catch (e) {
        updateUpload(key, { status: 'error', message: e instanceof Error ? e.message : 'Could not upload this file.' });
      }
    }
  };

  const onDocumentFiles = async (files: FileList | File[]) => {
    setError('');
    for (const file of Array.from(files)) {
      const key = `documents-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploadResults((rows) => [...rows, { key, category: 'documents', fileName: file.name, status: 'uploading', progress: 0 }]);
      try {
        const path = await uploadTripFile(tripId, me.uid, 'vault', file, (p) => updateUpload(key, { progress: p }));
        freshUploads.current.add(path);
        updateUpload(key, { status: 'reading', progress: undefined, message: 'Reading document' });
        const read = await api.post<{ kind: VaultKind | null; fields: VaultFields; confidence: number }>('vault/read', { storagePath: path }, { tripId });
        if (!read.kind) {
          void deleteFile(path);
          freshUploads.current.delete(path);
          updateUpload(key, { status: 'error', message: "Couldn't identify this as a passport, visa or insurance document." });
          continue;
        }
        await api.post('vault/save', { kind: read.kind, fields: read.fields, storagePath: path, keepFile: true, confidence: read.confidence }, { tripId });
        freshUploads.current.delete(path);
        updateUpload(key, { status: 'saved', message: `${VAULT_KINDS[read.kind]} saved to Documents` });
      } catch (e) {
        updateUpload(key, { status: 'error', message: e instanceof ApiError && e.status === 412 ? 'Open the Documents tab and accept the private vault notice first.' : e instanceof Error ? e.message : 'Could not upload this document.' });
      }
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
          {
            draft: item.draft as BookingDraft,
            source: item.source ?? source,
            ...(item.fileRef ? { fileRef: item.fileRef } : {}),
            ...(item.confidence !== undefined ? { parseConfidence: item.confidence } : {}),
          },
          { tripId },
        );
        item.saved = true;
        if (item.fileRef) freshUploads.current.delete(item.fileRef);
        item.error = undefined;
      } catch (e) {
        item.error = e instanceof ApiError ? e.message : 'Could not save.';
      }
      setItems([...next]);
    }
    setItems([...next]);
    setSaving(false);
    if (next.every((i) => i.saved)) {
      freshUploads.current.forEach((p) => void deleteFile(p));
      freshUploads.current.clear();
      reset();
      onClose();
    }
  };

  const pending = items.filter((i) => !i.saved);

  return (
    <Sheet open={open} onClose={close} title="Add travel details" wide={step.name === 'review'}>
      {step.name === 'choose' && (
        <div className="space-y-3">
          <ErrorBanner>{error}</ErrorBanner>
          <Option
            icon={<FileUp className="w-5 h-5" />}
            title="Upload files"
            text="Add transport, hotel and document files from one place."
            onClick={() => setStep({ name: 'upload' })}
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

      {step.name === 'upload' && (
        <div className="space-y-4">
          <input
            ref={transportInput}
            type="file"
            accept={UPLOAD_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void onBookingFiles('transport', files);
            }}
          />
          <input
            ref={hotelsInput}
            type="file"
            accept={UPLOAD_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void onBookingFiles('hotels', files);
            }}
          />
          <input
            ref={documentsInput}
            type="file"
            accept={UPLOAD_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void onDocumentFiles(files);
            }}
          />
          <ErrorBanner>{error}</ErrorBanner>
          <UploadBucket
            icon={<BusFront className="w-5 h-5" />}
            title="Transport"
            text="Flights, trains, buses and ferries."
            onClick={() => transportInput.current?.click()}
            onFiles={(files) => void onBookingFiles('transport', files)}
            files={uploadResults.filter((r) => r.category === 'transport')}
          />
          <UploadBucket
            icon={<BedDouble className="w-5 h-5" />}
            title="Hotels"
            text="Hotel and stay confirmations."
            onClick={() => hotelsInput.current?.click()}
            onFiles={(files) => void onBookingFiles('hotels', files)}
            files={uploadResults.filter((r) => r.category === 'hotels')}
          />
          <UploadBucket
            icon={<FileText className="w-5 h-5" />}
            title="Documents"
            text="Passport, visa and insurance files for your private vault."
            onClick={() => documentsInput.current?.click()}
            onFiles={(files) => void onDocumentFiles(files)}
            files={uploadResults.filter((r) => r.category === 'documents')}
          />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep({ name: 'choose' })}>
              Back
            </Button>
            <Button className="flex-1" disabled={!items.some((i) => !i.saved)} onClick={() => setStep({ name: 'review' })}>
              Review {items.filter((i) => !i.saved).length || ''} booking{items.filter((i) => !i.saved).length === 1 ? '' : 's'}
            </Button>
          </div>
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

function UploadBucket({
  icon,
  title,
  text,
  onClick,
  onFiles,
  files,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  onClick: () => void;
  onFiles: (files: File[]) => void;
  files: UploadResult[];
}) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length) onFiles(dropped);
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={[
        'rounded-2xl border border-dashed bg-white transition-colors hover:border-[#00685F]/60 hover:bg-[#00685F]/5',
        dragging ? 'border-[#00685F] bg-[#00685F]/5 ring-2 ring-[#00685F]/20' : 'border-[#D8CEC2]',
      ].join(' ')}
    >
      <button type="button" onClick={onClick} className="w-full flex items-center gap-3 p-4 text-left">
        <span className="w-10 h-10 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[#161C23]">{title}</span>
          <span className="block text-sm text-[#6D7A77]">{text}</span>
        </span>
        <FileUp className="w-4 h-4 text-[#6D7A77] shrink-0" />
      </button>
      {files.length > 0 && (
        <div className="space-y-2 border-t border-[#E7DFD5] px-3 pb-3 pt-2">
          {files.map((r) => (
            <UploadFileRow key={r.key} file={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadFileRow({ file: r }: { file: UploadResult }) {
  return (
    <div className="rounded-xl border border-[#E7DFD5] bg-white px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        {(r.status === 'uploading' || r.status === 'reading') && <Loader2 className="w-4 h-4 animate-spin text-[#00685F]" />}
        <span className="min-w-0 flex-1 truncate font-semibold text-[#161C23]">{r.fileName}</span>
        <span className={r.status === 'error' ? 'text-[#B3261E]' : r.status === 'saved' || r.status === 'ready' ? 'text-[#00685F]' : 'text-[#6D7A77]'}>
          {r.status === 'uploading' ? `${Math.round((r.progress ?? 0) * 100)}%` : r.status}
        </span>
      </div>
      {r.message && <p className={r.status === 'error' ? 'mt-1 text-xs text-[#B3261E]' : 'mt-1 text-xs text-[#6D7A77]'}>{r.message}</p>}
    </div>
  );
}
