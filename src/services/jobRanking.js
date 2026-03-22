const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const SENIORITY_LEVELS = [
  { label: "executive", keywords: ["chief", "ceo", "cto", "cfo", "coo", "vp", "vice president"], score: 5 },
  { label: "director", keywords: ["director", "head of"], score: 4 },
  { label: "senior", keywords: ["principal", "staff", "lead", "senior", "sr"], score: 3 },
  { label: "mid", keywords: ["manager", "specialist", "strategist", "designer", "engineer", "analyst"], score: 2 },
  { label: "junior", keywords: ["associate", "coordinator", "assistant", "junior", "jr", "entry"], score: 1 },
];

const WORK_PREFERENCE_KEYWORDS = {
  "full-time": ["full time", "full-time", "permanent"],
  "part-time": ["part time", "part-time"],
  remote: ["remote", "work from home", "distributed"],
  freelance: ["freelance", "contract", "independent contractor"],
};

function tokenize(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length > 1 && !STOP_WORDS.has(token));
}

function uniqueTokens(value) {
  return [...new Set(tokenize(value))];
}

function keywordOverlap(left, right) {
  const leftTokens = uniqueTokens(left);
  const rightTokens = new Set(uniqueTokens(right));

  if (!leftTokens.length || !rightTokens.size) {
    return 0;
  }

  const matches = leftTokens.filter((token) => rightTokens.has(token)).length;
  return matches / leftTokens.length;
}

function parseDesiredTitles(desiredJobTitles, desiredJobTitleTags) {
  const normalizedLabels = Array.isArray(desiredJobTitleTags)
    ? desiredJobTitleTags.map((tag) => tag.label).filter(Boolean)
    : [];

  if (normalizedLabels.length) {
    return normalizedLabels;
  }

  return desiredJobTitles
    .split(",")
    .map((title) => title.trim())
    .filter(Boolean);
}

function scoreTitleRelevance(job, desiredTitles) {
  if (!desiredTitles.length) {
    return 0;
  }

  const titleScores = desiredTitles.map((desiredTitle) => {
    const exactBoost = job.title.toLowerCase().includes(desiredTitle.toLowerCase()) ? 0.35 : 0;
    return Math.min(1, keywordOverlap(desiredTitle, job.title) + exactBoost);
  });

  return Math.max(...titleScores, 0);
}

function scoreLocationRelevance(jobLocation, desiredLocation) {
  const jobValue = (jobLocation || "").toLowerCase();
  const desiredValue = (desiredLocation || "").toLowerCase();

  if (!jobValue || !desiredValue) {
    return 0.45;
  }

  if (desiredValue.includes("remote")) {
    if (jobValue.includes("remote")) {
      return 1;
    }
    return jobValue.includes("hybrid") ? 0.75 : 0.55;
  }

  if (jobValue.includes(desiredValue) || desiredValue.includes(jobValue)) {
    return 1;
  }

  const overlap = keywordOverlap(desiredValue, jobValue);
  return overlap ? Math.max(0.45, overlap) : 0.2;
}

function scoreWorkPreferenceRelevance(job, workPreferences) {
  if (!Array.isArray(workPreferences) || !workPreferences.length) {
    return 0.55;
  }

  const haystack = `${job.title} ${job.location} ${job.description}`.toLowerCase();
  let matchedPreferences = 0;

  workPreferences.forEach((preference) => {
    const keywords = WORK_PREFERENCE_KEYWORDS[preference] || [];
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      matchedPreferences += 1;
      return;
    }

    if (preference === "remote" && !haystack.includes("remote")) {
      matchedPreferences -= 0.35;
    }
  });

  return Math.max(0.1, Math.min(1, matchedPreferences / workPreferences.length || 0.35));
}

function inferSeniority(text) {
  const lowerText = (text || "").toLowerCase();

  for (const level of SENIORITY_LEVELS) {
    if (level.keywords.some((keyword) => lowerText.includes(keyword))) {
      return level.score;
    }
  }

  return 2;
}

function extractYearsExperience(resumeText) {
  const matches = [...(resumeText || "").matchAll(/(\d+)\+?\s+years?/gi)];
  if (!matches.length) {
    return 0;
  }

  return Math.max(...matches.map((match) => Number(match[1]) || 0));
}

function scoreSeniorityRealism(job, resumeText) {
  const yearsExperience = extractYearsExperience(resumeText);
  const experienceBand =
    yearsExperience >= 8 ? 4 : yearsExperience >= 5 ? 3 : yearsExperience >= 2 ? 2 : 1;
  const candidateSeniority = resumeText
    ? Math.max(inferSeniority(resumeText), experienceBand)
    : 1;
  const roleSeniority = inferSeniority(`${job.title} ${job.description}`);
  const gap = roleSeniority - candidateSeniority;

  if (gap <= 0) {
    return 1;
  }

  if (gap === 1) {
    return 0.65;
  }

  if (gap === 2) {
    return 0.35;
  }

  return 0.1;
}

function buildWhyItMatches({
  titleScore,
  locationScore,
  workPreferenceScore,
  resumeOverlapScore,
  descriptionOverlapScore,
  seniorityScore,
  desiredTitles,
  location,
  workPreferences,
}) {
  const reasons = [];

  if (titleScore >= 0.7 && desiredTitles[0]) {
    reasons.push(`close title match for ${desiredTitles[0]}`);
  }

  if (locationScore >= 0.7 && location) {
    reasons.push(`location lines up with ${location}`);
  }

  if (workPreferenceScore >= 0.7 && Array.isArray(workPreferences) && workPreferences.length) {
    reasons.push("work preferences line up well");
  }

  if (resumeOverlapScore >= 0.35) {
    reasons.push("your resume shares useful role keywords");
  }

  if (descriptionOverlapScore >= 0.25) {
    reasons.push("the job description overlaps with your background");
  }

  if (seniorityScore >= 0.7) {
    reasons.push("seniority looks realistic for a callback");
  }

  return reasons.slice(0, 2).join(" and ") || "reasonable overall fit based on your targets and resume.";
}

function rankJobMatches({
  jobs,
  desiredJobTitles,
  desiredJobTitleTags,
  location,
  resumeText,
  workPreferences,
}) {
  const desiredTitles = parseDesiredTitles(desiredJobTitles, desiredJobTitleTags);
  const resumeSource = resumeText || "";

  return jobs
    .map((job) => {
      const titleScore = scoreTitleRelevance(job, desiredTitles);
      const locationScore = scoreLocationRelevance(job.location, location);
      const workPreferenceScore = scoreWorkPreferenceRelevance(job, workPreferences);
      const resumeOverlapScore = keywordOverlap(resumeSource, `${job.title} ${job.description}`);
      const descriptionOverlapScore = keywordOverlap(
        `${desiredJobTitles} ${resumeSource}`,
        job.description
      );
      const seniorityScore = scoreSeniorityRealism(job, resumeSource);

      const fitScore = Math.round(
        (titleScore * 0.3 +
          locationScore * 0.16 +
          workPreferenceScore * 0.1 +
          resumeOverlapScore * 0.22 +
          descriptionOverlapScore * 0.1 +
          seniorityScore * 0.12) *
          100
      );

      return {
        ...job,
        fitScore,
        whyItMatches: buildWhyItMatches({
          titleScore,
          locationScore,
          workPreferenceScore,
          resumeOverlapScore,
          descriptionOverlapScore,
          seniorityScore,
          desiredTitles,
          location,
          workPreferences,
        }),
      };
    })
    .sort((left, right) => right.fitScore - left.fitScore);
}

module.exports = {
  rankJobMatches,
};
