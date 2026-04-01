import { readFile } from 'node:fs/promises';

const allowedTypes = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
];

const commitMessageFile = process.argv[2];

if (!commitMessageFile) {
  console.error('Missing commit message file path.');
  process.exit(1);
}

const rawMessage = await readFile(commitMessageFile, 'utf8');
const header = rawMessage
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .find((line) => line.length > 0 && !line.startsWith('#'));

if (!header) {
  console.error('Commit message cannot be empty.');
  process.exit(1);
}

function isValidHeader(value) {
  if (value.startsWith('Merge ')) {
    return true;
  }

  if (value.startsWith('Revert "')) {
    return true;
  }

  if (value.startsWith('fixup! ') || value.startsWith('squash! ')) {
    return isValidHeader(value.slice(value.indexOf(' ') + 1));
  }

  if (value.length > 100) {
    return false;
  }

  const conventionalCommitPattern = new RegExp(
    `^(?:${allowedTypes.join('|')})(?:\\([a-z0-9._/-]+\\))?(?:!)?:\\s\\S.+$`,
    'u',
  );

  return conventionalCommitPattern.test(value);
}

if (!isValidHeader(header)) {
  console.error('Invalid commit message.');
  console.error('');
  console.error('Expected Conventional Commits format:');
  console.error('  type(scope): subject');
  console.error('  type: subject');
  console.error('');
  console.error(`Allowed types: ${allowedTypes.join(', ')}`);
  console.error('');
  console.error('Examples:');
  console.error('  feat(validation): add valibot adapter');
  console.error('  fix(ci): include dist in package tarballs');
  console.error('  chore: refresh lockfile');
  process.exit(1);
}
