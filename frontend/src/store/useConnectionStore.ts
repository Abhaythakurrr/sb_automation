/**
 * Global connection store — shared across all automations.
 * Token is sent ONCE to the backend during connect.
 * After that, only a session ID is used — token never stored in browser memory.
 */
import { create } from 'zustand';
import { ApiClient } from '@/services/api';

// Singleton API client — one instance for the whole app
export const globalApi = new ApiClient();

interface ConnectionState {
  // Only the session ID is stored — never the raw token
  sessionId:   string;
  connected:   boolean;
  connecting:  boolean;
  connError:   string;
  environment: string;
  baseUrlHint: string; // display only — just the hostname, not the full URL with token

  setSessionId:   (id: string)    => void;
  setConnected:   (v: boolean)    => void;
  setConnecting:  (v: boolean)    => void;
  setConnError:   (e: string)     => void;
  setEnvironment: (e: string)     => void;
  setBaseUrlHint: (h: string)     => void;
  disconnect:     () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  sessionId:   '',
  connected:   false,
  connecting:  false,
  connError:   '',
  environment: 'Production',
  baseUrlHint: '',

  setSessionId:   (id)  => set({ sessionId: id }),
  setConnected:   (v)   => set({ connected: v }),
  setConnecting:  (v)   => set({ connecting: v }),
  setConnError:   (e)   => set({ connError: e }),
  setEnvironment: (e)   => set({ environment: e }),
  setBaseUrlHint: (h)   => set({ baseUrlHint: h }),

  disconnect: () => {
    globalApi.disconnect().catch(() => {});
    set({ connected: false, sessionId: '', connError: '', baseUrlHint: '' });
  },
}));

// Listen for session expiry events from the API client
if (typeof window !== 'undefined') {
  window.addEventListener('session-expired', () => {
    useConnectionStore.getState().disconnect();
  });
}
