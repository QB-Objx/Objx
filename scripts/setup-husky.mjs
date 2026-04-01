import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const huskyDir = path.join(rootDir, '.husky');
const huskyInternalDir = path.join(huskyDir, '_');
const huskySourceScript = path.join(rootDir, 'node_modules', 'husky', 'husky');

function runGitConfig(command) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
      cwd: rootDir,
      stdio: 'inherit',
    });
  }

  return spawnSync('sh', ['-c', command], {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

if (!existsSync(path.join(rootDir, '.git'))) {
  console.log('Skipping Husky install because .git was not found.');
  process.exit(0);
}

if (!existsSync(huskySourceScript)) {
  console.error('Cannot install Husky hooks because node_modules/husky/husky was not found.');
  process.exit(1);
}

await mkdir(huskyInternalDir, { recursive: true });
await writeFile(path.join(huskyInternalDir, '.gitignore'), '*\n');
await copyFile(huskySourceScript, path.join(huskyInternalDir, 'h'));
await chmod(path.join(huskyInternalDir, 'h'), 0o755);
await writeFile(
  path.join(huskyInternalDir, 'commit-msg'),
  '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n',
);
await chmod(path.join(huskyInternalDir, 'commit-msg'), 0o755);

const gitResult = runGitConfig('git config core.hooksPath .husky/_');

if (gitResult.status !== 0) {
  console.error('Failed to configure git core.hooksPath for Husky.');
  process.exit(gitResult.status ?? 1);
}

console.log('Husky commit-msg hook installed.');
