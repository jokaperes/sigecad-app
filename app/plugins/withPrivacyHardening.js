const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withMainActivity,
  withMainApplication,
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

function removeBrowserVisibilityQueries(manifest) {
  const queries = manifest.manifest.queries;
  if (!Array.isArray(queries)) return;
  for (const query of queries) {
    if (!Array.isArray(query.intent)) continue;
    query.intent = query.intent.filter((intent) => {
      const actions = Array.isArray(intent.action) ? intent.action : [];
      const categories = Array.isArray(intent.category) ? intent.category : [];
      const data = Array.isArray(intent.data) ? intent.data : [];
      const opensUrl = actions.some((item) => item.$?.["android:name"] === "android.intent.action.VIEW");
      const browsable = categories.some((item) => item.$?.["android:name"] === "android.intent.category.BROWSABLE");
      const handlesHttps = data.some((item) => item.$?.["android:scheme"] === "https");
      return !(opensUrl && browsable && handlesHttps);
    });
  }
  manifest.manifest.queries = queries.filter((query) => !Array.isArray(query.intent) || query.intent.length > 0);
  if (manifest.manifest.queries.length === 0) delete manifest.manifest.queries;
}

function blockMergedPermissions(manifest) {
  const existing = Array.isArray(manifest.manifest["uses-permission"])
    ? manifest.manifest["uses-permission"]
    : [];
  const allowed = existing.filter((permission) => {
    const name = permission.$?.["android:name"];
    return !BLOCKED_PERMISSIONS.includes(name);
  });
  const removals = BLOCKED_PERMISSIONS.map((name) => ({
    $: {
      "android:name": name,
      "tools:node": "remove",
    },
  }));
  manifest.manifest["uses-permission"] = [...allowed, ...removals];
}

function withPrivacyHardening(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    ensureToolsNamespace(manifest);
    AndroidConfig.Permissions.removePermissions(manifest, BLOCKED_PERMISSIONS);
    blockMergedPermissions(manifest);
    removeBrowserVisibilityQueries(manifest);
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
    if (!src.includes("blocksSigecadExternalWebIntent")) {
      if (!src.includes("import android.content.Intent")) {
        src = src.replace(
          "import android.os.Build",
          "import android.content.Intent\nimport android.os.Build",
        );
      }
      src = src.replace(
        "\n  /**\n   * Returns the name of the main component registered from JavaScript.",
        `
  override fun startActivity(intent: Intent?) {
    if (blocksSigecadExternalWebIntent(intent)) return
    super.startActivity(intent)
  }

  override fun startActivity(intent: Intent?, options: Bundle?) {
    if (blocksSigecadExternalWebIntent(intent)) return
    super.startActivity(intent, options)
  }

  override fun startActivityForResult(intent: Intent, requestCode: Int) {
    if (blocksSigecadExternalWebIntent(intent)) return
    super.startActivityForResult(intent, requestCode)
  }

  override fun startActivityForResult(intent: Intent, requestCode: Int, options: Bundle?) {
    if (blocksSigecadExternalWebIntent(intent)) return
    super.startActivityForResult(intent, requestCode, options)
  }

  private fun blocksSigecadExternalWebIntent(intent: Intent?): Boolean {
    if (intent?.action != Intent.ACTION_VIEW) return false
    val scheme = intent.data?.scheme?.lowercase()
    return scheme == "http" || scheme == "https" || scheme == "intent"
  }

  /**
   * Returns the name of the main component registered from JavaScript.`,
      );
      if (!src.includes("blocksSigecadExternalWebIntent")) {
        throw new Error("Não foi possível bloquear intents web na MainActivity");
      }
    }
    config.modResults.contents = src;
    return config;
  });

  config = withMainApplication(config, (config) => {
    let src = config.modResults.contents;
    if (!src.includes("blocksSigecadExternalWebIntent")) {
      if (!src.includes("import android.content.Intent")) {
        src = src.replace(
          "import android.app.Application",
          "import android.app.Application\nimport android.content.Intent\nimport android.os.Bundle",
        );
      }
      src = src.replace(
        "\n  override val reactHost:",
        `
  override fun startActivity(intent: Intent) {
    if (blocksSigecadExternalWebIntent(intent)) return
    super.startActivity(intent)
  }

  override fun startActivity(intent: Intent, options: Bundle?) {
    if (blocksSigecadExternalWebIntent(intent)) return
    super.startActivity(intent, options)
  }

  private fun blocksSigecadExternalWebIntent(intent: Intent): Boolean {
    if (intent.action != Intent.ACTION_VIEW) return false
    val scheme = intent.data?.scheme?.lowercase()
    return scheme == "http" || scheme == "https" || scheme == "intent"
  }

  override val reactHost:`,
      );
      if (!src.includes("blocksSigecadExternalWebIntent")) {
        throw new Error("Não foi possível bloquear intents web na MainApplication");
      }
    }
    config.modResults.contents = src;
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (!src.includes("SIGECAD_UPLOAD_STORE_FILE")) {
      src = src.replace(
        "    signingConfigs {\n        debug {",
        `    signingConfigs {
        release {
            if (project.hasProperty('SIGECAD_UPLOAD_STORE_FILE') &&
                project.hasProperty('SIGECAD_UPLOAD_STORE_PASSWORD') &&
                project.hasProperty('SIGECAD_UPLOAD_KEY_ALIAS') &&
                project.hasProperty('SIGECAD_UPLOAD_KEY_PASSWORD')) {
                storeFile file(SIGECAD_UPLOAD_STORE_FILE)
                storePassword SIGECAD_UPLOAD_STORE_PASSWORD
                keyAlias SIGECAD_UPLOAD_KEY_ALIAS
                keyPassword SIGECAD_UPLOAD_KEY_PASSWORD
            }
        }
        debug {`,
      );
      src = src.replace(
        "            signingConfig signingConfigs.debug\n            def enableShrinkResources",
        "            signingConfig signingConfigs.release\n            def enableShrinkResources",
      );
      if (!src.includes("signingConfig signingConfigs.release")) {
        throw new Error("Não foi possível configurar a assinatura release do Android");
      }
    }
    config.modResults.contents = src;
    return config;
  });

  config = withDangerousMod(config, ["android", async (config) => {
    const root = config.modRequest.platformProjectRoot;
    const hardener = path.join(config.modRequest.projectRoot, "scripts/harden-react-native-webview.js");
    delete require.cache[require.resolve(hardener)];
    require(hardener);
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
