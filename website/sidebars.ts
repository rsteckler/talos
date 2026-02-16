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
        "user-guide/plugins",
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
      label: "Plugin Development",
      items: [
        "plugin-development/overview",
        "plugin-development/manifest-schema",
        "plugin-development/handler-functions",
        "plugin-development/prompt-engineering",
        "plugin-development/example-tool",
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
