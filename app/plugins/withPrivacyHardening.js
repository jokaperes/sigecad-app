const {
  AndroidConfig,
  withAndroidManifest,
  withMainActivity,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const BLOCKED_PERMISSIONS = [
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.READ_PHONE_STATE",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
];

function ensureToolsNamespace(manifest) {
  if (!manifest.manifest.$) manifest.manifest.$ = {};
  manifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
}

function writeXml(projectRoot, relative, contents) {
  const target = path.join(projectRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function withPrivacyHardening(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    ensureToolsNamespace(manifest);
    AndroidConfig.Permissions.removePermissions(manifest, BLOCKED_PERMISSIONS);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    application.$["android:allowBackup"] = "false";
    application.$["android:fullBackupContent"] = "@xml/backup_rules";
    application.$["android:dataExtractionRules"] = "@xml/data_extraction_rules";
    application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    application.$["android:usesCleartextTraffic"] = "false";
    application.$["android:hasFragileUserData"] = "false";
    return config;
  });

  config = withMainActivity(config, (config) => {
    let src = config.modResults.contents;
    src = src.replace(/\nimport android.view.WindowManager\n/, "\n");
    src = src.replace(
      /[ \t]*window\.setFlags\(WindowManager\.LayoutParams\.FLAG_SECURE, WindowManager\.LayoutParams\.FLAG_SECURE\)\n/,
      "",
    );
    if (!src.includes("WebView.setWebContentsDebuggingEnabled")) {
      if (!src.includes("import android.webkit.WebView")) {
        src = src.replace(
          "import android.os.Bundle",
          "import android.os.Bundle\nimport android.webkit.WebView",
        );
      }
      src = src.replace(
        "super.onCreate(null)",
        "super.onCreate(null)\n    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)",
      );
    }
    config.modResults.contents = src;
    return config;
  });

  config = withDangerousMod(config, ["android", async (config) => {
    const root = config.modRequest.platformProjectRoot;
    writeXml(root, "app/src/main/res/xml/network_security_config.xml", `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`);
    writeXml(root, "app/src/main/res/xml/backup_rules.xml", `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
</full-backup-content>
`);
    writeXml(root, "app/src/main/res/xml/data_extraction_rules.xml", `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
        <exclude domain="external" path="." />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
        <exclude domain="external" path="." />
    </device-transfer>
</data-extraction-rules>
`);
    const debugManifest = path.join(root, "app/src/debug/AndroidManifest.xml");
    if (fs.existsSync(debugManifest)) {
      let xml = fs.readFileSync(debugManifest, "utf8");
      xml = xml.replace('android:usesCleartextTraffic="true"', 'android:usesCleartextTraffic="false"');
      fs.writeFileSync(debugManifest, xml);
    }
    return config;
  }]);

  return config;
}

module.exports = withPrivacyHardening;
