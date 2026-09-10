import React, { useEffect, useState } from 'react';
import {
  Compass,
  Moon,
  Sparkles,
  Check,
  RefreshCw,
  Clock,
  Navigation,
  Lightbulb,
  X,
  BellRing,
  Play,
  ShieldCheck,
} from 'lucide-react';

interface LoadingScreenProps {
  onComplete: () => void;
  onCancel: () => void;
  onOpenVault?: () => void;
  sourceUrl?: string;
}

const CYCLING_MESSAGES = [
  'Extracting locations from Reel audio & captions...',
  'Checking Halal dining certifications & Zabihah status...',
  'Syncing with prayer times (Japan Islamic Trust method)...',
  'Constructing optimal route around prayer windows...',
  'Synchronizing multiplayer itinerary canvas...',
];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onComplete,
  onCancel,
  onOpenVault,
  sourceUrl,
}) => {
  const [progress, setProgress] = useState(24);
  const [messageIndex, setMessageIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(5);

  useEffect(() => {
    // Cycle text every 2 seconds
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % CYCLING_MESSAGES.length);
    }, 2000);

    // Progress counter
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 98) return 100;
        return prev + 16;
      });
    }, 1000);

    // 5-second countdown timer to trigger canvas
    const countdownInterval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setTimeout(() => {
            onComplete();
          }, 300);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
      clearInterval(countdownInterval);
    };
  }, [onComplete]);

  return (
    <div className="w-full min-h-screen pt-20 pb-20 px-4 md:px-8 max-w-xl mx-auto flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* Top Reel Context Breadcrumb */}
      <div className="w-full bg-[#EEF4FE] rounded-2xl p-3 shadow-xs border border-[#E7DFD5] flex items-center gap-3 mb-6">
        <div className="relative w-12 h-16 rounded-xl overflow-hidden shrink-0 bg-gray-200">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAmK9OdLzOir71jHbO1t6jJ99pWSzM_djX4YMyJ7Htwi1l7afuXJ6L8A_bU4KQcDw-nOmSaraDX8lwPIccibBY03QpaSGWnU_TUYx4g0RcDLO0cv1dYbbaxCGzg7vInI6MbFAEVyySXcvrnAGXtmV5UOWkFNRdZ-_eLUEbvcx0q0LLseCixxyWjmo85lGgSCuBsXMOrbCjjHMjXOo0VBLpAMz3HUIXw0rllujSTSqy527qqHtxgEgHv"
            alt="Reel thumbnail"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-1">
            <Play className="w-3.5 h-3.5 text-white fill-current" />
          </div>
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#00685F]/15 text-[#00685F]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00685F] animate-pulse mr-1"></span>
              Reel Analysis
            </span>
            <span className="text-[#6D7A77] text-[11px] font-semibold truncate">@halalvoyager</span>
          </div>
          <p className="font-bold text-sm text-[#161C23] truncate mt-0.5">
            Kyoto &amp; Tokyo Halal Autumn Reel
          </p>
          <div className="flex items-center gap-1 text-[#6D7A77] text-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#00685F]" />
            <span className="truncate">Extracting itinerary, dining &amp; prayer markers</span>
          </div>
        </div>
      </div>

      {/* Calming AI Compass & Progress Card */}
      <div className="w-full bg-white rounded-3xl p-6 md:p-8 shadow-md border border-[#E7DFD5] flex flex-col items-center text-center relative overflow-hidden mb-6">
        {/* Soft Ambient Background Glows */}
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[#00685F]/5 blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-[#D97706]/10 blur-3xl pointer-events-none"></div>

        {/* Centerpiece Visual: Layered Geometric Compass & Islamic Crescent Pulse */}
        <div className="relative w-44 h-44 flex items-center justify-center my-2">
          {/* Animated soft aura rings */}
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#00685F]/30 animate-spin" style={{ animationDuration: '24s' }}></div>
          <div className="absolute inset-3 rounded-full bg-[#00685F]/5 blur-xs animate-pulse" style={{ animationDuration: '2.5s' }}></div>

          {/* SVG Circular Progress Ring */}
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
            {/* Background ring */}
            <circle
              cx="80"
              cy="80"
              r="62"
              fill="none"
              stroke="#EEF4FE"
              strokeWidth="7"
            />
            {/* Active progress stroke */}
            <circle
              cx="80"
              cy="80"
              r="62"
              fill="none"
              stroke="#00685F"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray="389.5"
              strokeDashoffset={389.5 - (389.5 * progress) / 100}
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Center Floating Emblem: Celestial Compass + Crescent */}
          <div className="absolute flex flex-col items-center justify-center pointer-events-none">
            <div className="relative w-16 h-16 rounded-full bg-[#EEF4FE] flex items-center justify-center shadow-inner border border-[#E7DFD5]">
              <Compass className="w-8 h-8 text-[#00685F] animate-pulse" />
              <Moon className="absolute -top-1 -right-1 w-4 h-4 text-[#D97706] fill-current" />
            </div>

            {/* Numerical percent indicator */}
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xl font-extrabold text-[#00685F] tracking-tight font-['Plus_Jakarta_Sans']">
                {progress}%
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic cycling state text */}
        <div className="mt-2 max-w-sm">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00685F]/10 text-[#00685F] text-xs font-bold mb-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>AI Synthesis In Progress · {secondsRemaining}s</span>
          </div>

          <h3 className="text-base md:text-lg font-bold text-[#161C23] min-h-[52px] flex items-center justify-center transition-all duration-300">
            {CYCLING_MESSAGES[messageIndex]}
          </h3>

          <p className="text-xs text-[#6D7A77] mt-1">
            Correlating Instagram geolocation tags with Japan Muslim Association registry.
          </p>
        </div>
      </div>

      {/* Synthesis Pipeline Checklist */}
      <div className="w-full bg-white rounded-3xl p-5 shadow-xs border border-[#E7DFD5] mb-5 space-y-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-[#E7DFD5]">
          <span className="text-xs font-bold text-[#161C23]">Synthesis Pipeline</span>
          <span className="text-xs text-[#00685F] font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00685F] animate-ping"></span>
            Active Sync
          </span>
        </div>

        {/* Pipeline items */}
        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-[#00685F]/15 text-[#00685F] flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
            <div>
              <p className="font-bold text-[#161C23]">Extracted 6 locations from Reel audio &amp; captions</p>
              <p className="text-[#6D7A77] text-[11px]">Identified speech timestamps and Japanese on-screen text overlays</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-[#00685F]/15 text-[#00685F] flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
            <div>
              <p className="font-bold text-[#161C23]">Identified Fushimi Inari, Gion Mosque, Naritaya</p>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="px-2 py-0.5 rounded-md bg-[#EEF4FE] text-[#6D7A77] text-[10px] font-semibold">
                  Fushimi Inari-taisha
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#EEF4FE] text-[#6D7A77] text-[10px] font-semibold">
                  Kyoto Islamic Ctr
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#EEF4FE] text-[#6D7A77] text-[10px] font-semibold">
                  Halal Wagyu Panga
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[#EEF4FE]/70 p-2.5 rounded-xl border border-[#00685F]/20">
            <div className="w-5 h-5 rounded-full bg-[#00685F] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <RefreshCw className="w-3 h-3 animate-spin" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-bold text-[#00685F]">Verifying Halal certificates &amp; Zabihah status</p>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#00685F] text-white">
                  3 PLACES
                </span>
              </div>
              <p className="text-[#6D7A77] text-[11px] mt-0.5">
                Cross-checking kitchen segregation &amp; Muslim-friendly alcohol-free menu options
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 opacity-60">
            <div className="w-5 h-5 rounded-full bg-gray-100 text-[#6D7A77] flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="w-3 h-3" />
            </div>
            <div>
              <p className="font-semibold text-[#161C23]">Calculating Dhuhr &amp; Asr prayer times for Kyoto</p>
              <p className="text-[#6D7A77] text-[11px]">Japan Islamic Trust calculation method (18° / 17° angle)</p>
            </div>
          </div>

          <div className="flex items-start gap-3 opacity-60">
            <div className="w-5 h-5 rounded-full bg-gray-100 text-[#6D7A77] flex items-center justify-center shrink-0 mt-0.5">
              <Navigation className="w-3 h-3" />
            </div>
            <div>
              <p className="font-semibold text-[#161C23]">Constructing optimal route around prayer windows</p>
              <p className="text-[#6D7A77] text-[11px]">Ensuring rest buffer and prayer room proximity</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mindful Japan Travel Note Banner */}
      <div className="w-full bg-[#F5F1EA] rounded-2xl p-4 border border-[#E7DFD5] flex items-start gap-3 shadow-xs mb-5">
        <div className="w-8 h-8 rounded-full bg-[#D97706]/15 text-[#D97706] flex items-center justify-center shrink-0 mt-0.5">
          <Lightbulb className="w-4 h-4 fill-current" />
        </div>
        <div>
          <h4 className="font-bold text-xs text-[#904D00]">Mindful Japan Travel Note</h4>
          <p className="text-xs text-[#161C23] mt-0.5 leading-relaxed">
            Did you know? Japan has over 150 certified Halal ramen and wagyu restaurants. Safar automatically ensures all scheduled meals have dedicated prayer spaces or musallas within an 8-minute walk.
          </p>
        </div>
      </div>

      {/* Footer Navigation Buttons */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 px-2">
        <button
          onClick={onCancel}
          className="text-xs font-semibold text-[#6D7A77] hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>Cancel generation</span>
        </button>

        <div className="flex items-center gap-2">
          {onOpenVault && (
            <button
              onClick={onOpenVault}
              className="text-xs font-bold text-[#6D7A77] hover:text-[#00685F] hover:bg-[#00685F]/5 transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer border border-[#E7DFD5]"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#00685F]" />
              <span>Verify Docs (2.5)</span>
            </button>
          )}

          <button
            onClick={onComplete}
            className="text-xs font-bold text-[#00685F] hover:bg-[#00685F]/15 transition-all flex items-center gap-1.5 bg-[#00685F]/10 px-4 py-2 rounded-full cursor-pointer shadow-xs active:scale-95"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>Open Canvas Now ({secondsRemaining}s)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
