const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.join(__dirname, ".env"),
});

const express = require("express");
const fs = require("fs");
const multer = require("multer");
const { randomUUID } = require("crypto");
const { fetchRankedJobMatches, searchJobsQuick } = require("./src/services/jobSearch");
const { normalizeLocationInput } = require("./src/services/location");
const { resolveResumeInput } = require("./src/services/resumeText");
const { normalizeDesiredJobTitles } = require("./src/services/jobTitleTags");

const app = express();
const port = process.env.PORT || 3000;
const isVercel = process.env.VERCEL === "1";

// Simple in-memory rate limiter for /api/search
// 20 requests per IP per 60 seconds, no external dependency required
const searchRateLimit = (() => {
  const store = new Map();
  const WINDOW_MS = 60 * 1000;
  const MAX_REQUESTS = 20;

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    if (entry.count >= MAX_REQUESTS) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please wait a moment and try again.",
      });
    }

    entry.count += 1;
    return next();
  };
})();

const runtimeDataRoot = isVercel ? path.join("/tmp", "get-me-hired-ai") : __dirname;
const dataDir = path.join(runtimeDataRoot, "data");
const uploadsDir = path.join(dataDir, "uploads");
const submissionsPath = path.join(dataDir, "submissions.json");
const profilesPath = path.join(dataDir, "profiles.json");
const waitlistPath = path.join(dataDir, "waitlist.json");
const publicDir = path.join(__dirname, "public");

const ALERT_FREQUENCY_DAYS = {
  daily: 1,
  "every-3-days": 3,
  weekly: 7,
};

const ALERT_FREQUENCY_LABELS = {
  daily: "Daily",
  "every-3-days": "Every 3 days",
  weekly: "Weekly",
};

const WORK_PREFERENCE_LABELS = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  remote: "Remote",
  freelance: "Freelance",
};

function logStartupConfig() {
  console.log(`[startup] Get Me Hired AI`);
  console.log(
    `[startup] ADZUNA_APP_ID exists: ${process.env.ADZUNA_APP_ID ? "yes" : "no"}`
  );
  console.log(
    `[startup] ADZUNA_APP_KEY exists: ${process.env.ADZUNA_APP_KEY ? "yes" : "no"}`
  );
  console.log(
    `[startup] ADZUNA_COUNTRY value: ${process.env.ADZUNA_COUNTRY || "us"}`
  );
}

fs.mkdirSync(uploadsDir, { recursive: true });

if (!fs.existsSync(submissionsPath)) {
  fs.writeFileSync(submissionsPath, "[]", "utf8");
}

if (!fs.existsSync(profilesPath)) {
  fs.writeFileSync(profilesPath, "[]", "utf8");
}

if (!fs.existsSync(waitlistPath)) {
  fs.writeFileSync(waitlistPath, "[]", "utf8");
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDir);
  },
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
    callback(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

app.use(express.static(publicDir));

function sendPublicFile(res, fileName) {
  return res.sendFile(path.join(publicDir, fileName), (error) => {
    if (error && !res.headersSent) {
      res.status(error.statusCode || 404).end();
    }
  });
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  res.type("application/json");
  res.set("Cache-Control", "no-store");
  return res.json(payload);
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function readSubmissions() {
  try {
    const submissions = JSON.parse(fs.readFileSync(submissionsPath, "utf8"));
    return Array.isArray(submissions) ? submissions : [];
  } catch (_error) {
    return [];
  }
}

function readProfiles() {
  try {
    const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf8"));
    return Array.isArray(profiles) ? profiles : [];
  } catch (_error) {
    return [];
  }
}

function writeProfiles(profiles) {
  fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2), "utf8");
}

function normalizeAlertSettings(rawSettings) {
  const frequency = ALERT_FREQUENCY_DAYS[rawSettings.frequency]
    ? rawSettings.frequency
    : "daily";
  const workPreferenceInput = Array.isArray(rawSettings.workPreferences)
    ? rawSettings.workPreferences
    : rawSettings.workPreferences
      ? [rawSettings.workPreferences]
      : [];
  const workPreferences = workPreferenceInput.filter(
    (value) => WORK_PREFERENCE_LABELS[value]
  );
  const uniqueWorkPreferences = [...new Set(workPreferences)];
  const workPreferenceLabels = uniqueWorkPreferences.map(
    (value) => WORK_PREFERENCE_LABELS[value]
  );

  return {
    frequency,
    frequencyLabel: ALERT_FREQUENCY_LABELS[frequency],
    workPreferences: uniqueWorkPreferences,
    workPreferenceLabels,
    workPreferencesLabel: workPreferenceLabels.length
      ? workPreferenceLabels.join(", ")
      : "No specific preference saved",
    remoteOnly: uniqueWorkPreferences.includes("remote"),
    salaryPreference: rawSettings.salaryPreference || "",
  };
}

