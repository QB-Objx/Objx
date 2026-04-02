import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commandShell = process.env.ComSpec || 'cmd.exe';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const publishOrder = [
  'core',
  'validation',
  'sql-engine',
  'plugins',
  'sqlite-driver',
  'postgres-driver',
  'mysql-driver',
  'codegen',
  'nestjs',
];

function parseArgs(argv) {
  const options = {
    access: 'public',
    dryRun: false,
    skipBuild: false,
    skipPublishedCheck: false,
    tag: undefined,
    otp: undefined,
    from: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--skip-build':
        options.skipBuild = true;
        break;
      case '--skip-published-check':
        options.skipPublishedCheck = true;
        break;
      case '--tag':
        options.tag = argv[index + 1];
        index += 1;
        break;
      case '--otp':
        options.otp = argv[index + 1];
        index += 1;
        break;
      case '--access':
        options.access = argv[index + 1] ?? 'public';
        index += 1;
        break;
      case '--from':
        options.from = argv[index + 1];
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument "${argument}".`);
    }
  }

  return options;
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const commandToRun = process.platform === 'win32' ? commandShell : command;
    const commandArgs =
      process.platform === 'win32' ? ['/d', '/s', '/c', command, ...args] : args;

    const child = spawn(commandToRun, commandArgs, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      reject(
        new Error(`Command failed: ${command} ${args.join(' ')}\n${stdout}${stderr}`, {
          cause: error,
        }),
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(`Command failed: ${command} ${args.join(' ')}\n${stdout}${stderr}`, {
          cause: Object.assign(new Error(`Process exited with code ${code ?? 'unknown'}.`), {
            code,
            stdout,
            stderr,
          }),
        }),
      );
    });
  });
}

async function readWorkspacePackage(directoryName) {
  const packageJsonPath = path.join(rootDir, 'packages', directoryName, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  return {
    directoryName,
    packageDir: path.dirname(packageJsonPath),
    name: packageJson.name,
    version: packageJson.version,
    access: packageJson.publishConfig?.access ?? 'public',
  };
}

function resolvePublishList(packages, fromPackage) {
  if (!fromPackage) {
    return packages;
  }

  const normalized = fromPackage.toLowerCase();
  const startIndex = packages.findIndex(
    (pkg) => pkg.name.toLowerCase() === normalized || pkg.directoryName.toLowerCase() === normalized,
  );

  if (startIndex === -1) {
    throw new Error(`Could not find package "${fromPackage}" in publish order.`);
  }

  return packages.slice(startIndex);
}

async function isAlreadyPublished(pkg) {
  try {
    const { stdout } = await runCommand(
      npmCommand,
      ['view', `${pkg.name}@${pkg.version}`, 'version', '--json'],
      {
        cwd: rootDir,
      },
    );

    const parsed = JSON.parse(stdout);

    if (Array.isArray(parsed)) {
      return parsed.includes(pkg.version);
    }

    return parsed === pkg.version;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('E404') || message.includes('404 Not Found')) {
      return false;
    }

    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packages = await Promise.all(publishOrder.map((directory) => readWorkspacePackage(directory)));
  const publishList = resolvePublishList(packages, options.from);

  if (!options.skipBuild) {
    process.stdout.write('Building workspace before publish...\n');
    await runCommand(npmCommand, ['run', 'build'], {
      cwd: rootDir,
    });
  }

  if (!options.dryRun) {
    process.stdout.write('Verifying npm authentication...\n');
    await runCommand(npmCommand, ['whoami'], {
      cwd: rootDir,
    });
  }

  const published = [];
  const skipped = [];

  for (const pkg of publishList) {
    if (!options.skipPublishedCheck && (await isAlreadyPublished(pkg))) {
      skipped.push(`${pkg.name}@${pkg.version}`);
      process.stdout.write(`Skipping ${pkg.name}@${pkg.version} because it is already published.\n`);
      continue;
    }

    const publishArgs = ['publish', '--access', pkg.access || options.access];

    if (options.tag) {
      publishArgs.push('--tag', options.tag);
    }

    if (options.otp) {
      publishArgs.push('--otp', options.otp);
    }

    if (options.dryRun) {
      publishArgs.push('--dry-run');
    }

    process.stdout.write(`Publishing ${pkg.name}@${pkg.version}...\n`);
    await runCommand(npmCommand, publishArgs, {
      cwd: pkg.packageDir,
    });
    published.push(`${pkg.name}@${pkg.version}`);
  }

  process.stdout.write('\nPublish summary\n');
  process.stdout.write(`Published: ${published.length}\n`);

  for (const entry of published) {
    process.stdout.write(`  - ${entry}\n`);
  }

  process.stdout.write(`Skipped: ${skipped.length}\n`);

  for (const entry of skipped) {
    process.stdout.write(`  - ${entry}\n`);
  }
}

await main();
