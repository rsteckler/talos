import { BrowserRouter, Routes, Route } from "react-router-dom"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SettingsProvider } from "@/contexts/SettingsContext"
import { OrbProvider } from "@/contexts/OrbContext"
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
              <OrbProvider>
                <SidebarProvider>
                  <AppLayout />
                </SidebarProvider>
              </OrbProvider>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  )
}

export default App
