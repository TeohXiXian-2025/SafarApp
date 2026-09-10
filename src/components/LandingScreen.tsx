import React, { useState } from 'react';
import { TRENDING_COMMUNITY_PLANS } from '../data/mockData';
import {
  Sparkles,
  Compass,
  CheckCircle2,
  Clock,
  ChevronRight,
  Users,
  ShieldCheck,
  Crown,
  Play,
  Clipboard,
  MapPin,
  UtensilsCrossed,
  ArrowRight,
  Bookmark,
  Share2,
  FileCheck,
} from 'lucide-react';

interface LandingScreenProps {
  onStartPlanningLead: () => void;
  onQuickReelGenerate: (url: string) => void;
  onOpenWorkspace: () => void;
  onOpenVault: () => void;
  onSelectCommunityPlan: (planId: string) => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onStartPlanningLead,
  onQuickReelGenerate,
  onOpenWorkspace,
  onOpenVault,
  onSelectCommunityPlan,
}) => {
  const [reelUrl, setReelUrl] = useState('https://instagram.com/reel/C8k9xM2... (Kyoto Halal Guide)');
  const [showReelInput, setShowReelInput] = useState(false);

  const handleReelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reelUrl.trim()) return;
    onQuickReelGenerate(reelUrl.trim());
  };

  return (
    <div className="w-full min-h-screen pt-12 pb-24 px-4 sm:px-6 md:px-8 max-w-6xl mx-auto flex flex-col items-center">
      {/* 1. HERO BADGE */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EEF4FE] border border-[#00685F]/20 text-[#00685F] text-xs font-black tracking-wide shadow-xs mb-6 animate-in fade-in slide-in-from-bottom-2">
        <Sparkles className="w-4 h-4 text-[#008378]" />
        <span>Safar • The Muslim Travel OS · CodeNection 2026</span>
      </div>

      {/* 2. MAIN HERO HEADLINE */}
      <div className="text-center max-w-3xl mx-auto space-y-4 mb-10">
        <h1 className="text-4xl sm:text-6xl font-black text-[#161C23] tracking-tight leading-[1.08]">
          Effortless Halal Travel. <br />
          <span className="text-[#00685F]">Faith-Anchored</span> &amp; AI-Synced.
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-[#6D7A77] font-medium leading-relaxed max-w-2xl mx-auto">
          Built specifically for Muslim travelers and mixed-faith groups. Automatically locks daily prayer times with nearby wudu facilities, pinpoints verified Halal gastronomy, and arbitrates group decisions without anyone sacrificing their trip.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
          {/* Primary CTA: Start as Team Lead */}
          <button
            type="button"
            onClick={onStartPlanningLead}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-[#00685F] hover:bg-[#008378] active:scale-[0.99] text-white font-black text-base shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3 cursor-pointer group"
          >
            <Crown className="w-5 h-5 text-[#62FAE3] group-hover:rotate-12 transition-transform" />
            <span>Plan Trip (as Team Lead 👑)</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Secondary CTA: Quick Reel / TikTok URL */}
          <button
            type="button"
            onClick={() => setShowReelInput(!showReelInput)}
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white hover:bg-[#FAF8F5] border border-[#E7DFD5] text-[#161C23] font-bold text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 text-[#00685F]" />
            <span>Paste TikTok / Reel Link</span>
          </button>
        </div>

        {/* Collapsible Reel Input Drawer */}
        {showReelInput && (
          <div className="w-full max-w-xl mx-auto mt-4 p-4 rounded-2xl bg-white border border-[#E7DFD5] shadow-lg animate-in fade-in slide-in-from-top-2">
            <form onSubmit={handleReelSubmit} className="flex gap-2">
              <input
                type="text"
                value={reelUrl}
                onChange={(e) => setReelUrl(e.target.value)}
                placeholder="Paste Instagram Reel or TikTok link..."
                className="flex-1 h-12 px-4 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23] focus:outline-none focus:bg-white"
              />
              <button
                type="submit"
                className="px-5 h-12 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-black shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#62FAE3]" />
                <span>Extract</span>
              </button>
            </form>
          </div>
        )}

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#E7DFD5] text-xs font-bold text-[#161C23]">
            <Clock className="w-3.5 h-3.5 text-[#00685F]" />
            <span>Dynamic Prayer Anchoring</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#E7DFD5] text-xs font-bold text-[#161C23]">
            <UtensilsCrossed className="w-3.5 h-3.5 text-[#00685F]" />
            <span>3-Tier Halal Dining Radar</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#E7DFD5] text-xs font-bold text-[#161C23]">
            <Users className="w-3.5 h-3.5 text-[#00685F]" />
            <span>Team Lead &amp; Mate Suggestion Engine</span>
          </span>
        </div>
      </div>

      {/* 3. 4 CORE PRODUCT PILLARS (Aligned with Mentor Pitch Deck) */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
        <div className="p-5 rounded-3xl bg-white border border-[#E7DFD5] shadow-xs space-y-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold text-lg">
            🕌
          </div>
          <h3 className="text-sm font-black text-[#161C23]">
            1. Dynamic Prayer Anchors
          </h3>
          <p className="text-xs text-[#6D7A77] leading-relaxed">
            GPS calculates local Dhuhr, Asr &amp; Fajr times. Automatically maps nearest wudu facilities while reserving café pauses for non-Muslim companions.
          </p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-[#E7DFD5] shadow-xs space-y-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold text-lg">
            🍽️
          </div>
          <h3 className="text-sm font-black text-[#161C23]">
            2. Geo-Fenced Halal Radar
          </h3>
          <p className="text-xs text-[#6D7A77] leading-relaxed">
            Transparent 3-tier verification: Certified Halal, Muslim-Owned, or Pork-Free. Live wait times &amp; verified menus on one single map.
          </p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-[#E7DFD5] shadow-xs space-y-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold text-lg">
            👑
          </div>
          <h3 className="text-sm font-black text-[#161C23]">
            3. Lead &amp; Mate Permissions
          </h3>
          <p className="text-xs text-[#6D7A77] leading-relaxed">
            Team Lead holds prior authorization to edit and finalize. Tripmates submit suggestions and social links (TikTok/Reels) to the approval queue.
          </p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-[#E7DFD5] shadow-xs space-y-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center font-bold text-lg">
            🛡️
          </div>
          <h3 className="text-sm font-black text-[#161C23]">
            4. Smart Document Vault
          </h3>
          <p className="text-xs text-[#6D7A77] leading-relaxed">
            Proactively cross-checks passport 6-month validity, flight times, and hotel booking reference numbers (BRN) to catch errors before the airport.
          </p>
        </div>
      </div>

      {/* 4. POPULAR DESTINATIONS SHOWCASE */}
      <div className="w-full space-y-4 mb-14">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-[#161C23]">
              Curated Halal Destinations
            </h2>
            <p className="text-xs text-[#6D7A77]">
              Pre-verified itineraries with locked prayer anchors and Halal food corridors
            </p>
          </div>
          <button
            type="button"
            onClick={onStartPlanningLead}
            className="text-xs font-bold text-[#00685F] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Plan Custom Trip</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              city: 'Kyoto, Japan',
              flag: '🇯🇵',
              subtitle: 'Autumn foliage & Halal Wagyu',
              points: 'Arashiyama, Fushimi Inari, Gion',
              spots: '24 Halal Spots',
            },
            {
              city: 'Makkah & Madinah',
              flag: '🇸🇦',
              subtitle: 'Hajj & Umrah Pilgrimage',
              points: 'Kaaba, Nabawi, Quba Mosque',
              spots: '100% Halal City',
            },
            {
              city: 'Istanbul, Turkey',
              flag: '🇹🇷',
              subtitle: 'Ottoman Heritage & Bosphorus',
              points: 'Hagia Sophia, Blue Mosque, Grand Bazaar',
              spots: '4.2k Community Saves',
            },
            {
              city: 'Kuala Lumpur, Malaysia',
              flag: '🇲🇾',
              subtitle: 'Gastronomy & Modern Hub',
              points: 'KLCC, Masjid Negara, Batu Caves',
              spots: 'Global Halal Capital',
            },
          ].map((item) => (
            <div
              key={item.city}
              className="bg-white rounded-2xl border border-[#E7DFD5] p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{item.flag}</span>
                  <span className="text-[10px] font-extrabold text-[#00685F] bg-[#EEF4FE] px-2 py-0.5 rounded-full">
                    {item.spots}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-[#161C23]">{item.city}</h4>
                  <p className="text-xs text-[#6D7A77] mt-0.5">{item.subtitle}</p>
                </div>
                <div className="text-[11px] text-[#526360] font-medium pt-2 border-t border-[#E7DFD5]/60">
                  <span className="font-bold text-[#161C23]">Key stops:</span> {item.points}
                </div>
              </div>

              <button
                type="button"
                onClick={onStartPlanningLead}
                className="mt-4 w-full py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#00685F] hover:text-white text-xs font-bold text-[#161C23] transition-all cursor-pointer text-center"
              >
                Plan as Team Lead →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 5. QUICK ACTIONS FOOTER BANNER */}
      <div className="w-full bg-[#EEF4FE]/80 border border-[#00685F]/20 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-lg font-black text-[#161C23]">
            Ready to explore Kyoto with your group?
          </h3>
          <p className="text-xs sm:text-sm text-[#6D7A77]">
            View the live workspace with Team Lead authorization, mate suggestion feeds, and real-time conflict auto-split.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenVault}
            className="px-4 py-3 rounded-xl bg-white border border-[#E7DFD5] text-[#161C23] text-xs font-bold hover:bg-[#FAF8F5] transition-colors cursor-pointer"
          >
            Document Vault
          </button>
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="px-6 py-3 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>Open Demo Workspace</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
