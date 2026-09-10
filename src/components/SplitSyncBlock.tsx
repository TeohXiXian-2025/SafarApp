import React from 'react';
import {
  Compass,
  CheckCircle2,
  Clock,
  Sparkles,
  Info,
  GitFork,
  ArrowDown,
  Users,
  Coffee,
  Building,
  Check,
} from 'lucide-react';

interface SplitSyncBlockProps {
  onSimulateEdit?: (track: 'spiritual' | 'secular') => void;
}

export const SplitSyncBlock: React.FC<SplitSyncBlockProps> = ({ onSimulateEdit }) => {
  return (
    <div className="relative my-6 animate-in fade-in duration-300">
      {/* Split & Sync Container */}
      <div className="rounded-3xl bg-white border border-[#E7DFD5] p-5 sm:p-6 shadow-xs space-y-4">
        {/* Top Header Ribbon */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E7DFD5]/60">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 bg-[#0D6955]/10 text-[#0D6955] text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full">
              <GitFork className="w-3.5 h-3.5 text-[#0D6955] rotate-90" />
              <span>Split &amp; Sync Active</span>
            </span>
            <span className="text-xs font-bold text-[#8A9592] bg-[#FAF8F5] border border-[#E7DFD5] px-2.5 py-0.5 rounded-lg">
              Zuhr Window · 12:15 PM – 1:45 PM
            </span>
          </div>

          <button
            type="button"
            className="flex items-center gap-1 text-[11px] font-bold text-[#6D7A77] hover:text-[#0D6955] transition-colors cursor-pointer self-start sm:self-auto"
            title="Parallel itineraries allow faith obligations and leisure activities without leaving anyone behind."
          >
            <Info className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>How it syncs</span>
          </button>
        </div>

        {/* Subtitle Description */}
        <div className="flex items-center justify-between gap-2 text-xs text-[#6D7A77]">
          <p className="font-medium leading-relaxed">
            Parallel itineraries allow faith obligations and leisure activities without leaving anyone behind.
          </p>
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-[#0D6955] px-2.5 py-0.5 rounded-full shrink-0 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0D6955] animate-ping"></span>
            <span>John updated Cafe duration (90 mins)</span>
          </span>
        </div>

        {/* Parallel Split Cards Grid (Side-by-Side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          {/* ========================================================= */}
          {/* 2A: SPIRITUAL TRACK (Light Turquoise Background)          */}
          {/* ========================================================= */}
          <div
            onClick={() => onSimulateEdit?.('spiritual')}
            className="rounded-2xl bg-[#EAF6F4] border border-[#0D6955]/25 p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
          >
            <div className="space-y-3">
              {/* Header Badge & Time */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#0D6955] text-white px-2.5 py-0.8 rounded-md flex items-center gap-1">
                  <span>2A</span>
                  <span>SPIRITUAL TRACK</span>
                </span>
                <span className="text-xs font-bold text-white bg-[#0D6955] px-2.5 py-0.8 rounded-full font-mono">
                  12:30 PM – 1:30 PM
                </span>
              </div>

              {/* Title & Qibla Direction Badge */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-base sm:text-lg font-black text-[#161C23] group-hover:text-[#0D6955] transition-colors">
                    Zuhr Prayer at Central Mosque
                  </h4>
                  <p className="text-xs text-[#526360] font-medium leading-relaxed mt-1">
                    Congregational prayer, quiet contemplation, and cool courtyard resting area.
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-center bg-white/90 border border-[#0D6955]/20 rounded-xl px-2 py-1 text-center shadow-2xs">
                  <Compass className="w-4 h-4 text-[#0D6955]" />
                  <span className="text-[9px] font-black text-[#0D6955] font-mono">292°</span>
                </div>
              </div>

              {/* Badges / Amenities */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold text-[#0D6955]">
                <span className="flex items-center gap-1 bg-white/80 border border-[#0D6955]/20 px-2 py-0.5 rounded-lg">
                  <Check className="w-3 h-3 text-[#0D6955]" />
                  <span>Wudu Verified (Separate)</span>
                </span>
                <span className="flex items-center gap-1 bg-white/80 border border-[#0D6955]/20 px-2 py-0.5 rounded-lg">
                  <Clock className="w-3 h-3 text-[#0D6955]" />
                  <span>Jama'ah Starts 12:45 PM</span>
                </span>
              </div>

              {/* Thumbnail with overlay */}
              <div className="relative rounded-xl overflow-hidden h-28 bg-[#161C23] shadow-2xs">
                <img
                  src="https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=600&q=80"
                  alt="Kyoto Central Mosque Courtyard"
                  className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                <div className="absolute bottom-2.5 left-3 text-white text-[11px] font-bold">
                  Quiet space with air-conditioning
                </div>
              </div>
            </div>

            {/* Attendees Footer */}
            <div className="pt-2 border-t border-[#0D6955]/15 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  <span className="w-6 h-6 rounded-full bg-[#0D6955] text-white text-[10px] font-black flex items-center justify-center border border-white">
                    A
                  </span>
                  <span className="w-6 h-6 rounded-full bg-[#20A38B] text-white text-[10px] font-black flex items-center justify-center border border-white">
                    T
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#161C23]">
                  Amina &amp; Tariq
                </span>
              </div>
              <span className="text-[10px] font-semibold text-[#526360]">
                150m from Cafe
              </span>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 2B: LEISURE & ART TRACK (White Background, Turquoise Border) */}
          {/* ========================================================= */}
          <div
            onClick={() => onSimulateEdit?.('secular')}
            className="rounded-2xl bg-white border-2 border-[#20A38B]/40 p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
          >
            <div className="space-y-3">
              {/* Header Badge & Time */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#E58A2B] text-white px-2.5 py-0.8 rounded-md flex items-center gap-1">
                  <span>2B</span>
                  <span>LEISURE &amp; ART TRACK</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#161C23] bg-gray-100 px-2 py-0.8 rounded-md font-mono">
                    12:30 PM – 1:40 PM
                  </span>
                  <span className="text-[10px] font-extrabold text-[#E58A2B] bg-[#FFF5EB] border border-[#E58A2B]/30 px-1.5 py-0.5 rounded">
                    90 mins
                  </span>
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <h4 className="text-base sm:text-lg font-black text-[#161C23] group-hover:text-[#0D6955] transition-colors">
                  Artisan Cafe &amp; Gallery
                </h4>
                <p className="text-xs text-[#6D7A77] font-medium leading-relaxed mt-1">
                  Specialty Uji matcha tastings, single-origin pour-overs, and local ceramic exhibition.
                </p>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold text-[#161C23]">
                <span className="flex items-center gap-1 bg-[#FAF8F5] border border-[#E7DFD5] px-2 py-0.5 rounded-lg text-[#945511]">
                  <Coffee className="w-3 h-3 text-[#945511]" />
                  <span>Ceremonial Matcha Bar</span>
                </span>
                <span className="flex items-center gap-1 bg-[#FAF8F5] border border-[#E7DFD5] px-2 py-0.5 rounded-lg text-[#526360]">
                  <span>Wi-Fi &amp; Seating reserved</span>
                </span>
              </div>

              {/* Thumbnail with overlay */}
              <div className="relative rounded-xl overflow-hidden h-28 bg-[#161C23] shadow-2xs">
                <img
                  src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80"
                  alt="Artisan Cafe interior in Kyoto"
                  className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                <div className="absolute bottom-2.5 left-3 text-white text-[11px] font-bold">
                  Gallery display upstairs
                </div>
              </div>
            </div>

            {/* Attendees Footer */}
            <div className="pt-2 border-t border-[#E7DFD5] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  <span className="w-6 h-6 rounded-full bg-[#185ADB] text-white text-[10px] font-black flex items-center justify-center border border-white">
                    J
                  </span>
                  <span className="w-6 h-6 rounded-full bg-[#EA4C89] text-white text-[10px] font-black flex items-center justify-center border border-white">
                    S
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#161C23]">
                  John &amp; Sarah
                </span>
              </div>
              <span className="text-[10px] font-semibold text-[#6D7A77]">
                150m from Mosque
              </span>
            </div>
          </div>
        </div>

        {/* Timeline Reconverges Banner */}
        <div className="pt-2 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 bg-[#EAF6F4] border border-[#0D6955]/30 text-[#0D6955] text-xs font-bold px-4 py-1.5 rounded-full shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#0D6955] animate-pulse"></span>
            <span>Timeline Reconverges</span>
          </div>
        </div>
      </div>
    </div>
  );
};
