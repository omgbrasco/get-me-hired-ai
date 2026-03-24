const DEFAULT_PROVIDER = "adzuna";
const MAX_RESULTS = 10;
const ADZUNA_TIMEOUT_MS = 4000;
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
      message: "Search is unavailable right now. Please try again.",
      errorCode: "ADZUNA_CONFIG_MISSING",
      debugMessage: "ADZUNA_APP_ID or ADZUNA_APP_KEY is not configured.",
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
  const timeoutId = setTimeout(() => controller.abort(), ADZUNA_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(requestUrl, { signal: controller.signal });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Jobs API request timed out before the platform response deadline.");
    }

    throw new Error("Jobs API request failed before a response was received.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Jobs API request failed with status ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    throw new Error("Jobs API returned unreadable JSON.");
  }
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
    const errorMessage = error && error.message ? error.message : "";
    let errorCode = "ADZUNA_FETCH_FAILED";

    if (errorMessage.indexOf("timed out") !== -1) {
      errorCode = "ADZUNA_TIMEOUT";
    } else if (errorMessage.indexOf("status") !== -1) {
      errorCode = "ADZUNA_HTTP_ERROR";
    } else if (errorMessage.indexOf("unreadable JSON") !== -1) {
      errorCode = "ADZUNA_BAD_JSON";
    }

    return {
      provider: DEFAULT_PROVIDER,
      status: "failed",
      message: "Search is unavailable right now. Please try again.",
      errorCode,
      debugMessage: errorMessage || "Unknown Adzuna fetch error.",
      matches: [],
    };
  }
}

module.exports = {
  fetchRankedJobMatches,
  searchJobsQuick,
};
