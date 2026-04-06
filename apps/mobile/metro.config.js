const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Required for @metron/client which uses package.json "exports" field
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  "react-native",
  "import",
  "require",
  "default",
];

// Resolve .js imports to .ts files in workspace packages (e.g. @metron/client
// imports ./@tanstack/react-query.gen.js but the file is .ts)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Rewrite .js imports to .ts when resolving workspace packages
  if (moduleName.endsWith(".js") && !moduleName.includes("node_modules")) {
    const tsName = moduleName.replace(/\.js$/, ".ts");
    try {
      return context.resolveRequest(context, tsName, platform);
    } catch {}
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
