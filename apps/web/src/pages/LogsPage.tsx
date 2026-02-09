import { useEffect } from "react"
import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LogViewer } from "@/components/logs/LogViewer"
import { LogConfigPanel } from "@/components/logs/LogConfigPanel"
import { LogSettingsPanel } from "@/components/logs/LogSettingsPanel"
import { useLogStore } from "@/stores"

export function LogsPage() {
  const fetchConfigs = useLogStore((s) => s.fetchConfigs)
  const fetchSettings = useLogStore((s) => s.fetchSettings)
  const fetchAreas = useLogStore((s) => s.fetchAreas)

  useEffect(() => {
    fetchConfigs()
    fetchSettings()
    fetchAreas()
  }, [fetchConfigs, fetchSettings, fetchAreas])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              <span className="sr-only">Back to chat</span>
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Logs</h1>
        </div>
      </header>
      <main className="container max-w-5xl px-4 py-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Log Viewer</CardTitle>
              <CardDescription>
                View real-time and historical logs from Talos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogViewer />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log Configuration</CardTitle>
              <CardDescription>
                Set verbosity levels per logging area.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogConfigPanel />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log Settings</CardTitle>
              <CardDescription>
                Configure log retention and maintenance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogSettingsPanel />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
