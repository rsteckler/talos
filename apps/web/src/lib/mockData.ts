import type { InboxItem } from "@talos/shared/types"

export const mockInboxItems: InboxItem[] = [
  {
    id: "inbox-1",
    title: "Daily standup summary generated",
    content: "Your standup notes have been compiled and sent to #team-updates.",
    type: "task_result",
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "inbox-2",
    title: "Dependency audit completed",
    content: "3 packages have available updates. No critical vulnerabilities found.",
    type: "task_result",
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "inbox-3",
    title: "Calendar conflict detected",
    content: "You have overlapping meetings tomorrow at 2:00 PM.",
    type: "notification",
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "inbox-4",
    title: "Weekly metrics report",
    content: "Your weekly productivity metrics are ready for review.",
    type: "schedule_result",
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "inbox-5",
    title: "Backup verification passed",
    content: "All scheduled backups completed successfully.",
    type: "schedule_result",
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
]
