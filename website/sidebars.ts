import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      items: [
        "getting-started/installation",
        "getting-started/configuration",
        "getting-started/first-chat",
      ],
    },
    {
      type: "category",
      label: "User Guide",
      items: [
        "user-guide/chat",
        "user-guide/tasks",
        "user-guide/inbox",
        "user-guide/tools",
        "user-guide/channels",
        "user-guide/settings",
      ],
    },
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/google-workspace-setup",
        "guides/google-maps-setup",
        "guides/telegram-setup",
      ],
    },
    {
      type: "category",
      label: "Tool Development",
      items: [
        "tool-development/overview",
        "tool-development/manifest-schema",
        "tool-development/handler-functions",
        "tool-development/prompt-engineering",
        "tool-development/example-tool",
      ],
    },
    {
      type: "category",
      label: "API Reference",
      items: [
        "api-reference/rest-api",
        "api-reference/websocket-protocol",
      ],
    },
    {
      type: "category",
      label: "Architecture",
      items: [
        "architecture/overview",
        "architecture/agent-core",
        "architecture/database-schema",
        "architecture/logging-system",
      ],
    },
  ],
};

export default sidebars;
