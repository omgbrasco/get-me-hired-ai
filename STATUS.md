# Get Me Hired AI — Status

## What Was Broken

### 1. Blank white page on mobile (tunnel)
`public/styles.css` was missing `-webkit-backdrop-filter` on `.card` and `.modal-overlay`.
iOS Safari requires the prefixed property to establish compositing layers for semi-transparent
backgrounds. Without it, the card rendered invisibly against the page background on iPhone.

### 2. Script crash on mobile via tunnel
`public/app.js` called `window.localStorage.getItem()` at the top level without try/catch.
iOS Safari with "Prevent Cross-Site Tracking" enabled throws a `SecurityError` when localStorage
is accessed in a third-party context (e.g. localtunnel domain). The crash prevented the form
submit handler from ever being registered.

---

## What Was Changed

| File | Change |
|---|---|
| `public/styles.css` | Added `-webkit-backdrop-filter: blur(8px)` to `.modal-overlay` and `-webkit-backdrop-filter: blur(14px)` to `.card` |
| `public/app.js` | Wrapped both `localStorage.getItem` and `localStorage.setItem` calls in try/catch |
| `public/search.html` | New lightweight job search page (title + location → live Adzuna results) |
| `public/pricing.html` | New pricing page with Free / Pro / Premium tiers |
| `public/waitlist.html` | New waitlist signup page for Pro and Premium (pre-fills tier from URL param) |
| `server.js` | Added `/api/search` with rate limiting, `/api/waitlist` POST endpoint |
| `src/services/jobSearch.js` | Added `searchJobsQuick` (no resume required), `formatSalary` for Adzuna salary fields |

---

## How to Run

```
cd ~/Desktop/get-me-hired-ai
node server.js
```

Server starts on `http://localhost:3000`.

For remote phone access via tunnel:
```
npx localtunnel --port 3000
```

Open the printed URL on your phone. Tap through the tunnel confirmation page.

---

## What Still Needs Work

- **Email delivery** — daily job alert emails are not implemented yet
- **Resume tailoring / cover letters** — Pro tier features are UI only
- **Auto-apply** — Premium tier is UI only, no automation backend
- **Waitlist notifications** — entries save to `data/waitlist.json` but no email is sent
- **Auth / accounts** — no login system; profiles are anonymous local JSON
- **Payment integration** — pricing page is display only, no Stripe or equivalent
- **Production hosting** — currently localhost only; no deployment config
