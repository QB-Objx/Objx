import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  'generated',
  'node_modules',
  'out',
];

async function main() {
  for (const target of targets) {
    await rm(path.join(rootDir, target), {
      force: true,
      recursive: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
