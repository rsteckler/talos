import { useEffect, useCallback, useRef } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { LogToolbar } from "./LogToolbar"
import { LogTable } from "./LogTable"
import { useLogStore } from "@/stores"
import { useConnectionStore } from "@/stores"
import { Loader2 } from "lucide-react"

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
  const loadingMore = useLogStore((s) => s.loadingMore)
  const hasMore = useLogStore((s) => s.hasMore)
  const total = useLogStore((s) => s.total)
  const fetchMore = useLogStore((s) => s.fetchMore)
  const streaming = useLogStore((s) => s.streaming)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (streaming || !hasMore) return

    const sentinel = sentinelRef.current
    const scrollRoot = scrollRef.current
    if (!sentinel || !scrollRoot) return

    const observer = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) {
          fetchMore()
        }
      },
      { root: scrollRoot, threshold: 0 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [streaming, hasMore, fetchMore])

  return (
    <div className="space-y-2">
      <div ref={scrollRef} className="h-[500px] overflow-y-auto rounded-md border">
        <LogTable entries={entries} loading={loading} />
        {!streaming && hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {loadingMore && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        )}
      </div>
      {!streaming && total > 0 && (
        <div className="text-sm text-muted-foreground">
          {entries.length} of {total} log entries
        </div>
      )}
    </div>
  )
}
