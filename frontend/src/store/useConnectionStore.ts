/**
 * Global connection store — shared across all automations.
 * Token is sent ONCE to the backend during connect.
 * After that, only a session ID is used — token never stored in browser memory.
 */
import { create } from 'zustand';
import { ApiClient } from '@/services/api';

// Singleton API client — one instance for the whole app
export const globalApi = new ApiClient();

// Session timeout: 8 hours
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

interface ConnectionState {
  sessionId:   string;
  connected:   boolean;
  connecting:  boolean;
  connError:   string;
  environment: string;
  baseUrlHint: string;
  username:    string;
  connectedAt: number | null;

  setSessionId:   (id: string)    => void;
  setConnected:   (v: boolean)    => void;
  setConnecting:  (v: boolean)    => void;
  setConnError:   (e: string)     => void;
  setEnvironment: (e: string)     => void;
  setBaseUrlHint: (h: string)     => void;
  setUsername:    (u: string)     => void;
  disconnect:     () => void;
  isSessionValid: () => boolean;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  sessionId:   '',
  connected:   false,
  connecting:  false,
  connError:   '',
  environment: 'Production',
  baseUrlHint: '',
  username:    '',
  connectedAt: null,

  setSessionId:   (id)  => set({ sessionId: id }),
  setConnected:   (v)   => set({ connected: v, connectedAt: v ? Date.now() : null }),
  setConnecting:  (v)   => set({ connecting: v }),
  setConnError:   (e)   => set({ connError: e }),
  setEnvironment: (e)   => set({ environment: e }),
  setBaseUrlHint: (h)   => set({ baseUrlHint: h }),
  setUsername:    (u)   => set({ username: u }),

  disconnect: () => {
    globalApi.disconnect().catch(() => {});
    set({ connected: false, sessionId: '', connError: '', baseUrlHint: '', username: '', connectedAt: null });
  },

  isSessionValid: () => {
    const { connectedAt } = get();
    if (!connectedAt) return false;
    return Date.now() - connectedAt < SESSION_TIMEOUT_MS;
  },
}));

// Listen for session expiry events from the API client
if (typeof window !== 'undefined') {
  window.addEventListener('session-expired', () => {
    useConnectionStore.getState().disconnect();
  });

  // Check session timeout every minute
  setInterval(() => {
    const { connected, isSessionValid, disconnect } = useConnectionStore.getState();
    if (connected && !isSessionValid()) {
      disconnect();
    }
  }, 60000);
}
