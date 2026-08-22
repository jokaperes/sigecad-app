const fs = require("node:fs");
const path = require("node:path");


function isRealGoogleServicesJson(file) {
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const projectId = String(json?.project_info?.project_id || "");
    const apiKey = String(json?.client?.[0]?.api_key?.[0]?.current_key || "");
    return projectId.length > 0 && !projectId.includes("placeholder") && !apiKey.includes("PLACEHOLDER");
  } catch {
    return false;
  }
}

function isRealGoogleServicesPlist(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text.includes("<key>GOOGLE_APP_ID</key>") && !text.includes("placeholder");
  } catch {
    return false;
  }
}

module.exports = ({ config }) => {
  const ios = { ...(config.ios || {}) };
  const android = { ...(config.android || {}) };
  delete ios.googleServicesFile;
  delete android.googleServicesFile;

  const iosFile = path.join(__dirname, "GoogleService-Info.plist");
  const androidFile = path.join(__dirname, "google-services.json");
  if (fs.existsSync(iosFile) && isRealGoogleServicesPlist(iosFile)) {
    ios.googleServicesFile = "./GoogleService-Info.plist";
  }
  if (fs.existsSync(androidFile) && isRealGoogleServicesJson(androidFile)) {
    android.googleServicesFile = "./google-services.json";
  }

  return { ...config, ios, android };
};
