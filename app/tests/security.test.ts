import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hmacSha256hex, parseHmacKeyHex, sha256hex } from "../src/core/sha256";
import { sealItems } from "../src/storage/sealed";
import { h } from "../src/core/hash";
import {
  BRIDGE_BOOTSTRAP,
  CARD_BRIDGE_BOOTSTRAP,
  parseBridgeResponse,
  PortalBridgeError,
} from "../src/expo-go/bridge";
import {
  CARD_ORIGIN,
  CAS_ORIGIN,
  GOV_BR_ORIGIN,
  SESSION_ORIGINS,
  SIGECAD_ORIGIN,
  WEBDOC_ORIGIN,
  WEBVIEW_ORIGIN_WHITELIST,
  isAllowedSessionUrl,
  isBridgeUrl,
  isLoginUrl,
  isStableAcademicUrl,
  hasCasServiceTicket,
  rewriteSessionNavigationUrl,
} from "../src/expo-go/origins";
import { SENTINEL_ENABLED } from "../src/native/sentinelFlag";

let failures = 0;
let total = 0;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function check(name: string, test: () => void | Promise<void>) {
  total += 1;
  try {
    await test();
    console.log(`  ok   ${name}`);
  } catch (cause) {
    failures += 1;
    console.log(`  FAIL ${name}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

function assert(condition: unknown, message = "assert falhou"): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8");
}

async function main() {
await check("HMAC-SHA256 bate no vetor RFC 4231", () => {
  const key = Array.from({ length: 20 }, () => 0x0b);
  assert(
    hmacSha256hex(key, "Hi There") ===
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  );
});

await check("notas previsíveis não saem do HMAC persistido", () => {
  const key = parseHmacKeyHex("11".repeat(32));
  const digest = hmacSha256hex(key, "v|9.5|1");
  assert(digest.length === 64);
  assert(!digest.includes("9.5"));
  assert(digest !== sha256hex("9.5"));
  assert(digest !== h("9.5"));
  const other = hmacSha256hex(parseHmacKeyHex("22".repeat(32)), "v|9.5|1");
  assert(digest !== other);
});

await check("selagem remove rótulos e códigos de turma", () => {
  const sealed = sealItems({
    "07008721::P1::A1": { hash: h("9.5|True"), publicar: 1 },
  }, "ab".repeat(32));
  const blob = JSON.stringify(sealed);
  assert(!blob.includes("07008721"));
  assert(!blob.includes("ANÁLISE"));
  assert(!blob.includes("9.5"));
  assert(Object.keys(sealed)[0]?.length === 64);
});

await check("somente origens da sessão autenticada são permitidas", () => {
  assert(isAllowedSessionUrl(`${CAS_ORIGIN}/login`));
  assert(isAllowedSessionUrl(`${SIGECAD_ORIGIN}/`));
  assert(isAllowedSessionUrl(`${CARD_ORIGIN}/cartoes_usuario/visualiza_pessoa`));
  assert(isAllowedSessionUrl(`${GOV_BR_ORIGIN}/authorize`));
  assert(!isAllowedSessionUrl("http://login.app.ufgd.edu.br/"));
  assert(!isAllowedSessionUrl("https://evil.ufgd.edu.br/"));
  assert(!isAllowedSessionUrl("https://ufgd.edu.br/"));
  assert(!isAllowedSessionUrl("https://www.ufgd.edu.br/"));
  assert(!isAllowedSessionUrl("https://sso.gov.br/"));
  assert(!isAllowedSessionUrl("https://accounts.google.com/"));
  assert(!isAllowedSessionUrl(`${WEBDOC_ORIGIN}/gerar`));
  assert(!isBridgeUrl(`${CAS_ORIGIN}/`));
  assert(isBridgeUrl(`${SIGECAD_ORIGIN}/rest/notas`));
  assert(isLoginUrl(`${CAS_ORIGIN}/?service=x`));
  assert(SESSION_ORIGINS.length === 4);
  assert(WEBVIEW_ORIGIN_WHITELIST.length === 1 && WEBVIEW_ORIGIN_WHITELIST[0] === "*");
});

await check("redirect HTTP do SIGECAD permanece no app em HTTPS", () => {
  const ticket = "ST-test-ticket";
  assert(rewriteSessionNavigationUrl("http://sigecad-academico.app.ufgd.edu.br/") === `${SIGECAD_ORIGIN}/`);
  assert(
    rewriteSessionNavigationUrl(`http://sigecad-academico.app.ufgd.edu.br/?ticket=${ticket}`) ===
      `${SIGECAD_ORIGIN}/?ticket=${ticket}`,
  );
  assert(
    rewriteSessionNavigationUrl(`${CAS_ORIGIN}/?service=${encodeURIComponent("http://sigecad-academico.app.ufgd.edu.br/")}`) ===
      `${CAS_ORIGIN}/?service=${encodeURIComponent(`${SIGECAD_ORIGIN}/`)}`,
  );
  assert(rewriteSessionNavigationUrl(`${SIGECAD_ORIGIN}/`) === null);
  assert(rewriteSessionNavigationUrl(`${CAS_ORIGIN}/?service=${encodeURIComponent(`${SIGECAD_ORIGIN}/`)}`) === null);
  assert(rewriteSessionNavigationUrl("http://evil.ufgd.edu.br/") === null);
  assert(rewriteSessionNavigationUrl("http://user:pass@sigecad-academico.app.ufgd.edu.br/") === null);
  assert(!isAllowedSessionUrl("http://sigecad-academico.app.ufgd.edu.br/"));
});

