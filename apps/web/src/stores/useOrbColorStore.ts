import { create } from "zustand"

interface OrbColorState {
  primaryColor: string
  secondaryColor: string
  tertiaryColor: string
  setColors: (colors: { primaryColor: string; secondaryColor: string; tertiaryColor: string }) => void
}

export const useOrbColorStore = create<OrbColorState>((set) => ({
  primaryColor: "#888888",
  secondaryColor: "#888888",
  tertiaryColor: "#888888",
  setColors: ({ primaryColor, secondaryColor, tertiaryColor }) => {
    const root = document.documentElement
    root.style.setProperty("--orb-primary", primaryColor)
    root.style.setProperty("--orb-secondary", secondaryColor)
    root.style.setProperty("--orb-tertiary", tertiaryColor)
    set({ primaryColor, secondaryColor, tertiaryColor })
  },
}))
