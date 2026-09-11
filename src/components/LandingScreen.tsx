import React, { useState } from 'react';
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
  Radar,
  CloudSun,
  Route,
  BookOpen,
  Radio,
  Footprints,
  Video,
  Layers,
  Heart,
} from 'lucide-react';

interface LandingScreenProps {
  onStartPlanningLead: () => void;
  onQuickReelGenerate: (url: string) => void;
  onOpenWorkspace: () => void;
  onOpenVault: () => void;
  onOpenHalalRadar: () => void;
  onSelectCommunityPlan: (planId: string) => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onStartPlanningLead,
  onQuickReelGenerate,
  onOpenWorkspace,
  onOpenVault,
  onOpenHalalRadar,
  onSelectCommunityPlan,
}) => {
  const [activeConsoleTab, setActiveConsoleTab] = useState<'plan' | 'social'>('plan');
  const [destinationSearch, setDestinationSearch] = useState('Kyoto, Japan');
  const [socialLinkInput, setSocialLinkInput] = useState('https://xhslink.com/a/kyoto_halal_guide');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState<{
    source: 'rednote' | 'tiktok' | 'instagram';
    title: string;
    points: string[];
    halalInfo: string;
    weatherNote: string;
  } | null>(null);

  const handleSimulateExtract = (url: string) => {
    setSocialLinkInput(url);
    setIsExtracting(true);
    setExtractedPreview(null);

    setTimeout(() => {
      setIsExtracting(false);
      if (url.includes('xhs') || url.includes('rednote')) {
        setExtractedPreview({
          source: 'rednote',
          title: '小红书京都3日清真深度游 (RedNote Curated Guide)',
          points: ['Ayam-YA Halal Ramen', 'Arashiyama Bamboo Grove', 'Kiyomizu-dera Sunset', 'Gion Tea Stroll'],
          halalInfo: '100% Halal Verified Kitchens · Dedicated Wudu Spot',
          weatherNote: '☀️ 22°C Clear Autumn · Weather-Optimized Routing Recommended',
        });
      } else if (url.includes('tiktok')) {
        setExtractedPreview({
          source: 'tiktok',
          title: 'Viral Kyoto Halal Wagyu & Shrines (TikTok Guide)',
          points: ['Halal Wagyu Panga Gion', 'Fushimi Inari Torii Gates', 'Kyoto Islamic Center'],
          halalInfo: 'Certified Halal Wagyu (NAHA / JHA)',
          weatherNote: '☀️ Morning walk advised before afternoon drizzle buffer',
        });
      } else {
        setExtractedPreview({
          source: 'instagram',
          title: 'Autumn in Kansai: Cafes & Prayer Spaces (IG Reel)',
          points: ['% Arabica Higashiyama', 'Nishiki Market Skewers', 'Matsubara Musalla'],
          halalInfo: 'Pork-Free & Muslim-Friendly Corridor',
          weatherNote: '🍂 Peak Autumn Foliage season detected',
        });
      }
    }, 500);
  };

  return (
    <div className="w-full min-h-screen pt-8 pb-24 px-4 sm:px-6 md:px-8 max-w-6xl mx-auto flex flex-col items-center">
      {/* 1. TOP BRAND BADGE */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EEF4FE] border border-[#00685F]/20 text-[#00685F] text-xs font-black tracking-wide shadow-xs mb-5 animate-in fade-in slide-in-from-bottom-2">
        <Sparkles className="w-4 h-4 text-[#008378]" />
        <span>SAFAR OS • THE MUSLIM TRAVEL OPERATING SYSTEM</span>
      </div>

      {/* 2. HERO HEADLINE */}
      <div className="text-center max-w-3xl mx-auto space-y-3.5 mb-8">
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-[#161C23] tracking-tight leading-[1.1]">
          Faith-Anchored Trips. <br />
          <span className="text-[#00685F]">Weather-Smart</span> &amp; Group-Synced.
        </h1>
        <p className="text-sm sm:text-base text-[#6D7A77] font-medium leading-relaxed max-w-2xl mx-auto">
          Built for Muslim travelers and mixed-faith groups. Syncs daily prayer times with wudu facilities, organizes verified Halal dining, and clusters routes by distance &amp; weather — <strong>with you in full control, not letting AI dominate.</strong>
        </p>
      </div>

      {/* 3. CENTERPIECE INTERACTIVE PLANNING CONSOLE */}
      <div className="w-full max-w-3xl bg-white rounded-3xl p-5 sm:p-7 shadow-xl border border-[#E7DFD5] space-y-5 mb-14 transition-all">
        {/* Console Mode Switcher Tabs */}
        <div className="flex items-center justify-between border-b border-[#E7DFD5] pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 bg-[#FAF8F5] p-1 rounded-2xl border border-[#E7DFD5]">
            <button
              type="button"
              onClick={() => setActiveConsoleTab('plan')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeConsoleTab === 'plan'
                  ? 'bg-[#00685F] text-white shadow-xs'
                  : 'text-[#6D7A77] hover:text-[#161C23]'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Plan as Team Lead 👑</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveConsoleTab('social');
                if (!extractedPreview) handleSimulateExtract(socialLinkInput);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeConsoleTab === 'social'
                  ? 'bg-[#00685F] text-white shadow-xs'
                  : 'text-[#6D7A77] hover:text-[#161C23]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-red-500" />
              <span>RedNote 📕 / TikTok / IG Link</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#00685F] font-extrabold bg-[#EEF4FE] px-3 py-1 rounded-full border border-[#00685F]/20">
            <CloudSun className="w-3.5 h-3.5" />
            <span>Kyoto Live: 22°C Clear</span>
          </div>
        </div>

        {/* TAB 1: PLAN AS TEAM LEAD (WEATHER & DISTANCE AWARE) */}
        {activeConsoleTab === 'plan' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-[#00685F]" />
                  <span>Where are you traveling?</span>
                </span>
                <span className="text-[11px] text-[#6D7A77] font-semibold">
                  Weather &amp; Walking Distance Optimized
                </span>
              </label>

              <div className="relative">
                <input
                  type="text"
                  value={destinationSearch}
                  onChange={(e) => setDestinationSearch(e.target.value)}
                  placeholder="e.g. Kyoto, Japan or Mecca, Saudi Arabia"
                  className="w-full h-13 pl-4 pr-32 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] text-sm font-bold text-[#161C23] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 focus:bg-white transition-all shadow-inner"
                />

                <button
                  type="button"
                  onClick={onStartPlanningLead}
                  className="absolute right-2 top-2 bottom-2 px-5 rounded-xl bg-[#00685F] hover:bg-[#008378] active:scale-98 text-white font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#62FAE3]" />
                  <span>Plan Route</span>
                </button>
              </div>
            </div>

            {/* Quick Hub Buttons with Live Temperature Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs font-bold text-[#6D7A77]">Trending Hubs:</span>
              {[
                { name: 'Kyoto 🍁', temp: '22°C' },
                { name: 'Makkah 🕋', temp: '34°C' },
                { name: 'Istanbul 🕌', temp: '19°C' },
                { name: 'Kuala Lumpur 🌴', temp: '30°C' },
                { name: 'Tokyo 🗼', temp: '21°C' },
              ].map((hub) => (
                <button
                  key={hub.name}
                  type="button"
                  onClick={() => {
                    setDestinationSearch(hub.name.split(' ')[0]);
                    onStartPlanningLead();
                  }}
                  className="px-2.5 py-1 rounded-xl bg-[#FAF8F5] hover:bg-white border border-[#E7DFD5] text-xs font-bold text-[#161C23] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{hub.name}</span>
                  <span className="text-[10px] text-[#00685F] font-mono font-extrabold bg-[#EEF4FE] px-1 rounded">
                    {hub.temp}
                  </span>
                </button>
              ))}
            </div>

            {/* Human-in-Control Feature Strip */}
            <div className="p-3 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] flex items-center justify-between text-xs text-[#526360] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-[#00685F]" />
                <span className="font-semibold">
                  <strong>User Priority Guarantee:</strong> You define must-visit stops &amp; reorder; AI only organizes weather windows &amp; distances.
                </span>
              </div>
              <button
                type="button"
                onClick={onStartPlanningLead}
                className="text-[#00685F] font-bold hover:underline shrink-0"
              >
                Open Setup Wizard →
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: REDNOTE (小红书), TIKTOK & IG SOCIAL EXTRACTION */}
        {activeConsoleTab === 'social' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="text-base">📕</span>
                  <span>Paste RedNote (小红书), TikTok, or Instagram Link</span>
                </span>
                <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                  RedNote Supported
                </span>
              </label>

              <div className="relative flex gap-2">
                <input
                  type="text"
                  value={socialLinkInput}
                  onChange={(e) => handleSimulateExtract(e.target.value)}
                  placeholder="Paste RedNote link (xhslink.com/...) or TikTok / Reel..."
                  className="flex-1 h-13 px-4 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-medium text-[#161C23] focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => onQuickReelGenerate(socialLinkInput)}
                  className="px-5 h-13 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-xs shadow-md flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                  <span>Build Itinerary</span>
                </button>
              </div>
            </div>

            {/* Quick Test Links */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-[#6D7A77]">Test Sample Notes:</span>
              <button
                type="button"
                onClick={() => handleSimulateExtract('https://xhslink.com/a/kyoto_halal_guide')}
                className="px-2.5 py-1 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 hover:bg-red-100 flex items-center gap-1"
              >
                <span>📕 小红书京都清真打卡</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateExtract('https://tiktok.com/@halaltraveler/kyoto_food_walk')}
                className="px-2.5 py-1 rounded-xl bg-[#EEF4FE] text-xs font-bold text-[#00685F] hover:bg-[#00685F] hover:text-white transition-colors flex items-center gap-1"
              >
                <span>🎵 TikTok Food Guide</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateExtract('https://instagram.com/reel/autumn_kyoto_spots')}
                className="px-2.5 py-1 rounded-xl bg-[#FAF8F5] text-xs font-bold text-[#161C23] border border-[#E7DFD5] hover:bg-white flex items-center gap-1"
              >
                <span>📸 IG Autumn Reel</span>
              </button>
            </div>

            {/* Simulated Live Extraction Preview Card */}
            {isExtracting ? (
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] flex items-center justify-center gap-2 text-xs font-bold text-[#00685F] animate-pulse">
                <Sparkles className="w-4 h-4" />
                <span>Safar AI is reading note captions, locations &amp; Halal credentials...</span>
              </div>
            ) : extractedPreview ? (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-red-50/50 via-white to-emerald-50/50 border border-[#E7DFD5] shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-red-700 flex items-center gap-1">
                    <span>📕</span>
                    <span>{extractedPreview.title}</span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {extractedPreview.halalInfo}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {extractedPreview.points.map((pt) => (
                    <span
                      key={pt}
                      className="px-2.5 py-0.5 rounded-full bg-white border border-[#E7DFD5] text-xs font-bold text-[#161C23]"
                    >
                      📍 {pt}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#E7DFD5] text-[11px] text-[#526360]">
                  <span>{extractedPreview.weatherNote}</span>
                  <button
                    type="button"
                    onClick={() => onQuickReelGenerate(socialLinkInput)}
                    className="font-bold text-[#00685F] hover:underline flex items-center gap-1"
                  >
                    <span>Import to Plan</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 4. THE 4 PILLARS OF SAFAR OS (Directly addressing all 4 user requirements) */}
      <div className="w-full space-y-4 mb-16">
        <div className="text-center max-w-xl mx-auto space-y-1 mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-[#161C23]">
            Engineered for Modern Halal Travel
          </h2>
          <p className="text-xs sm:text-sm text-[#6D7A77]">
            Every feature is designed to protect your faith, optimize routes, and keep groups unified.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pillar 1: Weather & Distance (Requirement 1) */}
          <div className="p-5 rounded-3xl bg-white border border-[#E7DFD5] shadow-xs space-y-3 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xl border border-amber-200/60">
              🌤️
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                Human-in-Control
              </span>
              <h3 className="text-sm font-black text-[#161C23] mt-1.5">
                Weather &amp; Distance Optimizer
              </h3>
            </div>
            <p className="text-xs text-[#6D7A77] leading-relaxed">
              Considers live temperature, rain probability, and transit walking distances. You hold the final say to reorder and lock stops — AI never dominates your choices.
            </p>
          </div>

          {/* Pillar 2: Group Sync at Map (Requirement 2) */}
          <div className="p-5 rounded-3xl bg-white border border-[#E7DFD5] shadow-xs space-y-3 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-[#00685F] flex items-center justify-center font-bold text-xl border border-emerald-200/60">
              🤝
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#00685F] bg-[#EEF4FE] px-2 py-0.5 rounded-full">
                Visual Radar
              </span>
              <h3 className="text-sm font-black text-[#161C23] mt-1.5">
                Interactive Group Sync on Map
              </h3>
            </div>
            <p className="text-xs text-[#6D7A77] leading-relaxed">
              Allows Muslim &amp; Non-Muslim party members to split for prayer or artisan cafes, then reconverge at a synchronized, GPS-monitored rendezvous pin with zero awkward pauses.
            </p>
          </div>

          {/* Pillar 3: RedNote & Social Import (Requirement 3) */}
          <div className="p-5 rounded-3xl bg-white border border-[#E7DFD5] shadow-xs space-y-3 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-xl border border-red-200/60">
              📕
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-red-800 bg-red-100 px-2 py-0.5 rounded-full">
                Multi-Platform
              </span>
              <h3 className="text-sm font-black text-[#161C23] mt-1.5">
                RedNote, TikTok &amp; Reel Import
              </h3>
            </div>
            <p className="text-xs text-[#6D7A77] leading-relaxed">
              Directly import travel guides from RedNote (小红书), TikTok, and Instagram. AI extracts attractions, verifies Halal kitchens, and places them into your itinerary.
            </p>
          </div>

          {/* Pillar 4: Smart Document Vault */}
          <div className="p-5 rounded-3xl bg-white border border-[#E7DFD5] shadow-xs space-y-3 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-2xl bg-[#EEF4FE] text-[#00685F] flex items-center justify-center font-bold text-xl border border-[#00685F]/20">
              🛡️
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#00685F] bg-[#EEF4FE] px-2 py-0.5 rounded-full">
                Zero Airport Chaos
              </span>
              <h3 className="text-sm font-black text-[#161C23] mt-1.5">
                AI Document Cross-Check
              </h3>
            </div>
            <p className="text-xs text-[#6D7A77] leading-relaxed">
              Sweeps group passports, flight bookings, and hotel confirmation codes for expiry issues and accommodation date gaps before departure.
            </p>
          </div>
        </div>
      </div>

      {/* 5. QUICK ACTIONS FOOTER BANNER */}
      <div className="w-full bg-[#EEF4FE]/90 border border-[#00685F]/25 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-lg font-black text-[#161C23]">
            Experience the Live Interactive Canvas
          </h3>
          <p className="text-xs sm:text-sm text-[#6D7A77]">
            Test live group sync pins, weather-adaptive route clustering, and RedNote/TikTok suggestion queues.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenHalalRadar}
            className="px-4 py-3 rounded-xl bg-white border border-[#E7DFD5] text-[#161C23] text-xs font-bold hover:bg-[#FAF8F5] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Radar className="w-3.5 h-3.5 text-emerald-600" />
            Halal Radar
          </button>
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
