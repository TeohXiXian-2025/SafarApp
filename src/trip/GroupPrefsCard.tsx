import { AlertTriangle, BedDouble, Footprints, Moon, SlidersHorizontal, Utensils, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { HALAL_TIER_LABELS, HOTEL_PRIORITY_LABELS, mergePrefs } from '../domain';
import { Button, Card } from '../ui';
import { useTrip } from './TripLayout';

const PACE_LABEL = { relaxed: 'Relaxed', moderate: 'Moderate', fast: 'Packed' } as const;

/** The group's merged preferences — what planning will actually use. */
export function GroupPrefsCard() {
  const { trip, members, me } = useTrip();
  const g = mergePrefs(members);
  const money = (n: number) => `${trip.currency} ${n.toLocaleString()}`;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-[#161C23]">Group preferences</h2>
        <span className="text-xs text-[#6D7A77]">
          {g.respondents.length}/{members.length} answered
        </span>
      </div>

      {g.respondents.length === 0 ? (
        <p className="text-sm text-[#6D7A77]">Nobody has set preferences yet.</p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <Item icon={<BedDouble className="w-4 h-4" />} label="Hotel / night">
            {g.hotelBudget ? (g.hotelBudgetConflict ? <span className="text-[#B3261E]">No overlap</span> : `${money(g.hotelBudget.min)} – ${money(g.hotelBudget.max)}`) : '—'}
          </Item>
          <Item icon={<Wallet className="w-4 h-4" />} label="Daily spend">
            {g.dailyBudget !== null ? `up to ${money(g.dailyBudget)} pp` : '—'}
          </Item>
          <Item icon={<Utensils className="w-4 h-4" />} label="Shared meals">
            {g.sharedMealTier ? `${HALAL_TIER_LABELS[g.sharedMealTier]} (${g.halalRequiredCount} need halal)` : 'No halal requirement'}
          </Item>
          <Item icon={<Moon className="w-4 h-4" />} label="Prayer breaks">
            {g.prayerCount ? `${g.prayerCount} member${g.prayerCount === 1 ? '' : 's'}` : 'Not needed'}
          </Item>
          <Item icon={<Footprints className="w-4 h-4" />} label="Pace">
            {g.pace ? PACE_LABEL[g.pace] : '—'}
          </Item>
          <Item icon={<SlidersHorizontal className="w-4 h-4" />} label="Top hotel needs">
            {g.hotelPriorities.slice(0, 2).map((p) => HOTEL_PRIORITY_LABELS[p.key]).join(', ') || '—'}
          </Item>
        </dl>
      )}

      {g.interests.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {g.interests.slice(0, 8).map((i) => (
            <span key={i.label} className="px-2.5 py-1 rounded-full bg-[#F3EFE9] text-xs font-semibold text-[#161C23]">
              {i.label} · {i.count}
            </span>
          ))}
        </div>
      )}

      {g.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 text-xs text-[#96590B] bg-[#FDF3E1] rounded-lg px-2.5 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
        </p>
      ))}

      <Link to="../preferences" relative="path" className="block">
        <Button variant={me.prefs ? 'secondary' : 'primary'} className="w-full">
          {me.prefs ? 'Edit my preferences' : 'Set my preferences'}
        </Button>
      </Link>
    </Card>
  );
}

function Item({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-8 h-8 rounded-lg bg-[#00685F]/10 text-[#00685F] flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">{label}</dt>
        <dd className="text-[#161C23]">{children}</dd>
      </div>
    </div>
  );
}
