import { useState } from 'react';
import { useNavigate } from 'react-router';
import { NotificationsCard } from '../components/live/NotificationsCard';
import { TripForm } from '../components/live/TripForm';
import { UsageCard } from '../components/live/UsageCard';
import { api, ApiError } from '../lib/api';
import { Button, Card, ErrorBanner, Field, Input } from '../ui';
import { useTrip } from './TripLayout';

export function SettingsPage() {
  const { trip, isAdmin } = useTrip();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  if (!isAdmin) {
    return (
      <div className="max-w-xl space-y-4">
        <NotificationsCard />
        <Card className="p-5 text-sm text-[#6D7A77]">Only the trip admin can change trip details.</Card>
      </div>
    );
  }

  const del = async () => {
    setDeleting(true);
    setError('');
    try {
      await api.post('trips/delete', {}, { tripId: trip.id });
      // The trip's live listeners drop this page as soon as the doc is gone, so
      // fall back to a hard navigation if the router didn't move us.
      navigate('/trips', { replace: true });
      setTimeout(() => {
        if (window.location.pathname.startsWith(`/t/${trip.id}`)) window.location.replace('/trips');
      }, 300);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the trip.');
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <NotificationsCard />
      <Card className="p-5 space-y-4">
        <h2 className="font-bold text-[#161C23]">Trip details</h2>
        <TripForm
          // Remount when the trip changes remotely so the form shows fresh values.
          key={trip.updatedAt}
          initial={trip}
          submitLabel={saved ? 'Saved ✓' : 'Save changes'}
          onSubmit={async (input) => {
            await api.post('trips/update', input, { tripId: trip.id });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        />
      </Card>

      <UsageCard />

      <Card className="p-5 space-y-3 border-[#F2B8B5]">
        <h2 className="font-bold text-[#B3261E]">Delete trip</h2>
        <p className="text-sm text-[#6D7A77]">
          Permanently deletes the trip, its members list and everything planned in it. This can't be undone.
        </p>
        <Field label={`Type "${trip.name}" to confirm`}>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder={trip.name}
          />
        </Field>
        <ErrorBanner>{error}</ErrorBanner>
        <Button variant="danger" disabled={!nameMatches(confirmName, trip.name)} loading={deleting} onClick={del}>
          Delete this trip
        </Button>
      </Card>
    </div>
  );
}

/** Phone keyboards add trailing spaces and capitals — don't make people fight them. */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const nameMatches = (typed: string, name: string) => norm(typed) === norm(name);
