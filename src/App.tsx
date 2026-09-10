import React, { useState, useEffect, useCallback } from 'react';
import {
  Itinerary,
  Collaborator,
  ActivityBlock,
  HalalFallbackOption,
} from './types';
import {
  INITIAL_ITINERARY,
  INITIAL_COLLABORATORS,
} from './data/mockData';
import { multiplayerSync } from './services/multiplayerSync';
import { testConnection } from './firebase/config';
import { Navbar } from './components/Navbar';
import { PlanTripCard } from './components/PlanTripCard';
import { PasteInspirationView } from './components/PasteInspirationView';
import { GeneratingScreen } from './components/GeneratingScreen';
import { DocumentVaultScreen } from './components/DocumentVaultScreen';
import { CanvasScreen } from './components/CanvasScreen';
import { RefinementModal } from './components/RefinementModal';
import { AuthModal } from './components/AuthModal';
import { AddActivityModal } from './components/AddActivityModal';

export default function App() {
  // Application State & Flow per user mandate:
  // State variable: step ('planTrip' | 'pasteInspiration' | 'generating')
  const [step, setStep] = useState<'planTrip' | 'pasteInspiration' | 'generating'>('planTrip');
  const [currentScreen, setCurrentScreen] = useState<'landing' | 'vault' | 'canvas'>('landing');

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
    'https://instagram.com/reel/C8k9xM2... (Kyoto Halal Guide)'
  );

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

  // Trigger AI generation from Reel URL (transitions step to 'generating')
  const handleGenerateFromReel = (url: string) => {
    setGeneratingSource(url);
    setStep('generating');
  };

  // Start planning from Wanderlog-style card (transitions step to 'generating' or directly prepares canvas)
  const handleStartPlanning = (tripDetails: {
    destination: string;
    startDate: string;
    endDate: string;
    travelGroup: string;
  }) => {
    setItinerary((prev) => ({
      ...prev,
      title: `${tripDetails.destination} Itinerary 🧭`,
      subtitle: `${tripDetails.travelGroup} · Halal Dining & Prayer Synchronized`,
      dateRange: `${tripDetails.startDate} - ${tripDetails.endDate}`,
    }));
    setGeneratingSource(`${tripDetails.destination} (${tripDetails.startDate} - ${tripDetails.endDate})`);
    setStep('generating');
  };

  // Complete 3-second generation and open Canvas workspace
  const handleGeneratingComplete = () => {
    setStep('pasteInspiration');
    setCurrentScreen('canvas');
  };

  // Cancel generation flow
  const handleCancelGenerating = () => {
    setStep('pasteInspiration');
  };

  const handleSelectCommunityPlan = (planId: string) => {
    setGeneratingSource('Community Curated Halal Guide');
    setStep('generating');
  };

  // Swap activity in Refinement Modal (Screen 4)
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
          warning: undefined, // Clears the closing soon warning
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

  // Switch or add Google user
  const handleSelectUser = (user: Collaborator) => {
    setCurrentUser(user);
    multiplayerSync.broadcastPresence(user, 'Switched active collaborator view');
  };

  const handleCustomLogin = (name: string, email: string) => {
    const newUser: Collaborator = {
      id: `user-${Date.now()}`,
      name,
      role: 'Family Member',
      avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80`,
      status: 'active',
      action: 'Viewing canvas',
    };
    setCollaborators((prev) => [...prev, newUser]);
    setCurrentUser(newUser);
    multiplayerSync.broadcastPresence(newUser, 'Joined the family itinerary canvas');
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-neutral-900 font-['Plus_Jakarta_Sans'] selection:bg-[#0D6955]/20 selection:text-[#0D6955]">
      {/* For Workspace Canvas: Render Dedicated Full-Screen Canvas with Top Nav & Left Sidebar */}
      {currentScreen === 'canvas' ? (
        <CanvasScreen
          itinerary={itinerary}
          currentUser={currentUser}
          onUpdateItinerary={handleUpdateItinerary}
          onOpenRefinementModal={(activity) => setSelectedActivity(activity)}
          onOpenAddModal={(dayId) => {
            setActiveDayForAdd(dayId);
            setIsAddModalOpen(true);
          }}
          onOpenVault={() => setCurrentScreen('vault')}
          onOpenInspiration={() => {
            setCurrentScreen('landing');
            setStep('pasteInspiration');
          }}
          dateConflictNotice={dateConflictNotice}
          onDismissDateConflict={() => setDateConflictNotice(false)}
        />
      ) : (
        <>
          {/* Header Bar matching Safar OS Design System for Landing and Vault */}
          <Navbar
            currentScreen={currentScreen}
            step={step}
            collaborators={collaborators}
            currentUser={currentUser}
            onSelectUser={handleSelectUser}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onNavigateHome={() => {
              setCurrentScreen('landing');
              setStep('planTrip');
            }}
            onSelectStep={(targetStep) => {
              setCurrentScreen('landing');
              setStep(targetStep);
            }}
            onOpenVault={() => setCurrentScreen('vault')}
            onOpenCanvas={() => setCurrentScreen('canvas')}
            recentAction={recentAction}
          />

          {/* Main Content Area for Onboarding & Vault */}
          <main className="pt-24 pb-16 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto">
            {/* Landing Flow with step state: 'planTrip' | 'pasteInspiration' | 'generating' */}
            {currentScreen === 'landing' && (
              <div>
                {step === 'planTrip' && (
                  <PlanTripCard
                    onStartPlanning={handleStartPlanning}
                    onSwitchToInspiration={() => setStep('pasteInspiration')}
                  />
                )}

                {step === 'pasteInspiration' && (
                  <PasteInspirationView
                    onGenerate={handleGenerateFromReel}
                    onSwitchToPlanTrip={() => setStep('planTrip')}
                    onOpenVault={() => setCurrentScreen('vault')}
                    onOpenWorkspace={() => setCurrentScreen('canvas')}
                    onSelectCommunityPlan={handleSelectCommunityPlan}
                  />
                )}

                {step === 'generating' && (
                  <GeneratingScreen
                    sourceText={generatingSource}
                    onComplete={handleGeneratingComplete}
                    onCancel={handleCancelGenerating}
                  />
                )}
              </div>
            )}

            {/* Screen 2.5: The Smart Document Vault (Dedicated Document Verification Screen) */}
            {currentScreen === 'vault' && (
              <DocumentVaultScreen
                onNavigateToCanvas={(focusConflict) => {
                  if (focusConflict) {
                    setDateConflictNotice(true);
                  }
                  setCurrentScreen('canvas');
                }}
                onNavigateHome={() => {
                  setCurrentScreen('landing');
                  setStep('planTrip');
                }}
              />
            )}
          </main>
        </>
      )}

      {/* Screen 4: Activity Refinement & Fallback Modal */}
      {selectedActivity && (
        <RefinementModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
          onSwapActivity={handleSwapActivity}
          onAddAiPrompt={handleAddAiPrompt}
        />
      )}

      {/* Google Authentication & Switcher Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        collaborators={collaborators}
        onSelectUser={handleSelectUser}
        onCustomLogin={handleCustomLogin}
      />

      {/* Add New Activity Modal */}
      <AddActivityModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        dayId={activeDayForAdd}
        onAddActivity={handleAddActivity}
      />
    </div>
  );
}