await check("ticket CAS não é sessão acadêmica estável e não vaza no helper", () => {
  const ticket = `${SIGECAD_ORIGIN}/?ticket=ST-secret-value`;
  assert(hasCasServiceTicket(ticket));
  assert(!isStableAcademicUrl(ticket));
  assert(isStableAcademicUrl(`${SIGECAD_ORIGIN}/`));
  assert(!hasCasServiceTicket(`${SIGECAD_ORIGIN}/`));
  assert(!hasCasServiceTicket(`${CAS_ORIGIN}/?ticket=ST-secret-value`));
  const helper = source("src/expo-go/origins.ts");
  assert(helper.includes("url.searchParams.has(\"ticket\")"));
  assert(!helper.includes("searchParams.get(\"ticket\")"));
});

await check("ponte nunca lê cookie, senha ou caminho livre", () => {
  for (const blob of [BRIDGE_BOOTSTRAP, CARD_BRIDGE_BOOTSTRAP]) {
    assert(!blob.includes("document.cookie"));
    assert(!blob.includes("password"));
    assert(!blob.includes("user.password"));
    assert(!blob.includes("request.path"));
    assert(!blob.includes("request.url"));
  }
  try {
    parseBridgeResponse(JSON.stringify({
      channel: "sigecad-expo-go-v1",
      id: "req-1",
      ok: true,
      status: 200,
      data: { cookie: "UFGDNET=secret" },
    }));
  } catch (cause) {
    assert(cause instanceof PortalBridgeError);
  }
});

await check("App de produção não monta sentinela Firebase", () => {
  const app = source("App.tsx");
  assert(app.includes("ExpoGoApp"));
  assert(!app.includes("NativeApp"));
  assert(!app.includes("@react-native-firebase"));
  assert(!app.includes("wipeAcademicPersistence"));
  assert(!app.includes("clearToken"));
  assert(!app.includes("useEffect"));
  assert(!SENTINEL_ENABLED);
});

await check("login nativo não extrai UFGDNET", () => {
  const login = source("src/native/NativeLoginScreen.tsx");
  assert(!login.includes("CookieManager"));
  assert(!login.includes("saveToken"));
  assert(!login.includes("UFGDNET"));
  assert(login.includes("isAllowedSessionUrl"));
  assert(login.includes("rewriteSessionNavigationUrl"));
  assert(login.includes("KEEP_SESSION_NAVIGATION_SCRIPT"));
  assert(login.includes("setSupportMultipleWindows={false}"));
});

await check("WebView de sessão está endurecida", () => {
  const session = source("src/expo-go/PortalSession.tsx");
  assert(session.includes('webviewDebuggingEnabled={false}'));
  assert(session.includes('mixedContentMode="never"'));
  assert(session.includes("allowFileAccess={false}"));
  assert(session.includes("incognito={false}"));
  assert(session.includes("sharedCookiesEnabled"));
  assert(!session.includes("sharedCookiesEnabled={false}"));
  assert(session.includes("thirdPartyCookiesEnabled={false}"));
  assert(session.includes("cacheEnabled={false}"));
  assert(session.includes("originWhitelist={[...WEBVIEW_ORIGIN_WHITELIST]}"));
  assert(session.includes("destroyBrowserSession"));
  assert(session.includes("beginLogin(true)"));
  assert(session.includes("CookieManager.clearAll"));
  assert(!session.includes("CookieManager.get"));
  assert(session.includes("if (origin !=="));
  assert(!session.includes("endsWith(\".ufgd.edu.br\")"));
  assert(session.includes("onOpenWindow={onOpenWindow}"));
  assert(session.includes("setSupportMultipleWindows={false}"));
  assert(!session.includes("          setSupportMultipleWindows\n"));
  assert(session.includes("isAllowedSessionUrl(url)"));
  assert(session.includes("rewriteSessionNavigationUrl"));
  assert(session.includes("KEEP_SESSION_NAVIGATION_SCRIPT"));
  assert(source("src/expo-go/origins.ts").includes("window.open = function (url)"));
  assert(!session.includes("Linking.openURL"));
});

