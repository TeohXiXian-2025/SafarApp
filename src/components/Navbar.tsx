import React, { useState } from 'react';
import { Collaborator } from '../types';
import {
  Bell,
  Users,
  Check,
  ExternalLink,
  Sparkles,
  UserPlus,
  LogIn,
  ChevronDown,
  ShieldCheck,
  Compass,
  MapPin,
  Hotel,
  Radar,
} from 'lucide-react';

interface NavbarProps {
  currentScreen: 'landing' | 'loading' | 'vault' | 'canvas' | 'setup' | 'generating';
  step?: 'planTrip' | 'pasteInspiration' | 'generating';
  collaborators: Collaborator[];
  currentUser: Collaborator;
  onSelectUser: (user: Collaborator) => void;
  onOpenAuthModal: () => void;
  onNavigateHome: () => void;
  onSelectStep?: (step: 'planTrip' | 'pasteInspiration') => void;
  onOpenVault: () => void;
  onOpenCanvas: () => void;
  onOpenHalalRadar?: () => void;
  recentAction?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScreen,
  step = 'planTrip',
  collaborators,
  currentUser,
  onSelectUser,
  onOpenAuthModal,
  onNavigateHome,
  onSelectStep,
  onOpenVault,
  onOpenCanvas,
  onOpenHalalRadar,
  recentAction,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showInviteToast, setShowInviteToast] = useState(false);

  const handleCopyInvite = () => {
    navigator.clipboard?.writeText(window.location.href);
    setShowInviteToast(true);
    setTimeout(() => setShowInviteToast(false), 3000);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-neutral-200/80 h-16 px-4 md:px-8 transition-all">
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-2">
        {/* Left Brand with Turquoise Icon, "Safar OS", and subtitle "HALAL TRAVEL COPILOT" */}
        <div className="flex items-center gap-4 lg:gap-6">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-2.5 text-left focus:outline-none group cursor-pointer"
            title="Safar OS Home"
          >
            {/* Deep Turquoise Compass Icon */}
            <div className="w-10 h-10 rounded-2xl bg-[#0D6955]/10 flex items-center justify-center text-[#0D6955] group-hover:scale-105 transition-transform shadow-xs">
              <Compass className="w-6 h-6 text-[#0D6955]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-extrabold tracking-tight text-[#0D6955] font-['Plus_Jakarta_Sans']">
                  Safar
                </span>
                <span className="text-[10px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-full bg-[#0D6955]/10 text-[#0D6955]">
                  OS
                </span>
              </div>
              <span className="text-[10px] font-bold text-neutral-500 tracking-wider uppercase leading-none">
                HALAL TRAVEL COPILOT
              </span>
            </div>
          </button>

          {/* Top navigation links: "Home", "Travel guides", "Hotels" */}
          <nav className="hidden lg:flex items-center gap-1 pl-2 border-l border-neutral-200/80 text-xs font-bold text-neutral-600">
            <button
              onClick={() => {
                onNavigateHome();
                if (onSelectStep) onSelectStep('planTrip');
              }}
              className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                currentScreen === 'landing' && step === 'planTrip'
                  ? 'text-[#0D6955] bg-[#0D6955]/10 font-extrabold'
                  : 'hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => {
                onNavigateHome();
                if (onSelectStep) onSelectStep('pasteInspiration');
              }}
              className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                currentScreen === 'landing' && step === 'pasteInspiration'
                  ? 'text-[#0D6955] bg-[#0D6955]/10 font-extrabold'
                  : 'hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              Travel guides
            </button>
            <button
              onClick={() => {
                localStorage.setItem('safar_discovery_active_tab', 'Hotels');
                onOpenCanvas();
              }}
              className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                currentScreen === 'canvas'
                  ? 'hover:text-[#0D6955] hover:bg-[#0D6955]/10'
                  : 'hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              Hotels
            </button>
          </nav>
        </div>

        {/* Center: Stateful Navigation Pills [Inspiration] -> [Document Vault] -> [Workspace] -> [Halal Radar] */}
        <div className="hidden md:flex items-center gap-1 bg-[#EEF4FE] p-1 rounded-full border border-neutral-200/80 text-xs font-semibold">
          <button
            onClick={() => {
              onNavigateHome();
              if (onSelectStep) onSelectStep('pasteInspiration');
            }}
            className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              currentScreen === 'landing'
                ? 'bg-white text-[#0D6955] shadow-xs font-extrabold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>Inspiration</span>
          </button>
          <button
            onClick={onOpenVault}
            className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
              currentScreen === 'vault'
                ? 'bg-white text-[#0D6955] shadow-xs font-extrabold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Document Vault</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-[#0D6955]/15 text-[#0D6955]">
              2.5
            </span>
          </button>
          <button
            onClick={onOpenCanvas}
            className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
              currentScreen === 'canvas'
                ? 'bg-white text-[#0D6955] shadow-xs font-extrabold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Workspace</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#0D6955] animate-pulse"></span>
          </button>
          {onOpenHalalRadar && (
            <button
              onClick={onOpenHalalRadar}
              className="px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer text-neutral-600 hover:text-neutral-900"
              title="Live Halal Radar & Mosques"
            >
              <Radar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Halal Radar</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            </button>
          )}
        </div>

        {/* Right Section: Notification Bell & User Profile Avatar ("Amina") */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors relative cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#0D6955] ring-2 ring-white"></span>
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-3xl shadow-2xl border border-neutral-200 p-4 text-xs z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-2.5 border-b border-neutral-100 mb-3">
                  <span className="font-extrabold text-neutral-900">Live Travel Sync</span>
                  <span className="text-[10px] text-[#0D6955] font-extrabold flex items-center gap-1 bg-[#0D6955]/10 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D6955] animate-ping"></span>
                    Real-time
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="p-2.5 rounded-2xl bg-[#EEF4FE] flex items-start gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-[#0D6955] mt-1 shrink-0"></div>
                    <div>
                      <p className="font-bold text-neutral-900">
                        {recentAction || 'Amina just marked Wagyu Panga table confirmed'}
                      </p>
                      <p className="text-neutral-500 text-[10px] mt-0.5">2 minutes ago</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-amber-50 flex items-start gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-amber-600 mt-1 shrink-0"></div>
                    <div>
                      <p className="font-bold text-neutral-900">Dhuhr Prayer Window Auto-Anchored</p>
                      <p className="text-neutral-500 text-[10px] mt-0.5">Kyoto Islamic Center affiliate verified</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Avatar ("Amina") */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full hover:bg-neutral-100 transition-colors border border-transparent hover:border-neutral-200 cursor-pointer"
            >
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover ring-2 ring-[#0D6955]"
              />
              <div className="hidden sm:flex flex-col text-left leading-tight">
                <span className="text-xs font-extrabold text-neutral-900">
                  {currentUser.name}
                </span>
                <span className="text-[10px] font-semibold text-neutral-500">
                  {currentUser.role}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-3xl shadow-2xl border border-neutral-200 p-3 text-xs z-50">
                <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-100 mb-2">
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-[#0D6955]"
                  />
                  <div>
                    <h4 className="font-extrabold text-neutral-900">{currentUser.name}</h4>
                    <p className="text-neutral-500 text-[11px]">{currentUser.role} • Active</p>
                  </div>
                </div>

                <div className="space-y-1 mb-2">
                  <p className="text-[10px] font-bold uppercase text-neutral-400 px-2 py-1">
                    Switch Family Member
                  </p>
                  {collaborators.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        onSelectUser(user);
                        setShowUserMenu(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors cursor-pointer ${
                        user.id === currentUser.id
                          ? 'bg-[#0D6955]/10 text-[#0D6955] font-bold'
                          : 'hover:bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          referrerPolicy="no-referrer"
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <span>{user.name}</span>
                      </div>
                      {user.id === currentUser.id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-neutral-100 flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenAuthModal();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-[#EEF4FE] hover:bg-[#E2EDFE] text-[#0D6955] font-bold text-center flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Manage Google Auth</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite Toast Notification */}
      {showInviteToast && (
        <div className="fixed top-18 right-6 bg-neutral-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-semibold flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-3">
          <Sparkles className="w-4 h-4 text-emerald-300" />
          <span>Multiplayer link copied! Open in an Incognito tab to test live sync.</span>
        </div>
      )}
    </header>
  );
};
