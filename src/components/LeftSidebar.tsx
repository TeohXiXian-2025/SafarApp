import React from 'react';
import {
  Users,
  Compass,
  FileText,
  AlertTriangle,
  Clock,
  MapPin,
  Sparkles,
  Share2,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface LeftSidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onOpenConflictModal: () => void;
  onOpenVault?: () => void;
  onOpenInspiration?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenConflictModal,
  onOpenVault,
  onOpenInspiration,
}) => {
  return (
    <aside className="w-64 bg-white border-r border-[#E7DFD5] flex flex-col justify-between shrink-0 select-none h-full p-4 overflow-y-auto hidden md:flex">
      {/* Brand & Workspace Name */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-2xl bg-[#0D6955] text-white flex items-center justify-center font-black text-lg shadow-xs">
            S
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-[#161C23] text-base tracking-tight">
                Safar OS
              </h1>
            </div>
            <span className="text-[11px] font-semibold text-[#6D7A77]">
              Halal Workspace
            </span>
          </div>
        </div>

        {/* Navigation Items List */}
        <nav className="space-y-1.5">
          {/* Multiplayer Hub */}
          <button
            type="button"
            onClick={() => onSelectTab('multiplayer')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'multiplayer'
                ? 'bg-[#0D6955] text-white shadow-xs'
                : 'text-[#526360] hover:bg-[#FAF8F5] hover:text-[#161C23]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Multiplayer Hub</span>
          </button>

          {/* Inspiration */}
          <button
            type="button"
            onClick={() => {
              onSelectTab('inspiration');
              if (onOpenInspiration) onOpenInspiration();
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'inspiration'
                ? 'bg-[#0D6955] text-white shadow-xs'
                : 'text-[#526360] hover:bg-[#FAF8F5] hover:text-[#161C23]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Inspiration</span>
          </button>

          {/* Document Vault */}
          <button
            type="button"
            onClick={() => {
              onSelectTab('vault');
              if (onOpenVault) onOpenVault();
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'vault'
                ? 'bg-[#0D6955] text-white shadow-xs'
                : 'text-[#526360] hover:bg-[#FAF8F5] hover:text-[#161C23]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Document Vault</span>
          </button>

          {/* Conflict Radar with Alert Pill */}
          <button
            type="button"
            onClick={onOpenConflictModal}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'conflict'
                ? 'bg-[#0D6955] text-white shadow-xs'
                : 'text-[#526360] hover:bg-[#FAF8F5] hover:text-[#161C23]'
            }`}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-[#C27803]" />
              <span>Conflict Radar</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-[#E58A2B] animate-pulse"></span>
          </button>

          {/* Prayer & Qibla */}
          <button
            type="button"
            onClick={() => onSelectTab('prayer')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'prayer'
                ? 'bg-[#0D6955] text-white shadow-xs'
                : 'text-[#526360] hover:bg-[#FAF8F5] hover:text-[#161C23]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Prayer &amp; Qibla</span>
          </button>

          {/* Trip Roadmap */}
          <button
            type="button"
            onClick={() => onSelectTab('roadmap')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'roadmap'
                ? 'bg-[#0D6955] text-white shadow-xs'
                : 'text-[#526360] hover:bg-[#FAF8F5] hover:text-[#161C23]'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Trip Roadmap</span>
          </button>
        </nav>
      </div>

      {/* Bottom Salah Sync Card & User Card */}
      <div className="space-y-3 pt-4 border-t border-[#E7DFD5]">
        {/* Salah Sync Status Widget */}
        <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#161C23]">Salah Sync</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wide bg-[#EAF6F4] text-[#0D6955] px-2 py-0.5 rounded-full border border-[#0D6955]/20">
              Active
            </span>
          </div>
          <div className="text-[11px] font-semibold text-[#526360]">
            Next: Asr in 48m · Qibla 128°
          </div>
        </div>

        {/* User Identity Card */}
        <div className="flex items-center gap-2.5 p-2 rounded-2xl hover:bg-[#FAF8F5] transition-colors cursor-pointer">
          <img
            src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&h=120&q=80"
            alt="Tariq Al-Mansoor"
            className="w-9 h-9 rounded-full object-cover border border-white shadow-2xs"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-extrabold text-[#161C23] truncate">
              Tariq Al-Mansoor
            </div>
            <div className="text-[10px] font-semibold text-[#6D7A77]">
              Trip Host
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
