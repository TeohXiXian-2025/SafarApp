import React, { useState } from 'react';
import {
  Compass,
  X,
  Search,
  Calendar,
  UserPlus,
  Users,
  ChevronDown,
  Sparkles,
  Clock,
  CheckCircle2,
  Plus,
  Share2,
  Check,
  MapPin,
  Heart,
} from 'lucide-react';

interface PlanTripCardProps {
  onStartPlanning: (tripDetails: {
    destination: string;
    startDate: string;
    endDate: string;
    travelGroup: string;
  }) => void;
  onSwitchToInspiration: () => void;
}

export const PlanTripCard: React.FC<PlanTripCardProps> = ({
  onStartPlanning,
  onSwitchToInspiration,
}) => {
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('Oct 14');
  const [endDate, setEndDate] = useState('Oct 22');
  const [travelGroup, setTravelGroup] = useState<'Friends' | 'Family' | 'Couple' | 'Solo'>('Friends');
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [invitedEmails, setInvitedEmails] = useState<string[]>(['tariq@family.org']);

  const trendingDestinations = [
    { name: 'Mecca', emoji: '🕋' },
    { name: 'Kyoto', emoji: '🍁' },
    { name: 'Istanbul', emoji: '🕌' },
  ];

  const handleSelectTrending = (name: string) => {
    setDestination(name);
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInvitedEmails((prev) => [...prev, inviteEmail.trim()]);
    setInviteEmail('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartPlanning({
      destination: destination.trim() || 'Kyoto, Japan',
      startDate,
      endDate,
      travelGroup,
    });
  };

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* Primary Wanderlog-Style Plan Card */}
      <div className="w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-neutral-200/80 relative">
        {/* Top Bar inside Card: Capsule Tag & Close Button */}
        <div className="flex items-center justify-between mb-5">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0D6955]/10 text-[#0D6955] text-xs font-extrabold tracking-wider uppercase">
            <Compass className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>SAFAR OS • COPILOT</span>
          </div>

          <button
            type="button"
            onClick={onSwitchToInspiration}
            className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer"
            title="Switch to Inspiration Reel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Heading & Subtitle */}
        <div className="text-center space-y-1.5 mb-6">
          <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
            Plan a new trip
          </h2>
          <p className="text-sm font-medium text-neutral-600">
            Curated for Halal dining, prayer spaces &amp; ease
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Destination Input: "Where to?" */}
          <div className="space-y-2">
            <label
              htmlFor="destination-input"
              className="text-xs font-bold text-neutral-800 flex items-center gap-1.5"
            >
              <MapPin className="w-4 h-4 text-[#0D6955]" />
              <span>Where to?</span>
            </label>

            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-neutral-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </div>
              <input
                id="destination-input"
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g., Mecca, Kyoto, Istanbul"
                className="w-full h-12 pl-10 pr-4 rounded-2xl bg-[#EEF4FE]/70 hover:bg-[#EEF4FE] border border-neutral-200/80 text-sm font-semibold text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0D6955]/30 focus:bg-white transition-all shadow-inner"
              />
            </div>

            {/* Trending Quick Suggestions */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-neutral-500">Trending:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {trendingDestinations.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => handleSelectTrending(item.name)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                      destination === item.name
                        ? 'bg-[#0D6955] text-white border-[#0D6955] shadow-xs'
                        : 'bg-[#EEF4FE] hover:bg-[#E2EDFE] text-neutral-800 border-neutral-200/60'
                    }`}
                  >
                    <span>{item.emoji}</span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dates Row: Split 2-Column Inputs */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label
                htmlFor="start-date"
                className="text-xs font-bold text-neutral-800 flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-[#0D6955]" />
                <span>Start date</span>
              </label>
              <input
                id="start-date"
                type="text"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl bg-[#EEF4FE]/70 hover:bg-[#EEF4FE] border border-neutral-200/80 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#0D6955]/30 focus:bg-white transition-all shadow-inner"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="end-date"
                className="text-xs font-bold text-neutral-800 flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-[#0D6955]" />
                <span>End date</span>
              </label>
              <input
                id="end-date"
                type="text"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl bg-[#EEF4FE]/70 hover:bg-[#EEF4FE] border border-neutral-200/80 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#0D6955]/30 focus:bg-white transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Collaborator Controls: Invite Tripmates & Group Visibility */}
          <div className="rounded-2xl bg-[#EEF4FE]/60 border border-neutral-200/80 p-2 flex items-center justify-between gap-2 mt-2">
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="flex-1 bg-white hover:bg-neutral-50 text-neutral-800 rounded-xl px-3.5 py-2 text-xs font-bold shadow-xs border border-neutral-200 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#0D6955]" />
              <span>+ Invite tripmates</span>
              {invitedEmails.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#0D6955] text-white text-[10px] font-bold flex items-center justify-center">
                  {invitedEmails.length}
                </span>
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowGroupMenu(!showGroupMenu)}
                className="bg-white hover:bg-neutral-50 text-neutral-800 rounded-xl px-3.5 py-2 text-xs font-bold shadow-xs border border-neutral-200 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-[#0D6955]" />
                <span>{travelGroup}</span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
              </button>

              {showGroupMenu && (
                <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-neutral-200 p-1.5 z-20 text-xs font-semibold">
                  {(['Friends', 'Family', 'Couple', 'Solo'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setTravelGroup(option);
                        setShowGroupMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                        travelGroup === option
                          ? 'bg-[#0D6955]/10 text-[#0D6955] font-bold'
                          : 'hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      <span>{option}</span>
                      {travelGroup === option && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Button: Start Planning (Turquoise Green Pill) */}
          <button
            type="submit"
            className="w-full h-14 rounded-full bg-[#0D6955] hover:bg-[#095041] active:scale-[0.99] text-white font-extrabold text-base shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <span>Start planning</span>
            <Compass className="w-5 h-5 text-emerald-200" />
          </button>

          {/* Bottom Switcher: Or paste a reel, TikTok, or video link */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={onSwitchToInspiration}
              className="text-xs md:text-sm font-bold text-neutral-700 hover:text-[#0D6955] transition-colors inline-flex items-center gap-1.5 cursor-pointer py-1 group"
            >
              <Sparkles className="w-4 h-4 text-amber-500 group-hover:rotate-12 transition-transform" />
              <span>Or paste a reel, TikTok, or video link to generate</span>
            </button>
          </div>
        </form>

        {/* Feature Checkmarks below Container */}
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4 pt-4 mt-4 border-t border-neutral-200/80 text-[11px] md:text-xs font-semibold text-neutral-600">
          <div className="flex items-center gap-1 text-neutral-700">
            <Clock className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>Auto-synced prayer times</span>
          </div>
          <div className="flex items-center gap-1 text-neutral-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>100% Halal verified</span>
          </div>
          <div className="flex items-center gap-1 text-neutral-700">
            <Compass className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>Qibla-aligned stays</span>
          </div>
        </div>
      </div>

      {/* Featured Guide Card below Container (Mecca & Medina) */}
      <div className="w-full mt-4 bg-white rounded-3xl p-3.5 sm:p-4 shadow-sm border border-neutral-200/80 flex items-center justify-between gap-3 transition-all hover:shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-neutral-100">
            <img
              src="https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?auto=format&fit=crop&w=300&q=80"
              alt="Mecca Kaaba"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 uppercase tracking-wide">
                Featured
              </span>
              <span className="text-xs font-medium text-neutral-500 truncate">
                Umrah &amp; Cultural Guide
              </span>
            </div>
            <h3 className="font-extrabold text-sm text-neutral-900 truncate">
              Mecca &amp; Medina Spiritual Sp...
            </h3>
            <p className="text-xs text-neutral-500 truncate">
              Walking routes, accessible prayer spaces &amp; dates
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setDestination('Mecca, Saudi Arabia');
            onStartPlanning({
              destination: 'Mecca, Saudi Arabia',
              startDate: 'Oct 14',
              endDate: 'Oct 22',
              travelGroup: 'Family',
            });
          }}
          className="w-10 h-10 rounded-full bg-[#EEF4FE] hover:bg-[#0D6955] text-[#0D6955] hover:text-white flex items-center justify-center transition-colors shrink-0 shadow-xs cursor-pointer"
          title="Plan trip with this guide"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Invite Tripmates Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-neutral-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#0D6955]/10 text-[#0D6955] flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-neutral-900">Invite Tripmates</h4>
                  <p className="text-xs text-neutral-500">Collaborate on this Halal itinerary</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="w-7 h-7 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-2">
              <label htmlFor="invite-email-input" className="text-xs font-bold text-neutral-700">Invite by email</label>
              <div className="flex gap-2">
                <input
                  id="invite-email-input"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="tripmate@email.com"
                  className="flex-1 h-10 px-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0D6955]/30 focus:bg-white"
                />
                <button
                  type="submit"
                  className="px-3.5 h-10 rounded-xl bg-[#0D6955] hover:bg-[#095041] text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Invite
                </button>
              </div>
            </form>

            {invitedEmails.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-neutral-500">Pending Tripmates</span>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {invitedEmails.map((email) => (
                    <div key={email} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-neutral-50 border border-neutral-100">
                      <span className="text-neutral-800 font-medium truncate">{email}</span>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                        Invited
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-neutral-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full h-10 rounded-xl bg-[#EEF4FE] hover:bg-[#E2EDFE] text-[#0D6955] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Invite Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Copy Live Collaboration Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="w-full py-2 text-xs font-bold text-neutral-500 hover:text-neutral-800 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
