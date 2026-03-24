const DEFAULT_PROVIDER = "adzuna";
const MAX_RESULTS = 10;
const { rankJobMatches } = require("./jobRanking");
const { normalizeLocationInput } = require("./location");

function getAdzunaCountry() {
  return process.env.ADZUNA_COUNTRY || "us";
}

function normalizeQuery(desiredJobTitles, desiredJobTitleTags) {
  const intentLabels = Array.isArray(desiredJobTitleTags)
    ? desiredJobTitleTags.map((tag) => tag.label).filter(Boolean)
    : [];

  if (intentLabels.length) {
    return intentLabels.slice(0, 3).join(" OR ");
  }

  return desiredJobTitles
    .split(",")
    .map((title) => title.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" OR ");
}

function toSnippet(description) {
  const text = (description || "").replace(/\s+/g, " ").trim();

  if (!text) {
    return "Description not available from the job source.";
  }

  if (text.length <= 220) {
    return text;
  }

  return `${text.slice(0, 217)}...`;
}

function formatSalary(min, max) {
  const fmt = (n) =>
    Number.isFinite(n) && n > 0
      ? "$" + Math.round(n).toLocaleString("en-US")
      : null;
  const lo = fmt(min);
  const hi = fmt(max);
  if (lo && hi && lo !== hi) return `${lo} – ${hi}`;
  if (lo || hi) return lo || hi;
  return null;
}

function mapAdzunaJob(job) {
  return {
    id: job.id || `${job.title || "job"}-${job.redirect_url || ""}`,
    title: job.title || "Untitled role",
    company: job.company?.display_name || "Company not listed",
    location: job.location?.display_name || "Location not listed",
    salary: formatSalary(job.salary_min, job.salary_max),
    summary: toSnippet(job.description),
    description: (job.description || "").replace(/\s+/g, " ").trim(),
    applyUrl: job.redirect_url || "",
    source: DEFAULT_PROVIDER,
  };
}

async function searchAdzunaJobs({
  desiredJobTitles,
  desiredJobTitleTags,
  location,
  resumeText,
  workPreferences,
}) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return {
      provider: DEFAULT_PROVIDER,
      status: "failed",
      message:
        "Live job search is not configured yet. Add your Adzuna API credentials to start fetching real jobs.",
      matches: [],
    };
  }

  const normalizedLocation = normalizeLocationInput(location);

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(MAX_RESULTS),
    what: normalizeQuery(desiredJobTitles, desiredJobTitleTags),
    "content-type": "application/json",
  });

  if (normalizedLocation.query) {
    params.set("where", normalizedLocation.query);
  }

  const requestUrl = `https://api.adzuna.com/v1/api/jobs/${getAdzunaCountry()}/search/1?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  let response;
  try {
    response = await fetch(requestUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Jobs API request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload.results) ? payload.results : [];

  return {
    provider: DEFAULT_PROVIDER,
    status: "success",
    message: results.length ? "" : "No live job matches were found for this search yet.",
    searchLocation: normalizedLocation.display,
    matches: rankJobMatches({
      jobs: results.slice(0, MAX_RESULTS).map(mapAdzunaJob),
      desiredJobTitles,
      desiredJobTitleTags,
      location: normalizedLocation.display,
      resumeText,
      workPreferences,
    }),
  };
}

async function fetchRankedJobMatches({
  desiredJobTitles,
  desiredJobTitleTags,
  location,
  resumeText,
  workPreferences,
}) {
  try {
    return await searchAdzunaJobs({
      desiredJobTitles,
      desiredJobTitleTags,
      location,
      resumeText,
      workPreferences,
    });
  } catch (_error) {
    return {
      provider: DEFAULT_PROVIDER,
      status: "failed",
      message:
        "We could not load live job matches right now. Your submission was still saved successfully.",
      matches: [],
    };
  }
}

async function searchJobsQuick({ jobTitle, location }) {
  try {
    return await searchAdzunaJobs({
      desiredJobTitles: jobTitle,
      desiredJobTitleTags: [],
      location,
      resumeText: "",
      workPreferences: [],
    });
  } catch (error) {
    console.error("[searchJobsQuick] Adzuna fetch failed:", error && error.message ? error.message : error);
    return {
      provider: DEFAULT_PROVIDER,
      status: "failed",
      message: "Could not load job results right now. Please try again.",
      matches: [],
    };
  }
}

module.exports = {
  fetchRankedJobMatches,
  searchJobsQuick,
};
