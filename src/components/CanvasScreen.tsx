import React, { useState, useEffect } from 'react';
import {
  Itinerary,
  Collaborator,
  ActivityBlock,
  TripSuggestion,
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
  Crown,
  UserCheck,
  UserPlus,
  Video,
  Send,
  ThumbsUp,
  X,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  Shield,
  Eye,
} from 'lucide-react';
import { LeftSidebar } from './LeftSidebar';
import { WorkspaceMapPlaceholder } from './WorkspaceMapPlaceholder';
import { SplitSyncBlock } from './SplitSyncBlock';
import { ConflictResolutionModal } from './ConflictResolutionModal';
import { PrintItineraryModal } from './PrintItineraryModal';
import { BudgetTracker } from './BudgetTracker';
import { AddMateModal } from './AddMateModal';
import { SuggestActivityModal } from './SuggestActivityModal';
import { firestoreSync, ClashRecord } from '../firebase/firestoreService';

interface CanvasScreenProps {
  itinerary: Itinerary;
  currentUser: Collaborator;
  collaborators?: Collaborator[];
  onSelectUser?: (user: Collaborator) => void;
  onUpdateItinerary: (updated: Itinerary, actionNote?: string) => void;
  onOpenRefinementModal: (activity: ActivityBlock) => void;
  onOpenAddModal: (dayId: string) => void;
  onOpenVault?: () => void;
  onOpenInspiration?: () => void;
  dateConflictNotice?: boolean;
  onDismissDateConflict?: () => void;
  onAddMate?: (newMate: Collaborator) => void;
}