function getNextScanAt(frequency, createdAt) {
  const nextScanDate = new Date(createdAt);
  nextScanDate.setDate(nextScanDate.getDate() + ALERT_FREQUENCY_DAYS[frequency]);
  return nextScanDate.toISOString();
}

function buildSubmissionViewFromProfile(profileRecord, searchRecord) {
  return {
    profileId: profileRecord.profileId,
    submissionId: searchRecord.searchId,
    fullName: profileRecord.profile.fullName,
    email: profileRecord.profile.email,
    desiredJobTitles: profileRecord.profile.desiredJobTitles,
    desiredJobTitleTags: profileRecord.profile.desiredJobTitleTags,
    location: profileRecord.profile.location,
    resumeOriginalName: profileRecord.profile.resume.fileOriginalName,
    resumeStoredName: profileRecord.profile.resume.fileStoredName,
    resumePath: profileRecord.profile.resume.filePath,
    alertSettings: profileRecord.alertSettings,
    jobSearch: searchRecord.results,
    submittedAt: searchRecord.createdAt,
  };
}

function findSubmissionView(submissionId) {
  const profiles = readProfiles();

  for (const profile of profiles) {
    const searchRecord = (profile.searches || []).find(
      (search) => search.searchId === submissionId
    );

    if (searchRecord) {
      return buildSubmissionViewFromProfile(profile, searchRecord);
    }
  }

  const submissions = readSubmissions();
  return submissions.find((entry) => entry.id === submissionId) || null;
}

app.post("/submit", upload.single("resume"), async (req, res) => {
  const fullName = req.body.fullName ? req.body.fullName.trim() : "";
  const email = req.body.email ? req.body.email.trim() : "";
  const desiredJobTitles = req.body.desiredJobTitles
    ? req.body.desiredJobTitles.trim()
    : "";
  const location = req.body.location ? req.body.location.trim() : "";
  const pastedResumeText = req.body.resumeText ? req.body.resumeText.trim() : "";
  const alertSettings = normalizeAlertSettings({
    frequency: req.body.alertFrequency,
    workPreferences: req.body.workPreferences,
    salaryPreference: req.body.salaryPreference ? req.body.salaryPreference.trim() : "",
  });

  if (!email || !desiredJobTitles || !location || (!req.file && !pastedResumeText)) {
    return res.status(400).json({
      success: false,
      message:
        "Please provide your email, desired job titles, location, and either a resume upload or pasted resume text.",
    });
  }

  const normalizedTitles = normalizeDesiredJobTitles(desiredJobTitles);
  const resumePath = req.file ? path.join("data", "uploads", req.file.filename) : "";
  const resumeInput = await resolveResumeInput({
    uploadedFilePath: req.file ? path.join(uploadsDir, req.file.filename) : "",
    originalFileName: req.file ? req.file.originalname : "",
    pastedResumeText,
  });

  if (!resumeInput.text) {
    return res.status(400).json({
      success: false,
      message:
        "We could not text-read that uploaded file. Paste your resume text so Get Me Hired AI can rank jobs more accurately.",
    });
  }

  const profiles = readProfiles();
  const profileId = randomUUID();
  const searchId = randomUUID();
  const createdAt = new Date().toISOString();
  const jobSearch = await fetchRankedJobMatches({
    desiredJobTitles,
    desiredJobTitleTags: normalizedTitles.tags,
    location,
    resumeText: resumeInput.text,
    workPreferences: alertSettings.workPreferences,
  });

  const profileRecord = {
    profileId,
    createdAt,
    updatedAt: createdAt,
    profile: {
      fullName,
      email,
      desiredJobTitles,
      desiredJobTitleTags: normalizedTitles.tags,
      location,
      resume: {
        fileOriginalName: req.file ? req.file.originalname : "",
        fileStoredName: req.file ? req.file.filename : "",
        filePath: resumePath,
        text: resumeInput.text,
        textSource: resumeInput.source,
      },
    },
    alertSettings,
    alertSchedule: {
      status: "ready",
      nextScanAt: getNextScanAt(alertSettings.frequency, createdAt),
      lastSearchId: searchId,
      lastScannedAt: createdAt,
    },
    searches: [
      {
        searchId,
        createdAt,
        query: {
          desiredJobTitles,
          desiredJobTitleTags: normalizedTitles.tags,
          location,
          alertSettings,
        },
        results: jobSearch,
      },
    ],
  };

  profiles.push(profileRecord);
  writeProfiles(profiles);

  return res.json({
    success: true,
    message: "Your profile has been submitted successfully.",
    submissionId: searchId,
  });
});

