const params = new URLSearchParams(window.location.search);
const submissionId = params.get("id");
const message = document.getElementById("results-message");
const resultsCard = document.getElementById("results-card");
const matchesStatus = document.getElementById("job-matches-status");

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function renderMatchStatus(text) {
  matchesStatus.textContent = text;
  matchesStatus.hidden = !text;
}

function renderMatches(jobSearch) {
  const matchesList = document.getElementById("job-matches-list");
  matchesList.innerHTML = "";
  renderMatchStatus("");

  if (!jobSearch || !Array.isArray(jobSearch.matches) || jobSearch.matches.length === 0) {
    if (jobSearch?.status === "failed") {
      renderMatchStatus(jobSearch.message || "We could not load job matches right now.");
    } else {
      renderMatchStatus("No live job matches were found for this search yet.");
    }
    return;
  }

  jobSearch.matches.forEach((match) => {
    const card = document.createElement("article");
    card.className = "match-card";
    card.innerHTML = `
      <div class="match-card-top">
        <div>
          <h3 class="match-title">${match.title}</h3>
          <p class="match-company">${match.company}</p>
        </div>
        <div class="match-score">${match.fitScore}% Fit</div>
      </div>
      <p class="match-location">${match.location}</p>
      <p class="match-summary">${match.summary}</p>
      <p class="match-why"><strong>Why it matches:</strong> ${match.whyItMatches}</p>
      ${
        match.applyUrl
          ? `<p class="match-link-wrap"><a class="match-link" href="${match.applyUrl}" target="_blank" rel="noreferrer">View job</a></p>`
          : `<p class="match-link-wrap match-link-muted">Source link unavailable</p>`
      }
    `;
    matchesList.appendChild(card);
  });
}

async function loadSubmission() {
  if (!submissionId) {
    message.textContent = "We could not find that submission.";
    return;
  }

  try {
    const response = await fetch(`/submission/${encodeURIComponent(submissionId)}`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to load your submission.");
    }

    setText("result-full-name", result.submission.fullName);
    setText("result-email", result.submission.email);
    setText("result-job-titles", result.submission.desiredJobTitles);
    setText("result-location", result.submission.location);
    setText(
      "result-resume-name",
      result.submission.resumeOriginalName || "Pasted resume text provided"
    );
    const alertSettings = result.submission.alertSettings || {
      frequencyLabel: "Not saved on this older profile",
      remoteOnly: false,
      preferredJobTypeLabel: "Not saved on this older profile",
      salaryPreference: "",
    };

    setText("alert-frequency", alertSettings.frequencyLabel);
    setText("alert-remote-only", alertSettings.remoteOnly ? "Yes" : "No");
    setText("alert-job-type", alertSettings.preferredJobTypeLabel);
    setText(
      "alert-salary",
      alertSettings.salaryPreference || "No salary preference saved"
    );
    renderMatches(result.submission.jobSearch || { status: "idle", matches: [] });
    resultsCard.hidden = false;
  } catch (error) {
    message.textContent = error.message;
  }
}

loadSubmission();
