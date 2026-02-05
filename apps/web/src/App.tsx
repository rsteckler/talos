import { BrowserRouter, Routes, Route } from "react-router-dom"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SettingsProvider } from "@/contexts/SettingsContext"
import { AppLayout } from "@/components/layout/AppLayout"
import { SettingsPage } from "@/pages/SettingsPage"

function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <SidebarProvider>
                <AppLayout />
              </SidebarProvider>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  )
}

export default App
