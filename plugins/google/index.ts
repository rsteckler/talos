import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

// Logger injected by tool loader at init time
let log: { info(m: string): void; warn(m: string): void; error(m: string): void; debug(m: string): void } = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

export function init(logger: typeof log) {
  log = logger;
}

function makeAuth(config: Record<string, string>): OAuth2Client {
  const clientId = config["client_id"];
  const clientSecret = config["client_secret"];
  const refreshToken = config["refresh_token"];

  if (!refreshToken) {
    throw new Error("Google OAuth not connected. Please connect your Google account in Settings > Tools.");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

// --- Gmail ---

async function gmail_search(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const gmail = google.gmail({ version: "v1", auth });
  const query = args["query"] as string;
  const maxResults = (args["maxResults"] as number | undefined) ?? 10;

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = res.data.messages ?? [];
  if (messages.length === 0) {
    return { results: [], message: "No emails found matching the query." };
  }

  const results = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });
      const headers = detail.data.payload?.headers ?? [];
      const getHeader = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: detail.data.snippet,
        labelIds: detail.data.labelIds,
      };
    })
  );

  return { results };
}

async function gmail_read(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const gmail = google.gmail({ version: "v1", auth });
  const messageId = args["messageId"] as string;

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = res.data.payload?.headers ?? [];
  const getHeader = (name: string) => headers.find((h) => h.name === name)?.value ?? "";

  // Extract body text
  let body = "";
  const payload = res.data.payload;
  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, "base64url").toString("utf-8");
  } else if (payload?.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    } else {
      const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
      if (htmlPart?.body?.data) {
        body = Buffer.from(htmlPart.body.data, "base64url").toString("utf-8");
      }
    }
  }

  return {
    id: res.data.id,
    threadId: res.data.threadId,
    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject"),
    date: getHeader("Date"),
    body,
    labelIds: res.data.labelIds,
  };
}

async function gmail_send(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const gmail = google.gmail({ version: "v1", auth });
  const to = args["to"] as string;
  const subject = args["subject"] as string;
  const body = args["body"] as string;

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return { id: res.data.id, threadId: res.data.threadId, message: "Email sent successfully." };
}

async function gmail_reply(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const gmail = google.gmail({ version: "v1", auth });
  const messageId = args["messageId"] as string;
  const body = args["body"] as string;

  // Get original message for threading info
  const original = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From", "Subject", "Message-ID"],
  });

  const headers = original.data.payload?.headers ?? [];
  const getHeader = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
  const to = getHeader("From");
  const subject = getHeader("Subject").startsWith("Re: ")
    ? getHeader("Subject")
    : `Re: ${getHeader("Subject")}`;
  const inReplyTo = getHeader("Message-ID");

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nIn-Reply-To: ${inReplyTo}\r\nReferences: ${inReplyTo}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: original.data.threadId!,
    },
  });

  return { id: res.data.id, threadId: res.data.threadId, message: "Reply sent successfully." };
}

async function gmail_archive(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const gmail = google.gmail({ version: "v1", auth });
  const messageId = args["messageId"] as string;

  const res = await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });

  const remainingLabels = res.data.labelIds ?? [];
  const archived = !remainingLabels.includes("INBOX");

  return {
    id: res.data.id,
    threadId: res.data.threadId,
    labelIds: remainingLabels,
    archived,
    message: archived ? "Email archived successfully." : "Archive request completed but INBOX label still present.",
  };
}

// --- Calendar ---

async function calendar_list_events(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = (args["calendarId"] as string | undefined) ?? "primary";
  const maxResults = (args["maxResults"] as number | undefined) ?? 10;
  const timeMin = (args["timeMin"] as string | undefined) ?? new Date().toISOString();
  const timeMax = args["timeMax"] as string | undefined;

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = (res.data.items ?? []).map((event) => ({
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: event.start?.dateTime ?? event.start?.date,
    end: event.end?.dateTime ?? event.end?.date,
    location: event.location,
    attendees: event.attendees?.map((att) => ({ email: att.email, responseStatus: att.responseStatus })),
    htmlLink: event.htmlLink,
  }));

  return { events };
}

