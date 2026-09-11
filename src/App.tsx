import React, { useState, useEffect, useCallback } from 'react';
import {
  Itinerary,
  Collaborator,
  ActivityBlock,
  HalalFallbackOption,
  FaithDietaryTier,
  TravelPace,
} from './types';
import {
  INITIAL_ITINERARY,
  INITIAL_COLLABORATORS,
} from './data/mockData';
import { multiplayerSync } from './services/multiplayerSync';
import { testConnection } from './firebase/config';
import { Navbar } from './components/Navbar';
import { LandingScreen } from './components/LandingScreen';
import { TripSetupWizard } from './components/TripSetupWizard';
import { GeneratingScreen } from './components/GeneratingScreen';
import { DocumentVaultScreen } from './components/DocumentVaultScreen';
import { CanvasScreen } from './components/CanvasScreen';
import { RefinementModal } from './components/RefinementModal';
import { AuthModal } from './components/AuthModal';
import { AddActivityModal } from './components/AddActivityModal';
import { HalalRadarScreen } from './components/HalalRadarScreen';

export default function App() {
  // Application State & Flow:
  // 'landing' -> 'setup' (Team Lead setup wizard) -> 'generating' -> 'canvas'
  const [currentScreen, setCurrentScreen] = useState<
    'landing' | 'setup' | 'generating' | 'canvas' | 'vault' | 'radar'
  >('landing');

  const [itinerary, setItinerary] = useState<Itinerary>(() => multiplayerSync.getSavedItinerary());
  const [collaborators, setCollaborators] = useState<Collaborator[]>(INITIAL_COLLABORATORS);
  const [currentUser, setCurrentUser] = useState<Collaborator>(INITIAL_COLLABORATORS[0]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityBlock | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeDayForAdd, setActiveDayForAdd] = useState<string>('day-3');
  const [recentAction, setRecentAction] = useState<string>('Connected to Safar live sync');
  const [dateConflictNotice, setDateConflictNotice] = useState(false);
  const [generatingSource, setGeneratingSource] = useState<string>(
    'Kyoto, Japan (Autumn Foliage & Halal Corridors)'
  );
  const [radarReturnScreen, setRadarReturnScreen] = useState<'canvas' | 'landing'>('canvas');

  // Test Firebase connection on mount
  useEffect(() => {
    testConnection();
  }, []);

  // Real-time synchronization subscription
  useEffect(() => {
    const unsubscribeItinerary = multiplayerSync.subscribe((updatedItinerary) => {
      setItinerary(updatedItinerary);
    });

    const unsubscribePresence = multiplayerSync.subscribePresence((presence) => {
      setRecentAction(`${presence.user.name}: ${presence.action}`);
    });

    return () => {
      unsubscribeItinerary();
      unsubscribePresence();
    };
  }, []);

  // Update itinerary and broadcast to all tabs/collaborators
  const handleUpdateItinerary = useCallback(
    (updated: Itinerary, actionDescription?: string) => {
      setItinerary(updated);
      multiplayerSync.broadcastUpdate(updated, actionDescription);
      if (actionDescription) {
        setRecentAction(actionDescription);
        multiplayerSync.broadcastPresence(currentUser, actionDescription);
      }
    },
    [currentUser]
  );

  // Handle completion of TripSetupWizard (Step 2)
  const handleSetupComplete = (setupData: {
    leadName: string;
    leadFaithDietary: FaithDietaryTier;
    destination: string;
    startDate: string;
    endDate: string;
    travelGroup: string;
    tourismPoints: string[];
    pace: TravelPace;
    halalTier: FaithDietaryTier;
    prayerBuffers: boolean;
    currency: string;
  }) => {
    // 1. Automatically designate the first user as Team Lead
    const leadUser: Collaborator = {
      id: `lead-${Date.now()}`,
      name: setupData.leadName,
      role: 'Team Lead 👑',
      avatar:
        currentUser.avatar ||
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCMF4QQmYrpQ8HzjKhko22Jih1K3Y-q9rsjUNXYRcpuQRJZI9-kTyAVgy2hXl4ubqoeftdJqglilA_c73YAr4sRGffw_2BHxAK3cZh_1Z9KUpaNPheUdZPiBanGXDd2ZbeGKWGxkp7B73A4r9z9_CGzj6xnfS-tKgUcB7WVZAIfFAP6bubKyIQy9r70Msd0Wzbb7MLscKojguDl97TQqJtERYKuskyLaCccThAFvloV5IFKf7Nz5Sog',
      status: 'active',
      isLead: true,
      action: 'created trip as Team Lead',
      preferences: {
        faithDietary: setupData.leadFaithDietary,
        pace: setupData.pace,
        interests: ['Historic Heritage', 'Halal Gastronomy', 'Scenic Gardens'],
        prayerReminders: setupData.prayerBuffers,
      },
    };

    // Filter out previous lead if needed, place new lead at front
    const otherCollaborators = collaborators.filter((c) => !c.isLead);
    const updatedCollaborators = [leadUser, ...otherCollaborators];

    setCollaborators(updatedCollaborators);
    setCurrentUser(leadUser);

    // 2. Update itinerary details
    const destCity = setupData.destination.split(',')[0].trim();
    const updatedItinerary: Itinerary = {
      ...itinerary,
      title: `${destCity} Trip 🧭`,
      subtitle: `${setupData.travelGroup} · Team Lead: ${setupData.leadName} · Halal & Prayer Synchronized`,
      dateRange: `${setupData.startDate} - ${setupData.endDate}`,
      leadId: leadUser.id,
      destinationCity: destCity,
      tourismPoints: setupData.tourismPoints,
      collaborators: updatedCollaborators,
      budget: {
        totalGoal: 1500,
        currency: setupData.currency,
        dailyGoal: 250,
      },
    };

    setItinerary(updatedItinerary);
    setGeneratingSource(
      `${setupData.destination} • Key Stops: ${setupData.tourismPoints.slice(0, 3).join(', ')}`
    );
    setCurrentScreen('generating');
  };

  // Add new Tripmate with configured preferences (Step 3)
  const handleAddMate = (newMate: Collaborator) => {
    const updatedCollaborators = [...collaborators, newMate];
    setCollaborators(updatedCollaborators);

    const updatedItinerary = {
      ...itinerary,
      collaborators: updatedCollaborators,
    };
    handleUpdateItinerary(
      updatedItinerary,
      `Team Lead added ${newMate.name} as Tripmate (${newMate.role})`
    );
  };

  // Quick Reel extraction from landing
  const handleQuickReelGenerate = (url: string) => {
    setGeneratingSource(url);
    setCurrentScreen('generating');
  };

  // Generation screen completes
  const handleGeneratingComplete = () => {
    setCurrentScreen('canvas');
  };

  // Open the Halal Radar, remembering where to return on close
  const handleOpenHalalRadar = () => {
    setRadarReturnScreen(currentScreen === 'canvas' ? 'canvas' : 'landing');
    setCurrentScreen('radar');
  };

  // Switch or select active user (to test Team Lead vs Mate perspective)
  const handleSelectUser = (user: Collaborator) => {
    setCurrentUser(user);
    multiplayerSync.broadcastPresence(
      user,
      `Switched view to ${user.name} (${user.isLead ? 'Team Lead 👑' : 'Tripmate 👤'})`
    );
  };

  // Custom login via AuthModal
  const handleCustomLogin = (name: string, email: string) => {
    const newUser: Collaborator = {
      id: `user-${Date.now()}`,
      name,
      role: 'Tripmate',
      avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80`,
      status: 'active',
      isLead: false,
      action: 'Viewing canvas as Tripmate',
    };
    setCollaborators((prev) => [...prev, newUser]);
    setCurrentUser(newUser);
    multiplayerSync.broadcastPresence(newUser, 'Joined the itinerary canvas');
  };

  // Swap activity in Refinement Modal
  const handleSwapActivity = (oldActivityId: string, newOption: HalalFallbackOption) => {
    const updatedActivities = itinerary.activityBlocks.map((act) => {
      if (act.id === oldActivityId) {
        return {
          ...act,
          title: newOption.title,
          description: `${newOption.cuisine} · ${newOption.seatingNote}. Verified Halal kitchen.`,
          tags: ['Halal Dining', newOption.cuisine, 'Musalla Inside'],
          halalBadge: '100% Halal Verified',
          image: newOption.image,
          warning: undefined,
        };
      }
      return act;
    });

    const updatedItinerary = {
      ...itinerary,
      activityBlocks: updatedActivities,
    };

    handleUpdateItinerary(
      updatedItinerary,
      `${currentUser.name} swapped to "${newOption.title}" (Halal Fallback)`
    );

    const updatedAct = updatedActivities.find((a) => a.id === oldActivityId) || null;
    setSelectedActivity(updatedAct);
  };

  // Add AI Prompt refinement
  const handleAddAiPrompt = (promptText: string) => {
    const newActivity: ActivityBlock = {
      id: `act-ai-${Date.now()}`,
      dayId: 'day-2',
      title: 'Family Tea Break & Prayer Rest',
      time: '14:30',
      duration: '45m duration',
      type: 'cafe',
      location: 'Sannenzaka Traditional Teahouse',
      description: `Auto-recommended by AI based on "${promptText}": Wheelchair/stroller accessible with tatami seating and ablution facility.`,
      tags: ['Halal Cafe', 'Family Friendly', 'Ablution Spot'],
      halalBadge: 'Halal Certified Snacks',
      votes: {
        count: 2,
        voters: ['AI Copilot', currentUser.name],
        userVoted: true,
      },
    };

    const updatedItinerary = {
      ...itinerary,
      activityBlocks: [...itinerary.activityBlocks, newActivity],
    };

    handleUpdateItinerary(
      updatedItinerary,
      `AI Copilot applied schedule refinement: "${promptText}"`
    );
  };

  // Add custom activity
  const handleAddActivity = (newActData: Omit<ActivityBlock, 'id'>) => {
    const newActivity: ActivityBlock = {
      ...newActData,
      id: `act-custom-${Date.now()}`,
    };

    const updatedItinerary = {
      ...itinerary,
      activityBlocks: [...itinerary.activityBlocks, newActivity],
    };

    handleUpdateItinerary(
      updatedItinerary,
      `${currentUser.name} added "${newActivity.title}"`
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-neutral-900 font-['Plus_Jakarta_Sans'] selection:bg-[#00685F]/20 selection:text-[#00685F]">
      {/* 1. Canvas Screen (Full-Screen Dedicated Workspace) */}
      {currentScreen === 'canvas' ? (
        <CanvasScreen
          itinerary={itinerary}
          currentUser={currentUser}
          collaborators={collaborators}
          onSelectUser={handleSelectUser}
          onUpdateItinerary={handleUpdateItinerary}
          onOpenRefinementModal={(activity) => setSelectedActivity(activity)}
          onOpenAddModal={(dayId) => {
            setActiveDayForAdd(dayId);
            setIsAddModalOpen(true);
          }}
          onOpenVault={() => setCurrentScreen('vault')}
          onOpenInspiration={() => setCurrentScreen('landing')}
          dateConflictNotice={dateConflictNotice}
          onDismissDateConflict={() => setDateConflictNotice(false)}
          onAddMate={handleAddMate}
          onOpenHalalRadar={handleOpenHalalRadar}
        />
      ) : currentScreen === 'radar' ? (
        <HalalRadarScreen onClose={() => setCurrentScreen(radarReturnScreen)} />
      ) : (
        <>
          {/* Header Bar for Landing, Setup, and Vault */}
          <Navbar
            currentScreen={currentScreen}
            collaborators={collaborators}
            currentUser={currentUser}
            onSelectUser={handleSelectUser}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onNavigateHome={() => setCurrentScreen('landing')}
            onOpenVault={() => setCurrentScreen('vault')}
            onOpenCanvas={() => setCurrentScreen('canvas')}
            onOpenHalalRadar={handleOpenHalalRadar}
            recentAction={recentAction}
          />

          {/* Main Body */}
          <main className="pt-20 pb-16 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto">
            {/* Step 1: Landing Page */}
            {currentScreen === 'landing' && (
              <LandingScreen
                onStartPlanningLead={() => setCurrentScreen('setup')}
                onQuickReelGenerate={handleQuickReelGenerate}
                onOpenWorkspace={() => setCurrentScreen('canvas')}
                onOpenVault={() => setCurrentScreen('vault')}
                onOpenHalalRadar={handleOpenHalalRadar}
                onSelectCommunityPlan={(planId) => {
                  setGeneratingSource('Community Curated Halal Guide');
                  setCurrentScreen('generating');
                }}
              />
            )}

            {/* Step 2: Pre-generation Trip Setup Wizard (Destination, Tourism Points, Preferences, Team Lead) */}
            {currentScreen === 'setup' && (
              <TripSetupWizard
                onComplete={handleSetupComplete}
                onCancel={() => setCurrentScreen('landing')}
              />
            )}

            {/* Generating Screen with AI Countdown Animation */}
            {currentScreen === 'generating' && (
              <GeneratingScreen
                sourceText={generatingSource}
                onComplete={handleGeneratingComplete}
                onCancel={() => setCurrentScreen('landing')}
              />
            )}

            {/* Document Vault Screen */}
            {currentScreen === 'vault' && (
              <DocumentVaultScreen
                onNavigateToCanvas={(focusConflict) => {
                  if (focusConflict) {
                    setDateConflictNotice(true);
                  }
                  setCurrentScreen('canvas');
                }}
                onNavigateHome={() => setCurrentScreen('landing')}
              />
            )}
          </main>
        </>
      )}

      {/* Screen 4: Activity Refinement Modal */}
      {selectedActivity && (
        <RefinementModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
          onSwapActivity={handleSwapActivity}
          onAddAiPrompt={handleAddAiPrompt}
        />
      )}

      {/* Google Authentication / User Switcher Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        collaborators={collaborators}
        onSelectUser={handleSelectUser}
        onCustomLogin={handleCustomLogin}
      />

      {/* Add New Activity Modal (For Team Lead) */}
      <AddActivityModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        dayId={activeDayForAdd}
        onAddActivity={handleAddActivity}
      />
    </div>
  );
}
