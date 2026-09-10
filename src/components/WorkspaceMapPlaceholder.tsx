import React from 'react';
import {
  Compass,
  Layers,
  Crosshair,
  Plus,
  Minus,
  CheckCircle2,
  Navigation,
  Sparkles,
  MapPin,
  Footprints,
} from 'lucide-react';

export const WorkspaceMapPlaceholder: React.FC = () => {
  return (
    <div className="h-full w-full rounded-3xl bg-[#F0EBE1] border border-[#E7DFD5] relative overflow-hidden flex flex-col justify-between shadow-xs select-none">
      {/* Map Vector Graphic Background Canvas */}
      <svg
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-40"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid-pattern" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#D8CEBF" strokeWidth="0.75" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        {/* River Canal Representation */}
        <path
          d="M 120 0 Q 180 200 130 450 T 220 800"
          fill="none"
          stroke="#BFE3DE"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M 120 0 Q 180 200 130 450 T 220 800"
          fill="none"
          stroke="#9FD4CC"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>

      {/* Top Map Header Strip */}
      <div className="relative z-10 p-3.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/95 border border-[#E7DFD5] shadow-xs text-xs font-bold text-[#161C23]">
            <span className="w-2 h-3 rounded-full bg-[#0D6955]"></span>
            <span>Kyoto Old District Geo-Track</span>
          </div>

          <div className="px-2 py-0.8 rounded-xl bg-white/90 border border-[#E7DFD5] text-[10px] font-bold text-[#6D7A77]">
            Live Mesh
          </div>

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#0D6955] text-white shadow-xs text-xs font-bold font-mono">
            <Compass className="w-3.5 h-3.5 text-[#62FAE3]" />
            <span>Qibla Direction 292° WNW</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="p-1.5 rounded-xl bg-white/90 border border-[#E7DFD5] text-[#161C23] hover:bg-white shadow-xs transition-colors cursor-pointer"
            title="Layer Settings"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-xl bg-white/90 border border-[#E7DFD5] text-[#161C23] hover:bg-white shadow-xs transition-colors cursor-pointer"
            title="Recenter Map"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Central Interactive Route Visualization */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-4">
        {/* Collaborative scout tooltip */}
        <div className="absolute top-12 left-1/3 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#185ADB] text-white text-[11px] font-bold shadow-md animate-bounce">
          <Navigation className="w-3 h-3 rotate-45" />
          <span>John is scouting route</span>
        </div>

        {/* Route Graph SVG Container */}
        <div className="w-full max-w-xs relative my-auto space-y-4">
          {/* Node 1: Museum Tour */}
          <div className="flex flex-col items-center">
            <div className="px-3 py-1.5 rounded-2xl bg-white border border-[#E7DFD5] shadow-xs text-xs font-bold text-[#161C23] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-100 text-[#161C23] font-bold text-[10px] flex items-center justify-center">
                1
              </span>
              <span>Museum Tour</span>
            </div>
            <div className="h-8 w-0.5 bg-gray-400 border-l border-dashed border-gray-500 my-1 flex items-center justify-center">
              <span className="text-[9px] bg-white px-1 font-bold text-gray-500 rounded">8 min</span>
            </div>
          </div>

          {/* Node 2: Split Corridor (Central Mosque vs Artisan Cafe) */}
          <div className="relative py-2">
            {/* Safety corridor polygon highlight */}
            <div className="absolute inset-0 bg-[#0D6955]/10 rounded-3xl border border-[#0D6955]/30 pointer-events-none"></div>

            <div className="relative z-10 p-3 flex items-center justify-between gap-3">
              {/* Spiritual Node (2A) */}
              <div className="px-2.5 py-1.5 rounded-xl bg-[#0D6955] text-white shadow-xs text-[11px] font-extrabold flex items-center gap-1.5 shrink-0">
                <span className="bg-white/20 px-1 rounded text-[10px]">2A</span>
                <span>Central Mosque</span>
              </div>

              {/* Connecting Walk Metric */}
              <div className="flex flex-col items-center text-center">
                <span className="text-[9px] font-mono font-bold text-[#0D6955] bg-white/90 px-1.5 py-0.5 rounded-md border border-[#0D6955]/20">
                  150m (2m) walk
                </span>
              </div>

              {/* Secular Node (2B) */}
              <div className="px-2.5 py-1.5 rounded-xl bg-[#E58A2B] text-white shadow-xs text-[11px] font-extrabold flex items-center gap-1.5 shrink-0">
                <span className="bg-white/20 px-1 rounded text-[10px]">2B</span>
                <span>Artisan Cafe &amp; Art</span>
              </div>
            </div>
          </div>

          {/* Node 3: Reconvergence at Botanical Garden */}
          <div className="flex flex-col items-center">
            <div className="h-8 w-0.5 bg-gray-400 border-l border-dashed border-gray-500 my-1 flex items-center justify-center">
              <span className="text-[9px] bg-white px-1 font-bold text-gray-500 rounded">6 min walk</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-2xl bg-[#0D6955] text-white shadow-xs text-xs font-bold flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-white text-[#0D6955] font-black text-[10px] flex items-center justify-center">
                3
              </span>
              <span>★ SYNC: Botanical Garden</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Map Status & Zoom Controls */}
      <div className="relative z-10 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          {/* Split Distance Separation Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/95 border border-[#E7DFD5] text-xs font-bold text-[#161C23] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#0D6955]"></span>
            <span>Split Distance Separation</span>
            <span className="text-[#0D6955] font-mono">150m (2-min safety corridor)</span>
          </div>

          {/* Zoom Buttons */}
          <div className="flex items-center gap-1 bg-white/95 border border-[#E7DFD5] rounded-xl p-1 shadow-xs">
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-gray-100 text-[#161C23] transition-colors cursor-pointer"
              title="Zoom in"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-gray-100 text-[#161C23] transition-colors cursor-pointer"
              title="Zoom out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Offline Vector Tiles & Battery Status */}
        <div className="p-2 rounded-xl bg-white/90 border border-[#E7DFD5] flex items-center justify-between text-[11px] text-[#6D7A77] font-medium">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>Offline Kyoto vector tiles cached · Battery-efficient mode</span>
          </div>
          <span className="font-mono text-[10px] font-bold text-[#161C23]">
            SYNC MESH V3.4
          </span>
        </div>
      </div>
    </div>
  );
};
