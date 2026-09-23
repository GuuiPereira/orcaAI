const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// getSentryExpoConfig = getDefaultConfig do Expo + debug IDs pros source maps.
const config = getSentryExpoConfig(projectRoot);

// Metro precisa enxergar o resto do monorepo pnpm (packages/shared) para
// resolver @orcaai/shared, que fica fora de apps/mobile.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
