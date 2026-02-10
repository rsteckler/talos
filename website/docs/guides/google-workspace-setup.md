---
sidebar_position: 1
---

# Google Workspace Setup

This guide walks you through creating Google Cloud OAuth credentials so Talos can access Gmail, Calendar, Drive, Sheets, Docs, and Slides on your behalf.

## Prerequisites

- A Google account
- Access to the [Google Cloud Console](https://console.cloud.google.com/)

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top of the page and select **New Project**
3. Enter a project name (e.g. "Talos") and click **Create**
4. Make sure your new project is selected in the project dropdown

## Step 2: Enable the Required APIs

Enable each of these APIs for your project:

1. Go to **APIs & Services → Library**
2. Search for and enable each of the following:
   - **Gmail API**
   - **Google Calendar API**
   - **Google Drive API**
   - **Google Sheets API**
   - **Google Docs API**
   - **Google Slides API**

For each one, click into it and press **Enable**.

## Step 3: Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** user type and click **Create**
3. Fill in the required fields:
   - **App name:** Talos (or any name you prefer)
   - **User support email:** your email address
   - **Developer contact email:** your email address
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/presentations`
6. Click **Update** then **Save and Continue**
7. On the **Test users** page, click **Add Users** and add your own Google email address
8. Click **Save and Continue**, then **Back to Dashboard**

:::info
Your app will be in **Testing** mode, which means only the test users you added can authorize. This is fine for self-hosted use. The trade-off is that refresh tokens expire every **7 days** — Talos will send you an inbox reminder before expiry so you can reconnect.
:::

## Step 4: Create OAuth Client Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Select **Web application** as the application type
4. Set the name to "Talos" (or any name)
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3001/api/oauth/google/callback
   ```
   If you run Talos on a different host or port, adjust accordingly.
6. Click **Create**
7. Copy the **Client ID** and **Client Secret** — you'll need these in the next step

## Step 5: Configure in Talos

1. Open Talos and go to **Settings → Tools**
2. Find **Google Workspace** and click the gear icon to configure
3. Paste your **OAuth Client ID** and **OAuth Client Secret**
4. Click **Save**
5. Click the **Connect Google** button that appears
6. A popup will open asking you to sign in with Google and grant permissions
7. After authorizing, the popup will close and you'll see a **Connected** status

## Reconnecting

Since Google Cloud Testing mode tokens expire every 7 days, Talos creates a scheduled reminder that sends an inbox notification ~24 hours before expiry. When you receive it:

1. Go to **Settings → Tools → Google Workspace**
2. Click **Disconnect**, then **Connect Google** again
3. Re-authorize in the popup

## Troubleshooting

### "Access blocked" error
Make sure your Google email is listed as a test user in the OAuth consent screen settings.

### "redirect_uri_mismatch" error
The redirect URI in Google Cloud must exactly match your Talos server URL. Check that the protocol (`http` vs `https`), host, and port are correct.

### Token expired / tools not working
Click **Disconnect** and then **Connect Google** to get fresh tokens.
