import { useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { LogConfigPanel } from "@/components/logs/LogConfigPanel"
import { useLogStore } from "@/stores"

interface ChatLogFilterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChatLogFilterDialog({ open, onOpenChange }: ChatLogFilterDialogProps) {
  const fetchConfigs = useLogStore((s) => s.fetchConfigs)
  const fetchAreas = useLogStore((s) => s.fetchAreas)

  useEffect(() => {
    if (open) {
      fetchConfigs()
      fetchAreas()
    }
  }, [open, fetchConfigs, fetchAreas])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Chat Log Filters</DialogTitle>
          <DialogDescription>
            Control which log levels appear inline in the chat.
          </DialogDescription>
        </DialogHeader>
        <LogConfigPanel />
      </DialogContent>
    </Dialog>
  )
}
