// Expo SDK 56 auto-configures Metro for monorepos (watchFolders / nodeModulesPaths),
// so we only extend the default config with one resolver tweak.
//
// The shared workspace packages (@tezosx/relayer, @tezosx/wallet-core) are
// consumed as raw TypeScript source and use explicit ".js" import specifiers
// (NodeNext style, e.g. `import … from '../shared/constants.js'` where the file
// is constants.ts). Vite and tsc map those ".js" specifiers to their ".ts"
// sources; Metro does not, so we rewrite a relative ".js" import to its ".ts"
// sibling when one exists, falling back to the original specifier otherwise.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if ((moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, `${moduleName.slice(0, -3)}.ts`, platform);
    } catch {
      // Not a TS-source module — fall through to the default resolver.
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
