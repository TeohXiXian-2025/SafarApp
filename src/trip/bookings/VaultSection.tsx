// Document Vault: my passport, visas and insurance — only I can open them —
// checked against the trip. The group sees only each person's status labels.
import { AlertOctagon, CheckCircle2, CircleDashed, ExternalLink, Eye, EyeOff, FileText, Loader2, Lock, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { countryName, paths, Readiness, VAULT_KINDS, type CheckLevel, type ReadyCheck, type VaultDoc, type VaultFields, type VaultKind } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { deleteFile, fileUrl, UPLOAD_ACCEPT, uploadTripFile } from '../../lib/storage';
import { Avatar, Button, Card, Chip, cx, ErrorBanner, Field, Input, Sheet, Spinner, Toggle } from '../../ui';
import { useTrip } from '../TripLayout';

interface VaultState {
  consentAt?: number;
  share: boolean;
  docs: VaultDoc[];
  checks: ReadyCheck[];
  tickets: { id: string; kind: string; title: string; fileRef: string }[];
}

const LEVEL: Record<CheckLevel, { icon: typeof CheckCircle2; cls: string }> = {
  ok: { icon: CheckCircle2, cls: 'text-[#00685F]' },
  todo: { icon: CircleDashed, cls: 'text-[#6D7A77]' },
  warn: { icon: TriangleAlert, cls: 'text-[#96590B]' },
  bad: { icon: AlertOctagon, cls: 'text-[#B3261E]' },
};

const FIELD_LABELS: [keyof VaultFields, string, 'text' | 'date' | 'country'][] = [
  ['fullName', 'Name', 'text'],
  ['number', 'Number', 'text'],
  ['nationality', 'Nationality', 'country'],
  ['country', 'For country', 'country'],
  ['issuingCountry', 'Issued by', 'country'],
  ['dateOfBirth', 'Date of birth', 'date'],
  ['validFrom', 'Valid from', 'date'],
  ['validUntil', 'Valid until', 'date'],
  ['provider', 'Insurer / type', 'text'],
];
const FIELDS_FOR: Record<VaultKind, (keyof VaultFields)[]> = {
  passport: ['fullName', 'number', 'nationality', 'issuingCountry', 'dateOfBirth', 'validUntil'],
  visa: ['fullName', 'number', 'country', 'provider', 'validFrom', 'validUntil'],
  insurance: ['fullName', 'number', 'provider', 'validFrom', 'validUntil'],
};

export function VaultSection() {
  const { trip } = useTrip();
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<VaultDoc | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.post<VaultState>('vault/list', {}, { tripId: trip.id }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open the vault.');
    }
  }, [trip.id]);
  useEffect(() => void load(), [load]);

  if (!state) return error ? <ErrorBanner>{error}</ErrorBanner> : <Spinner label="Opening your vault…" />;
  if (!state.consentAt) return <Consent onDone={load} />;

  return (
    <div className="space-y-4">
      <MyChecks checks={state.checks} />

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-[#161C23] flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#00685F]" /> My documents
          </h2>
          <Button className="!min-h-9" onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
        {state.docs.length === 0 ? (
          <p className="text-sm text-[#6D7A77]">Add your passport first — Safar checks its expiry and the names on your tickets.</p>
        ) : (
          <ul className="divide-y divide-[#E7DFD5]">
            {state.docs.map((d) => (
              <DocRow key={d.id} doc={d} onEdit={() => setEditing(d)} onChanged={load} />
            ))}
          </ul>
        )}
        {state.tickets.length > 0 && (
          <div className="border-t border-[#E7DFD5] pt-3 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6D7A77]">Tickets & confirmations you uploaded</p>
            {state.tickets.map((t) => (
              <button key={t.id} type="button" onClick={() => void fileUrl(t.fileRef).then((u) => window.open(u, '_blank', 'noopener'))} className="flex w-full items-center gap-2 text-left text-sm text-[#161C23] hover:text-[#00685F]">
                <FileText className="w-4 h-4 shrink-0 text-[#6D7A77]" /> <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <GroupReadiness />

      <Card className="p-4 space-y-3">
        <Toggle
          checked={state.share}
          onChange={(share) => void api.post('vault/consent', { share }, { tripId: trip.id }).then(load)}
          label="Share my status with the group"
          hint="They see only lines like “Passport ✓” or “Insurance not added” — never your documents, numbers or dates."
        />
        <button
          type="button"
          className="text-sm font-semibold text-[#B3261E]"
          onClick={() => {
            if (confirm('Delete every document and file in your vault for this trip? This cannot be undone.')) void api.post('vault/forget', {}, { tripId: trip.id }).then(load);
          }}
        >
          Delete my vault for this trip
        </button>
      </Card>

      {editing && <DocSheet doc={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function Consent({ onDone }: { onDone: () => void }) {
  const { trip } = useTrip();
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const agree = async () => {
    setBusy(true);
    try {
      await api.post('vault/consent', { share }, { tripId: trip.id });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setBusy(false);
    }
  };
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center">
          <Lock className="w-5 h-5" />
        </span>
        <h2 className="text-lg font-bold text-[#161C23]">Your Document Vault</h2>
      </div>
      <ul className="space-y-2 text-sm text-[#161C23] list-disc pl-5">
        <li>
          Keep your <strong>passport, visas and travel insurance</strong> for this trip. Safar checks them against your bookings: passport expiry, the name on your tickets, visa
          and insurance dates.
        </li>
        <li>
          <strong>Only you</strong> can open your documents. Not the admin, not the group.
        </li>
        <li>An AI (Google Gemini) reads each upload to fill in the details. You check them before anything is saved.</li>
        <li>You can keep just the details and have the image deleted straight away.</li>
        <li>Delete any document, or everything, at any time. Leaving the trip deletes it too.</li>
      </ul>
      <Toggle checked={share} onChange={setShare} label="Share my status with the group" hint="Only lines like “Passport ✓”. You can change this later." />
      <ErrorBanner>{error}</ErrorBanner>
      <Button className="w-full" loading={busy} onClick={() => void agree()}>
        I understand — open my vault
      </Button>
    </Card>
  );
}

function MyChecks({ checks }: { checks: ReadyCheck[] }) {
  const order: CheckLevel[] = ['bad', 'warn', 'todo', 'ok'];
  const sorted = [...checks].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const ready = checks.length > 0 && checks.every((c) => c.level === 'ok');
  return (
    <Card className="p-4 space-y-2">
      <h2 className="font-bold text-[#161C23]">{ready ? 'You’re ready to go ✓' : 'Before you go'}</h2>
      <ul className="space-y-2">
        {sorted.map((c) => {
          const L = LEVEL[c.level];
          return (
            <li key={c.key} className="flex gap-2.5 text-sm">
              <L.icon className={cx('w-4 h-4 mt-0.5 shrink-0', L.cls)} />
              <span className="text-[#161C23]">
                {c.text}
                {c.link && (
                  <a href={c.link} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-[#00685F]">
                    Check official rules <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function GroupReadiness() {
  const { trip, members, me } = useTrip();
  const shared = useQuery(`readiness:${trip.id}`, () => paths.readiness(trip.id), Readiness);
  const others = members.filter((m) => m.uid !== me.uid);
  if (!others.length) return null;
  const badge = { ready: ['✓ Ready', 'text-[#00685F]'], check: ['! To check', 'text-[#96590B]'], problem: ['⚠ Problem', 'text-[#B3261E]'] } as const;
  return (
    <Card className="p-4 space-y-2">
      <h2 className="font-bold text-[#161C23]">Group readiness</h2>
      <ul className="space-y-2">
        {others.map((m) => {
          const r = shared.data.find((x) => x.uid === m.uid);
          const issues = r?.items.filter((i) => i.level !== 'ok') ?? [];
          return (
            <li key={m.uid} className="flex items-start gap-2.5">
              <Avatar name={m.displayName} photoURL={m.photoURL} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#161C23]">
                  {m.displayName} {r ? <span className={cx('ml-1 text-xs font-bold', badge[r.status][1])}>{badge[r.status][0]}</span> : <span className="ml-1 text-xs text-[#9AA5A3]">not shared</span>}
                </p>
                {issues.length > 0 && <p className="text-xs text-[#6D7A77]">{issues.map((i) => i.label).join(' · ')}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function DocRow({ doc, onEdit, onChanged }: { doc: VaultDoc; onEdit: () => void; onChanged: () => void }) {
  const { trip } = useTrip();
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const f = doc.fields;
  const number = f.number ? (reveal ? f.number : `•••• ${f.number.slice(-3)}`) : null;
  const detail = [f.fullName, f.country && `for ${countryName(f.country)}`, f.provider, f.validUntil && `until ${f.validUntil}`].filter(Boolean).join(' · ');

  const open = async () => {
    const tab = window.open('', '_blank');
    try {
      const { url } = await api.post<{ url: string }>('vault/file', { id: doc.id }, { tripId: trip.id });
      if (tab) tab.location.href = url;
    } catch {
      tab?.close();
    }
  };
  const remove = async () => {
    if (!confirm(`Delete this ${VAULT_KINDS[doc.kind].slice(3).toLowerCase()}?`)) return;
    setBusy(true);
    await api.post('vault/delete', { id: doc.id }, { tripId: trip.id }).catch(() => {});
    onChanged();
  };

  return (
    <li className="py-2.5 flex items-start gap-3">
      <span className="text-lg" aria-hidden>
        {VAULT_KINDS[doc.kind].split(' ')[0]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#161C23]">{VAULT_KINDS[doc.kind].split(' ').slice(1).join(' ')}</p>
        <p className="text-xs text-[#6D7A77] truncate">{detail || 'No details yet'}</p>
        {number && (
          <button type="button" onClick={() => setReveal((v) => !v)} className="mt-0.5 inline-flex items-center gap-1 text-xs font-mono text-[#161C23]">
            {number} {reveal ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {doc.storagePath && (
          <IconBtn label="View file" onClick={() => void open()}>
            <FileText className="w-4 h-4" />
          </IconBtn>
        )}
        <IconBtn label="Edit" onClick={onEdit}>
          <Pencil className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Delete" onClick={() => void remove()} disabled={busy} danger>
          <Trash2 className="w-4 h-4" />
        </IconBtn>
      </div>
    </li>
  );
}

function DocSheet({ doc, onClose, onSaved }: { doc?: VaultDoc; onClose: () => void; onSaved: () => void }) {
  const { trip, me } = useTrip();
  const [kind, setKind] = useState<VaultKind>(doc?.kind ?? 'passport');
  const [fields, setFields] = useState<VaultFields>(doc?.fields ?? {});
  const [path, setPath] = useState(doc?.storagePath);
  const [keep, setKeep] = useState(doc ? !!doc.storagePath : true);
  const [confidence, setConfidence] = useState(doc?.confidence);
  const [reading, setReading] = useState<string>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fresh = useRef<string>(undefined);

  const onFile = async (file: File) => {
    setError('');
    try {
      setReading('Uploading privately…');
      const p = await uploadTripFile(trip.id, me.uid, 'vault', file);
      if (fresh.current) void deleteFile(fresh.current);
      fresh.current = p;
      setPath(p);
      setReading('Reading it…');
      const r = await api.post<{ kind: VaultKind | null; fields: VaultFields; confidence: number }>('vault/read', { storagePath: p }, { tripId: trip.id });
      if (!r.kind || r.confidence < 0.3) setError("Couldn't read this clearly. Fill in the details yourself, or try a sharper photo.");
      if (r.kind) setKind(r.kind);
      setFields(r.fields);
      setConfidence(r.confidence);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read it.');
    } finally {
      setReading(undefined);
    }
  };

  const close = () => {
    if (fresh.current) void deleteFile(fresh.current);
    onClose();
  };
  const save = async () => {
    setSaving(true);
    setError('');
    const clean = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v && FIELDS_FOR[kind].includes(k as keyof VaultFields)));
    try {
      await api.post('vault/save', { ...(doc ? { id: doc.id } : {}), kind, fields: clean, ...(path ? { storagePath: path } : {}), keepFile: keep, ...(confidence !== undefined ? { confidence } : {}) }, { tripId: trip.id });
      fresh.current = undefined;
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={close} title={doc ? 'Edit document' : 'Add a document'}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(VAULT_KINDS) as VaultKind[]).map((k) => (
            <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
              {VAULT_KINDS[k]}
            </Chip>
          ))}
        </div>
        <input ref={input} type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        <Button variant="secondary" className="w-full" disabled={!!reading} onClick={() => input.current?.click()}>
          {reading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> {reading}
            </>
          ) : path ? (
            'Replace photo or PDF'
          ) : (
            'Upload a photo or PDF (AI fills in the details)'
          )}
        </Button>
        {confidence !== undefined && confidence < 0.7 && !reading && <p className="text-xs text-[#96590B]">Please check every field — some parts were hard to read.</p>}

        <div className="grid grid-cols-2 gap-3">
          {FIELD_LABELS.filter(([k]) => FIELDS_FOR[kind].includes(k)).map(([k, label, type]) => (
            <Field key={k} label={label} hint={type === 'country' && fields[k] ? countryName(fields[k]!) : type === 'country' ? '2 letters, e.g. MY' : undefined}>
              <Input
                type={type === 'date' ? 'date' : 'text'}
                maxLength={type === 'country' ? 2 : 120}
                value={fields[k] ?? ''}
                onChange={(e) => setFields((f) => ({ ...f, [k]: type === 'country' ? e.target.value.toUpperCase().replace(/[^A-Z]/g, '') : e.target.value }))}
              />
            </Field>
          ))}
        </div>

        {path && <Toggle checked={keep} onChange={setKeep} label="Keep a copy of the file" hint="Only you can open it. Turn off to keep just the details — the file is deleted when you save." />}
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} disabled={!!reading} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx('w-9 h-9 rounded-lg inline-flex items-center justify-center border border-[#E7DFD5] disabled:opacity-50', danger ? 'text-[#B3261E] hover:bg-[#FDECEA]' : 'text-[#6D7A77] hover:bg-[#F3EFE9]')}
    >
      {children}
    </button>
  );
}
