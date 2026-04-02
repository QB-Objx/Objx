import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULTS,
  applyDefaultDatabaseEnvironment,
} from '../src/config.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveSchemas(argv) {
  const mode = argv[0] ?? 'all';

  if (mode === 'postgres') {
    return ['prisma/postgres/schema.prisma'];
  }

  if (mode === 'mysql') {
    return ['prisma/mysql/schema.prisma'];
  }

  if (mode === 'all') {
    return [
      'prisma/postgres/schema.prisma',
      'prisma/mysql/schema.prisma',
    ];
  }

  throw new Error(`Unknown prisma generate mode "${mode}". Use "postgres", "mysql", or "all".`);
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

async function main() {
  applyDefaultDatabaseEnvironment(DEFAULTS);
  const schemas = resolveSchemas(process.argv.slice(2));

  for (const schema of schemas) {
    await runCommand('npx', ['prisma', 'generate', '--schema', schema]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
