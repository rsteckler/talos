import { create } from "zustand"

type SlidePanel = "flow" | "tasks" | "history" | null

interface LayoutState {
  slidePanel: SlidePanel
  setSlidePanel: (panel: SlidePanel) => void
  toggleSlidePanel: (panel: "flow" | "tasks" | "history") => void
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  slidePanel: null,
  setSlidePanel: (panel) => set({ slidePanel: panel }),
  toggleSlidePanel: (panel) => {
    const current = get().slidePanel
    set({ slidePanel: current === panel ? null : panel })
  },
}))
