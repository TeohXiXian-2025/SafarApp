import React, { useState } from 'react';
import {
  Sparkles,
  Link as LinkIcon,
  Play,
  Clipboard,
  Compass,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Building2,
  Bookmark,
  ChevronRight,
  Flame,
  UtensilsCrossed,
  Layers,
  Check,
  Lock,
  MapPin,
  Compass as CompassIcon,
} from 'lucide-react';
import { TRENDING_COMMUNITY_PLANS } from '../data/mockData';

interface PasteInspirationViewProps {
  onGenerate: (url: string) => void;
  onSwitchToPlanTrip: () => void;
  onOpenVault: () => void;
  onOpenWorkspace: () => void;
  onSelectCommunityPlan: (planId: string) => void;
}

export const PasteInspirationView: React.FC<PasteInspirationViewProps> = ({
  onGenerate,
  onSwitchToPlanTrip,
  onOpenVault,
  onOpenWorkspace,
  onSelectCommunityPlan,
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
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* Stateful Navigation Pills / Step Progression (View 2 Mandate) */}
      <div className="w-full flex items-center justify-center mb-8">
        <div className="inline-flex items-center gap-2 sm:gap-3 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full border border-neutral-200/80 shadow-xs text-xs font-semibold">
          {/* Step 1: Inspiration (Active) */}
          <div className="flex items-center gap-1.5 text-[#0D6955] font-extrabold bg-[#0D6955]/10 px-3 py-1 rounded-full">
            <span className="w-4 h-4 rounded-full bg-[#0D6955] text-white text-[10px] font-bold flex items-center justify-center">
              1
            </span>
            <span>Inspiration</span>
          </div>

          <span className="text-neutral-300">→</span>

          {/* Step 2: Document Vault (Badge 2.5) */}
          <button
            type="button"
            onClick={onOpenVault}
            className="flex items-center gap-1.5 text-neutral-600 hover:text-[#0D6955] px-2 py-1 rounded-full transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
            <span>Document Vault</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-[#0D6955]/10 text-[#0D6955]">
              2.5
            </span>
          </button>

          <span className="text-neutral-300">→</span>

          {/* Step 3: Workspace */}
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="flex items-center gap-1.5 text-neutral-600 hover:text-[#0D6955] px-2 py-1 rounded-full transition-colors cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5 text-neutral-500" />
            <span>Workspace</span>
          </button>
        </div>
      </div>

      {/* Header Area: Pill Tag, Main Title, Description */}
      <div className="text-center space-y-3 max-w-2xl mx-auto mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#A2F0D8]/40 text-[#0D6955] text-xs font-extrabold tracking-wide uppercase shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-[#0D6955]" />
          <span>AI Travel Copilot for Halal &amp; Umrah</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-neutral-900 tracking-tight">
          Turn Social Inspiration into Itinerary
        </h1>

        <p className="text-sm md:text-base text-neutral-600 leading-relaxed max-w-xl mx-auto">
          Paste any RedNote (小红书), TikTok, or Instagram Reel travel link. We extract locations, verify 100% Halal dining, check live weather, and anchor around prayer times.
        </p>
      </div>

      {/* Input Form Card with Extracted Video Preview (Matching Image 1) */}
      <div className="w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-7 shadow-xl border border-neutral-200/80 space-y-5 mb-10">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL Input Row with Auto-Detection status */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <label
                htmlFor="reel-input"
                className="text-neutral-800 flex items-center gap-1.5"
              >
                <LinkIcon className="w-4 h-4 text-[#0D6955]" />
                <span>RedNote (小红书), TikTok, or Reel Link</span>
              </label>

              <span className="flex items-center gap-1 text-emerald-700 text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Auto-Detection Ready</span>
              </span>
            </div>

            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-neutral-400 pointer-events-none">
                <Play className="w-4 h-4 fill-current text-[#0D6955]/70" />
              </div>

              <input
                id="reel-input"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste RedNote (xhslink.com/...), TikTok, or IG Reel link..."
                className="w-full h-12 pl-10 pr-24 bg-[#EEF4FE]/70 hover:bg-[#EEF4FE] rounded-2xl text-xs sm:text-sm font-semibold text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0D6955]/30 focus:bg-white border border-neutral-200/80 transition-all shadow-inner"
              />

              <button
                type="button"
                onClick={handleQuickPaste}
                className="absolute right-2 px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-bold transition-all shadow-xs border border-neutral-200 flex items-center gap-1 active:scale-95 cursor-pointer"
                title="Paste from clipboard"
              >
                <Clipboard className="w-3.5 h-3.5 text-[#0D6955]" />
                <span>{isPasting ? 'Pasted!' : 'Paste'}</span>
              </button>
            </div>
          </div>

          {/* Extracted Video Summary Card (Visual Replica of Image 1) */}
          <div className="bg-[#EEF4FE]/70 rounded-2xl p-4 border border-neutral-200/80 space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shrink-0 bg-neutral-100 shadow-xs border border-white">
                <img
                  src="https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80"
                  alt="Kyoto Halal Dining"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-500">
                  <span>📸</span>
                  <span>Extracted from</span>
                  <span className="text-neutral-800 font-extrabold">@halaltraveler_jp</span>
                </div>

                <h3 className="text-sm sm:text-base font-extrabold text-neutral-900 truncate">
                  3 Days in Kyoto: Heritage &amp; Halal Gourmet
                </h3>

                <p className="text-xs text-neutral-600 truncate">
                  Gion District, Halal Ramen Gion Naritaya, Kiyomizu-dera
                </p>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                    <span>Halal Certified</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 flex items-center gap-1">
                    <span>🕌</span>
                    <span>Prayer Space Near</span>
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Stats Chips in Extracted Card */}
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-neutral-200/60 text-center">
              <div className="bg-white/80 rounded-xl py-2 px-1 border border-neutral-200/50">
                <span className="block text-xs sm:text-sm font-extrabold text-neutral-900">5 Spots</span>
                <span className="block text-[10px] font-medium text-neutral-500">Geo-mapped</span>
              </div>
              <div className="bg-white/80 rounded-xl py-2 px-1 border border-neutral-200/50">
                <span className="block text-xs sm:text-sm font-extrabold text-[#0D6955]">3 Meals</span>
                <span className="block text-[10px] font-medium text-neutral-500">Halal Verified</span>
              </div>
              <div className="bg-white/80 rounded-xl py-2 px-1 border border-neutral-200/50">
                <span className="block text-xs sm:text-sm font-extrabold text-neutral-900">Dhuhr-ready</span>
                <span className="block text-[10px] font-medium text-neutral-500">Wudu Facilities</span>
              </div>
            </div>
          </div>

          {/* Action Button: Generate Itinerary (Deep Turquoise Green Pill) */}
          <button
            type="submit"
            className="w-full h-14 rounded-full bg-[#0D6955] hover:bg-[#095041] active:scale-[0.99] text-white font-extrabold text-base shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-emerald-200" />
            <span>✨ Generate Halal Itinerary</span>
          </button>

          {/* Caption & Switcher Link */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5 text-neutral-600">
              <Lock className="w-3.5 h-3.5 text-neutral-400" />
              <span>Zero manual entry needed • Calibrated to local Asr/Maghrib</span>
            </span>

            <button
              type="button"
              onClick={onSwitchToPlanTrip}
              className="font-bold text-[#0D6955] hover:underline cursor-pointer"
            >
              ← Or plan with custom dates &amp; tripmates
            </button>
          </div>
        </form>
      </div>

      {/* The Halal Copilot Advantage Section (Matching Image 1) */}
      <div className="w-full max-w-2xl space-y-3 mb-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-neutral-900">The Halal Copilot Advantage</h2>
          <span className="px-2.5 py-0.5 rounded-full bg-[#0D6955]/10 text-[#0D6955] text-[11px] font-extrabold uppercase tracking-wide">
            AI Powered
          </span>
        </div>

        <div className="space-y-3">
          {/* Card 1: Geo-extraction & Route Sync */}
          <div className="bg-white rounded-2xl p-4.5 border border-neutral-200/80 shadow-xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-neutral-900">Geo-extraction &amp; Route Sync</h4>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                Instantly pinpoints viral Instagram video landmarks and automatically re-orders stops into an ergonomic walking plan.
              </p>
            </div>
          </div>

          {/* Card 2: 100% Halal Verification */}
          <div className="bg-white rounded-2xl p-4.5 border border-neutral-200/80 shadow-xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              <UtensilsCrossed className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-neutral-900">100% Halal Verification</h4>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                Cross-references Muslim-owned kitchens, alcohol-free preparation spaces, and recognized Halal accreditation boards across Japan.
              </p>
            </div>
          </div>

          {/* Card 3: Spiritual Prayer Anchor */}
          <div className="bg-white rounded-2xl p-4.5 border border-neutral-200/80 shadow-xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-neutral-900">Spiritual Prayer Anchor</h4>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                Never miss Salah while sightseeing. Visited neighborhoods are paced around Dhuhr, Asr, and Maghrib with verified nearby wudu rooms.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Discovery: Kyoto Gion (Matching Image 1 bottom card) */}
      <div className="w-full max-w-2xl bg-white rounded-3xl p-4 shadow-sm border border-neutral-200/80 mb-10">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <CompassIcon className="w-4 h-4 text-[#0D6955]" />
            <span className="text-xs font-extrabold text-neutral-900">Featured Discovery: Kyoto Gion</span>
          </div>
          <span className="text-[11px] font-bold text-neutral-500">Live Qibla: 292° WNW</span>
        </div>

        <div className="relative rounded-2xl overflow-hidden h-44 bg-neutral-900">
          <img
            src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80"
            alt="Kyoto Traditional Street"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

          <div className="absolute bottom-3.5 left-3.5 right-3.5 flex items-end justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-800/90 text-white text-[11px] font-bold backdrop-blur-xs mb-1">
                <span>Kyoto Mosque Route</span>
                <span>•</span>
                <span>12 min walk</span>
              </div>
              <h4 className="text-white text-base sm:text-lg font-extrabold">
                Next Prayer: Dhuhr in 1h 24m
              </h4>
            </div>

            <button
              type="button"
              onClick={() => onGenerate('https://instagram.com/reel/KyotoGionHalal')}
              className="px-3.5 py-1.5 rounded-xl bg-white text-[#0D6955] text-xs font-bold shadow-sm hover:bg-neutral-100 transition-all cursor-pointer"
            >
              Explore Gion
            </button>
          </div>
        </div>
      </div>

      {/* Screen 2.5 Spotlight: Smart Document Vault Banner */}
      <div className="w-full max-w-2xl bg-gradient-to-r from-[#0D6955]/10 via-[#0D6955]/5 to-transparent border border-[#0D6955]/20 rounded-3xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#0D6955] text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-[#0D6955] text-white">
                Screen 2.5
              </span>
              <span className="text-xs font-extrabold text-[#0D6955]">
                Smart Document Vault
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-neutral-900">
              Cross-check Passport, Flight &amp; Hotel Dates
            </h4>
            <p className="text-xs text-neutral-600 mt-0.5">
              AI verification flags check-out vs flight discrepancies and ensures 6-month passport validity.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenVault}
          className="px-4 py-2 rounded-xl bg-[#0D6955] hover:bg-[#095041] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer shrink-0"
        >
          <span>Open Vault</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
