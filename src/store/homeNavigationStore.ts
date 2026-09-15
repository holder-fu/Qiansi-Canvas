import { create } from 'zustand';

export type HomeSection = 'home' | 'projects';

interface HomeNavigationState {
  section: HomeSection;
  setSection: (section: HomeSection) => void;
}

/**
 * Session-local Home navigation intent. Canvas data remains owned by
 * canvasStore; this small store only lets header actions choose which Home
 * surface should be visible after the asynchronous canvas save completes.
 */
export const useHomeNavigationStore = create<HomeNavigationState>((set) => ({
  section: 'home',
  setSection: (section) => set({ section }),
}));
