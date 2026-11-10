// Packaging for Linux, Windows and macOS (electron-builder). Names and ids come from the brand
// module, so renaming the product happens in electron/brand.json only.
// Build the renderer first (npm run build writes dist-build); it is packaged as dist/.
const brand = require("./electron/brand.cjs");

// GitHub owner/repo for releases and updates: CI sets GITHUB_REPOSITORY; locally the origin remote.
function githubRepo() {
  let source = process.env.GITHUB_REPOSITORY || "";
  if (!source) try { source = require("node:child_process").execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not a clone */ }
  const match = /([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(source);
  return match ? { owner: match[1], repo: match[2] } : {};
}

// "Token Industries" -> "token-industries": executable, package and artifact names.
const slug = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: brand.appId,
  productName: brand.name,
  executableName: slug,
  artifactName: `${slug}-\${version}-\${os}-\${arch}.\${ext}`,
  copyright: `Copyright (c) The ${brand.name} contributors`,
  directories: { output: "release", buildResources: "build" },
  // Only what the running app reads: the main process, its skill text, the built renderer
  // (which carries its fonts, art and music) and the licenses.
  files: [
    "package.json",
    "electron/**/*",
    { from: "dist-build", to: "dist", filter: ["**/*"] },
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "TRADEMARKS.md",
  ],
  asar: true,
  // Installed builds update from GitHub Releases (electron/packaged-updater.cjs). The owner and
  // repository come from githubRepo(). CI uploads to a draft release.
  publish: [{ provider: "github", releaseType: "draft", ...githubRepo() }],
  // Wayland matches the window to its .desktop entry through this name.
  extraMetadata: { desktopName: `${slug}.desktop` },

  linux: {
    target: ["AppImage", "deb", "rpm"],
    icon: "build/icons",
    category: "Development",
    synopsis: "A living office for your T3 Code agents",
    description: "A cute desktop office on top of T3 Code: projects are offices, threads are robots at desks, and each robot's computer shows its real work.",
    maintainer: `The ${brand.name} contributors`,
    // Wayland when the session has it, X11 otherwise.
    executableArgs: ["--ozone-platform-hint=auto"],
    desktop: {
      entry: {
        Name: brand.name,
        Comment: "A living office for your T3 Code agents",
        Keywords: "AI;agents;T3;office;coding;",
        StartupWMClass: brand.name,
      },
    },
  },
  deb: { packageName: slug },
  rpm: { packageName: slug },
  appImage: { artifactName: `${slug}-\${version}-\${arch}.AppImage` },

  win: {
    target: [{ target: "nsis", arch: ["x64", "arm64"] }],
    icon: "build/icons/icon.ico",
    // Unsigned by default. docs/releasing.md describes free signing through SignPath Foundation.
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: brand.name,
    uninstallDisplayName: brand.name,
  },

  mac: {
    target: [{ target: "dmg", arch: ["universal"] }],
    icon: "build/icons/icon.icns",
    category: "public.app-category.developer-tools",
    // Ad-hoc signature: free and enough for Apple silicon to run the app. No Apple account,
    // no notarization, so first launch needs "Open Anyway" (README).
    identity: "-",
    // Without the hardened runtime no entitlements are needed; the microphone prompt uses this text.
    hardenedRuntime: false,
    gatekeeperAssess: false,
    extendInfo: { NSMicrophoneUsageDescription: "Dictation records your voice and sends it to the T3 Code speech service on this computer." },
  },
  dmg: { artifactName: `${slug}-\${version}-mac-universal.dmg`, writeUpdateInfo: false },
};
