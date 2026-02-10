import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from "react"
import type { ThemeFile } from "@talos/shared/types"
import { themesApi } from "@/api/themes"
import { applyCustomTheme, clearCustomTheme, applyAccentColor, clearAccentColor } from "@/lib/theme-applier"

export type Theme = "light" | "dark" | "system"

export interface Settings {
  theme: Theme
  showLogsInChat: boolean
  accentColor: string | null
  customTheme: string | null
}

const defaultSettings: Settings = {
  theme: "system",
  showLogsInChat: false,
  accentColor: null,
  customTheme: null,
}

interface SettingsContextValue {
  settings: Settings
  updateSettings: (updates: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

const STORAGE_KEY = "talos-settings"

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) }
    }
  } catch {
    // Ignore parse errors
  }
  return defaultSettings
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function isDarkMode(theme: Theme): boolean {
  if (theme === "dark") return true
  if (theme === "light") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyDarkClass(dark: boolean): void {
  if (dark) {
    document.documentElement.classList.add("dark")
  } else {
    document.documentElement.classList.remove("dark")
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [themeData, setThemeData] = useState<ThemeFile | null>(null)
  const fetchedThemeId = useRef<string | null>(null)

  // Fetch theme data when customTheme changes
  useEffect(() => {
    if (!settings.customTheme) {
      setThemeData(null)
      fetchedThemeId.current = null
      return
    }

    if (fetchedThemeId.current === settings.customTheme) return

    themesApi.get(settings.customTheme).then((data) => {
      fetchedThemeId.current = data.id
      setThemeData(data)
    }).catch(() => {
      // Theme not found, clear selection
      setThemeData(null)
      fetchedThemeId.current = null
    })
  }, [settings.customTheme])

  // Apply appearance whenever mode, theme data, or accent changes
  useEffect(() => {
    const dark = isDarkMode(settings.theme)
    applyDarkClass(dark)

    // Clear both first to avoid stale vars
    clearCustomTheme()
    clearAccentColor()

    if (themeData) {
      applyCustomTheme(themeData, dark)
    } else if (settings.accentColor) {
      applyAccentColor(settings.accentColor, dark)
    }
  }, [settings.theme, settings.accentColor, themeData])

  // Listen for system theme changes
  useEffect(() => {
    if (settings.theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      const dark = mediaQuery.matches
      applyDarkClass(dark)

      clearCustomTheme()
      clearAccentColor()

      if (themeData) {
        applyCustomTheme(themeData, dark)
      } else if (settings.accentColor) {
        applyAccentColor(settings.accentColor, dark)
      }
    }
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [settings.theme, settings.accentColor, themeData])

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates }
      saveSettings(next)
      return next
    })
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return context
}
