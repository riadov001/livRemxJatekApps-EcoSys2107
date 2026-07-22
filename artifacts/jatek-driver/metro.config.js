const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// ── Watch all workspace packages ──────────────────────────────────────────────
config.watchFolders = [workspaceRoot];

// ── pnpm symlink support ──────────────────────────────────────────────────────
// Required for pnpm which installs packages as symlinks into node_modules/.pnpm.
// Without this Metro cannot follow those symlinks to find real source files.
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// ── Module resolution paths ───────────────────────────────────────────────────
// Check project-local modules first, then fall back to workspace root so
// shared workspace devDependencies (e.g. TypeScript) are also resolvable.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// ── Block noisy directories from the watcher ──────────────────────────────────
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ignoredDirs = [
  path.resolve(workspaceRoot, ".local"),
  path.resolve(workspaceRoot, ".git"),
  path.resolve(workspaceRoot, "dist"),
  path.resolve(workspaceRoot, "build"),
];
config.resolver.blockList = [
  ...ignoredDirs.map((d) => new RegExp(`^${escapeRegExp(d)}(/.*)?$`)),
  // Exclude Expo postinstall temp dirs that pnpm creates then removes
  /_tmp_\d+/,
];

// ── Fix web bundle URL for pnpm virtual store paths ───────────────────────────
// Expo CLI resolves symlinks when writing the <script src> in the web index.html,
// producing a URL like:
//   /node_modules/.pnpm/expo-router@X/node_modules/expo-router/entry.bundle
// Metro's projectRoot is artifacts/jatek-driver; it can only serve files
// located under that root.  The workflow creates a symlink:
//   artifacts/jatek-driver/node_modules/.pnpm  →  workspace-root/node_modules/.pnpm
// so the pnpm virtual-store path is reachable from projectRoot via that symlink,
// and Metro can read the file through normal OS-level symlink resolution.
// No URL rewriting is needed — Metro receives the original URL and resolves it
// through the .pnpm symlink transparently.

module.exports = config;
