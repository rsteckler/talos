import { useEffect, useCallback } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LogToolbar } from "./LogToolbar"
import { LogTable } from "./LogTable"
import { useLogStore } from "@/stores"
import { useConnectionStore } from "@/stores"

export function LogViewer() {
  const fetchLogs = useLogStore((s) => s.fetchLogs)
  const streaming = useLogStore((s) => s.streaming)
  const setStreaming = useLogStore((s) => s.setStreaming)
  const setFilter = useLogStore((s) => s.setFilter)
  const filters = useLogStore((s) => s.filters)

  const sendFn = useConnectionStore((s) => s.sendFn)

  // Subscribe/unsubscribe to WS logs when streaming toggles
  useEffect(() => {
    if (streaming && sendFn) {
      sendFn({ type: "subscribe_logs" })
    }
    return () => {
      if (sendFn) {
        sendFn({ type: "unsubscribe_logs" })
      }
    }
  }, [streaming, sendFn])

  // Fetch historical logs on mount and when filters change (only when not streaming)
  useEffect(() => {
    if (!streaming) {
      fetchLogs()
    }
  }, [fetchLogs, streaming, filters])

  const handleTabChange = useCallback((value: string) => {
    if (value === "user") {
      setFilter({ axis: "user" })
    } else if (value === "dev") {
      setFilter({ axis: "dev" })
    } else {
      setFilter({ axis: undefined })
    }
  }, [setFilter])

  const currentTab = filters.axis ?? "combined"

  return (
    <div className="space-y-4">
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="combined">Combined</TabsTrigger>
            <TabsTrigger value="user">User</TabsTrigger>
            <TabsTrigger value="dev">Dev</TabsTrigger>
          </TabsList>
          <LogToolbar
            streaming={streaming}
            onToggleStreaming={() => setStreaming(!streaming)}
          />
        </div>

        <TabsContent value="combined" className="mt-4">
          <LogTableContainer />
        </TabsContent>
        <TabsContent value="user" className="mt-4">
          <LogTableContainer />
        </TabsContent>
        <TabsContent value="dev" className="mt-4">
          <LogTableContainer />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function LogTableContainer() {
  const entries = useLogStore((s) => s.entries)
  const loading = useLogStore((s) => s.loading)
  const total = useLogStore((s) => s.total)
  const page = useLogStore((s) => s.page)
  const fetchLogs = useLogStore((s) => s.fetchLogs)
  const streaming = useLogStore((s) => s.streaming)

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-2">
      <ScrollArea className="h-[500px] rounded-md border">
        <LogTable entries={entries} loading={loading} />
      </ScrollArea>
      {!streaming && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} total log entries</span>
          <div className="flex gap-2">
            <button
              className="underline disabled:no-underline disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1)}
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              className="underline disabled:no-underline disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => fetchLogs(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
