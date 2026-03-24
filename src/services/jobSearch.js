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

function buildFailureResult(message, debug) {
  return {
    provider: DEFAULT_PROVIDER,
    status: "failed",
    message,
    debug,
    matches: [],
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
    return buildFailureResult(
      "Live job search is not configured yet. Add your Adzuna API credentials to start fetching real jobs.",
      {
        branch: "missing_env",
        hasAdzunaAppId: Boolean(appId),
        hasAdzunaAppKey: Boolean(appKey),
        adzunaCountry: getAdzunaCountry(),
      }
    );
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
  const response = await fetch(requestUrl);

  console.log("[api/search][adzuna] upstream response", {
    branch: "upstream_response",
    status: response.status,
    ok: response.ok,
    hasLocation: Boolean(normalizedLocation.query),
    adzunaCountry: getAdzunaCountry(),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw Object.assign(new Error(`Jobs API request failed with status ${response.status}.`), {
      debug: {
        branch: "upstream_http_error",
        status: response.status,
        bodyPreview: responseText.slice(0, 200),
        adzunaCountry: getAdzunaCountry(),
      },
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw Object.assign(new Error("Jobs API returned unreadable JSON."), {
      debug: {
        branch: "upstream_json_parse_failed",
        adzunaCountry: getAdzunaCountry(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
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
  } catch (error) {
    return buildFailureResult(
      "We could not load live job matches right now. Your submission was still saved successfully.",
      {
        branch: "fetch_ranked_job_matches_failed",
        reason: error && error.debug ? error.debug : { message: error.message },
      }
    );
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
    return buildFailureResult("Could not load job results right now. Please try again.", {
      branch: "search_jobs_quick_failed",
      reason: error && error.debug ? error.debug : { message: error.message },
    });
  }
}

module.exports = {
  fetchRankedJobMatches,
  searchJobsQuick,
};