export const CanvasScreen: React.FC<CanvasScreenProps> = ({
  itinerary,
  currentUser,
  collaborators = [],
  onSelectUser,
  onUpdateItinerary,
  onOpenRefinementModal,
  onOpenAddModal,
  onOpenVault,
  onOpenInspiration,
  dateConflictNotice = false,
  onDismissDateConflict,
  onAddMate,
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>('multiplayer');
  const [isConflictModalOpen, setIsConflictModalOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isAddMateModalOpen, setIsAddMateModalOpen] = useState<boolean>(false);
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState<boolean>(false);
  const [showSuggestionsDrawer, setShowSuggestionsDrawer] = useState<boolean>(false);
  const [showBudgetDrawer, setShowBudgetDrawer] = useState<boolean>(false);
  const [selectedDayId, setSelectedDayId] = useState<string>('day-3');
  const [clashData, setClashData] = useState<ClashRecord | null>(null);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'timeline' | 'map'>('timeline');

  // Check if current active user is Team Lead
  const isTeamLead =
    currentUser.isLead ||
    currentUser.id === itinerary.leadId ||
    currentUser.role.toLowerCase().includes('lead') ||
    currentUser.role.toLowerCase().includes('organizer');

  // Pending and approved suggestions
  const suggestions = itinerary.suggestions || [];
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');

  // Initialize and subscribe to Firestore realtime updates
  useEffect(() => {
    firestoreSync.initializeTripData(itinerary);

    const unsubscribeClash = firestoreSync.subscribeClash((clash) => {
      setClashData(clash);
    });

    return () => {
      unsubscribeClash();
    };
  }, []);

  const handleSimulateConflict = (track: 'spiritual' | 'secular') => {
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
    setNotificationToast('Multiplayer collaboration link copied! Tripmates can view and suggest places.');
    setTimeout(() => setNotificationToast(null), 3500);
  };

  // Team Lead approves suggestion into official itinerary
  const handleApproveSuggestion = (suggestion: TripSuggestion) => {
    if (!isTeamLead) return;

    // Create an official activity block from the suggestion
    const newActivity: ActivityBlock = {
      id: `act-approved-${Date.now()}`,
      dayId: suggestion.suggestedDayId || selectedDayId,
      time: '04:30 PM',
      duration: '1h 15m',
      title: suggestion.title,
      type: suggestion.type,
      location: suggestion.location,
      description: `${suggestion.description} (Suggested by ${suggestion.proposedBy.name} via ${suggestion.sourceUrl ? 'social link' : 'proposal'})`,
      tags: ['Group Approved', suggestion.type, 'Halal Verified'],
      halalBadge: suggestion.halalBadge || '100% Halal Verified',
      votes: {
        count: suggestion.votes + 1,
        voters: [...suggestion.votedBy, currentUser.name],
        userVoted: true,
      },
      collaboratorNote: {
        author: suggestion.proposedBy.name,
        avatar: suggestion.proposedBy.avatar,
        text: `Approved by Team Lead ${currentUser.name}`,
      },
    };

    const updatedSuggestions = suggestions.map((s) =>
      s.id === suggestion.id ? { ...s, status: 'approved' as const } : s
    );

    const updatedItinerary: Itinerary = {
      ...itinerary,
      activityBlocks: [...itinerary.activityBlocks, newActivity],
      suggestions: updatedSuggestions,
    };

    onUpdateItinerary(
      updatedItinerary,
      `Team Lead ${currentUser.name} approved suggestion: "${suggestion.title}" into Day schedule`
    );

    setNotificationToast(`✓ Approved "${suggestion.title}"! Added to official schedule.`);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  // Team Lead declines suggestion
  const handleRejectSuggestion = (suggestionId: string) => {
    if (!isTeamLead) return;

    const updatedSuggestions = suggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: 'rejected' as const } : s
    );

    const updatedItinerary: Itinerary = {
      ...itinerary,
      suggestions: updatedSuggestions,
    };

    onUpdateItinerary(
      updatedItinerary,
      `Team Lead ${currentUser.name} declined suggestion`
    );

    setNotificationToast('Suggestion marked as declined.');
    setTimeout(() => setNotificationToast(null), 2500);
  };

  // Submit suggestion from modal
  const handleAddSuggestion = (newSugData: Omit<TripSuggestion, 'id' | 'votes' | 'votedBy' | 'submittedAt'>) => {
    const newSug: TripSuggestion = {
      ...newSugData,
      id: `sug-${Date.now()}`,
      submittedAt: 'Just now',
      votes: 1,
      votedBy: [currentUser.name],
    };

    const updatedItinerary: Itinerary = {
      ...itinerary,
      suggestions: [newSug, ...suggestions],
    };

    onUpdateItinerary(
      updatedItinerary,
      `Tripmate ${currentUser.name} submitted recommendation: "${newSug.title}" for Team Lead approval`
    );

    setNotificationToast(`Suggestion "${newSug.title}" submitted to Team Lead!`);
    setTimeout(() => setNotificationToast(null), 3500);
    setShowSuggestionsDrawer(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#FAF8F5] overflow-hidden select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* ========================================================================= */}
      {/* 1. TOP WORKSPACE NAVIGATION BAR                                           */}
      {/* ========================================================================= */}
      <header className="h-16 bg-white border-b border-[#E7DFD5] px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0 z-30">
        {/* Left: Breadcrumbs & Quick Role Switcher */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={onOpenInspiration}
            className="text-[#6D7A77] hover:text-[#161C23] transition-colors cursor-pointer hidden sm:inline"
          >
            Inspiration
          </button>
          <span className="text-[#C4BCB3] hidden sm:inline">/</span>
          <button
            type="button"
            onClick={onOpenVault}
            className="text-[#6D7A77] hover:text-[#161C23] transition-colors cursor-pointer hidden sm:inline"
          >
            Document Vault
          </button>
          <span className="text-[#C4BCB3] hidden sm:inline">/</span>
          <span className="text-[#00685F] font-extrabold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00685F]"></span>
            <span>Workspace</span>
          </span>

          {/* Quick Perspective Switcher (Pitch / Demo feature) */}
          <div className="ml-2 pl-2 border-l border-[#E7DFD5] flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase text-[#8A9592] hidden md:inline">
              Role:
            </span>
            <div className="flex items-center bg-[#FAF8F5] border border-[#E7DFD5] rounded-full p-0.5">
              {collaborators.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectUser && onSelectUser(c)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                    c.id === currentUser.id
                      ? c.isLead
                        ? 'bg-[#00685F] text-white shadow-xs'
                        : 'bg-[#161C23] text-white shadow-xs'
                      : 'text-[#6D7A77] hover:text-[#161C23]'
                  }`}
                  title={`Switch view to ${c.name} (${c.role})`}
                >
                  <span>{c.isLead ? '👑' : '👤'}</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Actions (Add Mate, Suggestions, Budget, Export, Share, User Profile) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Active Mode Badge */}
          {isTeamLead ? (
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-extrabold text-amber-900 shadow-2xs">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              <span>Team Lead (Full Authority)</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EEF4FE] border border-[#00685F]/20 text-[11px] font-bold text-[#00685F] shadow-2xs">
              <Users className="w-3.5 h-3.5" />
              <span>Tripmate (Suggestion Role)</span>
            </div>
          )}

          {/* Add Mate Button (For Team Lead) */}
          {isTeamLead && (
            <button
              type="button"
              onClick={() => setIsAddMateModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-2xl bg-[#EEF4FE] hover:bg-[#00685F]/15 border border-[#00685F]/30 text-[#00685F] text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title="Add Tripmate & configure preferences"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Mate</span>
            </button>
          )}

          {/* Suggest Place or Drop Link Button (For Tripmate) */}
          {!isTeamLead && (
            <button
              type="button"
              onClick={() => setIsSuggestModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Suggest attraction or drop TikTok/Reel link"
            >
              <Video className="w-3.5 h-3.5 text-[#62FAE3]" />
              <span>Suggest / Drop Link</span>
            </button>
          )}

          {/* Suggestions Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowSuggestionsDrawer(!showSuggestionsDrawer)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer relative ${
              showSuggestionsDrawer
                ? 'bg-[#00685F] text-white border-[#00685F]'
                : 'bg-white border-[#E7DFD5] text-[#161C23] hover:bg-[#FAF8F5]'
            }`}
            title="View Tripmate recommendations & social media links"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Suggestions</span>
            {pendingSuggestions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-[#dc2626] text-white animate-pulse">
                {pendingSuggestions.length}
              </span>
            )}
          </button>

          {/* Conflict Radar Button */}
          <button
            type="button"
            onClick={() => setIsConflictModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-[#FFF8EE] border border-[#E58A2B]/40 hover:bg-[#FFF2DF] text-[#C27803] text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="Click to view AI Conflict Mediator"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#E58A2B]" />
            <span className="hidden lg:inline">Conflict Radar</span>
          </button>

          {/* Budget Toggle */}
          <button
            type="button"
            onClick={() => setShowBudgetDrawer(!showBudgetDrawer)}
            className={`hidden xl:flex items-center gap-1 px-3 py-1.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
              showBudgetDrawer
                ? 'bg-[#00685F]/10 border-[#00685F] text-[#00685F]'
                : 'bg-white border-[#E7DFD5] text-[#526360] hover:bg-gray-50'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Budget</span>
          </button>

          {/* Export PDF Button */}
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white border border-[#E7DFD5] hover:bg-gray-50 text-[#161C23] text-xs font-bold transition-all cursor-pointer shadow-2xs"
          >
            <FileDown className="w-3.5 h-3.5 text-[#00685F]" />
            <span>Export</span>
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-2xl bg-[#161C23] hover:bg-black text-white text-xs font-bold transition-all cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Active User Avatar */}
          <div className="relative">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className={`w-8 h-8 rounded-full object-cover ring-2 ${
                isTeamLead ? 'ring-amber-500' : 'ring-[#00685F]'
              }`}
            />
            {isTeamLead && (
              <span className="absolute -top-1 -right-1 text-xs" title="Team Lead">
                👑
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN WORKSPACE BODY (Left Sidebar + Split Canvas + Suggestions Drawer)   */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Persistent Vertical Sidebar */}
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

        {/* Workspace Canvas Container */}
        <main className="flex-1 flex flex-col overflow-hidden p-3 sm:p-5">
          {/* Mobile Tab Switcher */}
          <div className="lg:hidden flex items-center justify-center mb-3">
            <div className="bg-white border border-[#E7DFD5] rounded-full p-1 flex items-center gap-1 shadow-xs text-xs font-bold">
              <button
                type="button"
                onClick={() => setMobileView('timeline')}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  mobileView === 'timeline'
                    ? 'bg-[#00685F] text-white shadow-xs'
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
                    ? 'bg-[#00685F] text-white shadow-xs'
                    : 'text-[#6D7A77] hover:text-[#161C23]'
                }`}
              >
                Geo-Track Map
              </button>
            </div>
          </div>

          {/* Split-Screen 2-Column Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-hidden">
            {/* LEFT COLUMN: Map Placeholder */}
            <div
              className={`lg:col-span-5 h-full overflow-hidden ${
                mobileView === 'map' ? 'block' : 'hidden lg:block'
              }`}
            >
              <WorkspaceMapPlaceholder />
            </div>

            {/* RIGHT COLUMN: Vertical Timeline */}
            <div
              className={`lg:col-span-7 h-full overflow-y-auto pr-1 sm:pr-3 space-y-4 ${
                mobileView === 'timeline' ? 'block' : 'hidden lg:block'
              }`}
            >
              {/* Timeline Header */}
              <div className="bg-white rounded-3xl border border-[#E7DFD5] p-5 sm:p-6 shadow-xs space-y-3">
                {/* Day Badge & Breadcrumb */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider bg-[#00685F]/10 text-[#00685F] px-3 py-1 rounded-full">
                      Day 3 of 7
                    </span>
                    <span className="text-xs font-semibold text-[#8A9592]">
                      {itinerary.destinationCity || 'Kyoto'} Historical Basin · Wednesday, Oct 16
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#00685F] flex items-center gap-1 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00685F]"></span>
                      <span>{collaborators.length} Tripmates Connected</span>
                    </span>
                  </div>
                </div>

                {/* Day Title & Lead Status Notice */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-[#161C23] tracking-tight">
                      Heritage, Prayer &amp; Harmony
                    </h2>
                    <p className="text-xs text-[#6D7A77] font-medium mt-0.5">
                      {isTeamLead
                        ? '👑 You are the Team Lead. You have prior authority to edit, swap, and finalize the official itinerary.'
                        : '👤 You are viewing as Tripmate. Official activities are locked; use "+ Suggest" or "Drop Link" to submit ideas to the Team Lead.'}
                    </p>
                  </div>

                  {/* Actions: Add Stop / Suggest */}
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    {isTeamLead ? (
                      <button
                        type="button"
                        onClick={() => onOpenAddModal(selectedDayId)}
                        className="px-4 py-2 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Stop (Lead)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsSuggestModalOpen(true)}
                        className="px-4 py-2 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#62FAE3]" />
                        <span>Suggest Stop</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Group Roster Strip with Preferences Badges */}
                <div className="pt-2 border-t border-[#E7DFD5]/60 flex items-center justify-between text-xs text-[#6D7A77] flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[11px]">Party Members:</span>
                    <div className="flex items-center gap-1.5">
                      {collaborators.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-1 bg-[#FAF8F5] border border-[#E7DFD5] px-2 py-0.5 rounded-full text-[10px] font-bold"
                          title={`${c.name} (${c.role}) - Dietary: ${c.preferences?.faithDietary || 'Configured'}`}
                        >
                          <img src={c.avatar} alt={c.name} className="w-4 h-4 rounded-full object-cover" />
                          <span>{c.name}</span>
                          {c.isLead && <span className="text-amber-600">👑</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <span className="text-[11px] font-extrabold text-[#00685F] bg-[#EAF6F4] px-2.5 py-0.5 rounded-full border border-[#00685F]/20 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#00685F]" />
                    <span>⚡ Prayer &amp; Halal Sync Active</span>
                  </span>
                </div>
              </div>

              {/* Collapsible Budget Drawer */}
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
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-white bg-[#00685F] px-3 py-1 rounded-full font-mono">
                        09:30 AM – 12:00 PM
                      </span>
                      <span className="text-xs font-semibold text-[#8A9592]">(2h 30m)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isTeamLead ? (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Crown className="w-3 h-3 text-amber-700" />
                          <span>Lead Authorized</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-neutral-600 bg-neutral-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          <span>Official Anchor</span>
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Ticket className="w-3 h-3 text-emerald-700" />
                        <span>Tickets Confirmed</span>
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-black text-[#161C23]">
                      Kyoto National Museum &amp; Garden Walk
                    </h3>
                    <p className="text-xs sm:text-sm text-[#6D7A77] font-medium leading-relaxed mt-1">
                      Exploring the Heian period imperial calligraphy &amp; tranquil stone courtyards before midday Dhuhr prayer.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E7DFD5]/50 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-[#526360]">
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] font-medium">
                        <MapPin className="w-3.5 h-3.5 text-[#00685F]" />
                        <span>Higashiyama Ward · Step-free path</span>
                      </span>
                    </div>

                    {/* Team Lead Edit Actions / Tripmate view */}
                    {isTeamLead && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const sampleAct: ActivityBlock = {
                              id: 'act-1',
                              dayId: 'day-3',
                              time: '09:30 AM',
                              duration: '2h 30m',
                              title: 'Kyoto National Museum & Garden Walk',
                              type: 'sightseeing',
                              location: 'Higashiyama Ward',
                              description: 'Heian calligraphy & stone gardens',
                              tags: ['Sightseeing', 'Step-Free'],
                            };
                            onOpenRefinementModal(sampleAct);
                          }}
                          className="px-2.5 py-1 rounded-xl text-xs font-bold text-[#00685F] bg-[#EEF4FE] hover:bg-[#00685F]/20 transition-colors cursor-pointer"
                        >
                          Modify Activity (Lead)
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* TRANSIT CONNECTOR */}
                <div className="flex items-center gap-2 px-6 py-1 text-xs text-[#8A9592] font-semibold">
                  <Footprints className="w-3.5 h-3.5 text-[#00685F]" />
                  <span>8 min walk (650m) along Takase River Canal</span>
                </div>

                {/* ------------------------------------------------------- */}
                {/* BLOCK 2: SPLIT & SYNC BLOCK (AI Mediator)               */}
                {/* ------------------------------------------------------- */}
                <SplitSyncBlock onSimulateEdit={handleSimulateConflict} />

                {/* TRANSIT CONNECTOR */}
                <div className="flex items-center gap-2 px-6 py-1 text-xs text-[#8A9592] font-semibold">
                  <Footprints className="w-3.5 h-3.5 text-[#00685F]" />
                  <span>6 min walk to East Torii Gate</span>
                </div>

                {/* ------------------------------------------------------- */}
                {/* BLOCK 3: GROUP SYNC POINT                               */}
                {/* ------------------------------------------------------- */}
                <div className="bg-white rounded-3xl border-2 border-[#00685F]/30 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider bg-[#00685F] text-white px-3 py-1 rounded-full flex items-center gap-1">
                        <span>★ Group Sync Point</span>
                      </span>
                      <span className="text-xs font-bold text-[#161C23] font-mono">
                        02:00 PM – 04:30 PM (2h 30m)
                      </span>
                    </div>

                    <span className="text-xs font-extrabold text-[#00685F] bg-[#EAF6F4] px-2.5 py-0.5 rounded-full border border-[#00685F]/20 animate-pulse">
                      Rendezvous in 25 mins
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-black text-[#161C23]">
                      Botanical Gardens &amp; Bamboo Pavilion
                    </h3>
                    <p className="text-xs sm:text-sm text-[#6D7A77] font-medium leading-relaxed mt-1">
                      Full group reunites at the East Torii Gate. Afternoon guided stroll through medicinal plants, autumn maple foliage, and shaded teahouse lawns.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E7DFD5]/50 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="px-2.5 py-1 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-[#526360] font-medium">
                        Scenic Photo Spot #4
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-[#00685F] font-bold border border-emerald-200">
                        Meet at East Torii Gate
                      </span>
                    </div>

                    {isTeamLead && (
                      <button
                        type="button"
                        onClick={() => {
                          const sampleAct: ActivityBlock = {
                            id: 'act-3',
                            dayId: 'day-3',
                            time: '02:00 PM',
                            duration: '2h 30m',
                            title: 'Botanical Gardens & Bamboo Pavilion',
                            type: 'sightseeing',
                            location: 'East Torii Gate',
                            description: 'Group sync point and stroll',
                            tags: ['Sync Point', 'Scenic'],
                          };
                          onOpenRefinementModal(sampleAct);
                        }}
                        className="px-2.5 py-1 rounded-xl text-xs font-bold text-[#00685F] bg-[#EEF4FE] hover:bg-[#00685F]/20 transition-colors cursor-pointer"
                      >
                        Adjust Sync Slot
                      </button>
                    )}
                  </div>
                </div>

                {/* TRANSIT CONNECTOR */}
                <div className="flex items-center gap-2 px-6 py-1 text-xs text-[#8A9592] font-semibold">
                  <Route className="w-3.5 h-3.5 text-[#00685F]" />
                  <span>12 min taxi to Gion Quarter</span>
                </div>

                {/* ------------------------------------------------------- */}
                {/* BLOCK 4: Halal Wagyu Dining Experience                  */}
                {/* ------------------------------------------------------- */}
                <div className="bg-white rounded-3xl border border-[#E7DFD5] p-5 sm:p-6 shadow-xs hover:shadow-md transition-all space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-white bg-[#00685F] px-3 py-1 rounded-full font-mono">
                        05:00 PM – 07:00 PM
                      </span>
                      <span className="text-xs font-semibold text-[#8A9592]">(2h)</span>
                    </div>

                    <span className="text-[11px] font-bold text-[#00685F] bg-[#EAF6F4] border border-[#00685F]/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <UtensilsCrossed className="w-3 h-3 text-[#00685F]" />
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

                    {isTeamLead ? (
                      <button
                        type="button"
                        onClick={() => {
                          const sampleAct: ActivityBlock = {
                            id: 'act-4',
                            dayId: 'day-3',
                            time: '05:00 PM',
                            duration: '2h',
                            title: 'Halal Wagyu Dining Experience',
                            type: 'dining',
                            location: 'Gion Quarter',
                            description: 'Halal certified wagyu with prayer room',
                            tags: ['Halal Dining', 'Prayer Room'],
                          };
                          onOpenRefinementModal(sampleAct);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#00685F] text-white text-xs font-bold hover:bg-[#008378] transition-colors cursor-pointer"
                      >
                        Swap Halal Option (Lead)
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#6D7A77] flex items-center gap-1">
                        <Lock className="w-3 h-3 text-[#00685F]" />
                        <span>Locked by Team Lead</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Approved Custom / Suggested Activities */}
                {itinerary.activityBlocks
                  .filter((act) => act.id.startsWith('act-approved-') || act.id.startsWith('act-custom-'))
                  .map((act) => (
                    <div
                      key={act.id}
                      className="bg-emerald-50/40 rounded-3xl border-2 border-emerald-500/30 p-5 sm:p-6 shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-white bg-[#00685F] px-3 py-1 rounded-full font-mono">
                          {act.time}
                        </span>
                        <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>Approved by Team Lead 👑</span>
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-black text-[#161C23]">{act.title}</h3>
                      <p className="text-xs text-[#6D7A77] font-medium leading-relaxed">
                        {act.description}
                      </p>
                      <div className="text-xs text-[#526360] flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#00685F]" />
                        <span>{act.location}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </main>

        {/* ========================================================================= */}
        {/* 3. SUGGESTIONS & SOCIAL MEDIA REVIEW DRAWER                               */}
        {/* ========================================================================= */}
        {showSuggestionsDrawer && (
          <aside className="w-80 sm:w-96 bg-white border-l border-[#E7DFD5] h-full flex flex-col shadow-2xl z-40 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[#E7DFD5] flex items-center justify-between bg-[#FAF8F5]">
              <div>
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-[#00685F]" />
                  <h3 className="text-sm font-black text-[#161C23]">Tripmate Suggestions</h3>
                </div>
                <p className="text-[11px] text-[#6D7A77]">
                  {isTeamLead
                    ? 'Review & approve suggestions into the itinerary'
                    : 'Your submitted proposals and social links'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSuggestionsDrawer(false)}
                className="p-1 rounded-full hover:bg-neutral-200 text-[#6D7A77]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick action button inside drawer for Mates */}
            {!isTeamLead && (
              <div className="p-3 bg-[#EEF4FE] border-b border-[#00685F]/20">
                <button
                  type="button"
                  onClick={() => setIsSuggestModalOpen(true)}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Suggest New Place / Reel Link</span>
                </button>
              </div>
            )}

            {/* Suggestions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {suggestions.length === 0 ? (
                <div className="text-center py-12 space-y-2 text-[#6D7A77]">
                  <MessageSquare className="w-8 h-8 mx-auto text-[#C4BCB3]" />
                  <p className="text-xs font-bold">No suggestions yet</p>
                  <p className="text-[11px]">
                    Tripmates can submit TikTok reels, food spots, and scenic locations here.
                  </p>
                </div>
              ) : (
                suggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                      sug.status === 'approved'
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : sug.status === 'rejected'
                        ? 'bg-neutral-100 border-neutral-200 opacity-60'
                        : 'bg-white border-[#E7DFD5] shadow-xs'
                    }`}
                  >
                    {/* Proposer Info & Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img
                          src={sug.proposedBy.avatar}
                          alt={sug.proposedBy.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <div className="leading-tight">
                          <span className="text-xs font-bold text-[#161C23]">
                            {sug.proposedBy.name}
                          </span>
                          <span className="text-[10px] text-[#6D7A77] block">
                            {sug.submittedAt}
                          </span>
                        </div>
                      </div>

                      {sug.status === 'approved' && (
                        <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Approved</span>
                        </span>
                      )}
                      {sug.status === 'rejected' && (
                        <span className="text-[10px] font-bold text-neutral-500 bg-neutral-200 px-2 py-0.5 rounded-full">
                          Declined
                        </span>
                      )}
                      {sug.status === 'pending' && (
                        <span className="text-[10px] font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
                          Pending Review
                        </span>
                      )}
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h4 className="text-xs font-black text-[#161C23]">{sug.title}</h4>
                      <p className="text-[11px] text-[#6D7A77] mt-0.5 leading-relaxed">
                        {sug.description}
                      </p>
                    </div>

                    {/* Halal Badge & Source Link */}
                    <div className="flex items-center justify-between gap-1 text-[10px] pt-1 border-t border-[#E7DFD5]/50 flex-wrap">
                      <span className="font-bold text-[#00685F] bg-[#EEF4FE] px-2 py-0.5 rounded">
                        {sug.halalBadge || 'Community Halal Checked'}
                      </span>

                      {sug.sourceUrl && (
                        <a
                          href={sug.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#00685F] font-bold flex items-center gap-1 hover:underline"
                        >
                          <Video className="w-3 h-3" />
                          <span>View Social Link</span>
                        </a>
                      )}
                    </div>

                    {/* Team Lead Actions: Approve or Reject */}
                    {isTeamLead && sug.status === 'pending' && (
                      <div className="flex items-center gap-2 pt-1 border-t border-[#E7DFD5]">
                        <button
                          type="button"
                          onClick={() => handleApproveSuggestion(sug)}
                          className="flex-1 py-1.5 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve into Day</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectSuggestion(sug.id)}
                          className="px-2.5 py-1.5 rounded-xl border border-[#E7DFD5] hover:bg-neutral-100 text-[#6D7A77] text-xs font-bold transition-colors cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS & POPUPS                                                        */}
      {/* ========================================================================= */}
      {/* Add Tripmate Modal (Configures preferences) */}
      <AddMateModal
        isOpen={isAddMateModalOpen}
        onClose={() => setIsAddMateModalOpen(false)}
        collaborators={collaborators}
        onAddMate={(newMate) => {
          if (onAddMate) onAddMate(newMate);
          setNotificationToast(`Added ${newMate.name} as Tripmate with custom dietary preferences!`);
          setTimeout(() => setNotificationToast(null), 3500);
        }}
      />

      {/* Suggest Activity / Drop Link Modal (For Mates) */}
      <SuggestActivityModal
        isOpen={isSuggestModalOpen}
        onClose={() => setIsSuggestModalOpen(false)}
        currentUser={currentUser}
        activeDayId={selectedDayId}
        onSubmitSuggestion={handleAddSuggestion}
      />

      {/* AI Mediator Conflict Resolution Modal */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        onVoteSubmitted={() => {
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
