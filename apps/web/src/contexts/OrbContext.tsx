import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react"
import type { TalosOrbRef } from "@/components/orb/TalosOrb"

interface OrbContextValue {
  orbRef: RefObject<TalosOrbRef | null>
}

const OrbContext = createContext<OrbContextValue | null>(null)

export function OrbProvider({ children }: { children: ReactNode }) {
  const orbRef = useRef<TalosOrbRef | null>(null)

  return (
    <OrbContext.Provider value={{ orbRef }}>
      {children}
    </OrbContext.Provider>
  )
}

export function useOrb() {
  const context = useContext(OrbContext)
  if (!context) {
    throw new Error("useOrb must be used within an OrbProvider")
  }
  return context.orbRef
}
