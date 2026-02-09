import { useEffect } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SettingsProvider } from "@/contexts/SettingsContext"
import { OrbProvider } from "@/contexts/OrbContext"
import { AppLayout } from "@/components/layout/AppLayout"
import { SettingsPage } from "@/pages/SettingsPage"
import { useWebSocket } from "@/hooks/useWebSocket"
import { useInboxStore, useProviderStore } from "@/stores"
import { mockInboxItems } from "@/lib/mockData"

function AppContent() {
  const setItems = useInboxStore((s) => s.setItems)
  const fetchActiveModel = useProviderStore((s) => s.fetchActiveModel)

  useEffect(() => {
    setItems(mockInboxItems)
    fetchActiveModel()
  }, [setItems, fetchActiveModel])

  useWebSocket()

  return (
    <Routes>
      <Route
        path="/"
        element={
          <OrbProvider>
            <SidebarProvider>
              <AppLayout />
            </SidebarProvider>
          </OrbProvider>
        }
      />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )
}

function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </SettingsProvider>
  )
}

export default App
