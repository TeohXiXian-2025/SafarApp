// Free allowances this month (hotel prices, link readers, flight status) and
// AI requests per day — so running low shows up before anything breaks.
// Each service already falls back on its own when its allowance runs out.
import { Gauge } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { auth } from '../../firebase/config';
import { api } from '../../lib/api';
import { Card, cx } from '../../ui';

interface Cap {
  used: number;
  cap: number;
  left: number;
  pct: number;
  note: string;
}
interface Usage {
  month: string;
  hotels: Cap;
  instagramTiktok: Cap;
  xiaohongshu: Cap;
  flightStatus: Cap;
  halalAutoChecks: Cap;
  halalChecksMonth?: Cap;
  ai: { last7Days: { day: string; gemini: number; groq: number; failed: number }[]; models: { model: string; resting: boolean }[]; note: string };
}

const ROWS: [keyof Omit<Usage, 'month' | 'ai'>, string][] = [
  ['hotels', 'Hotel searches'],
  ['instagramTiktok', 'Instagram / TikTok links'],
  ['xiaohongshu', 'Xiaohongshu links'],
  ['flightStatus', 'Flight status checks'],
  ['halalChecksMonth', 'Halal full checks (this month)'],
  ['halalAutoChecks', 'Auto halal checks (today)'],
];

/** True when the signed-in account is an app owner (OWNER_EMAILS). Asked once per signed-in user. */
let ownerCheck: { uid: string; result: Promise<boolean> } | null = null;
export function isOwner(): Promise<boolean> {
  const uid = auth.currentUser?.uid ?? '';
  if (ownerCheck?.uid !== uid) ownerCheck = { uid, result: uid ? api.get('system/usage').then(() => true, () => false) : Promise.resolve(false) };
  return ownerCheck.result;
}

export function UsageCard({ fallback = null }: { fallback?: ReactNode }) {
  const [u, setU] = useState<Usage | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    void api.get<Usage>('system/usage').then(setU).catch(() => setDenied(true));
  }, []);
  if (denied) return <>{fallback}</>;
  if (!u) return null;
  const today = u.ai.last7Days[0];
  const week = u.ai.last7Days.reduce((s, d) => ({ ok: s.ok + d.gemini + d.groq, failed: s.failed + d.failed }), { ok: 0, failed: 0 });
  const resting = u.ai.models.filter((m) => m.resting).length;

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-bold text-[#161C23] flex items-center gap-2">
        <Gauge className="w-4 h-4 text-[#00685F]" /> Service usage · {u.month}
      </h2>
      <ul className="space-y-2.5">
        {ROWS.map(([k, label]) => {
          const c = u[k];
          const tone = c.pct >= 90 ? 'bg-[#B3261E]' : c.pct >= 70 ? 'bg-[#E0A030]' : 'bg-[#00685F]';
          return (
            <li key={k} title={c.note}>
              <div className="flex justify-between text-sm">
                <span className="text-[#161C23]">{label}</span>
                <span className={cx('tabular-nums', c.pct >= 70 ? 'font-bold text-[#8A5A00]' : 'text-[#6D7A77]')}>
                  {c.used} / {c.cap}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#F3EFE9] overflow-hidden">
                <div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.min(100, c.pct)}%` }} />
              </div>
              {c.pct >= 70 && <p className="text-[11px] text-[#8A5A00] mt-0.5">{c.note}</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-[#161C23]">
        AI: {today.gemini + today.groq} requests today ({today.groq} by the backup Groq){today.failed ? ` · ${today.failed} failed` : ''} · {week.ok} this week
        {week.failed ? `, ${week.failed} failed` : ''}.
      </p>
      <p className={cx('text-xs', resting === u.ai.models.length ? 'text-[#B3261E] font-semibold' : 'text-[#6D7A77]')}>
        {resting === u.ai.models.length
          ? 'All Gemini models are resting (daily limit) — Groq is answering until they reset.'
          : resting
            ? `${resting} of ${u.ai.models.length} Gemini models resting (daily limit) — the others are answering.`
            : 'All Gemini models available.'}
      </p>
    </Card>
  );
}
