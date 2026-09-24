import { CalendarDays, MapPin, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { AppHeader } from '../components/live/AppHeader';
import { api, ApiError } from '../lib/api';
import { formatDateRange } from '../lib/format';
import { Button, Card, ErrorBanner, Spinner } from '../ui';

interface Preview {
  tripId: string;
  name: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  memberCount: number;
  adminName: string | null;
  alreadyMember: boolean;
  problem: string | null;
}

export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api
      .get<Preview>('invites/preview', { token })
      .then(setPreview)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not open this invite.'));
  }, [token]);

  if (preview?.alreadyMember) return <Navigate to={`/t/${preview.tripId}`} replace />;

  const join = async () => {
    setJoining(true);
    setError('');
    try {
      const { tripId } = await api.post<{ tripId: string }>('invites/accept', { token });
      navigate(`/t/${tripId}`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join the trip.');
      setJoining(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <AppHeader />
      <main className="max-w-md mx-auto px-4 py-10">
        {!preview && !error ? (
          <Spinner label="Opening invite…" />
        ) : (
          <Card className="p-6 space-y-5">
            {preview && (
              <>
                <div className="space-y-1">
                  <p className="text-sm text-[#6D7A77]">{preview.adminName ?? 'Someone'} invited you to join</p>
                  <h1 className="text-2xl font-extrabold text-[#161C23]">{preview.name}</h1>
                </div>
                <div className="space-y-2 text-sm text-[#6D7A77]">
                  <p className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#00685F]" /> {preview.destinations.join(' → ')}
                  </p>
                  <p className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-[#00685F]" /> {formatDateRange(preview.startDate, preview.endDate)}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#00685F]" /> {preview.memberCount} member{preview.memberCount === 1 ? '' : 's'} so far
                  </p>
                </div>
              </>
            )}
            <ErrorBanner>{preview?.problem || error}</ErrorBanner>
            {preview && !preview.problem ? (
              <Button className="w-full" loading={joining} onClick={join}>
                Join trip
              </Button>
            ) : (
              <Link to="/trips" className="block">
                <Button variant="secondary" className="w-full">
                  Go to my trips
                </Button>
              </Link>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
