const fs = require("fs/promises");
const path = require("path");

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".text"]);

async function resolveResumeInput({ uploadedFilePath, originalFileName, pastedResumeText }) {
  if (pastedResumeText) {
    return {
      text: pastedResumeText,
      source: "pasted-text",
    };
  }

  const extension = path.extname(originalFileName || "").toLowerCase();

  if (!TEXT_EXTENSIONS.has(extension)) {
    return {
      text: "",
      source: "unreadable-upload",
    };
  }

  try {
    const fileContents = await fs.readFile(uploadedFilePath, "utf8");
    return {
      text: fileContents.trim(),
      source: "text-file-upload",
    };
  } catch (_error) {
    return {
      text: "",
      source: "upload-read-failed",
    };
  }
}

module.exports = {
  resolveResumeInput,
};
