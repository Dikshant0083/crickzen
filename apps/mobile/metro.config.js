const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The engine imports its TypeScript siblings as './x.js' (Node ESM style); Metro
// only finds them once the '.js' is dropped.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // A real .js file: fall through to the default lookup.
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
