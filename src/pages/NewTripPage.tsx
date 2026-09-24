import { useNavigate } from 'react-router';
import { AppHeader } from '../components/live/AppHeader';
import { TripForm } from '../components/live/TripForm';
import { api } from '../lib/api';
import { Card } from '../ui';

export function NewTripPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <AppHeader />
      <main className="max-w-xl mx-auto px-4 py-6 space-y-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div>
          <h1 className="text-2xl font-extrabold text-[#161C23]">Plan a new trip</h1>
          <p className="text-sm text-[#6D7A77] mt-1">You'll be the trip admin. You can invite your group next.</p>
        </div>
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
