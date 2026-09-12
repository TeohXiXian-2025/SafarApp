import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Clock,
  Star,
  MapPin,
  Navigation,
  Timer,
  Landmark,
  Lightbulb,
  Shuffle,
  CheckCircle2,
  ArrowRight,
  Users,
  ChevronDown,
  ChevronUp,
  Footprints,
  Utensils,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import { SplitPlan, SplitVenueDetail, GroupMember } from '../types/itinerary';

interface AiMediatorModalProps {
  plan: SplitPlan;
  onClose: () => void;
  onAccept: () => void;
}

const TAG_COLOR_STYLES: Record<SplitVenueDetail['tagColor'], string> = {
  green: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  gray: 'bg-slate-100 text-slate-600 border border-slate-200',
  amber: 'bg-amber-100 text-amber-800 border border-amber-300',
};

const DIETARY_BADGE: Record<string, { label: string; cls: string }> = {
  Halal:      { label: 'Halal', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
  Vegetarian: { label: 'Veg',   cls: 'bg-lime-100 text-lime-800 border border-lime-300' },
  None:       { label: 'Any',   cls: 'bg-slate-100 text-slate-500 border border-slate-200' },
};

function MemberPill({ member }: { member: GroupMember; key?: React.Key }) {
  const badge = member.dietaryRestriction ? DIETARY_BADGE[member.dietaryRestriction] : DIETARY_BADGE['None'];
  return (
    <div className="flex items-center gap-1.5 bg-white rounded-full px-2.5 py-1 border border-[#E7DFD5] shadow-sm">
      <img
        src={member.avatarUrl}
        alt={member.name}
        className="h-5 w-5 rounded-full object-cover ring-1 ring-white"
      />
      <span className="text-[11px] font-bold text-[#161C23]">{member.name}</span>
      {member.dietaryRestriction && member.dietaryRestriction !== 'None' && (
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${badge.cls}`}>
          {badge.label}
        </span>
      )}
    </div>
  );
}

function VenueCard({
  venue,
  accent,
  trackLabel,
  trackLetter,
}: {
  venue: SplitVenueDetail;
  accent: 'green' | 'slate';
  trackLabel: string;
  trackLetter: 'A' | 'B';
}) {
  const isGreen = accent === 'green';
  const accentBorder  = isGreen ? 'border-emerald-200' : 'border-slate-200';
  const accentTop     = isGreen ? 'from-emerald-600 to-emerald-500' : 'from-slate-700 to-slate-600';
  const accentBadge   = isGreen ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white';
  const accentRing    = isGreen ? 'ring-2 ring-emerald-400 ring-offset-2' : 'ring-2 ring-slate-400 ring-offset-2';

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm ${accentBorder}`}>
      {/* Track pill overlay */}
      <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${accentTop}`} />

      {/* Restaurant hero image */}
      <div className="relative h-36 overflow-hidden bg-[#EDE7DF]">
        <img
          src={venue.imageUrl}
          alt={venue.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />

        {/* Track letter badge */}
        <span className={`absolute left-2.5 top-3 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shadow-md ${accentBadge}`}>
          {trackLetter}
        </span>

        {/* Dietary tag */}
        <span className={`absolute right-2.5 top-3 rounded-full px-2 py-0.5 text-[10px] font-extrabold shadow ${TAG_COLOR_STYLES[venue.tagColor]}`}>
          {venue.tag}
        </span>

        {/* Name & cuisine on image */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5">
          <h5 className="text-sm font-black text-white drop-shadow leading-tight">{venue.name}</h5>
          <span className="text-[10px] font-semibold text-white/80">{venue.cuisineType}</span>
        </div>

        {/* Price tag */}
        <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-white/90 px-1.5 py-0.5 text-[10px] font-black text-[#161C23]">
          {venue.priceRange}
        </span>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Rating row */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5">
            {[1,2,3,4,5].map(i => (
              <Star key={i} className={`h-3 w-3 ${i <= Math.round(venue.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
            ))}
          </div>
          <span className="text-xs font-black text-[#161C23]">{venue.rating.toFixed(1)}</span>
          <span className="text-[10px] font-medium text-[#8A9592]">
            ({venue.reviewsCount >= 1000 ? `${(venue.reviewsCount / 1000).toFixed(1)}k` : venue.reviewsCount} reviews)
          </span>
        </div>

        {/* Address */}
        <div className="flex items-start gap-1.5 text-[11px] font-medium text-[#526360]">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#0D6955]" />
          <span>{venue.address}</span>
        </div>

        {/* Walk logistics */}
        <div className="space-y-1 rounded-xl bg-[#F4F1ED] px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#161C23]">
            <Navigation className="h-3 w-3 text-[#0D6955]" />
            <span className="font-bold">{venue.distanceFromCurrent}</span>
            <span className="text-[#8A9592]">from here</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#161C23]">
            <Footprints className="h-3 w-3 text-purple-500" />
            <span>{venue.walkingToSyncPoint}</span>
            <span className="text-[#8A9592]">to meetup</span>
          </div>
        </div>

        {/* Assigned members */}
        <div className="border-t border-[#EDE7DF] pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wide text-[#8A9592]">
              {trackLabel}
            </span>
            <span className="text-[10px] font-bold text-[#526360]">
              {venue.assignedMembers.length} {venue.assignedMembers.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {venue.assignedMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-1">
                <img
                  src={m.avatarUrl}
                  alt={m.name}
                  title={m.name}
                  className={`h-7 w-7 rounded-full object-cover ${isGreen ? accentRing.replace('ring-2 ring-emerald-400', 'ring-1 ring-emerald-400') : 'ring-1 ring-slate-300'} ring-offset-1`}
                />
              </div>
            ))}
            <div className="flex flex-col justify-center ml-1">
              {venue.assignedMembers.map((m) => (
                <span key={m.id} className="text-[10px] text-[#526360] font-medium leading-tight">{m.name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const AiMediatorModal: React.FC<AiMediatorModalProps> = ({ plan, onClose, onAccept }) => {
  const [altOpen, setAltOpen] = useState(false);
  const { syncPoint, optionA, optionB } = plan;

  // All members who have Halal restriction — shown in conflict diagnosis
  const halalMembers = [...optionA.assignedMembers].filter(m => m.dietaryRestriction === 'Halal');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-[#E7DFD5]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideUp 0.28s cubic-bezier(0.32,0.72,0,1) both' }}
      >
        {/* ─── Header ─── */}
        <div className="shrink-0 bg-gradient-to-br from-[#0A5041] via-[#0D6955] to-[#0F7A65] p-5">
          {/* Drag handle for mobile */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25 sm:hidden" />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* AI orb */}
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 border border-white/20 shadow-inner">
                <Sparkles className="h-6 w-6 text-[#62FAE3]" />
                {/* Pulse ring */}
                <span className="absolute inset-0 rounded-2xl animate-ping bg-[#62FAE3]/20 duration-1000" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-black tracking-tight text-white leading-none">AI Mediator</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#62FAE3]/20 border border-[#62FAE3]/40 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#62FAE3]">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Conflict Resolved
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-medium text-white/65">
                  Win-win split plan detected · Harmony Score: 98%
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ─── Scrollable Body ─── */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Conflict Diagnosis Banner ── */}
          <div className="border-b border-[#E7DFD5] bg-amber-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 border border-amber-200 mt-0.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wide text-amber-700">Dietary Contradiction</span>
                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[9px] font-black text-amber-800">
                    {plan.timeSlot} · {plan.duration}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#526360] leading-relaxed">
                  <span className="font-black text-[#161C23]">{optionB.name}</span> serves pork-based Tonkotsu broth which violates Halal requirements for:
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {halalMembers.map(m => <MemberPill key={m.id} member={m} />)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {/* ── AI Reasoning ── */}
            <div className="rounded-2xl border border-[#E7DFD5] bg-[#FAF8F5] p-4">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#0D6955]" />
                <p className="text-xs font-medium leading-relaxed text-[#526360]">
                  {plan.reason}
                </p>
              </div>
            </div>

            {/* ── The Split ── */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Shuffle className="h-4 w-4 text-[#0D6955]" />
                <span className="text-xs font-black uppercase tracking-wider text-[#161C23]">The Split — Two Parallel Tracks</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <VenueCard venue={optionA} accent="green" trackLabel="Halal Group" trackLetter="A" />
                <VenueCard venue={optionB} accent="slate" trackLabel="Original Group" trackLetter="B" />
              </div>
            </div>

            {/* ── Sync Point Card ── */}
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A5041] via-[#0D6955] to-[#0F7A65] p-4 text-white shadow-lg">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/60 mb-3">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#62FAE3]" />
                <span>Re-Sync Gateway</span>
              </div>

              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-base font-black leading-tight">{syncPoint.locationName}</h4>
                  <div className="flex items-center gap-1.5 mt-1 text-xs font-medium text-white/80">
                    <MapPin className="h-3 w-3 shrink-0 text-[#62FAE3]" />
                    <span>{syncPoint.address}</span>
                  </div>
                </div>
                <span className="shrink-0 rounded-xl bg-white/15 border border-white/20 px-3 py-1.5 text-sm font-black">
                  🤝 {syncPoint.meetingTime}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold">
                  <Timer className="h-3.5 w-3.5 shrink-0 text-[#62FAE3]" />
                  <span>{syncPoint.bufferMinutes} min buffer</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold">
                  <Users className="h-3.5 w-3.5 shrink-0 text-[#62FAE3]" />
                  <span>
                    {optionA.assignedMembers.length + optionB.assignedMembers.length} reuniting
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-start gap-2 rounded-xl bg-black/20 px-3 py-2 text-xs font-medium text-white/90">
                <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#62FAE3]" />
                <span>
                  <span className="font-black">Landmark tip: </span>
                  {syncPoint.landmarkTip}
                </span>
              </div>
            </div>

            {/* ── Alternative Suggestions Accordion ── */}
            {plan.alternativeSuggestions && plan.alternativeSuggestions.length > 0 && (
              <div className="rounded-2xl border border-[#E7DFD5] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAltOpen(o => !o)}
                  className="flex w-full items-center justify-between gap-2 bg-[#FAF8F5] px-4 py-3 text-left cursor-pointer hover:bg-[#F0EBE4] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-black text-[#161C23]">
                      Alternative Compromises ({plan.alternativeSuggestions.length})
                    </span>
                  </div>
                  {altOpen ? (
                    <ChevronUp className="h-4 w-4 text-[#8A9592]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#8A9592]" />
                  )}
                </button>
                {altOpen && (
                  <div className="divide-y divide-[#E7DFD5]">
                    {plan.alternativeSuggestions.map((alt) => (
                      <div key={alt.id} className="bg-white px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700">
                            {plan.alternativeSuggestions!.indexOf(alt) + 1}
                          </span>
                          <div>
                            <h5 className="text-xs font-black text-[#161C23]">{alt.title}</h5>
                            <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-[#526360]">
                              {alt.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Footer CTA ─── */}
        <div className="shrink-0 border-t border-[#E7DFD5] bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-[11px] font-medium text-[#8A9592]">
              <Shield className="h-4 w-4 shrink-0 text-[#0D6955] mt-0.5" />
              <span>AI suggests. You decide. Fully reversible.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-bold text-[#526360] hover:bg-[#F0EBE4] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={onAccept}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0D6955] to-[#0F7A65] px-5 py-2.5 text-sm font-black text-white shadow-md hover:shadow-lg hover:from-[#0A5041] hover:to-[#0D6955] transition-all cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                Accept AI Plan &amp; Split Route
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
};