await check("plugin e app.json endurecem o Android de produção", () => {
  const plugin = source("plugins/withPrivacyHardening.js");
  const hardener = source("scripts/harden-react-native-webview.js");
  const packageJson = source("package.json");
  const appJson = source("app.json");
  assert(plugin.includes('android:allowBackup"] = "false"'));
  assert(!plugin.includes("window.setFlags(WindowManager.LayoutParams.FLAG_SECURE"));
  assert(plugin.includes("cleartextTrafficPermitted"));
  assert(plugin.includes("harden-react-native-webview.js"));
  assert(plugin.includes("withAppBuildGradle"));
  assert(plugin.includes("signingConfig signingConfigs.release"));
  assert(plugin.includes("SIGECAD_UPLOAD_STORE_FILE"));
  assert(packageJson.includes('"postinstall": "node scripts/harden-react-native-webview.js"'));
  assert(hardener.includes('new Set(["13.15.0", "13.16.1"])'));
  assert(hardener.includes("SIGECAD_ALLOWED_HOSTS"));
  assert(hardener.includes("applySigecadNavigationPolicy"));
  assert(hardener.includes('view.loadUrl(destination.toString())'));
  assert(hardener.includes('if (!"about:blank".equals(url)) view.loadUrl(url)'));
  const installedShared = resolve(root, "node_modules/react-native-webview/src/WebViewShared.tsx");
  const installedSharedBuild = resolve(root, "node_modules/react-native-webview/lib/WebViewShared.js");
  const installedClient = resolve(root, "node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java");
  if (existsSync(installedShared) && existsSync(installedSharedBuild) && existsSync(installedClient)) {
    const shared = readFileSync(installedShared, "utf8");
    const sharedBuild = readFileSync(installedSharedBuild, "utf8");
    const client = readFileSync(installedClient, "utf8");
    assert(!shared.includes("Linking.openURL"));
    assert(!shared.includes("Linking.canOpenURL"));
    assert(!sharedBuild.includes("Linking.openURL"));
    assert(!sharedBuild.includes("Linking.canOpenURL"));
    assert(client.includes("SIGECAD_ALLOWED_HOSTS"));
    assert(client.includes("applySigecadNavigationPolicy"));
    assert(client.includes("if (!request.isForMainFrame()) return false;"));
  }
  assert(appJson.includes("withPrivacyHardening"));
  assert(appJson.includes('"allowBackup": false'));
  assert(appJson.includes("usesCleartextTraffic"));
  const manifestPath = resolve(root, "android/app/src/main/AndroidManifest.xml");
  if (existsSync(manifestPath)) {
    const gradle = source("android/app/build.gradle");
    const manifest = readFileSync(manifestPath, "utf8");
    const activity = source("android/app/src/main/java/br/edu/ufgd/notificador/MainActivity.kt");
    const network = source("android/app/src/main/res/xml/network_security_config.xml");
    const debug = source("android/app/src/debug/AndroidManifest.xml");
    assert(manifest.includes('android:allowBackup="false"'));
    assert(gradle.includes("signingConfig signingConfigs.release"));
    assert(manifest.includes("network_security_config"));
    assert(manifest.includes('android:usesCleartextTraffic="false"'));
    assert(!activity.includes("FLAG_SECURE"));
    assert(!activity.includes("WindowManager"));
    assert(network.includes('cleartextTrafficPermitted="false"'));
    assert(!debug.includes('usesCleartextTraffic="true"'));
  }
});

await check("dashboard não grava snapshot acadêmico", () => {
  const design = source("src/expo-go/design/DesignExpoGoApp.tsx");
  assert(!design.includes("savePreviewState"));
  assert(design.includes("clearPreviewState"));
});

  console.log(`\n${total - failures}/${total} passaram`);
  process.exit(failures ? 1 : 0);
}

void main();
