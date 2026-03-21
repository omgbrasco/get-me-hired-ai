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

Production-style start:

```bash
npm start
```

Local development with file watching:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Local Data Storage

- Saved profiles: `data/profiles.json`
- Legacy prototype data: `data/submissions.json`
- Uploaded resumes: `data/uploads/`

## Deployment Notes

This app is ready for basic Node hosting on services like Render:

- Build command: none required
- Start command: `npm start`
- Runtime: Node
- Required env vars: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, optional `ADZUNA_COUNTRY`, optional `PORT`

For production hosting, use persistent disk or replace local JSON/file storage with hosted storage.

## Current Roadmap

- Add recurring profile rescans using the saved `alertSchedule` metadata
- Add outbound email delivery for recurring job alerts
- Add better resume parsing for PDF and DOCX uploads
- Add public account access to saved profiles and search history
- Add hosted storage instead of local JSON/files

