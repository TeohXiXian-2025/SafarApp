import { useState } from 'react';
import { useNavigate } from 'react-router';
import { TripForm } from '../components/live/TripForm';
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
    return <Card className="p-5 text-sm text-[#6D7A77]">Only the trip admin can change trip settings.</Card>;
  }

  const del = async () => {
    setDeleting(true);
    setError('');
    try {
      await api.post('trips/delete', {}, { tripId: trip.id });
      navigate('/trips', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the trip.');
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
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

      <Card className="p-5 space-y-3 border-[#F2B8B5]">
        <h2 className="font-bold text-[#B3261E]">Delete trip</h2>
        <p className="text-sm text-[#6D7A77]">
          Permanently deletes the trip, its members list and everything planned in it. This can't be undone.
        </p>
        <Field label={`Type "${trip.name}" to confirm`}>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </Field>
        <ErrorBanner>{error}</ErrorBanner>
        <Button variant="danger" disabled={confirmName !== trip.name} loading={deleting} onClick={del}>
          Delete this trip
        </Button>
      </Card>
    </div>
  );
}
