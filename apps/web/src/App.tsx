import { useEffect } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { SettingsProvider } from "@/contexts/SettingsContext"
import { OrbProvider } from "@/contexts/OrbContext"
import { AppLayout } from "@/components/layout/AppLayout"
import { SettingsPage } from "@/pages/SettingsPage"
import { LogsPage } from "@/pages/LogsPage"
import { useWebSocket } from "@/hooks/useWebSocket"
import { useInboxStore, useProviderStore, useChatStore } from "@/stores"

function AppContent() {
  const fetchInbox = useInboxStore((s) => s.fetchInbox)
  const fetchActiveModel = useProviderStore((s) => s.fetchActiveModel)
  const fetchConversations = useChatStore((s) => s.fetchConversations)

  useEffect(() => {
    fetchInbox()
    fetchActiveModel()
    fetchConversations()
  }, [fetchInbox, fetchActiveModel, fetchConversations])

  useWebSocket()

  return (
    <Routes>
      <Route
        path="/"
        element={
          <OrbProvider>
            <AppLayout />
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
