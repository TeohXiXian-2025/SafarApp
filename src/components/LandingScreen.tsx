import React, { useState } from 'react';
import { TRENDING_COMMUNITY_PLANS } from '../data/mockData';
import {
  Sparkles,
  Link as LinkIcon,
  Play,
  Clipboard,
  Compass,
  CheckCircle2,
  Clock,
  ChevronRight,
  Users,
  BellRing,
  WifiOff,
  Plane,
  Flame,
  Bookmark,
  Building2,
  UtensilsCrossed,
  Layers,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

interface LandingScreenProps {
  onGenerate: (url: string) => void;
  onSelectCommunityPlan: (planId: string) => void;
  onOpenVault?: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onGenerate,
  onSelectCommunityPlan,
  onOpenVault,
}) => {
  const [urlInput, setUrlInput] = useState('https://instagram.com/reel/C8k9xM2... (Kyoto Halal Guide)');
  const [isPasting, setIsPasting] = useState(false);

  const handleQuickPaste = async () => {
    setIsPasting(true);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length > 0) {
          setUrlInput(text.trim());
        } else {
          setUrlInput('https://www.tiktok.com/@halaltraveler/video/73918237');
        }
      } else {
        setUrlInput('https://www.tiktok.com/@halaltraveler/video/73918237');
      }
    } catch {
      setUrlInput('https://www.tiktok.com/@halaltraveler/video/73918237');
    } finally {
      setTimeout(() => setIsPasting(false), 400);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    onGenerate(urlInput.trim());
  };

  return (
    <div className="w-full min-h-screen pt-20 pb-28 px-4 md:px-8 max-w-5xl mx-auto flex flex-col items-center">
      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EEF4FE] text-[#00685F] text-xs font-bold tracking-wide shadow-xs mb-4 animate-in fade-in slide-in-from-bottom-2">
        <Sparkles className="w-4 h-4 text-[#008378]" />
        <span>AI Travel Copilot for Halal &amp; Umrah</span>
      </div>

      {/* Hero Title & Subheading */}
      <div className="text-center max-w-2xl mx-auto space-y-3 mb-8">
        <h1 className="text-3xl md:text-5xl font-extrabold text-[#161C23] tracking-tight font-['Plus_Jakarta_Sans'] leading-tight">
          Turn Inspiration into Your Itinerary
        </h1>
        <p className="text-sm md:text-base text-[#6D7A77] leading-relaxed max-w-xl mx-auto">
          Paste any Instagram Reel or TikTok travel video. We extract locations, verify 100% Halal dining, and anchor around prayer times.
        </p>
      </div>

      {/* Primary Input Card */}
      <div className="w-full max-w-2xl bg-white rounded-3xl p-5 md:p-7 shadow-lg border border-[#E7DFD5] space-y-5 mb-10 transition-all hover:shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="reel-url"
              className="text-xs font-bold text-[#6D7A77] flex items-center gap-1.5"
            >
              <LinkIcon className="w-4 h-4 text-[#00685F]" />
              <span>Reel or TikTok URL</span>
            </label>

            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-[#6D7A77] pointer-events-none">
                <Play className="w-5 h-5 fill-current text-[#00685F]/60" />
              </div>

              <input
                id="reel-url"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste an IG Reel or TikTok link here..."
                className="w-full h-14 pl-12 pr-24 bg-[#EEF4FE]/80 hover:bg-[#EEF4FE] rounded-2xl text-sm font-medium text-[#161C23] placeholder:text-[#6D7A77] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 focus:bg-white border border-[#E7DFD5]/70 transition-all shadow-inner"
              />

              <button
                type="button"
                onClick={handleQuickPaste}
                className="absolute right-2 px-3.5 py-2 rounded-xl bg-white hover:bg-[#F5F1EA] text-[#161C23] text-xs font-bold transition-all shadow-xs border border-[#E7DFD5] flex items-center gap-1 active:scale-95"
                title="Paste from clipboard"
              >
                <Clipboard className="w-3.5 h-3.5 text-[#00685F]" />
                <span>{isPasting ? 'Pasted!' : 'Paste'}</span>
              </button>
            </div>
          </div>

          {/* Generate Button (Prominent Turquoise Green) */}
          <button
            type="submit"
            className="w-full h-14 rounded-2xl bg-[#00685F] hover:bg-[#008378] active:scale-[0.99] text-white font-bold text-base shadow-md transition-all flex items-center justify-center gap-2.5 group cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-[#62FAE3] group-hover:rotate-12 transition-transform" />
            <span>Generate Itinerary</span>
          </button>
        </form>

        {/* Feature Pill Tags */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 border-t border-[#E7DFD5]/40">
          <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#EEF4FE] text-[#161C23] text-xs font-semibold">
            <Compass className="w-3.5 h-3.5 text-[#00685F]" />
            <span>Extracts places</span>
          </div>
          <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#EEF4FE] text-[#161C23] text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#00685F]" />
            <span>100% Halal dining</span>
          </div>
          <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#EEF4FE] text-[#161C23] text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-[#00685F]" />
            <span>Prayer anchored</span>
          </div>
        </div>
      </div>

      {/* Trending Community Plans Section */}
      <div className="w-full space-y-4 mb-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-[#161C23] flex items-center gap-2">
              <span>Trending Community Plans</span>
              <Flame className="w-5 h-5 text-[#D97706]" />
            </h2>
            <p className="text-xs text-[#6D7A77]">Created from viral creator reels</p>
          </div>
          <span className="text-xs font-bold text-[#00685F] hover:underline flex items-center gap-0.5 cursor-pointer">
            <span>Explore all</span>
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>

        {/* Horizontal scroll cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TRENDING_COMMUNITY_PLANS.map((plan) => (
            <div
              key={plan.id}
              onClick={() => onSelectCommunityPlan(plan.id)}
              className="bg-white rounded-2xl overflow-hidden shadow-xs border border-[#E7DFD5] hover:shadow-md hover:border-[#00685F]/50 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="relative w-full h-40 overflow-hidden bg-gray-100">
                  <img
                    src={plan.image}
                    alt={plan.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-[#00685F] shadow-xs">
                    <CheckCircle2 className="w-3 h-3 text-[#00685F]" />
                    <span>{plan.tag}</span>
                  </div>
                  <div className="absolute bottom-2.5 right-2.5 bg-black/60 backdrop-blur-md text-white px-2 py-0.5 rounded-lg text-[11px] font-semibold">
                    {plan.duration}
                  </div>
                </div>

                <div className="p-3.5 space-y-1.5">
                  <h3 className="font-bold text-sm text-[#161C23] group-hover:text-[#00685F] transition-colors">
                    {plan.title}
                  </h3>
                  <p className="text-xs text-[#6D7A77] line-clamp-2 leading-relaxed">
                    {plan.description}
                  </p>
                </div>
              </div>

              <div className="px-3.5 pb-3.5 pt-1 flex items-center justify-between text-[11px] font-semibold text-[#6D7A77] border-t border-gray-50">
                <span className="flex items-center gap-1 text-[#00685F]">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{plan.stat1}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{plan.saves}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Screen 2.5 Spotlight: Smart Document Vault Banner */}
      {onOpenVault && (
        <div className="w-full bg-gradient-to-r from-[#00685F]/10 via-[#00685F]/5 to-transparent border border-[#00685F]/20 rounded-3xl p-5 md:p-6 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start md:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#00685F] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-[#00685F] text-white">
                  Screen 2.5
                </span>
                <span className="text-xs font-extrabold text-[#00685F]">
                  Smart Document Vault &amp; Verification
                </span>
              </div>
              <h3 className="text-sm md:text-base font-extrabold text-[#161C23]">
                Upload Passports, Flights &amp; Hotels for AI Consistency Checking
              </h3>
              <p className="text-xs text-[#6D7A77] mt-0.5">
                Automatically flags flight vs. hotel checkout discrepancies, validates 6-month passport validity, and cross-checks PNR codes.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenVault}
            className="px-5 py-2.5 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-white font-extrabold text-xs flex items-center gap-2 shadow-sm transition-transform active:scale-95 cursor-pointer shrink-0"
          >
            <span>Open Document Vault</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3 Core Value Pillars Grid */}
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-8">
        <div className="bg-white p-4 rounded-2xl border border-[#E7DFD5] shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#00685F]/10 flex items-center justify-center text-[#00685F] shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-[#161C23]">Family Sync Workspace</h4>
            <p className="text-xs text-[#6D7A77]">Shared group votes, voice notes, real-time live cursors</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E7DFD5] shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#D97706]/10 flex items-center justify-center text-[#D97706] shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-[#161C23]">Salah Auto-Anchor</h4>
            <p className="text-xs text-[#6D7A77]">Auto buffers with nearby musalla &amp; wudu spot verification</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E7DFD5] shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#008378]/10 flex items-center justify-center text-[#008378] shrink-0">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-[#161C23]">Offline Vault &amp; Maps</h4>
            <p className="text-xs text-[#6D7A77]">Zero roaming anxiety with cached tickets and route guides</p>
          </div>
        </div>
      </div>

      {/* Umrah & Travel Notify Callout Banner */}
      <div className="w-full bg-[#EEF4FE] p-4 md:p-5 rounded-2xl border border-[#E7DFD5] flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center text-[#00685F] shrink-0 shadow-xs">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-[#161C23]">Traveling to Makkah or Japan next month?</h4>
            <p className="text-xs text-[#6D7A77]">Get notified for early Rawdah slots and Halal Wagyu reservations.</p>
          </div>
        </div>
        <button
          onClick={() => alert('Notification alert enabled for early Rawdah prayer permits!')}
          className="px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-[#00685F] text-xs font-bold shadow-xs border border-[#E7DFD5] transition-all shrink-0 active:scale-95"
        >
          Notify Me
        </button>
      </div>
    </div>
  );
};
