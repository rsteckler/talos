---
sidebar_position: 2
---

# Google Maps Setup

This guide walks you through getting a Google Maps API key so Talos can search places, get directions, calculate distances, and geocode addresses.

## Prerequisites

- A Google account
- Access to the [Google Cloud Console](https://console.cloud.google.com/)

## Step 1: Create a Google Cloud Project

If you already have a project from the [Google Workspace Setup](./google-workspace-setup), you can reuse it.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top and select **New Project** (or use an existing one)
3. Enter a project name (e.g. "Talos") and click **Create**
4. Make sure your project is selected in the project dropdown

## Step 2: Enable the Required APIs

1. Go to **APIs & Services > Library**
2. Search for and enable each of the following:
   - **Places API**
   - **Directions API**
   - **Distance Matrix API**
   - **Geocoding API**

For each one, click into it and press **Enable**.

:::tip
All four APIs share the same **$200/month free credit** from Google Maps Platform, which covers a generous amount of usage for personal/self-hosted use.
:::

## Step 3: Create an API Key

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > API Key**
3. Your new API key will appear — copy it

### Optional: Restrict the API Key

For better security, restrict the key to only the APIs you need:

1. Click the API key name to edit it
2. Under **API restrictions**, select **Restrict key**
3. Select the 4 APIs you enabled above
4. Click **Save**

## Step 4: Configure in Talos

1. Open Talos and go to **Settings > Tools**
2. Find **Google Maps** and click the gear icon to configure
3. Paste your **Google Maps API Key**
4. Click **Save**
5. Toggle the tool **On**

## Troubleshooting

### "REQUEST_DENIED" errors

Make sure the required APIs are enabled in your Google Cloud project. Go to **APIs & Services > Dashboard** and verify all four APIs show as enabled.

### "OVER_QUERY_LIMIT" errors

You may have exceeded the free tier. Check your usage in **APIs & Services > Dashboard** and consider setting a billing alert.

### API key not working

Ensure your API key does not have overly restrictive application restrictions (e.g. HTTP referrer restrictions will block server-side calls). For Talos, use either no application restriction or an IP restriction matching your server.