app.get("/submission/:id", (req, res) => {
  const submission = findSubmissionView(req.params.id);

  if (!submission) {
    return res.status(404).json({
      success: false,
      message: "Submission not found.",
    });
  }

  return res.json({
    success: true,
    submission,
  });
});

// Save a waitlist entry. Uses Airtable when configured, falls back to local JSON.
async function saveWaitlistEntry({ name, email, tier, note }) {
  const airtableKey  = process.env.AIRTABLE_API_KEY;
  const airtableBase = process.env.AIRTABLE_BASE_ID;
  const airtableTable = process.env.AIRTABLE_TABLE_NAME || "Waitlist";

  if (airtableKey && airtableBase) {
    const url = `https://api.airtable.com/v0/${airtableBase}/${encodeURIComponent(airtableTable)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${airtableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [{
          fields: {
            Name: name,
            Email: email,
            Tier: tier,
            Note: note,
            "Submitted At": new Date().toISOString(),
          },
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Airtable error ${response.status}: ${err}`);
    }

    return { storage: "airtable" };
  }

  // Fallback: local JSON (local dev only — ephemeral on Render free tier)
  const entries = JSON.parse(fs.readFileSync(waitlistPath, "utf8"));
  entries.push({ name, email, tier, note, createdAt: new Date().toISOString() });
  fs.writeFileSync(waitlistPath, JSON.stringify(entries, null, 2), "utf8");
  return { storage: "local" };
}

app.post("/api/waitlist", express.json(), async (req, res) => {
  try {
    const name  = (req.body.name  || "").trim();
    const email = (req.body.email || "").trim();
    const tier  = (req.body.tier  || "").trim();
    const note  = (req.body.note  || "").trim();

    if (!name || !email || !tier) {
      return res.status(400).json({ success: false, message: "Name, email, and tier are required." });
    }

    if (!email.includes("@")) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }

    const VALID_TIERS = ["pro", "premium"];
    if (!VALID_TIERS.includes(tier)) {
      return res.status(400).json({ success: false, message: "Invalid tier." });
    }

    await saveWaitlistEntry({ name, email, tier, note });
    return res.json({ success: true, message: "You're on the list." });
  } catch (_err) {
    return res.status(500).json({ success: false, message: "Could not save your entry. Please try again." });
  }
});

app.get("/api/search", searchRateLimit, async (req, res) => {
  try {
    const jobTitle = (req.query.jobTitle || "").trim();
    const location = normalizeLocationInput(req.query.location || "");

    if (!jobTitle) {
      return sendJson(res, 400, {
        success: false,
        message: "Please enter a job title to search.",
      });
    }

    if (jobTitle.length > 100 || location.input.length > 100) {
      return sendJson(res, 400, {
        success: false,
        message: "Job title and location must each be 100 characters or fewer.",
      });
    }

    if (!location.isValid) {
      return sendJson(res, 400, {
        success: false,
        message:
          "Please enter a simpler location like California, Los Angeles, CA, or leave it blank.",
      });
    }

    const results = await withTimeout(
      searchJobsQuick({
        jobTitle,
        location: location.query,
      }),
      8000,
      "Search request timed out before a stable response was ready."
    );

    if (results.status === "failed") {
      return sendJson(res, 503, {
        success: false,
        message: results.message || "Search is unavailable right now. Please try again.",
      });
    }

    return sendJson(res, 200, { success: true, results });
  } catch (error) {
    console.error("[/api/search] Unhandled error:", error && error.message ? error.message : error);
    return sendJson(res, 500, {
      success: false,
      message: "Search is unavailable right now. Please try again.",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  sendPublicFile(res, "index.html");
});

app.get("/robots.txt", (_req, res) => {
  sendPublicFile(res, "robots.txt");
});

app.get("/favicon.ico", (_req, res) => {
  sendPublicFile(res, "favicon.ico");
});

app.get("/apple-touch-icon.png", (_req, res) => {
  sendPublicFile(res, "apple-touch-icon.png");
});

app.get("/apple-touch-icon-precomposed.png", (_req, res) => {
  sendPublicFile(res, "apple-touch-icon-precomposed.png");
});

app.get("/success", (_req, res) => {
  sendPublicFile(res, "success.html");
});

if (require.main === module) {
  logStartupConfig();
  app.listen(port, () => {
    console.log(`Get Me Hired AI running at http://localhost:${port}`);
  });
}

module.exports = app;
