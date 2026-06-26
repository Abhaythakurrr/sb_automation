/**
 * Global connection store — shared across all automations.
 * Token is sent ONCE to the backend during connect.
 * After that, only a session ID is used — token never stored in browser memory.
 */
import { create } from 'zustand';
import { ApiClient } from '@/services/api';

// Singleton API client — one instance for the whole app
export const globalApi = new ApiClient();

// Session idle timeout: 30 minutes of inactivity (matches backend SESSION_IDLE_MS).
const SESSION_IDLE_MS = 30 * 60 * 1000;

interface ConnectionState {
  sessionId:   string;
  connected:   boolean;
  connecting:  boolean;
  connError:   string;
  environment: string;
  baseUrlHint: string;
  username:    string;
  connectedAt: number | null;
  lastActivity: number | null;

  setSessionId:   (id: string)    => void;
  setConnected:   (v: boolean)    => void;
  setConnecting:  (v: boolean)    => void;
  setConnError:   (e: string)     => void;
  setEnvironment: (e: string)     => void;
  setBaseUrlHint: (h: string)     => void;
  setUsername:    (u: string)     => void;
  recordActivity: () => void;
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
  lastActivity: null,

  setSessionId:   (id)  => set({ sessionId: id }),
  setConnected:   (v)   => set({ connected: v, connectedAt: v ? Date.now() : null, lastActivity: v ? Date.now() : null }),
  setConnecting:  (v)   => set({ connecting: v }),
  setConnError:   (e)   => set({ connError: e }),
  setEnvironment: (e)   => set({ environment: e }),
  setBaseUrlHint: (h)   => set({ baseUrlHint: h }),
  setUsername:    (u)   => set({ username: u }),

  // Called on user interaction and on every API request to slide the idle window.
  recordActivity: () => {
    if (get().connected) set({ lastActivity: Date.now() });
  },

  disconnect: () => {
    globalApi.disconnect().catch(() => {});
    globalApi.clearSession();
    set({ connected: false, sessionId: '', connError: '', baseUrlHint: '', username: '', connectedAt: null, lastActivity: null });
  },

  isSessionValid: () => {
    const { lastActivity } = get();
    if (!lastActivity) return false;
    return Date.now() - lastActivity < SESSION_IDLE_MS;
  },
}));

// ── Idle-timeout + activity wiring (browser only) ──────────────────────────
if (typeof window !== 'undefined') {
  // Backend told us the session is gone — clear local state.
  window.addEventListener('session-expired', () => {
    useConnectionStore.getState().disconnect();
  });

  // API client signals real request activity — slide the idle window.
  window.addEventListener('api-activity', () => {
    useConnectionStore.getState().recordActivity();
  });

  // Track genuine user interaction (throttled to once per 15s to avoid churn).
  let lastRecorded = 0;
  const onUserActivity = () => {
    const now = Date.now();
    if (now - lastRecorded > 15000) {
      lastRecorded = now;
      useConnectionStore.getState().recordActivity();
    }
  };
  ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, onUserActivity, { passive: true });
  });

  // Check every 30s — disconnect after 30 min of no activity.
  setInterval(() => {
    const { connected, isSessionValid, disconnect } = useConnectionStore.getState();
    if (connected && !isSessionValid()) {
      disconnect();
    }
  }, 30000);
}
