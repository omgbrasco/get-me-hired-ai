const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.join(__dirname, ".env"),
});

const express = require("express");
const fs = require("fs");
const multer = require("multer");
const { randomUUID } = require("crypto");
const { fetchRankedJobMatches } = require("./src/services/jobSearch");
const { resolveResumeInput } = require("./src/services/resumeText");
const { normalizeDesiredJobTitles } = require("./src/services/jobTitleTags");

const app = express();
const port = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(dataDir, "uploads");
const submissionsPath = path.join(dataDir, "submissions.json");
const profilesPath = path.join(dataDir, "profiles.json");

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

const JOB_TYPE_LABELS = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
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

app.use(express.static(path.join(__dirname, "public")));

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
  const preferredJobType = JOB_TYPE_LABELS[rawSettings.preferredJobType]
    ? rawSettings.preferredJobType
    : "full-time";

  return {
    frequency,
    frequencyLabel: ALERT_FREQUENCY_LABELS[frequency],
    remoteOnly: Boolean(rawSettings.remoteOnly),
    preferredJobType,
    preferredJobTypeLabel: JOB_TYPE_LABELS[preferredJobType],
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
    remoteOnly: req.body.remoteOnly === "on",
    preferredJobType: req.body.preferredJobType,
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

app.get("/success", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "success.html"));
});

if (require.main === module) {
  logStartupConfig();
  app.listen(port, () => {
    console.log(`Get Me Hired AI running at http://localhost:${port}`);
  });
}

module.exports = app;
