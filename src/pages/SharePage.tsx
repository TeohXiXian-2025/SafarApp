// Receives posts shared from other apps (Android share sheet → Safar), via the
// manifest's share_target. Pick a trip, then the Idea Board import opens with
// the shared link/text already filled in.
import { collection, query, where } from 'firebase/firestore';
import { MapPin, Share2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/auth';
import { AppHeader } from '../components/live/AppHeader';
import { paths, Trip } from '../domain';
import { db } from '../firebase/config';
import { useQuery } from '../lib/firestore';
import { daysUntil, formatDateRange } from '../lib/format';
import { Button, Card, Spinner } from '../ui';

export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const uid = useAuth((s) => s.user?.uid);
  // Apps put the link in `url`, `text` or both — keep everything, the server finds the link.
  const shared = useMemo(
    () => [params.get('title'), params.get('text'), params.get('url')].filter((x, i, all) => x && all.indexOf(x) === i).join(' ').trim(),
    [params],
  );
  const trips = useQuery(uid ? `share-trips:${uid}` : null, () => query(collection(db, paths.trips()), where('memberIds', 'array-contains', uid)), Trip);
  const upcoming = trips.data.filter((t) => daysUntil(t.endDate) >= 0).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const go = (tripId: string) => navigate(`/t/${tripId}/ideas?share=${encodeURIComponent(shared)}`, { replace: true });

  // Only one upcoming trip → no need to ask.
  useEffect(() => {
    if (!trips.loading && shared && upcoming.length === 1) go(upcoming[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips.loading, shared, upcoming.length]);

  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <AppHeader />
      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-[#00685F]" />
          <h1 className="text-xl font-extrabold text-[#161C23]">Add to which trip?</h1>
        </div>
        {shared && <p className="text-xs text-[#6D7A77] break-all line-clamp-3 bg-white rounded-xl border border-[#E7DFD5] p-3">{shared}</p>}
        {!shared ? (
          <Card className="p-5 text-sm text-[#6D7A77]">Nothing was shared. Share a TikTok, Instagram or Xiaohongshu post to Safar from its app.</Card>
        ) : trips.loading ? (
          <Spinner />
        ) : upcoming.length === 0 ? (
          <Card className="p-5 space-y-3 text-sm text-[#6D7A77]">
            <p>You don't have an upcoming trip yet.</p>
            <Link to="/trips/new">
              <Button>Plan a trip</Button>
            </Link>
          </Card>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((t) => (
              <li key={t.id}>
                <button onClick={() => go(t.id)} className="w-full text-left">
                  <Card className="p-4 hover:border-[#00685F]/40">
                    <p className="font-bold text-[#161C23]">{t.name}</p>
                    <p className="text-xs text-[#6D7A77] flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {t.destinations.map((d) => d.name).join(' → ')} · {formatDateRange(t.startDate, t.endDate)}
                    </p>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