async function calendar_create_event(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = (args["calendarId"] as string | undefined) ?? "primary";
  const summary = args["summary"] as string;
  const description = args["description"] as string | undefined;
  const start = args["start"] as string;
  const end = args["end"] as string;
  const attendees = args["attendees"] as string[] | undefined;

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: attendees?.map((email) => ({ email })),
    },
  });

  return {
    id: res.data.id,
    summary: res.data.summary,
    start: res.data.start?.dateTime,
    end: res.data.end?.dateTime,
    htmlLink: res.data.htmlLink,
    message: "Event created successfully.",
  };
}

// --- Drive ---

async function drive_list(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const drive = google.drive({ version: "v3", auth });
  const query = args["query"] as string | undefined;
  const maxResults = (args["maxResults"] as number | undefined) ?? 10;

  const res = await drive.files.list({
    q: query,
    pageSize: maxResults,
    fields: "files(id, name, mimeType, modifiedTime, size, webViewLink)",
  });

  return { files: res.data.files ?? [] };
}

async function drive_read(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const drive = google.drive({ version: "v3", auth });
  const fileId = args["fileId"] as string;

  // Get file metadata to determine type
  const meta = await drive.files.get({ fileId, fields: "mimeType, name" });
  const mimeType = meta.data.mimeType ?? "";

  // For Google Docs types, export as text
  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export({ fileId, mimeType: "text/plain" });
    return { name: meta.data.name, mimeType, content: res.data };
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await drive.files.export({ fileId, mimeType: "text/csv" });
    return { name: meta.data.name, mimeType, content: res.data };
  }
  if (mimeType === "application/vnd.google-apps.presentation") {
    const res = await drive.files.export({ fileId, mimeType: "text/plain" });
    return { name: meta.data.name, mimeType, content: res.data };
  }

  // For other files, try to download as text
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  return { name: meta.data.name, mimeType, content: res.data };
}

// --- Sheets ---

async function sheets_read(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = args["spreadsheetId"] as string;
  const range = args["range"] as string;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return { range: res.data.range, values: res.data.values ?? [] };
}

async function sheets_write(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = args["spreadsheetId"] as string;
  const range = args["range"] as string;
  const values = args["values"] as string[][];

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return {
    updatedRange: res.data.updatedRange,
    updatedRows: res.data.updatedRows,
    updatedColumns: res.data.updatedColumns,
    updatedCells: res.data.updatedCells,
    message: "Spreadsheet updated successfully.",
  };
}

// --- Docs ---

async function docs_read(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const docs = google.docs({ version: "v1", auth });
  const documentId = args["documentId"] as string;

  const res = await docs.documents.get({ documentId });

  // Extract text from document body
  const content = res.data.body?.content ?? [];
  let text = "";
  for (const element of content) {
    if (element.paragraph) {
      for (const el of element.paragraph.elements ?? []) {
        if (el.textRun?.content) {
          text += el.textRun.content;
        }
      }
    }
  }

  return { documentId, title: res.data.title, text };
}

// --- Slides ---

async function slides_read(args: Record<string, unknown>, config: Record<string, string>): Promise<unknown> {
  const auth = makeAuth(config);
  const slides = google.presentations({ version: "v1", auth });
  const presentationId = args["presentationId"] as string;

  const res = await slides.presentations.get({ presentationId });

  const slideTexts = (res.data.slides ?? []).map((slide: NonNullable<typeof res.data.slides>[number], index: number) => {
    let text = "";
    for (const element of slide.pageElements ?? []) {
      if (element.shape?.text?.textElements) {
        for (const te of element.shape.text.textElements) {
          if (te.textRun?.content) {
            text += te.textRun.content;
          }
        }
      }
    }
    return { slideNumber: index + 1, text: text.trim() };
  });

  return { presentationId, title: res.data.title, slides: slideTexts };
}

export const handlers = {
  gmail_search,
  gmail_read,
  gmail_send,
  gmail_reply,
  gmail_archive,
  calendar_list_events,
  calendar_create_event,
  drive_list,
  drive_read,
  sheets_read,
  sheets_write,
  docs_read,
  slides_read,
};

// --- Trigger handlers ---

interface GmailTriggerState {
  lastHistoryId?: string;
  lastPollTimestamp?: string;
}

interface TriggerPollResult {
  event: { triggerId: string; toolId: string; data?: unknown; summary?: string } | null;
  newState: Record<string, unknown>;
}

