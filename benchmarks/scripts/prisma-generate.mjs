import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
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

function resolveLocalPrismaEntrypoint() {
  return path.join(rootDir, 'node_modules', 'prisma', 'build', 'index.js');
}

async function assertLocalPrismaInstalled(entrypoint) {
  try {
    await access(entrypoint);
  } catch (error) {
    throw new Error(
      'Local Prisma CLI was not found. Run "npm install" inside benchmarks or "npm run benchmark:install" at the repo root first.',
      {
        cause: error,
      },
    );
  }
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
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
  const prismaEntrypoint = resolveLocalPrismaEntrypoint();

  await assertLocalPrismaInstalled(prismaEntrypoint);

  for (const schema of schemas) {
    await runCommand(process.execPath, [prismaEntrypoint, 'generate', '--schema', schema]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
