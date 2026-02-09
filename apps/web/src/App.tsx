import { useEffect } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SettingsProvider } from "@/contexts/SettingsContext"
import { OrbProvider } from "@/contexts/OrbContext"
import { AppLayout } from "@/components/layout/AppLayout"
import { SettingsPage } from "@/pages/SettingsPage"
import { LogsPage } from "@/pages/LogsPage"
import { useWebSocket } from "@/hooks/useWebSocket"
import { useInboxStore, useProviderStore, useChatStore } from "@/stores"
import { mockInboxItems } from "@/lib/mockData"

function AppContent() {
  const setItems = useInboxStore((s) => s.setItems)
  const fetchActiveModel = useProviderStore((s) => s.fetchActiveModel)
  const fetchConversations = useChatStore((s) => s.fetchConversations)

  useEffect(() => {
    setItems(mockInboxItems)
    fetchActiveModel()
    fetchConversations()
  }, [setItems, fetchActiveModel, fetchConversations])

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
      <Route path="/logs" element={<LogsPage />} />
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
