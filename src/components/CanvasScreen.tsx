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
import { NavigationRail } from './NavigationRail';
import { ItineraryFeed } from './ItineraryFeed';
import { GoogleMapPane } from './GoogleMapPane';
import { SplitSyncBlock } from './SplitSyncBlock';
import { useTripState } from '../hooks/useTripState';
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

  // Three-pane itinerary state (new Wanderlog-pattern)
  const tripState = useTripState();

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
      {/* 2. MAIN WORKSPACE BODY — Three-Pane Wanderlog Layout                      */}
      {/*    [NavigationRail] | [ItineraryFeed] | [GoogleMapPane]                   */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── Pane 1: Collapsible Navigation Rail ── */}
        <NavigationRail
          state={tripState.state}
          onSelectDay={(dayId) => {
            tripState.setActiveDay(dayId);
            setSelectedDayId(dayId);
          }}
          onToggleCollapse={tripState.toggleNavRail}
          onOpenMultiplayer={() => setActiveSidebarTab('multiplayer')}
          onOpenConflict={() => setIsConflictModalOpen(true)}
          onOpenVault={onOpenVault}
          onOpenBudget={() => setShowBudgetDrawer((b) => !b)}
        />

        {/* ── Pane 2: Itinerary Feed ── */}
        <ItineraryFeed
          state={tripState.state}
          activeDay={tripState.activeDay}
          activeStops={tripState.activeStops}
          onSelectStop={(id) => tripState.setSelectedStop(id)}
          onHoverStop={(id) => tripState.setHoveredStop(id)}
          onSelectDay={(dayId) => {
            tripState.setActiveDay(dayId);
            setSelectedDayId(dayId);
          }}
          onAddStop={(dayId, placeName) => {
            setNotificationToast(`"${placeName}" added to search queue!`);
            setTimeout(() => setNotificationToast(null), 3000);
          }}
          collaboratorsCount={collaborators.length}
          isLead={isTeamLead}
          onInsertPrayerBreak={(dayId, afterStopId, prayerStop) => {
            tripState.dispatch({ type: 'INSERT_PRAYER_BREAK', dayId, afterStopId, prayerStop });
            setNotificationToast(`🕌 Prayer break added: ${prayerStop.title}`);
            setTimeout(() => setNotificationToast(null), 3500);
          }}
        />

        {/* ── Pane 3: Google Map ── */}
        <GoogleMapPane
          days={tripState.state.days}
          activeDayId={tripState.state.activeDayId}
          stops={tripState.activeStops}
          selectedStopId={tripState.state.selectedStopId}
          hoveredStopId={tripState.state.hoveredStopId}
          activeMapLayer={tripState.state.activeMapLayer}
          mapViewport={tripState.state.mapViewport}
          onSelectStop={(id) => tripState.setSelectedStop(id)}
          onHoverStop={(id) => tripState.setHoveredStop(id)}
          onSetLayer={(layer) => tripState.setMapLayer(layer)}
          onSelectDay={(dayId) => {
            tripState.setActiveDay(dayId);
            setSelectedDayId(dayId);
          }}
        />

        {/* ── Suggestions Drawer (slides in over map pane when open) ── */}
        {showSuggestionsDrawer && (
          <aside className="w-80 bg-white border-l border-[#E7DFD5] flex flex-col h-full overflow-hidden shrink-0 shadow-xl z-20">
            <div className="flex items-center justify-between p-4 border-b border-[#E7DFD5]">
              <span className="text-sm font-black text-[#161C23]">
                Suggestions ({suggestions.length})
              </span>
              <button
                type="button"
                onClick={() => setShowSuggestionsDrawer(false)}
                className="text-[#8A9592] hover:text-[#161C23] text-xs font-bold cursor-pointer px-2 py-1 rounded-lg hover:bg-[#FAF8F5]"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {suggestions.length === 0 ? (
                <p className="text-xs text-[#8A9592] text-center py-8 font-medium">
                  No suggestions yet. Tripmates can submit ideas via the "Suggest" button.
                </p>
              ) : (
                suggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                      sug.status === 'approved'
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : sug.status === 'rejected'
                        ? 'border-neutral-200 bg-neutral-50 opacity-60'
                        : 'border-[#E7DFD5] bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={sug.proposedBy.avatar}
                        alt={sug.proposedBy.name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-[#161C23] truncate">{sug.title}</p>
                        <p className="text-[10px] text-[#8A9592]">
                          by {sug.proposedBy.name} · {sug.submittedAt}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          sug.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : sug.status === 'rejected'
                            ? 'bg-neutral-100 text-neutral-500 border-neutral-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {sug.status}
                      </span>
                    </div>
                    <p className="text-[#526360] leading-relaxed">{sug.description}</p>
                    {isTeamLead && sug.status === 'pending' && (
                      <div className="flex items-center gap-2 pt-1 border-t border-[#E7DFD5]">
                        <button
                          type="button"
                          onClick={() => handleApproveSuggestion(sug)}
                          className="flex-1 py-1.5 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
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
