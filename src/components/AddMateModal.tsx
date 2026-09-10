import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Copy,
  Check,
  Users,
  Shield,
  Crown,
  Heart,
  Sparkles,
  UtensilsCrossed,
  Footprints,
  Clock,
} from 'lucide-react';
import { Collaborator, FaithDietaryTier, TravelPace } from '../types';

interface AddMateModalProps {
  isOpen: boolean;
  onClose: () => void;
  collaborators: Collaborator[];
  onAddMate: (newMate: Collaborator) => void;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
];

const INTEREST_PRESETS = [
  'Halal Street Food',
  'Historical Mosques',
  'Specialty Coffee',
  'Scenic Nature',
  'Photography',
  'Traditional Crafts',
  'Shopping Districts',
  'Anime & Tech',
];

export const AddMateModal: React.FC<AddMateModalProps> = ({
  isOpen,
  onClose,
  collaborators,
  onAddMate,
}) => {
  const [mateName, setMateName] = useState('');
  const [mateRole, setMateRole] = useState('Tripmate (Explorer)');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_PRESETS[0]);
  const [faithDietary, setFaithDietary] = useState<FaithDietaryTier>('strictly_halal');
  const [pace, setPace] = useState<TravelPace>('moderate');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Halal Street Food',
    'Historical Mosques',
  ]);
  const [prayerReminders, setPrayerReminders] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleToggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter((i) => i !== interest));
    } else {
      setSelectedInterests([...selectedInterests, interest]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mateName.trim()) return;

    const newMate: Collaborator = {
      id: `mate-${Date.now()}`,
      name: mateName.trim(),
      role: mateRole.trim() || 'Tripmate',
      avatar: selectedAvatar,
      status: 'active',
      action: 'joined via Team Lead invite',
      isLead: false, // Mate role has suggestion privileges
      preferences: {
        faithDietary,
        pace,
        interests: selectedInterests,
        prayerReminders,
      },
    };

    onAddMate(newMate);
    setMateName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-[#E7DFD5] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E7DFD5] flex items-center justify-between bg-[#FAF8F5]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#161C23]">
                Add Tripmate &amp; Setup Preferences
              </h3>
              <p className="text-xs text-[#6D7A77]">
                Team Lead can register mates with their dietary &amp; travel needs
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-200/60 text-[#6D7A77] hover:text-[#161C23] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Shareable Invite Link Bar */}
          <div className="p-3.5 rounded-2xl bg-[#EEF4FE]/80 border border-[#00685F]/20 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-[#00685F] uppercase tracking-wider block">
                Instant Share Link for Mates
              </span>
              <p className="text-xs font-mono text-[#161C23] truncate">
                {window.location.origin}/join-trip?ref=lead-safargroup
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3.5 py-2 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>

          {/* Form to directly configure mate */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#6D7A77]">
              Or Add Tripmate Directly:
            </h4>

            {/* Name & Role */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1 block">
                  Mate's Name
                </label>
                <input
                  type="text"
                  value={mateName}
                  onChange={(e) => setMateName(e.target.value)}
                  placeholder="e.g. Tariq, John, Fatima"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23] focus:outline-none focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1 block">
                  Role / Description
                </label>
                <input
                  type="text"
                  value={mateRole}
                  onChange={(e) => setMateRole(e.target.value)}
                  placeholder="e.g. Foodie Explorer, Non-Muslim Companion"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23] focus:outline-none focus:bg-white"
                />
              </div>
            </div>

            {/* Avatar Selector */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 block">
                Choose Avatar
              </label>
              <div className="flex items-center gap-2">
                {AVATAR_PRESETS.map((avatarUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAvatar(avatarUrl)}
                    className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                      selectedAvatar === avatarUrl
                        ? 'border-[#00685F] ring-2 ring-[#00685F]/30 scale-105'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={avatarUrl} alt="Preset avatar" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Faith & Dietary Preference */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-[#00685F]" />
                <span>Mate's Dietary / Faith Constraint</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'strictly_halal', label: '🕌 Strictly Halal', sub: 'Certified only' },
                  { id: 'muslim_owned', label: '🍽️ Muslim-Owned', sub: 'Halal meat assured' },
                  { id: 'pork_free', label: '🥢 Pork & Alcohol Free', sub: 'Vegetarian/seafood' },
                  { id: 'non_muslim', label: '🍜 Non-Muslim', sub: 'Local cuisine freely' },
                ].map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setFaithDietary(tier.id as FaithDietaryTier)}
                    className={`p-2 rounded-xl text-left border text-xs transition-all cursor-pointer ${
                      faithDietary === tier.id
                        ? 'bg-[#EEF4FE] border-[#00685F] font-bold text-[#00685F]'
                        : 'bg-[#FAF8F5] border-[#E7DFD5] text-[#161C23] hover:bg-white'
                    }`}
                  >
                    <div className="font-bold">{tier.label}</div>
                    <div className="text-[10px] text-[#6D7A77]">{tier.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Travel Pace */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-[#00685F]" />
                <span>Travel Pace</span>
              </label>
              <div className="flex gap-2">
                {[
                  { id: 'relaxed', label: 'Relaxed (Elderly/Stroller)' },
                  { id: 'moderate', label: 'Balanced' },
                  { id: 'fast', label: 'Active Sightseeing' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPace(item.id as TravelPace)}
                    className={`flex-1 py-2 px-2.5 rounded-xl text-center border text-xs transition-all cursor-pointer ${
                      pace === item.id
                        ? 'bg-[#EEF4FE] border-[#00685F] font-bold text-[#00685F]'
                        : 'bg-[#FAF8F5] border-[#E7DFD5] text-[#161C23] hover:bg-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Travel Interests */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-[#00685F]" />
                <span>Interests &amp; Hobbies</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {INTEREST_PRESETS.map((interest) => {
                  const isSelected = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => handleToggleInterest(interest)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#00685F] text-white border-[#00685F]'
                          : 'bg-[#FAF8F5] text-[#161C23] border-[#E7DFD5] hover:bg-white'
                      }`}
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prayer Reminders */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#00685F]" />
                <span className="text-xs font-bold text-[#161C23]">
                  Include in Prayer Notification Radar
                </span>
              </div>
              <input
                type="checkbox"
                checked={prayerReminders}
                onChange={(e) => setPrayerReminders(e.target.checked)}
                className="w-4 h-4 accent-[#00685F] cursor-pointer"
              />
            </div>

            <button
              type="submit"
              className="w-full h-12 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-black shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Tripmate to Group (Suggestion Role)</span>
            </button>
          </form>

          {/* Current Collaborator Roster */}
          <div className="pt-4 border-t border-[#E7DFD5] space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#6D7A77]">
              Current Group Members ({collaborators.length})
            </h4>
            <div className="space-y-2">
              {collaborators.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5]"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-8 h-8 rounded-full object-cover border"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-[#161C23]">{c.name}</span>
                        {c.isLead ? (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-extrabold text-[10px]">
                            👑 Lead
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-800 font-bold text-[10px]">
                            👤 Mate
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#6D7A77]">{c.role}</span>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-[#00685F] bg-white px-2 py-0.5 rounded border border-[#E7DFD5]">
                    {c.preferences?.faithDietary === 'strictly_halal' && 'Strict Halal'}
                    {c.preferences?.faithDietary === 'muslim_owned' && 'Muslim-Friendly'}
                    {c.preferences?.faithDietary === 'pork_free' && 'Pork-Free'}
                    {c.preferences?.faithDietary === 'non_muslim' && 'Non-Muslim'}
                    {!c.preferences?.faithDietary && 'Configured'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
