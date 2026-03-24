const form = document.getElementById("intake-form");
const submitButton = document.getElementById("submit-button");
const message = document.getElementById("form-message");
const onboardingModal = document.getElementById("onboarding-modal");
const modalContinueButton = document.getElementById("modal-continue");
const ONBOARDING_STORAGE_KEY = "get-me-hired-ai-onboarding-dismissed";

function showMessage(text) {
  message.textContent = text;
}

function validateForm(formData) {
  const fullName = formData.get("fullName")?.toString().trim() || "";
  const email = formData.get("email")?.toString().trim() || "";
  const desiredJobTitles = formData.get("desiredJobTitles")?.toString().trim() || "";
  const location = formData.get("location")?.toString().trim() || "";
  const resume = formData.get("resume");
  const resumeText = formData.get("resumeText")?.toString().trim() || "";

  if (!fullName || !email || !desiredJobTitles || !location) {
    return "Please complete all required fields.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }

  const hasResumeFile = resume instanceof File && resume.name;

  if (!hasResumeFile && !resumeText) {
    return "Please upload your resume or paste your resume text.";
  }

  return "";
}

function closeOnboardingModal() {
  onboardingModal.hidden = true;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  } catch (_e) {
    // localStorage blocked in this context — dismiss state won't persist
  }
}

function showOnboardingModalIfNeeded() {
  try {
    const alreadyDismissed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
    onboardingModal.hidden = alreadyDismissed;
  } catch (_e) {
    // localStorage blocked — default to showing the modal once
    onboardingModal.hidden = false;
  }
}

modalContinueButton.addEventListener("click", closeOnboardingModal);
showOnboardingModalIfNeeded();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  try {
    const formData = new FormData(form);
    const validationMessage = validateForm(formData);

    if (validationMessage) {
      throw new Error(validationMessage);
    }

    const response = await fetch("/submit", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Something went wrong.");
    }

    window.location.href = `/success?id=${encodeURIComponent(result.submissionId)}`;
  } catch (error) {
    showMessage(error.message);
    submitButton.disabled = false;
    submitButton.textContent = "Submit profile";
  }
});
