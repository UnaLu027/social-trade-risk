import { create } from 'zustand'

interface AppState {
  activeTicker: string
  setActiveTicker: (t: string) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTicker: 'GME',
  setActiveTicker: (t) => set({ activeTicker: t }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}))
