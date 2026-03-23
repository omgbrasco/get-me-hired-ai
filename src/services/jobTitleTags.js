const TITLE_FAMILIES = [
  {
    tag: "customer-support",
    label: "Customer Support",
    keywords: [
      "customer support",
      "customer service",
      "support specialist",
      "support rep",
      "support representative",
      "client support",
      "csr",
      "help desk",
    ],
  },
  {
    tag: "customer-experience",
    label: "Customer Experience",
    keywords: [
      "customer experience",
      "cx",
      "client experience",
      "guest experience",
      "customer success",
      "member experience",
    ],
  },
  {
    tag: "cashier-retail",
    label: "Cashier",
    keywords: [
      "cashier",
      "retail associate",
      "sales associate",
      "front end",
      "checkout",
      "store associate",
    ],
  },
  {
    tag: "frontend-engineering",
    label: "Frontend Engineer",
    keywords: ["frontend", "front end", "frontend engineer", "ui engineer"],
  },
  {
    tag: "software-engineering",
    label: "Software Engineer",
    keywords: ["software engineer", "software developer", "developer", "engineer"],
  },
  {
    tag: "product-management",
    label: "Product Manager",
    keywords: ["product manager", "pm"],
  },
  {
    tag: "product-design",
    label: "Product Designer",
    keywords: ["product designer", "ux designer"],
  },
  {
    tag: "ux-research",
    label: "UX Researcher",
    keywords: ["ux researcher", "user researcher"],
  },
  {
    tag: "executive-leadership",
    label: "Executive Leadership",
    keywords: ["founder", "chief", "ceo", "coo", "cfo", "vp"],
  },
];

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function splitRawSearchTerms(value) {
  return String(value || "")
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

function parseSearchTerms(value) {
  const seen = new Set();

  return splitRawSearchTerms(value)
    .map((term) => ({
      rawTerm: term,
      normalizedTerm: normalizeSearchText(term),
    }))
    .filter((term) => term.normalizedTerm)
    .filter((term) => {
      if (seen.has(term.normalizedTerm)) {
        return false;
      }

      seen.add(term.normalizedTerm);
      return true;
    });
}

function levenshteinDistance(left, right) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const costs = new Array(right.length + 1);

  for (let index = 0; index <= right.length; index += 1) {
    costs[index] = index;
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = costs[0];
    costs[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const current = costs[rightIndex];
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      costs[rightIndex] = Math.min(
        costs[rightIndex] + 1,
        costs[rightIndex - 1] + 1,
        previous + substitutionCost
      );

      previous = current;
    }
  }

  return costs[right.length];
}

function isFuzzyMatch(left, right) {
  const normalizedLeft = normalizeSearchText(left);
  const normalizedRight = normalizeSearchText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  const threshold = maxLength <= 8 ? 1 : maxLength <= 18 ? 3 : 4;

  return distance <= threshold;
}

function findTitleFamily(term) {
  const normalizedTerm = normalizeSearchText(term);

  if (!normalizedTerm) {
    return null;
  }

  for (const family of TITLE_FAMILIES) {
    const normalizedKeywords = family.keywords.map((keyword) => normalizeSearchText(keyword));

    if (normalizedKeywords.includes(normalizedTerm)) {
      return { family, matchType: "exact" };
    }

    if (
      normalizedKeywords.some(
        (keyword) => keyword.includes(normalizedTerm) || normalizedTerm.includes(keyword)
      )
    ) {
      return { family, matchType: "synonym" };
    }

    if (normalizedKeywords.some((keyword) => isFuzzyMatch(normalizedTerm, keyword))) {
      return { family, matchType: "fuzzy" };
    }
  }

  return null;
}

function slugify(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildSearchIntents(value) {
  const seen = new Set();

  return parseSearchTerms(value)
    .map(({ rawTerm, normalizedTerm }) => {
      const matched = findTitleFamily(normalizedTerm);

      if (!matched) {
        return {
          rawTerm,
          normalizedTerm,
          tag: slugify(normalizedTerm) || "general-search",
          label: rawTerm,
          matchType: "exact",
          synonyms: [],
          queryTerms: [rawTerm],
        };
      }

      const synonyms = [...new Set(matched.family.keywords.map((keyword) => keyword.trim()))];

      return {
        rawTerm,
        normalizedTerm,
        tag: matched.family.tag,
        label: matched.family.label,
        matchType: matched.matchType,
        synonyms,
        queryTerms: [...new Set([matched.family.label, ...synonyms])].slice(0, 6),
      };
    })
    .filter((intent) => {
      const key = `${intent.tag}:${intent.normalizedTerm}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function normalizeDesiredJobTitles(desiredJobTitles) {
  const intents = buildSearchIntents(desiredJobTitles);
  const rawTitles = intents.map((intent) => intent.rawTerm);
  const tags = intents.map((intent) => ({
    tag: intent.tag,
    label: intent.label,
    normalizedTerm: intent.normalizedTerm,
    matchType: intent.matchType,
    synonyms: intent.synonyms,
    queryTerms: intent.queryTerms,
  }));

  return {
    rawTitles,
    intents,
    tags: tags.slice(0, 6),
  };
}

module.exports = {
  buildSearchIntents,
  findTitleFamily,
  isFuzzyMatch,
  normalizeDesiredJobTitles,
  normalizeSearchText,
  parseSearchTerms,
};