const gmail_new_email_handler = {
  async poll(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
  ): Promise<TriggerPollResult> {
    const auth = makeAuth(credentials);
    const gmail = google.gmail({ version: "v1", auth });
    const triggerState = state as GmailTriggerState;

    // First poll: establish baseline historyId, don't fire
    if (!triggerState.lastHistoryId) {
      log.info("Gmail trigger: establishing baseline historyId");
      const profile = await gmail.users.getProfile({ userId: "me" });
      const historyId = profile.data.historyId;
      log.debug(`Gmail trigger: baseline historyId=${historyId}`);
      return {
        event: null,
        newState: {
          lastHistoryId: historyId,
          lastPollTimestamp: new Date().toISOString(),
        },
      };
    }

    log.debug(`Gmail trigger: polling history since ${triggerState.lastHistoryId}`);

    try {
      const historyRes = await gmail.users.history.list({
        userId: "me",
        startHistoryId: triggerState.lastHistoryId,
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
      });

      const history = historyRes.data.history ?? [];
      const newHistoryId = historyRes.data.historyId ?? triggerState.lastHistoryId;

      // Collect new message IDs from messageAdded events
      const newMessageIds: string[] = [];
      for (const entry of history) {
        for (const added of entry.messagesAdded ?? []) {
          if (added.message?.id && added.message.labelIds?.includes("INBOX")) {
            newMessageIds.push(added.message.id);
          }
        }
      }

      if (newMessageIds.length === 0) {
        log.debug("Gmail trigger: no new messages");
        return {
          event: null,
          newState: {
            lastHistoryId: newHistoryId,
            lastPollTimestamp: new Date().toISOString(),
          },
        };
      }

      log.info(`Gmail trigger: ${newMessageIds.length} new message(s) found`);

      // Fetch metadata for up to 10 new messages
      const toFetch = newMessageIds.slice(0, 10);
      const summaryParts: string[] = [];

      for (const msgId of toFetch) {
        try {
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: msgId,
            format: "metadata",
            metadataHeaders: ["From", "Subject"],
          });
          const headers = detail.data.payload?.headers ?? [];
          const from = headers.find((h) => h.name === "From")?.value ?? "Unknown";
          const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
          summaryParts.push(`- From: ${from} | Subject: ${subject}`);
        } catch {
          // Skip messages that can't be fetched (may have been deleted)
        }
      }

      const totalNew = newMessageIds.length;
      const summary = totalNew === 1
        ? `1 new email received:\n${summaryParts.join("\n")}`
        : `${totalNew} new email(s) received:\n${summaryParts.join("\n")}${totalNew > 10 ? `\n...and ${totalNew - 10} more` : ""}`;

      const event = {
        triggerId: "google:gmail_new_email",
        toolId: "google",
        summary,
        data: { messageIds: newMessageIds, count: totalNew },
      };

      return {
        event,
        newState: {
          lastHistoryId: newHistoryId,
          lastPollTimestamp: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      // Handle stale historyId (404) by resetting to current
      const isNotFound = err instanceof Error && "code" in err && (err as { code: number }).code === 404;
      if (isNotFound) {
        log.warn("Gmail trigger: stale historyId (404), resetting baseline");
        const profile = await gmail.users.getProfile({ userId: "me" });
        return {
          event: null,
          newState: {
            lastHistoryId: profile.data.historyId,
            lastPollTimestamp: new Date().toISOString(),
          },
        };
      }
      throw err;
    }
  },
};

// --- Calendar triggers ---

interface CalendarTriggerState {
  lastSyncToken?: string;
  lastPollTimestamp?: string;
  remindedEventIds?: string[];
}

