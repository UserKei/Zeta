import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';

let loaded = false;

function findWorkspaceRoot(startDir = process.cwd()) {
  let currentDir = startDir;

  while (true) {
    if (existsSync(join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

export function getZetaEnvFilePath() {
  const workspaceRoot = findWorkspaceRoot();
  const rootEnvPath = join(workspaceRoot, '.env');

  if (existsSync(rootEnvPath)) {
    return rootEnvPath;
  }

  const legacyServerEnvPath = join(workspaceRoot, 'server', '.env');
  if (existsSync(legacyServerEnvPath)) {
    return legacyServerEnvPath;
  }

  return undefined;
}

export function loadZetaEnv() {
  if (loaded) {
    return;
  }

  const envFilePath = getZetaEnvFilePath();
  if (envFilePath) {
    config({ path: envFilePath, override: false });
  }

  loaded = true;
}
