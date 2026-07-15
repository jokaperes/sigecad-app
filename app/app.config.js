const fs = require("node:fs");
const path = require("node:path");

/**
 * Keep Expo Go/export usable without private local Firebase files. Native builds
 * automatically receive the paths as soon as the files are present in app/.
 */
module.exports = ({ config }) => {
  const ios = { ...(config.ios || {}) };
  const android = { ...(config.android || {}) };
  delete ios.googleServicesFile;
  delete android.googleServicesFile;

  const iosFile = path.join(__dirname, "GoogleService-Info.plist");
  const androidFile = path.join(__dirname, "google-services.json");
  if (fs.existsSync(iosFile)) ios.googleServicesFile = "./GoogleService-Info.plist";
  if (fs.existsSync(androidFile)) android.googleServicesFile = "./google-services.json";

  return { ...config, ios, android };
};
