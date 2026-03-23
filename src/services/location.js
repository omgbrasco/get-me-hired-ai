const US_STATE_NAMES = {
  al: "Alabama",
  ak: "Alaska",
  az: "Arizona",
  ar: "Arkansas",
  ca: "California",
  co: "Colorado",
  ct: "Connecticut",
  de: "Delaware",
  fl: "Florida",
  ga: "Georgia",
  hi: "Hawaii",
  id: "Idaho",
  il: "Illinois",
  in: "Indiana",
  ia: "Iowa",
  ks: "Kansas",
  ky: "Kentucky",
  la: "Louisiana",
  me: "Maine",
  md: "Maryland",
  ma: "Massachusetts",
  mi: "Michigan",
  mn: "Minnesota",
  ms: "Mississippi",
  mo: "Missouri",
  mt: "Montana",
  ne: "Nebraska",
  nv: "Nevada",
  nh: "New Hampshire",
  nj: "New Jersey",
  nm: "New Mexico",
  ny: "New York",
  nc: "North Carolina",
  nd: "North Dakota",
  oh: "Ohio",
  ok: "Oklahoma",
  or: "Oregon",
  pa: "Pennsylvania",
  ri: "Rhode Island",
  sc: "South Carolina",
  sd: "South Dakota",
  tn: "Tennessee",
  tx: "Texas",
  ut: "Utah",
  vt: "Vermont",
  va: "Virginia",
  wa: "Washington",
  wv: "West Virginia",
  wi: "Wisconsin",
  wy: "Wyoming",
  dc: "District of Columbia",
};

const COUNTRY_ALIASES = {
  us: "United States",
  usa: "United States",
  "u s": "United States",
  "u s a": "United States",
  "united states": "United States",
  "united states of america": "United States",
};

function cleanLocationText(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w\s,.-]/g, " ")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*-\s*/g, " ")
    .trim();
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeStatePart(value) {
  const normalized = cleanLocationText(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  return US_STATE_NAMES[normalized] || toTitleCase(normalized);
}

function normalizeLocationInput(value) {
  const raw = String(value || "");
  const cleaned = cleanLocationText(raw);

  if (!cleaned) {
    return {
      raw,
      input: "",
      query: "United States",
      display: "Remote or nationwide",
      isBlank: true,
      isValid: true,
      type: "blank",
    };
  }

  const lower = cleaned.toLowerCase();

  if (COUNTRY_ALIASES[lower]) {
    return {
      raw,
      input: cleaned,
      query: COUNTRY_ALIASES[lower],
      display: COUNTRY_ALIASES[lower],
      isBlank: false,
      isValid: true,
      type: "country",
    };
  }

  if (US_STATE_NAMES[lower]) {
    return {
      raw,
      input: cleaned,
      query: US_STATE_NAMES[lower],
      display: US_STATE_NAMES[lower],
      isBlank: false,
      isValid: true,
      type: "state",
    };
  }

  if (cleaned.includes(",")) {
    const [primary, secondary] = cleaned.split(",").map((part) => part.trim());
    const primaryPart = toTitleCase(primary);
    const secondaryPart = normalizeStatePart(secondary);
    const display = [primaryPart, secondaryPart].filter(Boolean).join(", ");

    return {
      raw,
      input: cleaned,
      query: display,
      display,
      isBlank: false,
      isValid: Boolean(display),
      type: "city-state",
    };
  }

  if (/\bcounty$/i.test(cleaned)) {
    return {
      raw,
      input: cleaned,
      query: toTitleCase(cleaned),
      display: toTitleCase(cleaned),
      isBlank: false,
      isValid: true,
      type: "county",
    };
  }

  const display = toTitleCase(cleaned);

  return {
    raw,
    input: cleaned,
    query: display,
    display,
    isBlank: false,
    isValid: Boolean(display),
    type: "general",
  };
}

module.exports = {
  normalizeLocationInput,
};