const calendar_reminder_handler = {
  async poll(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
    settings: Record<string, string>,
  ): Promise<TriggerPollResult> {
    const auth = makeAuth(credentials);
    const calendar = google.calendar({ version: "v3", auth });
    const triggerState = state as CalendarTriggerState;
    const reminderMinutes = parseInt(settings["calendar_reminder_minutes"] ?? "15", 10);
    const alreadyReminded = new Set(triggerState.remindedEventIds ?? []);

    const now = new Date();
    const windowEnd = new Date(now.getTime() + reminderMinutes * 60_000);

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: windowEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const upcoming = (res.data.items ?? []).filter(
      (e) => e.id && !alreadyReminded.has(e.id) && e.status !== "cancelled",
    );

    if (upcoming.length === 0) {
      // Prune old reminded IDs (keep only recent ones)
      return {
        event: null,
        newState: {
          ...triggerState,
          remindedEventIds: [...alreadyReminded].slice(-100),
          lastPollTimestamp: now.toISOString(),
        },
      };
    }

    const newRemindedIds = [...alreadyReminded, ...upcoming.map((e) => e.id!)];
    const summaryParts = upcoming.map((e) => {
      const start = e.start?.dateTime ?? e.start?.date ?? "unknown";
      return `- ${e.summary ?? "(no title)"} at ${start}`;
    });

    const summary =
      upcoming.length === 1
        ? `Upcoming event in the next ${reminderMinutes} minutes:\n${summaryParts[0]}`
        : `${upcoming.length} upcoming events in the next ${reminderMinutes} minutes:\n${summaryParts.join("\n")}`;

    return {
      event: {
        triggerId: "google:calendar_reminder",
        toolId: "google",
        summary,
        data: {
          events: upcoming.map((e) => ({
            id: e.id,
            summary: e.summary,
            start: e.start?.dateTime ?? e.start?.date,
            end: e.end?.dateTime ?? e.end?.date,
            location: e.location,
            htmlLink: e.htmlLink,
          })),
        },
      },
      newState: {
        ...triggerState,
        remindedEventIds: newRemindedIds.slice(-100),
        lastPollTimestamp: now.toISOString(),
      },
    };
  },
};

const calendar_event_changed_handler = {
  async poll(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
  ): Promise<TriggerPollResult> {
    const auth = makeAuth(credentials);
    const calendar = google.calendar({ version: "v3", auth });
    const triggerState = state as CalendarTriggerState;

    // First poll: establish sync token baseline
    if (!triggerState.lastSyncToken) {
      log.info("Calendar event_changed trigger: establishing baseline syncToken");
      const res = await calendar.events.list({
        calendarId: "primary",
        maxResults: 1,
        showDeleted: false,
      });
      return {
        event: null,
        newState: {
          lastSyncToken: res.data.nextSyncToken,
          lastPollTimestamp: new Date().toISOString(),
        },
      };
    }

    try {
      const res = await calendar.events.list({
        calendarId: "primary",
        syncToken: triggerState.lastSyncToken,
        showDeleted: false,
      });

      const changed = (res.data.items ?? []).filter((e) => e.status !== "cancelled");
      const newSyncToken = res.data.nextSyncToken ?? triggerState.lastSyncToken;

      if (changed.length === 0) {
        return {
          event: null,
          newState: { lastSyncToken: newSyncToken, lastPollTimestamp: new Date().toISOString() },
        };
      }

      log.info(`Calendar event_changed trigger: ${changed.length} event(s) changed`);

      const summaryParts = changed.slice(0, 10).map((e) => {
        const start = e.start?.dateTime ?? e.start?.date ?? "";
        return `- ${e.summary ?? "(no title)"} (${start})`;
      });
      const summary =
        changed.length === 1
          ? `Calendar event created/updated:\n${summaryParts[0]}`
          : `${changed.length} calendar event(s) created/updated:\n${summaryParts.join("\n")}${changed.length > 10 ? `\n...and ${changed.length - 10} more` : ""}`;

      return {
        event: {
          triggerId: "google:calendar_event_changed",
          toolId: "google",
          summary,
          data: {
            events: changed.map((e) => ({
              id: e.id,
              summary: e.summary,
              start: e.start?.dateTime ?? e.start?.date,
              end: e.end?.dateTime ?? e.end?.date,
              htmlLink: e.htmlLink,
            })),
            count: changed.length,
          },
        },
        newState: { lastSyncToken: newSyncToken, lastPollTimestamp: new Date().toISOString() },
      };
    } catch (err: unknown) {
      // Sync token invalidated (410 Gone) — reset
      const isGone = err instanceof Error && "code" in err && (err as { code: number }).code === 410;
      if (isGone) {
        log.warn("Calendar event_changed trigger: sync token expired (410), resetting");
        const res = await calendar.events.list({
          calendarId: "primary",
          maxResults: 1,
          showDeleted: false,
        });
        return {
          event: null,
          newState: { lastSyncToken: res.data.nextSyncToken, lastPollTimestamp: new Date().toISOString() },
        };
      }
      throw err;
    }
  },
};

