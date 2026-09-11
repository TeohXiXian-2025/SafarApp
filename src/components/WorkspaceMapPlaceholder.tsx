import React, { useState } from 'react';
import {
  Compass,
  Layers,
  Crosshair,
  Navigation,
  Sparkles,
  MapPin,
  Footprints,
  Clock,
  Users,
  Bell,
  CheckCircle2,
  CloudSun,
  ShieldCheck,
  Eye,
  Radio,
  Coffee,
  Heart,
  ChevronRight,
} from 'lucide-react';

export const WorkspaceMapPlaceholder: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sync' | 'spiritual' | 'secular'>('sync');
  const [showPingToast, setShowPingToast] = useState(false);
  const [selectedSyncLocation, setSelectedSyncLocation] = useState('East Torii Gate Pavilion');
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const syncOptions = [
    { name: 'East Torii Gate Pavilion', distMuslim: '180m (3m)', distNonMuslim: '210m (4m)', type: 'Scenic Garden' },
    { name: 'Takase Riverside Teahouse', distMuslim: '120m (2m)', distNonMuslim: '280m (5m)', type: 'Covered Cafe (Rain Option)' },
    { name: 'Gion Historic Clock Tower', distMuslim: '320m (6m)', distNonMuslim: '150m (3m)', type: 'Central Landmark' },
  ];

  const handleSendPing = () => {
    setShowPingToast(true);
    setTimeout(() => setShowPingToast(false), 3500);
  };

  return (
    <div className="h-full w-full rounded-3xl bg-[#F4EFE6] border border-[#E7DFD5] relative overflow-hidden flex flex-col justify-between shadow-xs select-none">
      {/* 1. Map Canvas Background Graphic */}
      <svg
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-45"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid-canvas-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#D3C7B6" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-canvas-pattern)" />
        {/* River Canal Representation */}
        <path
          d="M 100 0 Q 170 240 120 480 T 210 820"
          fill="none"
          stroke="#B4DFD9"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M 100 0 Q 170 240 120 480 T 210 820"
          fill="none"
          stroke="#8FCAC2"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Path A (Muslim track to sync) */}
        <path
          d="M 80 280 Q 140 330 180 390"
          fill="none"
          stroke="#00685F"
          strokeWidth="3.5"
          strokeDasharray="6 4"
        />
        {/* Path B (Non-Muslim track to sync) */}
        <path
          d="M 280 290 Q 230 340 180 390"
          fill="none"
          stroke="#D97706"
          strokeWidth="3.5"
          strokeDasharray="6 4"
        />
      </svg>

      {/* 2. Top Status Bar: Live Sync & Weather Pill */}
      <div className="relative z-10 p-3 flex items-center justify-between gap-2 flex-wrap bg-white/80 backdrop-blur-md border-b border-[#E7DFD5]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-black text-[#00685F]">
            <Radio className="w-3.5 h-3.5 text-[#00685F] animate-pulse" />
            <span>Group Sync Map (Live Radar)</span>
          </div>

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#00685F] text-white text-xs font-bold font-mono shadow-xs">
            <Compass className="w-3 h-3 text-[#62FAE3]" />
            <span>Qibla 292° WNW</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900">
            <CloudSun className="w-3 h-3 text-amber-600" />
            <span>22°C Clear</span>
          </div>
        </div>

        {/* Sync Ping Action Button */}
        <button
          type="button"
          onClick={handleSendPing}
          className="px-3 py-1 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
          title="Send immediate rendezvous ping to all party members"
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Send Regroup Ping</span>
        </button>
      </div>

      {/* 3. Interactive Central Map Workspace with Visible Group Sync Pin */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-3 overflow-hidden">
        
        {/* TOP PATH TRACKS: Track 2A (Muslim Mosque) and Track 2B (Non-Muslim Cafe) */}
        <div className="w-full max-w-sm flex items-center justify-between gap-4 mb-2 z-10">
          {/* Node 2A: Mosque Path */}
          <div className="flex-1 bg-white/95 rounded-2xl border-2 border-[#00685F] p-2.5 shadow-md space-y-1 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-[#00685F] bg-[#EEF4FE] px-1.5 py-0.5 rounded">
                🕌 Muslim Path
              </span>
              <span className="w-2 h-2 rounded-full bg-[#00685F] animate-ping"></span>
            </div>
            <div className="text-xs font-black text-[#161C23] truncate">
              Kyoto Islamic Center
            </div>
            <div className="text-[10px] text-[#6D7A77] flex items-center gap-1">
              <span>Amina &amp; Tariq</span>
              <span>·</span>
              <span className="font-bold text-[#00685F]">Dhuhr 12:48 PM</span>
            </div>
            <div className="text-[10px] font-mono font-bold text-[#00685F] pt-1 border-t border-[#E7DFD5]">
              ↓ 180m (3m walk) to Sync
            </div>
          </div>

          {/* Node 2B: Cafe Path */}
          <div className="flex-1 bg-white/95 rounded-2xl border-2 border-[#D97706] p-2.5 shadow-md space-y-1 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                ☕ Secular Path
              </span>
              <span className="w-2 h-2 rounded-full bg-[#D97706] animate-ping"></span>
            </div>
            <div className="text-xs font-black text-[#161C23] truncate">
              % Arabica &amp; Tea House
            </div>
            <div className="text-[10px] text-[#6D7A77] flex items-center gap-1">
              <span>John &amp; Fatima</span>
              <span>·</span>
              <span className="font-bold text-amber-800">Relaxing</span>
            </div>
            <div className="text-[10px] font-mono font-bold text-amber-800 pt-1 border-t border-[#E7DFD5]">
              ↓ 210m (4m walk) to Sync
            </div>
          </div>
        </div>

        {/* ── CENTRAL GROUP SYNC PIN (RENDEZVOUS ANCHOR) ── */}
        <div className="relative z-20 my-auto flex flex-col items-center">
          {/* Animated radar rings around group sync pin */}
          <div className="absolute -inset-6 rounded-full bg-[#00685F]/15 animate-ping pointer-events-none"></div>
          <div className="absolute -inset-10 rounded-full bg-[#00685F]/10 pointer-events-none"></div>

          {/* Group Sync Card */}
          <div className="bg-white rounded-3xl border-3 border-[#00685F] p-4 shadow-2xl space-y-2 text-center max-w-xs transition-all hover:scale-102">
            <div className="flex items-center justify-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#00685F] text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs">
                <Users className="w-3 h-3" />
                <span>★ GROUP SYNC POINT</span>
              </span>
              <span className="text-[10px] font-bold text-[#00685F] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                02:00 PM
              </span>
            </div>

            <div>
              <h3 className="text-sm font-black text-[#161C23]">
                {selectedSyncLocation}
              </h3>
              <p className="text-[11px] text-[#6D7A77] mt-0.5">
                Botanical Gardens rendezvous. Shaded benches, tatami rest pavilion &amp; scenic autumn foliage.
              </p>
            </div>

            {/* Convergence Proximity Pill */}
            <div className="p-2 rounded-xl bg-[#EEF4FE] border border-[#00685F]/20 flex items-center justify-between text-[11px] font-bold">
              <div className="flex items-center gap-1 text-[#00685F]">
                <Clock className="w-3 h-3" />
                <span>Rendezvous in 25m</span>
              </div>
              <div className="text-[#161C23]">
                Max Separation: <span className="text-[#00685F] font-mono">210m</span>
              </div>
            </div>

            {/* Change Sync Anchor Trigger */}
            <button
              type="button"
              onClick={() => setShowLocationPicker(!showLocationPicker)}
              className="w-full py-1 text-[11px] font-bold text-[#00685F] hover:underline flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>Switch Sync Location</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Collapsible Location Picker */}
          {showLocationPicker && (
            <div className="absolute top-full mt-2 w-64 bg-white rounded-2xl border border-[#E7DFD5] shadow-xl p-2 z-30 space-y-1 animate-in fade-in">
              <div className="text-[10px] font-bold uppercase text-[#8A9592] px-2 py-0.5">
                Nearby Safe Rendezvous Points:
              </div>
              {syncOptions.map((opt) => (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => {
                    setSelectedSyncLocation(opt.name);
                    setShowLocationPicker(false);
                  }}
                  className={`w-full text-left p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                    selectedSyncLocation === opt.name
                      ? 'bg-[#00685F] text-white font-bold'
                      : 'hover:bg-[#FAF8F5] text-[#161C23]'
                  }`}
                >
                  <div className="font-bold">{opt.name}</div>
                  <div className="text-[10px] opacity-80">{opt.type}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* BOTTOM: Next Joint Stop */}
        <div className="w-full max-w-xs mt-2 z-10">
          <div className="bg-white/95 rounded-2xl border border-[#E7DFD5] p-2.5 shadow-xs flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#00685F] text-white text-[10px] font-bold flex items-center justify-center">
                4
              </span>
              <div>
                <span className="font-black text-[#161C23] block">Next: Halal Wagyu Panga</span>
                <span className="text-[10px] text-[#6D7A77]">Full group departs together at 04:45 PM</span>
              </div>
            </div>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              Table #4
            </span>
          </div>
        </div>
      </div>

      {/* 4. Bottom Map Footer: Metrics Bar */}
      <div className="relative z-10 p-3 bg-white/95 border-t border-[#E7DFD5] flex items-center justify-between text-xs text-[#6D7A77] flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Footprints className="w-3.5 h-3.5 text-[#00685F]" />
          <span className="font-semibold text-[11px]">
            Split Duration: <strong className="text-[#161C23]">45 mins</strong>
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#00685F]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>No Member Left Isolated · Auto-Sync Confirmed</span>
        </div>
      </div>

      {/* Live Regroup Notification Toast */}
      {showPingToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-[#161C23] text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Bell className="w-4 h-4 text-[#62FAE3] animate-bounce" />
          <span>Regroup Ping Broadcasted! Tripmates received 15-minute alert to meet at {selectedSyncLocation}.</span>
        </div>
      )}
    </div>
  );
};
