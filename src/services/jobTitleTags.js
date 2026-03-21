const TITLE_TAGS = [
  { keywords: ["frontend", "front end"], tag: "frontend-engineering", label: "Frontend Engineer" },
  { keywords: ["software engineer", "software developer", "developer"], tag: "software-engineering", label: "Software Engineer" },
  { keywords: ["product manager", "pm"], tag: "product-management", label: "Product Manager" },
  { keywords: ["product designer", "ux designer"], tag: "product-design", label: "Product Designer" },
  { keywords: ["ux researcher", "user researcher"], tag: "ux-research", label: "UX Researcher" },
  { keywords: ["customer support", "support specialist", "support engineer"], tag: "customer-support", label: "Customer Support" },
  { keywords: ["founder", "chief", "ceo", "coo", "cfo", "vp"], tag: "executive-leadership", label: "Executive Leadership" },
];

function normalizeDesiredJobTitles(desiredJobTitles) {
  const rawTitles = desiredJobTitles
    .split(",")
    .map((title) => title.trim())
    .filter(Boolean);

  const matchedTags = [];

  for (const rawTitle of rawTitles) {
    const lowerTitle = rawTitle.toLowerCase();
    const matched = TITLE_TAGS.find((entry) =>
      entry.keywords.some((keyword) => lowerTitle.includes(keyword))
    );

    if (matched && !matchedTags.some((tag) => tag.tag === matched.tag)) {
      matchedTags.push({
        tag: matched.tag,
        label: matched.label,
      });
      continue;
    }

    matchedTags.push({
      tag: lowerTitle.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      label: rawTitle,
    });
  }

  return {
    rawTitles,
    tags: matchedTags.slice(0, 5),
  };
}

module.exports = {
  normalizeDesiredJobTitles,
};
