/**
 * Workspace Store — manages open automation tabs.
 * All opened automations stay mounted (hidden when inactive) so state is preserved.
 * Users can open multiple automations simultaneously and switch between them freely.
 */
import { create } from 'zustand';

export type AutomationId = 'home' | 'job-creation' | 'agent-control' | 'monitoring' | 'job-deletion';

interface Tab {
  id: AutomationId;
  title: string;
}

interface WorkspaceState {
  activeTab: AutomationId;
  openTabs:  Tab[];

  setActiveTab: (id: AutomationId) => void;
  openTab:      (id: AutomationId, title: string) => void;
  closeTab:     (id: AutomationId) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeTab: 'home',
  openTabs:  [{ id: 'home', title: 'Home' }],

  setActiveTab: (id) => set({ activeTab: id }),

  openTab: (id, title) => {
    const { openTabs } = get();
    // If tab already open, just switch to it
    if (openTabs.find(t => t.id === id)) {
      set({ activeTab: id });
      return;
    }
    // Add new tab and switch to it
    set({
      openTabs:  [...openTabs, { id, title }],
      activeTab: id,
    });
  },

  closeTab: (id) => {
    if (id === 'home') return; // Can't close home
    const { openTabs, activeTab } = get();
    const filtered = openTabs.filter(t => t.id !== id);
    // If closing the active tab, switch to the last remaining tab
    if (activeTab === id) {
      const newActive = filtered[filtered.length - 1]?.id || 'home';
      set({ openTabs: filtered, activeTab: newActive });
    } else {
      set({ openTabs: filtered });
    }
  },
}));
