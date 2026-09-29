import { useNavigate } from 'react-router';
import { AppHeader } from '../components/live/AppHeader';
import { TripForm } from '../components/live/TripForm';
import { api } from '../lib/api';
import { Card, PageHeader } from '../ui';

export function NewTripPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <AppHeader />
      <main className="max-w-xl mx-auto px-4 py-6 space-y-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <PageHeader eyebrow="New trip" title="Where are you going?" />
        <p className="-mt-3 text-sm text-[#6D7A77]">You'll be the trip admin. You can invite your group next.</p>
        <Card className="p-5">
          <TripForm
            submitLabel="Create trip"
            onCancel={() => navigate('/trips')}
            onSubmit={async (input) => {
              const { tripId } = await api.post<{ tripId: string }>('trips/create', input);
              navigate(`/t/${tripId}/members?welcome=1`, { replace: true });
            }}
          />
        </Card>
      </main>
    </div>
  );
}
