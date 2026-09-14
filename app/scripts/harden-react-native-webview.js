const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const packageRoot = path.join(appRoot, "node_modules", "react-native-webview");
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const supportedVersions = new Set(["13.15.0", "13.16.1"]);

if (!supportedVersions.has(packageJson.version)) {
  throw new Error(`Versão inesperada de react-native-webview: ${packageJson.version}`);
}

function replace(relativePath, pattern, replacement, marker) {
  const filePath = path.join(packageRoot, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  if (source.includes(marker)) return;
  if (!pattern.test(source)) throw new Error(`Não foi possível endurecer ${relativePath}`);
  fs.writeFileSync(filePath, source.replace(pattern, replacement));
}

replace(
  "src/WebViewShared.tsx",
  /import \{ Linking, View, ActivityIndicator, Text, Platform \} from 'react-native';/,
  "import { View, ActivityIndicator, Text, Platform } from 'react-native';",
  "import { View, ActivityIndicator, Text, Platform } from 'react-native';",
);

replace(
  "src/WebViewShared.tsx",
  /if \(!passesWhitelist\(compileWhitelist\(originWhitelist\), url\)\) \{[\s\S]*?      shouldStart = false;\n    \} else if \(onShouldStartLoadWithRequest\) \{/,
  `if (!passesWhitelist(compileWhitelist(originWhitelist), url)) {
      shouldStart = false;
    } else if (onShouldStartLoadWithRequest) {`,
  "if (!passesWhitelist(compileWhitelist(originWhitelist), url)) {\n      shouldStart = false;",
);

replace(
  "lib/WebViewShared.js",
  /if\(!passesWhitelist\(compileWhitelist\(originWhitelist\),url\)\)\{_reactNative\.Linking\.canOpenURL\(url\)[\s\S]*?shouldStart=false;\}/,
  "if(!passesWhitelist(compileWhitelist(originWhitelist),url)){shouldStart=false;}",
  "if(!passesWhitelist(compileWhitelist(originWhitelist),url)){shouldStart=false;}",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /import android\.net\.http\.SslError;/,
  `import android.net.Uri;
import android.net.http.SslError;`,
  "import android.net.Uri;",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /    private static String TAG = "RNCWebViewClient";/,
  `    private static String TAG = "RNCWebViewClient";
    private static final String CAS_HOST = "login.app.ufgd.edu.br";
    private static final String SIGECAD_HOST = "sigecad-academico.app.ufgd.edu.br";
    private static final String[] SIGECAD_ALLOWED_HOSTS = {
        CAS_HOST,
        SIGECAD_HOST,
        "cartao.app.ufgd.edu.br",
        "webdoc.app.ufgd.edu.br",
        "challenges.cloudflare.com",
        "sso.acesso.gov.br"
    };

    private boolean isSigecadAllowedHost(String host) {
        if (host == null) return false;
        for (String allowedHost : SIGECAD_ALLOWED_HOSTS) {
            if (allowedHost.equalsIgnoreCase(host)) return true;
        }
        return false;
    }

    private boolean isSigecadHttpUpgradeHost(String host) {
        return host != null && (CAS_HOST.equalsIgnoreCase(host) || SIGECAD_HOST.equalsIgnoreCase(host));
    }

    private @Nullable Boolean applySigecadNavigationPolicy(WebView view, String value) {
        if ("about:blank".equals(value)) return null;
        final Uri uri;
        try {
            uri = Uri.parse(value);
        } catch (RuntimeException error) {
            return true;
        }
        final String scheme = uri.getScheme();
        final String host = uri.getHost();
        final int port = uri.getPort();
        if ("http".equalsIgnoreCase(scheme) && isSigecadHttpUpgradeHost(host) &&
            uri.getUserInfo() == null && (port == -1 || port == 80)) {
            final Uri destination = uri.buildUpon().scheme("https").encodedAuthority(host).build();
            view.loadUrl(destination.toString());
            return true;
        }
        if (!"https".equalsIgnoreCase(scheme)) return true;
        if (uri.getUserInfo() != null || (port != -1 && port != 443)) return true;
        if (!isSigecadAllowedHost(host)) return true;
        return null;
    }`,
  "SIGECAD_ALLOWED_HOSTS",
);

// Upgrade installations already hardened by an earlier revision of this
// script. Fresh installs already contain these markers from the block above.
replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /    private static final String SIGECAD_HOST = "sigecad-academico\.app\.ufgd\.edu\.br";/,
  `    private static final String CAS_HOST = "login.app.ufgd.edu.br";
    private static final String SIGECAD_HOST = "sigecad-academico.app.ufgd.edu.br";`,
  "private static final String CAS_HOST",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /        "login\.app\.ufgd\.edu\.br",/,
  "        CAS_HOST,",
  "        CAS_HOST,",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /    private @Nullable Boolean applySigecadNavigationPolicy/,
  `    private boolean isSigecadHttpUpgradeHost(String host) {
        return host != null && (CAS_HOST.equalsIgnoreCase(host) || SIGECAD_HOST.equalsIgnoreCase(host));
    }

    private @Nullable Boolean applySigecadNavigationPolicy`,
  "private boolean isSigecadHttpUpgradeHost",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /if \("http"\.equalsIgnoreCase\(scheme\) && SIGECAD_HOST\.equalsIgnoreCase\(host\) &&\n            uri\.getUserInfo\(\) == null && \(port == -1 \|\| port == 80\)\) \{\n            final Uri destination = uri\.buildUpon\(\)\.scheme\("https"\)\.encodedAuthority\(SIGECAD_HOST\)\.build\(\);/,
  `if ("http".equalsIgnoreCase(scheme) && isSigecadHttpUpgradeHost(host) &&
            uri.getUserInfo() == null && (port == -1 || port == 80)) {
            final Uri destination = uri.buildUpon().scheme("https").encodedAuthority(host).build();`,
  'if ("http".equalsIgnoreCase(scheme) && isSigecadHttpUpgradeHost(host)',
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /        "webdoc\.app\.ufgd\.edu\.br",\n        "sso\.acesso\.gov\.br"/,
  `        "webdoc.app.ufgd.edu.br",
        "challenges.cloudflare.com",
        "sso.acesso.gov.br"`,
  '        "challenges.cloudflare.com",',
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /    private @Nullable Boolean applySigecadNavigationPolicy/,
  `    private boolean shouldHideSigecadDocument(String value) {
        final Uri uri;
        try {
            uri = Uri.parse(value);
        } catch (RuntimeException error) {
            return true;
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
        final String host = uri.getHost();
        return SIGECAD_HOST.equalsIgnoreCase(host) ||
            "cartao.app.ufgd.edu.br".equalsIgnoreCase(host) ||
            "webdoc.app.ufgd.edu.br".equalsIgnoreCase(host);
    }

    private boolean shouldBlockSigecadSubframe(String value) {
        final Uri uri;
        try {
            uri = Uri.parse(value);
        } catch (RuntimeException error) {
            return true;
        }
        final String scheme = uri.getScheme();
        if (scheme == null) return true;
        return !"https".equalsIgnoreCase(scheme) &&
            !"about".equalsIgnoreCase(scheme) &&
            !"data".equalsIgnoreCase(scheme) &&
            !"blob".equalsIgnoreCase(scheme);
    }

    private @Nullable Boolean applySigecadNavigationPolicy`,
  "shouldBlockSigecadSubframe",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /    public boolean shouldOverrideUrlLoading\(WebView view, String url\) \{\n        final RNCWebView rncWebView/,
  `    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        final Boolean sigecadDecision = applySigecadNavigationPolicy(view, url);
        if (sigecadDecision != null) return sigecadDecision;
        final RNCWebView rncWebView`,
  "final Boolean sigecadDecision = applySigecadNavigationPolicy",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /    public void onPageStarted\(WebView webView, String url, Bitmap favicon\) \{\n      super\.onPageStarted\(webView, url, favicon\);/,
  `    public void onPageStarted(WebView webView, String url, Bitmap favicon) {
      webView.setAlpha(shouldHideSigecadDocument(url) ? 0.0f : 1.0f);
      super.onPageStarted(webView, url, favicon);`,
  "webView.setAlpha(shouldHideSigecadDocument(url) ? 0.0f : 1.0f);",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java",
  /    public boolean shouldOverrideUrlLoading\(WebView view, WebResourceRequest request\) \{\n(?:        if \(!request\.isForMainFrame\(\)\) return false;\n)?        final String url = request\.getUrl\(\)\.toString\(\);\n        return this\.shouldOverrideUrlLoading\(view, url\);\n    \}/,
  `    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        final String url = request.getUrl().toString();
        if (!request.isForMainFrame()) return shouldBlockSigecadSubframe(url);
        return this.shouldOverrideUrlLoading(view, url);
    }`,
  "return shouldBlockSigecadSubframe(url);",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebChromeClient.java",
  /import android\.webkit\.PermissionRequest;/,
  `import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;`,
  "import android.webkit.WebResourceRequest;",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebChromeClient.java",
  /    @Override\n    public boolean onCreateWindow\(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg\) \{[\s\S]*?\n    \}\n\n    @Override\n    public boolean onConsoleMessage/,
  `    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        if (!mHasOnOpenWindowEvent) return false;
        final WebView newWebView = new WebView(view.getContext());
        newWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView subview, String url) {
                if (!"about:blank".equals(url)) view.loadUrl(url);
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView subview, WebResourceRequest request) {
                final String url = request.getUrl().toString();
                if (!"about:blank".equals(url)) view.loadUrl(url);
                return true;
            }
        });
        final WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(newWebView);
        resultMsg.sendToTarget();
        return true;
    }

    @Override
    public boolean onConsoleMessage`,
  "if (!\"about:blank\".equals(url)) view.loadUrl(url);",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebChromeClient.java",
  /                if \(!"about:blank"\.equals\(url\)\) view\.loadUrl\(url\);\n                return true;/g,
  `                if (!"about:blank".equals(url)) view.loadUrl(url);
                subview.stopLoading();
                subview.destroy();
                return true;`,
  "subview.destroy();",
);

replace(
  "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewManagerImpl.kt",
  /settings\.setSupportMultipleWindows\(true\)/,
  "settings.setSupportMultipleWindows(false)",
  "settings.setSupportMultipleWindows(false)",
);

console.log("react-native-webview endurecida para o SIGECAD");
