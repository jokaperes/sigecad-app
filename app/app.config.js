const fs = require("node:fs");
const path = require("node:path");

/**
 * Native prebuild needs the Google Services path whenever the file exists,
 * including the local placeholder used until a real Firebase project is wired.
 */
module.exports = ({ config }) => {
  const ios = { ...(config.ios || {}) };
  const android = { ...(config.android || {}) };
  delete ios.googleServicesFile;
  delete android.googleServicesFile;

  const iosFile = path.join(__dirname, "GoogleService-Info.plist");
  const androidFile = path.join(__dirname, "google-services.json");
  if (fs.existsSync(iosFile)) {
    ios.googleServicesFile = "./GoogleService-Info.plist";
  }
  if (fs.existsSync(androidFile)) {
    android.googleServicesFile = "./google-services.json";
  }

  return { ...config, ios, android };
};
