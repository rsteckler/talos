import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

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