const calendar_event_cancelled_handler = {
  async poll(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
  ): Promise<TriggerPollResult> {
    const auth = makeAuth(credentials);
    const calendar = google.calendar({ version: "v3", auth });
    const triggerState = state as CalendarTriggerState;

    // First poll: establish sync token baseline
    if (!triggerState.lastSyncToken) {
      log.info("Calendar event_cancelled trigger: establishing baseline syncToken");
      const res = await calendar.events.list({
        calendarId: "primary",
        maxResults: 1,
        showDeleted: true,
      });
      return {
        event: null,
        newState: {
          lastSyncToken: res.data.nextSyncToken,
          lastPollTimestamp: new Date().toISOString(),
        },
      };
    }

    try {
      const res = await calendar.events.list({
        calendarId: "primary",
        syncToken: triggerState.lastSyncToken,
        showDeleted: true,
      });

      const cancelled = (res.data.items ?? []).filter((e) => e.status === "cancelled");
      const newSyncToken = res.data.nextSyncToken ?? triggerState.lastSyncToken;

      if (cancelled.length === 0) {
        return {
          event: null,
          newState: { lastSyncToken: newSyncToken, lastPollTimestamp: new Date().toISOString() },
        };
      }

      log.info(`Calendar event_cancelled trigger: ${cancelled.length} event(s) cancelled`);

      const summaryParts = cancelled.slice(0, 10).map((e) => `- ${e.summary ?? "(no title)"}`);
      const summary =
        cancelled.length === 1
          ? `Calendar event cancelled:\n${summaryParts[0]}`
          : `${cancelled.length} calendar event(s) cancelled:\n${summaryParts.join("\n")}`;

      return {
        event: {
          triggerId: "google:calendar_event_cancelled",
          toolId: "google",
          summary,
          data: {
            events: cancelled.map((e) => ({
              id: e.id,
              summary: e.summary,
            })),
            count: cancelled.length,
          },
        },
        newState: { lastSyncToken: newSyncToken, lastPollTimestamp: new Date().toISOString() },
      };
    } catch (err: unknown) {
      const isGone = err instanceof Error && "code" in err && (err as { code: number }).code === 410;
      if (isGone) {
        log.warn("Calendar event_cancelled trigger: sync token expired (410), resetting");
        const res = await calendar.events.list({
          calendarId: "primary",
          maxResults: 1,
          showDeleted: true,
        });
        return {
          event: null,
          newState: { lastSyncToken: res.data.nextSyncToken, lastPollTimestamp: new Date().toISOString() },
        };
      }
      throw err;
    }
  },
};

const calendar_invite_handler = {
  async poll(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
  ): Promise<TriggerPollResult> {
    const auth = makeAuth(credentials);
    const calendar = google.calendar({ version: "v3", auth });
    const triggerState = state as { lastPollTimestamp?: string; seenEventIds?: string[] };

    const lastPoll = triggerState.lastPollTimestamp ?? new Date(Date.now() - 300_000).toISOString();
    const seenIds = new Set(triggerState.seenEventIds ?? []);

    // Get the user's email to check attendee status
    const calMeta = await calendar.calendars.get({ calendarId: "primary" });
    const myEmail = calMeta.data.id ?? "";

    const res = await calendar.events.list({
      calendarId: "primary",
      updatedMin: lastPoll,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: new Date().toISOString(),
      showDeleted: false,
    });

    const invites = (res.data.items ?? []).filter((e) => {
      if (!e.id || seenIds.has(e.id)) return false;
      // Check if I'm an attendee with needsAction status (pending RSVP)
      const me = e.attendees?.find((a) => a.email === myEmail || a.self);
      return me?.responseStatus === "needsAction";
    });

    const now = new Date().toISOString();
    const newSeenIds = [...seenIds, ...invites.map((e) => e.id!)].slice(-200);

    if (invites.length === 0) {
      return {
        event: null,
        newState: { lastPollTimestamp: now, seenEventIds: newSeenIds },
      };
    }

    log.info(`Calendar invite trigger: ${invites.length} new invitation(s)`);

    const summaryParts = invites.slice(0, 10).map((e) => {
      const start = e.start?.dateTime ?? e.start?.date ?? "";
      const organizer = e.organizer?.displayName ?? e.organizer?.email ?? "unknown";
      return `- ${e.summary ?? "(no title)"} at ${start} (from ${organizer})`;
    });
    const summary =
      invites.length === 1
        ? `New calendar invitation:\n${summaryParts[0]}`
        : `${invites.length} new calendar invitation(s):\n${summaryParts.join("\n")}`;

    return {
      event: {
        triggerId: "google:calendar_invite",
        toolId: "google",
        summary,
        data: {
          events: invites.map((e) => ({
            id: e.id,
            summary: e.summary,
            start: e.start?.dateTime ?? e.start?.date,
            end: e.end?.dateTime ?? e.end?.date,
            organizer: e.organizer?.displayName ?? e.organizer?.email,
            location: e.location,
            htmlLink: e.htmlLink,
          })),
          count: invites.length,
        },
      },
      newState: { lastPollTimestamp: now, seenEventIds: newSeenIds },
    };
  },
};

