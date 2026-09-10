import React, { useState, useEffect } from 'react';
import {
  Itinerary,
  Collaborator,
  ActivityBlock,
} from '../types';
import {
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  ChevronRight,
  Route,
  UtensilsCrossed,
  Layers,
  Users,
  AlertTriangle,
  Check,
  Footprints,
  FileDown,
  Printer,
  Share2,
  Filter,
  Plus,
  Compass,
  ArrowRight,
  ShieldCheck,
  Lock,
  DollarSign,
  Ticket,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { LeftSidebar } from './LeftSidebar';
import { WorkspaceMapPlaceholder } from './WorkspaceMapPlaceholder';
import { SplitSyncBlock } from './SplitSyncBlock';
import { ConflictResolutionModal } from './ConflictResolutionModal';
import { PrintItineraryModal } from './PrintItineraryModal';
import { BudgetTracker } from './BudgetTracker';
import { firestoreSync, ClashRecord } from '../firebase/firestoreService';

interface CanvasScreenProps {
  itinerary: Itinerary;
  currentUser: Collaborator;
  onUpdateItinerary: (updated: Itinerary, actionNote?: string) => void;
  onOpenRefinementModal: (activity: ActivityBlock) => void;
  onOpenAddModal: (dayId: string) => void;
  onOpenVault?: () => void;
  onOpenInspiration?: () => void;
  dateConflictNotice?: boolean;
  onDismissDateConflict?: () => void;
}

export const CanvasScreen: React.FC<CanvasScreenProps> = ({
  itinerary,
  currentUser,
  onUpdateItinerary,
  onOpenRefinementModal,
  onOpenAddModal,
  onOpenVault,
  onOpenInspiration,
  dateConflictNotice = false,
  onDismissDateConflict,
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>('multiplayer');
  const [isConflictModalOpen, setIsConflictModalOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [showBudgetDrawer, setShowBudgetDrawer] = useState<boolean>(false);
  const [selectedDayId, setSelectedDayId] = useState<string>('day-3');
  const [clashData, setClashData] = useState<ClashRecord | null>(null);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'timeline' | 'map'>('timeline');

  // Initialize and subscribe to Firestore realtime updates
  useEffect(() => {
    firestoreSync.initializeTripData(itinerary);

    const unsubscribeClash = firestoreSync.subscribeClash((clash) => {
      setClashData(clash);
      if (clash && clash.status === 'active') {
        // Auto-show toast or notification
      }
    });

    return () => {
      unsubscribeClash();
    };
  }, []);

  const handleSimulateConflict = (track: 'spiritual' | 'secular') => {
    // Record slot collision in Firestore to demonstrate AI Mediator conflict resolution
    const editor = track === 'spiritual' ? 'Amina' : 'John';
    firestoreSync.recordSlotEdit(
      '03:00 PM - 05:00 PM',
      editor,
      track === 'spiritual' ? 'Afternoon Prayer & Reflection' : 'Gion Artisan Walk',
      () => {
        setIsConflictModalOpen(true);
      }
    );
    setIsConflictModalOpen(true);
  };

  const handleCopyShareLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setNotificationToast('Multiplayer collaboration link copied! Open in a second window to test live sync.');
    setTimeout(() => setNotificationToast(null), 3500);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#FAF8F5] overflow-hidden select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* ========================================================================= */}
      {/* 1. TOP WORKSPACE NAVIGATION BAR (Matching Screenshot 1)                   */}
      {/* ========================================================================= */}
      <header className="h-16 bg-white border-b border-[#E7DFD5] px-4 md:px-6 flex items-center justify-between gap-3 shrink-0 z-30">
        {/* Left: Breadcrumbs [Inspiration / Document Vault / Workspace] */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={onOpenInspiration}
            className="text-[#6D7A77] hover:text-[#161C23] transition-colors cursor-pointer"
          >
            Inspiration
          </button>
          <span className="text-[#C4BCB3]">/</span>
          <button
            type="button"
            onClick={onOpenVault}
            className="text-[#6D7A77] hover:text-[#161C23] transition-colors cursor-pointer"
          >
            Document Vault
          </button>
          <span className="text-[#C4BCB3]">/</span>
          <span className="text-[#0D6955] font-extrabold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0D6955]"></span>
            <span>Workspace</span>
          </span>
        </div>

        {/* Right: Live Session, Collaborator Avatars, Conflict Radar, Export, Share */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Live Session Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-bold text-[#0D6955]">
            <span className="w-2 h-2 rounded-full bg-[#0D6955] animate-pulse"></span>
            <span>Live Session</span>
          </div>

          {/* Tripmate Avatars (A, J, T, S) */}
          <div
            className="flex items-center -space-x-2 cursor-pointer"
            title="Amina, John, Tariq, Sarah (4 editing in real time)"
          >
            <span className="w-7 h-7 rounded-full bg-[#0D6955] text-white text-[11px] font-black flex items-center justify-center border-2 border-white shadow-2xs">
              A
            </span>
            <span className="w-7 h-7 rounded-full bg-[#185ADB] text-white text-[11px] font-black flex items-center justify-center border-2 border-white shadow-2xs">
              J
            </span>
            <span className="w-7 h-7 rounded-full bg-[#20A38B] text-white text-[11px] font-black flex items-center justify-center border-2 border-white shadow-2xs">
              T
            </span>
            <span className="w-7 h-7 rounded-full bg-[#EA4C89] text-white text-[11px] font-black flex items-center justify-center border-2 border-white shadow-2xs">
              S
            </span>
          </div>

          {/* Conflict Radar Button with Alert Badge */}
          <button
            type="button"
            onClick={() => setIsConflictModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#FFF8EE] border border-[#E58A2B]/40 hover:bg-[#FFF2DF] text-[#C27803] text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="Click to view AI Conflict Mediator"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#E58A2B]" />
            <span className="hidden md:inline">Conflict Radar</span>
            <span className="w-2 h-2 rounded-full bg-[#E58A2B] animate-ping"></span>
          </button>

          {/* Budget Tracker Toggle Button */}
          <button
            type="button"
            onClick={() => setShowBudgetDrawer(!showBudgetDrawer)}
            className={`hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
              showBudgetDrawer
                ? 'bg-[#0D6955]/10 border-[#0D6955] text-[#0D6955]'
                : 'bg-white border-[#E7DFD5] text-[#526360] hover:bg-gray-50'
            }`}
            title="Toggle Live Budget & Cost Breakdown"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Budget</span>
          </button>

          {/* Export PDF Button */}
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white border border-[#E7DFD5] hover:bg-gray-50 text-[#161C23] text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="Download Clean Print-Ready PDF Itinerary"
          >
            <FileDown className="w-3.5 h-3.5 text-[#0D6955]" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Share Button (Primary Accent) */}
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-2xl bg-[#0D6955] hover:bg-[#095041] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>

          {/* User Profile Avatar */}
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-8 h-8 rounded-full object-cover ring-2 ring-[#0D6955] ml-1"
          />
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN WORKSPACE BODY (Left Sidebar + Split Canvas)                      */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Persistent Vertical Sidebar (Matching Screenshot 1) */}
        <LeftSidebar
          activeTab={activeSidebarTab}
          onSelectTab={(tab) => {
            setActiveSidebarTab(tab);
            if (tab === 'conflict') setIsConflictModalOpen(true);
            if (tab === 'vault' && onOpenVault) onOpenVault();
            if (tab === 'inspiration' && onOpenInspiration) onOpenInspiration();
          }}
          onOpenConflictModal={() => setIsConflictModalOpen(true)}
          onOpenVault={onOpenVault}
          onOpenInspiration={onOpenInspiration}
        />

        {/* Workspace Canvas Container (Split-Screen Map & Drag-and-Drop Timeline) */}
        <main className="flex-1 flex flex-col overflow-hidden p-3 sm:p-5">
          {/* Mobile Tab Switcher */}
          <div className="lg:hidden flex items-center justify-center mb-3">
            <div className="bg-white border border-[#E7DFD5] rounded-full p-1 flex items-center gap-1 shadow-xs text-xs font-bold">
              <button
                type="button"
                onClick={() => setMobileView('timeline')}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  mobileView === 'timeline'
                    ? 'bg-[#0D6955] text-white shadow-xs'
                    : 'text-[#6D7A77] hover:text-[#161C23]'
                }`}
              >
                Timeline
              </button>
              <button
                type="button"
                onClick={() => setMobileView('map')}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  mobileView === 'map'
                    ? 'bg-[#0D6955] text-white shadow-xs'
                    : 'text-[#6D7A77] hover:text-[#161C23]'
                }`}
              >
                Geo-Track Map
              </button>
            </div>
          </div>

          {/* Split-Screen 2-Column Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-hidden">
            {/* ========================================================= */}
            {/* LEFT COLUMN: Map Placeholder (Kyoto Geo-Track)            */}
            {/* ========================================================= */}
            <div
              className={`lg:col-span-5 h-full overflow-hidden ${
                mobileView === 'map' ? 'block' : 'hidden lg:block'
              }`}
            >
              <WorkspaceMapPlaceholder />
            </div>

            {/* ========================================================= */}
            {/* RIGHT COLUMN: Vertical Timeline (Wanderlog-Style Cards)    */}
            {/* ========================================================= */}
            <div
              className={`lg:col-span-7 h-full overflow-y-auto pr-1 sm:pr-3 space-y-4 ${
                mobileView === 'timeline' ? 'block' : 'hidden lg:block'
              }`}
            >
              {/* Timeline Header (Matching Screenshot 1) */}
              <div className="bg-white rounded-3xl border border-[#E7DFD5] p-5 sm:p-6 shadow-xs space-y-3">
                {/* Day Badge & Breadcrumb */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider bg-[#0D6955]/10 text-[#0D6955] px-3 py-1 rounded-full">
                      Day 3 of 7
                    </span>
                    <span className="text-xs font-semibold text-[#8A9592]">
                      Kyoto Historical Basin · Wednesday, Oct 16
                    </span>
                  </div>

                  <span className="text-[11px] font-bold text-[#0D6955] flex items-center gap-1 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D6955]"></span>
                    <span>4 tripmates live</span>
                  </span>
                </div>

                {/* Day Title & Subtitle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-[#161C23] tracking-tight">
                      Heritage, Prayer &amp; Harmony
                    </h2>
                    <p className="text-xs text-[#6D7A77] font-medium mt-0.5">
                      Balancing contemplative spiritual space with collaborative secular highlights
                    </p>
                  </div>

                  {/* Actions: Filters & Add Stop */}
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => setShowBudgetDrawer(!showBudgetDrawer)}
                      className="px-3.5 py-2 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] hover:bg-[#F2ECE4] text-[#161C23] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Filter className="w-3.5 h-3.5 text-[#6D7A77]" />
                      <span>Filters</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenAddModal(selectedDayId)}
                      className="px-4 py-2 rounded-2xl bg-[#0D6955] hover:bg-[#095041] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Stop</span>
                    </button>
                  </div>
                </div>

                {/* Active Tripmates Editing Strip */}
                <div className="pt-2 border-t border-[#E7DFD5]/60 flex items-center justify-between text-xs text-[#6D7A77] flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Active Tripmates:</span>
                    <div className="flex items-center -space-x-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#0D6955] text-white text-[9px] font-bold flex items-center justify-center border border-white">
                        A
                      </span>
                      <span className="w-5 h-5 rounded-full bg-[#185ADB] text-white text-[9px] font-bold flex items-center justify-center border border-white">
                        J
                      </span>
                      <span className="w-5 h-5 rounded-full bg-[#20A38B] text-white text-[9px] font-bold flex items-center justify-center border border-white">
                        T
                      </span>
                      <span className="w-5 h-5 rounded-full bg-[#EA4C89] text-white text-[9px] font-bold flex items-center justify-center border border-white">
                        S
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-[#8A9592]">
                      (Editing together in real time)
                    </span>
                  </div>

                  <span className="text-[11px] font-extrabold text-[#0D6955] bg-[#EAF6F4] px-2.5 py-0.5 rounded-full border border-[#0D6955]/20 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#0D6955]" />
                    <span>⚡ Split &amp; Sync Active</span>
                  </span>
                </div>
              </div>

              {/* Collapsible Budget Tracker Panel */}
              {showBudgetDrawer && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <BudgetTracker
                    itinerary={itinerary}
                    currentDayId={selectedDayId}
                    currentUser={currentUser}
                    onUpdateItinerary={onUpdateItinerary}
                    onOpenAddModal={onOpenAddModal}
                    onOpenPrintModal={() => setIsPrintModalOpen(true)}
                  />
                </div>
              )}

              {/* ========================================================= */}
              {/* TIMELINE ACTIVITIES LIST                                  */}
              {/* ========================================================= */}
              <div className="space-y-4">
                {/* ------------------------------------------------------- */}
                {/* BLOCK 1: Kyoto National Museum & Garden Walk            */}
                {/* ------------------------------------------------------- */}
                <div className="bg-white rounded-3xl border border-[#E7DFD5] p-5 sm:p-6 shadow-xs hover:shadow-md transition-all space-y-3">
                  {/* Top Bar: Time, Duration, Tickets Badge */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-white bg-[#0D6955] px-3 py-1 rounded-full font-mono">
                        09:30 AM – 12:00 PM
                      </span>
                      <span className="text-xs font-semibold text-[#8A9592]">
                        (2h 30m)
                      </span>
                    </div>

                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Ticket className="w-3 h-3 text-emerald-700" />
                      <span>4 Tickets Confirmed · QR Ready</span>
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-[#161C23]">
                      Kyoto National Museum &amp; Garden Walk
                    </h3>
                    <p className="text-xs sm:text-sm text-[#6D7A77] font-medium leading-relaxed mt-1">
                      Exploring the Heian period imperial calligraphy &amp; tranquil stone courtyards before midday prayer.
                    </p>
                  </div>

                  {/* Badges & Attendees */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E7DFD5]/50 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-[#526360]">
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] font-medium">
                        <MapPin className="w-3.5 h-3.5 text-[#0D6955]" />
                        <span>Higashiyama Ward · Step-free path</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#161C23]">Attendees:</span>
                      <div className="flex items-center -space-x-1.5">
                        <span className="w-6 h-6 rounded-full bg-[#0D6955] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          A
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#185ADB] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          J
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#20A38B] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          T
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#EA4C89] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          S
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TRANSIT CONNECTOR: 8 min walk */}
                <div className="flex items-center gap-2 px-6 py-1 text-xs text-[#8A9592] font-semibold">
                  <Footprints className="w-3.5 h-3.5 text-[#0D6955]" />
                  <span>8 min walk (650m) along Takase River Canal</span>
                </div>

                {/* ------------------------------------------------------- */}
                {/* BLOCK 2: SPLIT & SYNC BLOCK (Custom React Component)    */}
                {/* ------------------------------------------------------- */}
                <SplitSyncBlock onSimulateEdit={handleSimulateConflict} />

                {/* TRANSIT CONNECTOR: 6 min walk to East Torii Gate */}
                <div className="flex items-center gap-2 px-6 py-1 text-xs text-[#8A9592] font-semibold">
                  <Footprints className="w-3.5 h-3.5 text-[#0D6955]" />
                  <span>6 min walk to East Torii Gate</span>
                </div>

                {/* ------------------------------------------------------- */}
                {/* BLOCK 3: GROUP SYNC POINT (Botanical Gardens)           */}
                {/* ------------------------------------------------------- */}
                <div className="bg-white rounded-3xl border-2 border-[#0D6955]/30 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all space-y-3 relative overflow-hidden">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider bg-[#0D6955] text-white px-3 py-1 rounded-full flex items-center gap-1">
                        <span>★ Group Sync Point</span>
                      </span>
                      <span className="text-xs font-bold text-[#161C23] font-mono">
                        02:00 PM – 04:30 PM (2h 30m)
                      </span>
                    </div>

                    <span className="text-xs font-extrabold text-[#0D6955] bg-[#EAF6F4] px-2.5 py-0.5 rounded-full border border-[#0D6955]/20 animate-pulse">
                      Rendezvous in 25 mins
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-[#161C23]">
                      Botanical Gardens &amp; Bamboo Pavilion
                    </h3>
                    <p className="text-xs sm:text-sm text-[#6D7A77] font-medium leading-relaxed mt-1">
                      Full group reunites at the East Torii Gate. Afternoon guided stroll through medicinal plants, autumn maple foliage, and shaded teahouse lawns.
                    </p>
                  </div>

                  {/* Badges & Attendees */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E7DFD5]/50 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="px-2.5 py-1 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-[#526360] font-medium">
                        Scenic Photo Spot #4
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-[#526360] font-medium">
                        6 min walk from Mosque &amp; Cafe
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-[#0D6955] font-bold border border-emerald-200">
                        Meet at East Torii Gate
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#161C23]">Attendees:</span>
                      <div className="flex items-center -space-x-1.5">
                        <span className="w-6 h-6 rounded-full bg-[#0D6955] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          A
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#185ADB] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          J
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#20A38B] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          T
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#EA4C89] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          S
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TRANSIT CONNECTOR: 12 min taxi to Gion Quarter */}
                <div className="flex items-center gap-2 px-6 py-1 text-xs text-[#8A9592] font-semibold">
                  <Route className="w-3.5 h-3.5 text-[#0D6955]" />
                  <span>12 min taxi to Gion Quarter</span>
                </div>

                {/* ------------------------------------------------------- */}
                {/* BLOCK 4: Halal Certified Wagyu Dining Experience        */}
                {/* ------------------------------------------------------- */}
                <div className="bg-white rounded-3xl border border-[#E7DFD5] p-5 sm:p-6 shadow-xs hover:shadow-md transition-all space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-white bg-[#0D6955] px-3 py-1 rounded-full font-mono">
                        05:00 PM – 07:00 PM
                      </span>
                      <span className="text-xs font-semibold text-[#8A9592]">
                        (2h)
                      </span>
                    </div>

                    <span className="text-[11px] font-bold text-[#0D6955] bg-[#EAF6F4] border border-[#0D6955]/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <UtensilsCrossed className="w-3 h-3 text-[#0D6955]" />
                      <span>100% Halal Verified · Table #4 Reserved</span>
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-black text-[#161C23]">
                      Halal Wagyu Dining Experience (Gion Quarter)
                    </h3>
                    <p className="text-xs sm:text-sm text-[#6D7A77] font-medium leading-relaxed mt-1">
                      Private tatami room reserved with dedicated halal certified kitchen utensils and prayer room on 2nd floor.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E7DFD5]/50 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-[#526360]">
                      <span className="px-2.5 py-1 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] font-medium">
                        Prayer Room on 2nd Floor
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] font-medium">
                        Pre-booked Halal Menu
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#161C23]">Attendees:</span>
                      <div className="flex items-center -space-x-1.5">
                        <span className="w-6 h-6 rounded-full bg-[#0D6955] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          A
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#185ADB] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          J
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#20A38B] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          T
                        </span>
                        <span className="w-6 h-6 rounded-full bg-[#EA4C89] text-white text-[10px] font-bold flex items-center justify-center border border-white">
                          S
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ========================================================================= */}
      {/* 3. MODALS & POPUPS                                                        */}
      {/* ========================================================================= */}
      {/* AI Mediator Conflict Resolution Modal (Screenshot 2) */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        onVoteSubmitted={(optId) => {
          setNotificationToast('Anonymous vote recorded in Firestore! Live consensus updated.');
          setTimeout(() => setNotificationToast(null), 3000);
        }}
      />

      {/* Clean, Print-Ready PDF Generator Modal */}
      <PrintItineraryModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        itinerary={itinerary}
        currentUser={currentUser}
        initialDayId={selectedDayId}
      />

      {/* Live Toast Notification */}
      {notificationToast && (
        <div className="fixed bottom-6 right-6 bg-[#161C23] text-white px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2 z-50 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-[#62FAE3]" />
          <span>{notificationToast}</span>
        </div>
      )}
    </div>
  );
};
