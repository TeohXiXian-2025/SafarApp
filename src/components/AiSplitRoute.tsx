import React from 'react';
import {
  Star,
  MapPin,
  Navigation,
  Footprints,
  Clock,
  Landmark,
  Lightbulb,
  Shuffle,
  Timer,
  Users,
  CheckCircle2,
  ArrowDown,
  Utensils,
} from 'lucide-react';
import { SplitPlan, SplitVenueDetail } from '../types/itinerary';

const TAG_COLOR_STYLES: Record<SplitVenueDetail['tagColor'], string> = {
  green: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  gray:  'bg-slate-100 text-slate-600 border border-slate-200',
  amber: 'bg-amber-100 text-amber-800 border border-amber-300',
};

interface SplitVenueCardProps {
  venue: SplitVenueDetail;
  accent: 'green' | 'slate';
  sideLabel: string;
  trackLetter: 'A' | 'B';
}

function formatReviews(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
}

function SplitVenueCard({ venue, accent, sideLabel, trackLetter }: SplitVenueCardProps) {
  const isGreen   = accent === 'green';
  const topBar    = isGreen ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-slate-500 to-slate-400';
  const badge     = isGreen ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white';
  const ringCls   = isGreen ? 'ring-1 ring-emerald-300 ring-offset-1' : 'ring-1 ring-slate-300 ring-offset-1';
  const border    = isGreen ? 'border-emerald-200' : 'border-slate-200';
  const hoverBg   = isGreen ? 'hover:border-emerald-300 hover:shadow-emerald-100' : 'hover:border-slate-300 hover:shadow-slate-100';

  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${border} ${hoverBg}`}>
      {/* Top accent stripe */}
      <div className={`h-1 w-full ${topBar}`} />

      {/* Hero image */}
      <div className="relative h-32 overflow-hidden bg-[#EDE7DF]">
        <img
          src={venue.imageUrl}
          alt={venue.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />

        {/* Track badge */}
        <span className={`absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shadow-md ${badge}`}>
          {trackLetter}
        </span>

        {/* Dietary tag */}
        <span className={`absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold shadow-sm ${TAG_COLOR_STYLES[venue.tagColor]}`}>
          {venue.tag}
        </span>

        {/* Name bottom-left */}
        <div className="absolute bottom-2.5 left-2.5 right-10">
          <h4 className="truncate text-sm font-black text-white drop-shadow-sm leading-tight">{venue.name}</h4>
          <span className="text-[10px] font-semibold text-white/80">{venue.cuisineType}</span>
        </div>

        {/* Price tag */}
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-black text-[#161C23]">
          {venue.priceRange}
        </span>
      </div>

      <div className="space-y-2.5 p-3">
        {/* Rating */}
        <div className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="text-xs font-black text-[#161C23]">{venue.rating.toFixed(1)}</span>
          <span className="text-[10px] font-medium text-[#8A9592]">
            ({formatReviews(venue.reviewsCount)} reviews)
          </span>
        </div>

        {/* Address */}
        <div className="flex items-start gap-1.5 text-[11px] font-medium text-[#526360]">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#0D6955]" />
          <span className="leading-tight">{venue.address}</span>
        </div>

        {/* Walk logistics */}
        <div className="space-y-1 rounded-xl bg-[#F4F1ED] px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#161C23]">
            <Navigation className="h-3 w-3 text-[#0D6955]" />
            <span className="font-bold">{venue.distanceFromCurrent}</span>
            <span className="text-[10px] text-[#8A9592] font-normal">from current</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#526360]">
            <Footprints className="h-3 w-3 text-purple-500" />
            <span>{venue.walkingToSyncPoint}</span>
          </div>
        </div>

        {/* Assigned members */}
        <div className="flex items-center justify-between border-t border-[#EDE7DF] pt-2">
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {venue.assignedMembers.map((m) => (
                <img
                  key={m.id}
                  src={m.avatarUrl}
                  alt={m.name}
                  title={m.name}
                  className={`h-6 w-6 rounded-full object-cover ring-2 ring-white ${ringCls}`}
                />
              ))}
            </div>
            <span className="text-[10px] font-bold text-[#526360]">
              {venue.assignedMembers.map(m => m.name).join(', ')}
            </span>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${badge}`}>
            {sideLabel}
          </span>
        </div>
      </div>
    </article>
  );
}