// --- Drive triggers ---

interface DriveTriggerState {
  startPageToken?: string;
  lastPollTimestamp?: string;
}

const drive_file_shared_handler = {
  async poll(
    credentials: Record<string, string>,
    state: Record<string, unknown>,
  ): Promise<TriggerPollResult> {
    const auth = makeAuth(credentials);
    const drive = google.drive({ version: "v3", auth });
    const triggerState = state as DriveTriggerState;

    // First poll: establish baseline page token
    if (!triggerState.startPageToken) {
      log.info("Drive file_shared trigger: establishing baseline startPageToken");
      const res = await drive.changes.getStartPageToken();
      return {
        event: null,
        newState: {
          startPageToken: res.data.startPageToken,
          lastPollTimestamp: new Date().toISOString(),
        },
      };
    }

    const res = await drive.changes.list({
      pageToken: triggerState.startPageToken,
      fields: "newStartPageToken, changes(fileId, file(id, name, mimeType, sharingUser, sharedWithMeTime, webViewLink, owners))",
      includeItemsFromAllDrives: false,
      spaces: "drive",
    });

    const newPageToken = res.data.newStartPageToken ?? triggerState.startPageToken;

    // Filter to files that were shared with me (have sharedWithMeTime set)
    const sharedFiles = (res.data.changes ?? []).filter((c) => {
      const file = c.file;
      return file?.sharedWithMeTime && file.sharingUser;
    });

    if (sharedFiles.length === 0) {
      return {
        event: null,
        newState: { startPageToken: newPageToken, lastPollTimestamp: new Date().toISOString() },
      };
    }

    log.info(`Drive file_shared trigger: ${sharedFiles.length} newly shared file(s)`);

    const summaryParts = sharedFiles.slice(0, 10).map((c) => {
      const f = c.file!;
      const sharer = f.sharingUser?.displayName ?? f.sharingUser?.emailAddress ?? "someone";
      return `- "${f.name}" shared by ${sharer}`;
    });
    const summary =
      sharedFiles.length === 1
        ? `File shared with you:\n${summaryParts[0]}`
        : `${sharedFiles.length} file(s) shared with you:\n${summaryParts.join("\n")}${sharedFiles.length > 10 ? `\n...and ${sharedFiles.length - 10} more` : ""}`;

    return {
      event: {
        triggerId: "google:drive_file_shared",
        toolId: "google",
        summary,
        data: {
          files: sharedFiles.map((c) => ({
            id: c.file?.id,
            name: c.file?.name,
            mimeType: c.file?.mimeType,
            sharingUser: c.file?.sharingUser?.displayName ?? c.file?.sharingUser?.emailAddress,
            webViewLink: c.file?.webViewLink,
          })),
          count: sharedFiles.length,
        },
      },
      newState: { startPageToken: newPageToken, lastPollTimestamp: new Date().toISOString() },
    };
  },
};

export const triggers = {
  gmail_new_email: gmail_new_email_handler,
  calendar_reminder: calendar_reminder_handler,
  calendar_event_changed: calendar_event_changed_handler,
  calendar_event_cancelled: calendar_event_cancelled_handler,
  calendar_invite: calendar_invite_handler,
  drive_file_shared: drive_file_shared_handler,
};
