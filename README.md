# Get Me Hired AI

Get Me Hired AI is a simple Node/Express MVP that collects a job seeker's profile, stores it locally, fetches real jobs from Adzuna, ranks those jobs by practical fit, and saves recurring alert preferences for future scheduled delivery.

## What It Does

- Collects a candidate profile through a single intake form
- Supports either uploaded resume files or pasted resume text
- Saves reusable profiles locally with stable `profileId` values
- Saves one-time search runs with stable `searchId` values
- Fetches real job listings from Adzuna
- Ranks returned jobs using title fit, location fit, resume overlap, description overlap, and seniority realism
- Saves recurring alert preferences like frequency, remote-only preference, job type, and salary preference
- Shows a clean results page with saved profile details, alert settings, and ranked job matches

## Current Feature List

- One-page intake flow
- Results page with ranked live job matches
- Real Adzuna API integration
- Resume text fallback for more honest scoring
- Local JSON storage for saved profiles
- Local resume upload storage
- Scheduler-ready recurring alert metadata

## MVP Note

This is an MVP package intended to be easy to run locally, easy to understand on GitHub, and easy to deploy to a simple Node host before adding auth, accounts, email delivery, or deeper automation.

## Setup

1. Clone the repository.
2. Open the project directory:

```bash
cd /path/to/get-me-hired-ai
```

3. Install dependencies:

```bash
npm install
```

4. Copy the environment template:

```bash
cp .env.example .env
```

5. Fill in your Adzuna credentials inside `.env`.

## Environment Variables

Create a `.env` file in the project root with:

```bash
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key
ADZUNA_COUNTRY=us
PORT=3000
```

## Run Locally

From the project root:

```bash
npm start
```

You should see startup output like:

```text
[startup] Get Me Hired AI
[startup] ADZUNA_APP_ID exists: yes
[startup] ADZUNA_APP_KEY exists: yes
[startup] ADZUNA_COUNTRY value: us
Get Me Hired AI running at http://localhost:3000
```

Open `http://localhost:3000` in your browser.

Optional development mode with file watching:

```bash
npm run dev
```

## If The App Looks Broken

If the page is blank or stale, restart the server cleanly:

```bash
kill $(lsof -ti tcp:3000) 2>/dev/null; npm start
```

## Local Data Storage

- Saved profiles: `data/profiles.json`
- Legacy prototype data: `data/submissions.json`
- Uploaded resumes: `data/uploads/`

## Deploy

### Recommended host

Use **Render** for this MVP.

This app is **not a good Vercel target in its current form** because it is an Express server that writes uploads and JSON data to the local filesystem. Vercel's serverless runtime is not a good fit for that storage model. Render is a better match because it runs the app as a long-lived Node web service.

### Exact Render steps

1. Push this repo to GitHub.
2. In Render, create a new **Web Service** from the GitHub repo.
3. Render will detect the included [render.yaml](/Users/bscobambam/Desktop/get-me-hired-ai/render.yaml), or you can set the values manually:
   - Runtime: `Node`
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
4. Add these environment variables in Render:

| Variable | Required | Notes |
|---|---|---|
| `ADZUNA_APP_ID` | ✅ Required | Needed for live job search |
| `ADZUNA_APP_KEY` | ✅ Required | Needed for live job search |
| `ADZUNA_COUNTRY` | Optional | Defaults to `us` |
| `AIRTABLE_API_KEY` | Optional | Recommended if you want waitlist entries to persist cleanly |
| `AIRTABLE_BASE_ID` | Optional | Required if using Airtable waitlist storage |
| `AIRTABLE_TABLE_NAME` | Optional | Defaults to `Waitlist` |

Do not set `PORT` manually on Render. Render injects it automatically and the app already reads it from `process.env.PORT`.

### What to expect after deploy

- `/health` should return `{"status":"ok"}`
- `/waitlist.html` should submit successfully
- `/search.html` should either show live results or a clear error message if Adzuna is unavailable

### Storage warning

Without a persistent disk or external database, these local files are ephemeral on Render and can reset on deploy or restart:

- `data/profiles.json`
- `data/waitlist.json`
- `data/uploads/`

For public testing, that is usually fine. For anything beyond that, attach a Render Disk or move profiles/uploads into hosted storage.

## Waitlist Storage (Airtable)

By default, waitlist entries are saved to `data/waitlist.json` locally. For production, the app writes to Airtable instead — no extra npm packages required.

### Setup (takes about 5 minutes)

**1. Create a free Airtable account**

Go to [airtable.com](https://airtable.com) and sign up.

**2. Create a new Base**

Name it anything — e.g. "Get Me Hired AI". Inside it, create a table named `Waitlist` with these fields:

| Field name | Field type |
|---|---|
| Name | Single line text |
| Email | Email |
| Tier | Single line text |
| Note | Long text |
| Submitted At | Single line text |

**3. Get your credentials**

- **API key**: Go to [airtable.com/create/tokens](https://airtable.com/create/tokens) → create a personal access token with `data.records:write` scope for your base.
- **Base ID**: Open your base in the browser — the URL is `https://airtable.com/appXXXXXXXX/...`. The `appXXXXXXXX` part is your Base ID.

**4. Add to your environment**

Locally in `.env`, or in Render under Environment:

```bash
AIRTABLE_API_KEY=your_personal_access_token
AIRTABLE_BASE_ID=appXXXXXXXX
AIRTABLE_TABLE_NAME=Waitlist
```

`AIRTABLE_TABLE_NAME` defaults to `Waitlist` if not set.

**How it works**

If the Airtable env vars are present, entries go to Airtable. If they are not set, the app falls back to local `data/waitlist.json` automatically — so local development works without any setup.

## Current Roadmap

- Add recurring profile rescans using the saved `alertSchedule` metadata
- Add outbound email delivery for recurring job alerts
- Add better resume parsing for PDF and DOCX uploads
- Add public account access to saved profiles and search history
- Add hosted storage instead of local JSON/files