function SyncGatewayCard({ plan }: { plan: SplitPlan }) {
  const { syncPoint, optionA, optionB } = plan;
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A5041] via-[#0D6955] to-[#0F7A65] p-4 text-white shadow-lg">
      {/* Label */}
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/60 mb-3">
        <CheckCircle2 className="h-3.5 w-3.5 text-[#62FAE3]" />
        <span>Re-Sync Gateway · Everyone Reunites Here</span>
      </div>

      {/* Location + time */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="text-base font-black leading-tight">{syncPoint.locationName}</h4>
          <div className="flex items-center gap-1.5 mt-1 text-xs font-medium text-white/80">
            <MapPin className="h-3 w-3 shrink-0 text-[#62FAE3]" />
            <span>{syncPoint.address}</span>
          </div>
        </div>
        <div className="shrink-0 rounded-xl bg-white/15 border border-white/20 px-3 py-1.5 text-center">
          <div className="text-sm font-black">🤝 {syncPoint.meetingTime}</div>
          <div className="text-[10px] text-white/70 font-semibold">Group reunites</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="flex flex-col items-center gap-1 rounded-xl bg-white/10 px-2 py-2">
          <Timer className="h-4 w-4 text-[#62FAE3]" />
          <span className="text-xs font-black">{syncPoint.bufferMinutes} min</span>
          <span className="text-[9px] font-semibold text-white/60">buffer</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-white/10 px-2 py-2">
          <Users className="h-4 w-4 text-[#62FAE3]" />
          <span className="text-xs font-black">
            {optionA.assignedMembers.length + optionB.assignedMembers.length}
          </span>
          <span className="text-[9px] font-semibold text-white/60">reuniting</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-white/10 px-2 py-2">
          <Clock className="h-4 w-4 text-[#62FAE3]" />
          <span className="text-xs font-black">{plan.duration}</span>
          <span className="text-[9px] font-semibold text-white/60">split</span>
        </div>
      </div>

      {/* Landmark tip */}
      <div className="flex items-start gap-2 rounded-xl bg-black/20 px-3 py-2 text-xs font-medium text-white/90">
        <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#62FAE3]" />
        <span>
          <span className="font-black">Landmark tip: </span>
          {syncPoint.landmarkTip}
        </span>
      </div>
    </div>
  );
}

export const AiSplitRoute: React.FC<{ plan: SplitPlan }> = ({ plan }) => {
  return (
    <div className="my-4">
      {/* ── Fork Header ── */}
      <div className="mb-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-2xl bg-[#161C23] px-4 py-2 shadow-lg">
          <Lightbulb className="h-3.5 w-3.5 text-amber-300" />
          <span className="text-[11px] font-black uppercase tracking-wide text-white">
            ⚡ AI Split Route
          </span>
          <span className="text-white/40">·</span>
          <span className="text-[11px] font-bold text-[#62FAE3]">{plan.timeSlot}</span>
          <span className="text-white/40">·</span>
          <span className="text-[11px] font-bold text-white/80">{plan.duration}</span>
        </div>

        {/* Fork connector visual */}
        <div className="relative mt-3 flex justify-center">
          <div className="flex items-center gap-0">
            {/* Left fork arm */}
            <div className="h-px w-20 bg-gradient-to-l from-emerald-400 to-transparent" />
            <div className="h-6 w-6 rounded-full bg-emerald-500 border-2 border-white shadow-md flex items-center justify-center">
              <Shuffle className="h-3 w-3 text-white" />
            </div>
            {/* Right fork arm */}
            <div className="h-px w-20 bg-gradient-to-r from-slate-400 to-transparent" />
          </div>
        </div>
      </div>

      {/* ── Parallel Track Labels ── */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="flex items-center gap-1.5 px-1">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
            Track A · Halal
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <div className="h-2 w-2 rounded-full bg-slate-500" />
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-600">
            Track B · Original
          </span>
        </div>
      </div>

      {/* ── Venue Cards Side-by-Side ── */}
      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Dashed divider (desktop only) */}
        <div className="absolute left-1/2 top-0 bottom-0 hidden -translate-x-1/2 border-l-2 border-dashed border-[#C4BCB3] sm:block" />

        <div className="relative z-10">
          <SplitVenueCard
            venue={plan.optionA}
            accent="green"
            sideLabel="Halal"
            trackLetter="A"
          />
        </div>
        <div className="relative z-10">
          <SplitVenueCard
            venue={plan.optionB}
            accent="slate"
            sideLabel="Original"
            trackLetter="B"
          />
        </div>
      </div>

      {/* ── Converge Arrow ── */}
      <div className="my-3 flex flex-col items-center gap-1 text-[#8A9592]">
        <ArrowDown className="h-5 w-5 animate-bounce" />
        <span className="text-[10px] font-bold uppercase tracking-wide">Groups reconvene</span>
      </div>

      {/* ── Sync Gateway Card ── */}
      <SyncGatewayCard plan={plan} />
    </div>
  );
};
