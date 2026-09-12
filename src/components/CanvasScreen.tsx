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
  MoreVertical,
} from 'lucide-react';
import { NavigationRail } from './NavigationRail';
import { ItineraryFeed, TimelinePanel } from './ItineraryFeed';
import { DiscoveryPanel } from './DiscoveryPanel';
import { SplitSyncBlock } from './SplitSyncBlock';
import { useTripState } from '../hooks/useTripState';
import { ConflictResolutionModal } from './ConflictResolutionModal';
import { PrintItineraryModal } from './PrintItineraryModal';
import { BudgetTracker } from './BudgetTracker';
import { AddMateModal } from './AddMateModal';
import { SuggestActivityModal } from './SuggestActivityModal';
import { firestoreSync, ClashRecord } from '../firebase/firestoreService';
import { detectGroupConflicts, getPlanningContext } from '../services/groupConflictEngine';
import { AIPlannerWorkspace } from './AIPlannerWorkspace';
import { WeatherData, fetchLiveWeather } from '../services/weatherService';
import { ShareInviteModal } from './ShareInviteModal';
import { HalalRadarScreen } from './HalalRadarScreen';
import { AddActivityModal } from './AddActivityModal';
import { ItineraryStop } from '../types/itinerary';

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
  onOpenHalalRadar?: () => void;
  dateConflictNotice?: boolean;
  onDismissDateConflict?: () => void;
  onAddMate?: (newMate: Collaborator) => void;
  initialDayId?: string;
  fallbackToast?: boolean;
  onDismissFallbackToast?: () => void;
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
  onOpenHalalRadar,
  dateConflictNotice = false,
  onDismissDateConflict,
  onAddMate,
  initialDayId,
  fallbackToast = false,
  onDismissFallbackToast,
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>('multiplayer');
  const [isConflictModalOpen, setIsConflictModalOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isAddMateModalOpen, setIsAddMateModalOpen] = useState<boolean>(false);
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isHalalRadarOpen, setIsHalalRadarOpen] = useState<boolean>(false);
  const [isAddActivityModalOpen, setIsAddActivityModalOpen] = useState<boolean>(false);
  const [addActivityDayId, setAddActivityDayId] = useState<string>('day-3');
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [showSuggestionsDrawer, setShowSuggestionsDrawer] = useState<boolean>(false);
  const [showBudgetDrawer, setShowBudgetDrawer] = useState<boolean>(false);
  const [selectedDayId, setSelectedDayId] = useState<string>('day-3');
  const [clashData, setClashData] = useState<ClashRecord | null>(null);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'timeline' | 'map'>('timeline');
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);

  // Three-pane itinerary state (new Wanderlog-pattern)
  const tripState = useTripState(initialDayId);

  const activeCity = tripState.activeDay?.city || 'Tokyo';

  useEffect(() => {
    fetchLiveWeather(activeCity).then(setCurrentWeather);
  }, [activeCity]);

  // Show the "itinerary updated" confirmation toast when redirected here
  // after executing the AI fallback plan in the Document Vault.
  useEffect(() => {
    if (!fallbackToast) return;
    setNotificationToast('Itinerary updated: Schedules and transit synced to delayed arrival.');
    const timer = setTimeout(() => {
      setNotificationToast(null);
      onDismissFallbackToast?.();
    }, 4200);
    return () => clearTimeout(timer);
  }, [fallbackToast]);

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

  // Detect Group Preferences Conflicts
  useEffect(() => {
    if (tripState.state.groupTravelMode) {
      const context = getPlanningContext(tripState.state);
      const conflicts = detectGroupConflicts(context);
      tripState.dispatch({ type: 'SET_ACTIVE_CONFLICTS', conflicts });
    } else {
      tripState.dispatch({ type: 'SET_ACTIVE_CONFLICTS', conflicts: [] });
    }
  }, [tripState.state.groupTravelMode, tripState.state.activeDayId, tripState.activeStops]);


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

  // Add stop or open Add Activity modal
  const handleAddStopToTrip = (dayId: string, placeName: string) => {
    const targetDayId = dayId || selectedDayId || 'day-3';
    if (!placeName || placeName.trim() === '') {
      setAddActivityDayId(targetDayId);
      setIsAddActivityModalOpen(true);
      if (onOpenAddModal) onOpenAddModal(targetDayId);
      return;
    }

    const isHotel =
      placeName.includes('🏨') ||
      placeName.toLowerCase().includes('hotel') ||
      placeName.toLowerCase().includes('base:');

    const newStop: ItineraryStop = {
      id: `stop-${Date.now()}`,
      dayId: targetDayId,
      orderIndex: tripState.activeStops?.length || 0,
      title: placeName,
      description: isHotel
        ? 'Base accommodation anchored for day hub, prayer rest, and luggage drop.'
        : 'Recommended spot added to day schedule.',
      address: isHotel ? 'Shimogyo Ward, Kyoto 600-8216' : 'Kyoto / Tokyo, Japan',
      coordinate: isHotel ? { lat: 34.9858, lng: 135.7588 } : { lat: 35.0035, lng: 135.7765 },
      timeWindow: isHotel ? { start: '08:30 PM', end: '10:00 PM' } : { start: '03:30 PM', end: '05:00 PM' },
      durationMinutes: isHotel ? 90 : 75,
      category: isHotel ? 'LODGING' : 'ATTRACTION',
      status: 'CONFIRMED',
      halalBadge: isHotel ? 'Muslim-Friendly · Verified Wudu/Musalla' : 'Halal Verified',
      tags: isHotel ? ['Hotel', 'Base Hub', 'Halal Facilities'] : ['Custom', 'Activity'],
    };

    tripState.dispatch({ type: 'ADD_STOP', dayId: targetDayId, stop: newStop });

    const newActivity: ActivityBlock = {
      id: `act-${newStop.id}`,
      dayId: targetDayId,
      time: newStop.timeWindow?.start || '04:00 PM',
      duration: `${newStop.durationMinutes || 60}m duration`,
      title: placeName,
      type: isHotel ? 'lodging' : 'sightseeing',
      location: newStop.address || 'Kyoto, Japan',
      description: newStop.description || '',
      tags: newStop.tags || ['Custom'],
      halalBadge: newStop.halalBadge,
      votes: { count: 1, voters: [currentUser.name], userVoted: true },
    };

    onUpdateItinerary(
      {
        ...itinerary,
        activityBlocks: [...itinerary.activityBlocks, newActivity],
      },
      `${currentUser.name} added "${placeName}" to Day schedule`
    );

    setNotificationToast(isHotel ? `🏨 "${placeName}" anchored to itinerary!` : `✓ Added "${placeName}" to schedule!`);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  // Add custom activity from AddActivityModal
  const handleModalAddActivity = (act: Omit<ActivityBlock, 'id'>) => {
    const targetDayId = addActivityDayId || selectedDayId || 'day-3';
    const isDining = act.type === 'dining' || act.type === 'cafe';
    const isHotel = act.type === 'lodging';

    const newStop: ItineraryStop = {
      id: `stop-${Date.now()}`,
      dayId: targetDayId,
      orderIndex: tripState.activeStops?.length || 0,
      title: act.title,
      description: act.description,
      address: act.location,
      coordinate: { lat: 35.0035, lng: 135.7765 },
      timeWindow: { start: act.time, end: '06:00 PM' },
      durationMinutes: 75,
      category: isDining ? 'FOOD' : isHotel ? 'LODGING' : 'ATTRACTION',
      status: 'CONFIRMED',
      halalBadge: act.halalBadge || 'Halal Verified',
      tags: act.tags || ['Custom'],
      cost: act.cost,
    };

    tripState.dispatch({ type: 'ADD_STOP', dayId: targetDayId, stop: newStop });

    const newActivity: ActivityBlock = {
      ...act,
      id: `act-${newStop.id}`,
    };

    onUpdateItinerary(
      {
        ...itinerary,
        activityBlocks: [...itinerary.activityBlocks, newActivity],
      },
      `${currentUser.name} added "${act.title}"`
    );

    setIsAddActivityModalOpen(false);
    setNotificationToast(`✓ Added "${act.title}" to Day schedule!`);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#FAF8F5] overflow-hidden select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* ========================================================================= */}
      {/* 1. TOP WORKSPACE NAVIGATION BAR                                           */}
      {/* ========================================================================= */}
      <header className="flex justify-between items-center h-16 px-4 bg-white border-b border-[#E7DFD5] shrink-0 z-30">
        {/* LEFT ALIGN (Context) */}
        <div className="flex items-center text-sm">
          <span className="text-gray-600">Workspace / </span>
          <span className="ml-1 font-bold text-[#161C23]">Tokyo & Kyoto</span>
        </div>

        {/* CENTER (Breathing Room) */}
        <div className="flex-1"></div>

        {/* RIGHT ALIGN (Action Group) */}
        <div className="flex items-center gap-3">
          {/* Live Real Weather Badge */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-full text-[#166534] shadow-2xs"
            title="Real-time weather (Open-Meteo)"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-black text-[#161C23]">
              {currentWeather ? `${currentWeather.temperature}°C ${currentWeather.conditionEmoji}` : '🌤️ Weather'}
            </span>
            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-emerald-200/70 text-emerald-900">
              Live
            </span>
          </div>

          {/* Suggest Spot */}
          <button
            type="button"
            onClick={() => setIsSuggestModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF4FE] hover:bg-[#DDE9FD] text-[#0D6955] rounded-full text-xs font-bold transition-colors cursor-pointer"
            title="Suggest a place or video link for Team Lead approval"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Suggest Spot</span>
          </button>

          {/* View Suggestions Toggle if any suggestions exist */}
          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSuggestionsDrawer((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                showSuggestionsDrawer
                  ? 'bg-[#0D6955] text-white'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
              }`}
              title="View Suggestions Drawer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{suggestions.length} Ideas</span>
            </button>
          )}

          {/* Conflict Radar */}
          <button
            type="button"
            onClick={() => setIsConflictModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF2DF] hover:bg-[#FFE8C7] rounded-full text-[#C27803] transition-colors"
            title="Conflict Radar"
          >
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-bold">Radar</span>
          </button>

          {/* Avatar Cluster */}
          <div className="flex -space-x-2">
            {collaborators.slice(0, 3).map((c, i) => (
              <img
                key={c.id || i}
                src={c.avatar}
                alt={c.name}
                className="w-8 h-8 rounded-full border-2 border-white object-cover"
                title={c.name}
              />
            ))}
          </div>

          {/* Share Button */}
          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0D6955] hover:bg-[#095040] text-white rounded-md text-sm font-bold transition-colors shadow-sm cursor-pointer"
            title="Invite tripmates via Gmail or copy share link"
          >
            <UserPlus className="w-4 h-4" />
            <span>Share</span>
          </button>

          {/* Overflow Menu with Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
              title="More Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showMoreMenu && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-[#E7DFD5] py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150 font-medium"
                onClick={() => setShowMoreMenu(false)}
              >
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(true)}
                  className="w-full px-4 py-2 text-left hover:bg-[#FAF8F5] flex items-center gap-2.5 text-[#161C23] cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-[#0D6955]" />
                  <span>Export Itinerary (PDF & Budget)</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenVault}
                  className="w-full px-4 py-2 text-left hover:bg-[#FAF8F5] flex items-center gap-2.5 text-[#161C23] cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>Document Vault & Passes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsAddMateModalOpen(true)}
                  className="w-full px-4 py-2 text-left hover:bg-[#FAF8F5] flex items-center gap-2.5 text-[#161C23] cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-blue-600" />
                  <span>Add / Manage Tripmates</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSuggestModalOpen(true)}
                  className="w-full px-4 py-2 text-left hover:bg-[#FAF8F5] flex items-center gap-2.5 text-[#161C23] cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Suggest Spot or Video</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSuggestionsDrawer((prev) => !prev)}
                  className="w-full px-4 py-2 text-left hover:bg-[#FAF8F5] flex items-center gap-2.5 text-[#161C23] cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                  <span>Tripmate Suggestions ({suggestions.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsHalalRadarOpen(true)}
                  className="w-full px-4 py-2 text-left hover:bg-[#FAF8F5] flex items-center gap-2.5 text-[#161C23] cursor-pointer"
                >
                  <Compass className="w-4 h-4 text-emerald-600" />
                  <span>Halal Radar & Scanner</span>
                </button>

                <div className="my-1 border-t border-[#E7DFD5]" />

                <button
                  type="button"
                  onClick={() => {
                    if (onOpenInspiration) onOpenInspiration();
                    else window.location.reload();
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-rose-50 flex items-center gap-2.5 text-rose-600 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  <span>Back to Safar Home</span>
                </button>
              </div>
            )}
          </div>

          {/* User Profile */}
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-8 h-8 rounded-full ml-1 object-cover cursor-pointer"
            title={currentUser.name}
          />
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
          onOpenMultiplayer={() => setIsAddMateModalOpen(true)}
          onOpenConflict={() => setIsConflictModalOpen(true)}
          onOpenVault={onOpenVault}
          onOpenBudget={() => setIsPrintModalOpen(true)}
          onToggleGroupTravel={() => tripState.dispatch({ type: 'TOGGLE_GROUP_TRAVEL_MODE' })}
          onOpenHalalRadar={() => setIsHalalRadarOpen(true)}
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
          onAddStop={handleAddStopToTrip}
          collaboratorsCount={collaborators.length}
          isLead={isTeamLead}
          onInsertPrayerBreak={(dayId, afterStopId, prayerStop) => {
            tripState.dispatch({ type: 'INSERT_PRAYER_BREAK', dayId, afterStopId, prayerStop });
            setNotificationToast(`🕌 Prayer break added: ${prayerStop.title}`);
            setTimeout(() => setNotificationToast(null), 3500);
          }}
          onOpenAiPlanner={(conflictId) => tripState.dispatch({ type: 'OPEN_AI_PLANNER', conflictId })}
        />

        {/* ── Pane 3: Discovery Panel (Right Column) ── */}
        <DiscoveryPanel
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
          onOpenVault={onOpenVault}
          onAddStop={handleAddStopToTrip}
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
      {/* AI Planner Workspace */}
      <AIPlannerWorkspace
        state={tripState.state}
        dispatch={tripState.dispatch}
        onApplyPlan={(dayId, conflictActivityId, proposedStops) => {
          tripState.dispatch({ type: 'APPLY_AI_PLAN', dayId, conflictActivityId, proposedStops });
          setNotificationToast('✅ AI Plan successfully applied to the itinerary!');
          setTimeout(() => setNotificationToast(null), 3500);
        }}
        onClose={() => tripState.dispatch({ type: 'CLOSE_AI_PLANNER' })}
      />

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

      {/* Share & Invite Tripmates Modal (Gmail & Copy Link) */}
      <ShareInviteModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        collaborators={collaborators}
        tripTitle={itinerary.title || 'Japan Autumn Odyssey 2026'}
      />

      {/* Suggest Activity / Drop Link Modal (For Mates) */}
      <SuggestActivityModal
        isOpen={isSuggestModalOpen}
        onClose={() => setIsSuggestModalOpen(false)}
        currentUser={currentUser}
        activeDayId={selectedDayId}
        onSubmitSuggestion={handleAddSuggestion}
      />

      {/* Add New Activity Modal (With categories & prayer coordination) */}
      <AddActivityModal
        isOpen={isAddActivityModalOpen}
        onClose={() => setIsAddActivityModalOpen(false)}
        dayId={addActivityDayId}
        onAddActivity={handleModalAddActivity}
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

      {/* NOTE: the global full-screen weather animation overlay was removed in favour
          of the clean, confined weather pill inside the itinerary hero header. */}

      {/* Halal Radar Screen Overlay */}
      {isHalalRadarOpen && (
        <HalalRadarScreen onClose={() => setIsHalalRadarOpen(false)} />
      )}
    </div>
  );
};
