import { Itinerary, Collaborator } from '../types';
import { INITIAL_ITINERARY } from '../data/mockData';

const CHANNEL_NAME = 'safar_multiplayer_sync_v1';
const STORAGE_KEY = 'safar_active_itinerary';

class MultiplayerSyncManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(itinerary: Itinerary) => void> = new Set();
  private presenceListeners: Set<(presence: { user: Collaborator; action: string }) => void> = new Set();
  private instanceId: string = Math.random().toString(36).substring(2, 9);

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel not supported or restricted, falling back to storage listener', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed && parsed.senderId !== this.instanceId) {
              this.notifyListeners(parsed.itinerary);
            }
          } catch (err) {
            console.error('Failed to parse storage sync event', err);
          }
        }
      });
    }
  }

  public getSavedItinerary(): Itinerary {
    if (typeof window === 'undefined') return INITIAL_ITINERARY;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.itinerary) {
          return parsed.itinerary;
        }
      }
    } catch (err) {
      console.warn('Failed to load stored itinerary', err);
    }
    return INITIAL_ITINERARY;
  }

  public broadcastUpdate(itinerary: Itinerary, actionDescription?: string) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            senderId: this.instanceId,
            timestamp: Date.now(),
            itinerary,
            actionDescription,
          })
        );
      } catch (err) {
        console.error('Storage write error', err);
      }
    }

    if (this.channel) {
      this.channel.postMessage({
        type: 'ITINERARY_UPDATE',
        senderId: this.instanceId,
        itinerary,
        actionDescription,
      });
    }

    this.notifyListeners(itinerary);
  }

  public broadcastPresence(user: Collaborator, action: string) {
    if (this.channel) {
      this.channel.postMessage({
        type: 'PRESENCE_UPDATE',
        senderId: this.instanceId,
        presence: { user, action },
      });
    }
    this.notifyPresenceListeners({ user, action });
  }

  public subscribe(callback: (itinerary: Itinerary) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public subscribePresence(callback: (presence: { user: Collaborator; action: string }) => void) {
    this.presenceListeners.add(callback);
    return () => {
      this.presenceListeners.delete(callback);
    };
  }

  private handleIncomingMessage(data: any) {
    if (!data || data.senderId === this.instanceId) return;

    if (data.type === 'ITINERARY_UPDATE' && data.itinerary) {
      this.notifyListeners(data.itinerary);
    } else if (data.type === 'PRESENCE_UPDATE' && data.presence) {
      this.notifyPresenceListeners(data.presence);
    }
  }

  private notifyListeners(itinerary: Itinerary) {
    this.listeners.forEach((listener) => {
      try {
        listener(itinerary);
      } catch (err) {
        console.error('Listener callback error', err);
      }
    });
  }

  private notifyPresenceListeners(presence: { user: Collaborator; action: string }) {
    this.presenceListeners.forEach((listener) => {
      try {
        listener(presence);
      } catch (err) {
        console.error('Presence callback error', err);
      }
    });
  }
}

export const multiplayerSync = new MultiplayerSyncManager();
