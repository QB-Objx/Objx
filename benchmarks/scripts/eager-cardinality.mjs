import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createAdapters } from '../src/adapters/index.mjs';
import {
  applyDefaultDatabaseEnvironment,
  parseBenchmarkArgs,
  resolveBenchmarkEnvironmentMetadata,
} from '../src/config.mjs';
import { resetDatabases } from './reset-databases.mjs';
import { runBenchmarksForScenarios } from '../src/runner.mjs';

function parseCardinalities(argv) {
  const cardinalities = [1, 3, 10, 25];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--cardinalities') {
      continue;
    }

    const next = argv[index + 1];

    if (!next) {
      throw new Error('Missing value for --cardinalities.');
    }

    const parsed = next
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (parsed.length === 0) {
      throw new Error('At least one positive integer must be provided to --cardinalities.');
    }

    return [...new Set(parsed)];
  }

  return cardinalities;
}

function withoutCardinalityArgs(argv) {
  const filtered = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--cardinalities') {
      index += 1;
      continue;
    }

    filtered.push(argv[index]);
  }

  return filtered;
}

function printSummary(report) {
  console.log('\nOBJX Eager Cardinality Benchmark\n');
  console.log(`node: ${report.runtime.node}`);
  console.log(`platform: ${report.runtime.platform} (${report.runtime.arch})`);
  console.log(`environment: ${report.environment.mode} | ${report.environment.profile}`);
  console.log(`scenario: ${report.scenario}`);
  console.log(`people: ${report.config.people}`);
  console.log(`runs: ${report.config.warmup} warmup + ${report.config.iterations} measured`);
  console.log('');

  for (const cardinality of report.cardinalities) {
    console.log(`[pets/person=${cardinality}]`);

    const cardinalityResults = report.results.filter((result) => result.petsPerPerson === cardinality);
    const adapters = [...new Set(cardinalityResults.map((result) => result.adapter))];

    for (const adapter of adapters) {
      for (const result of cardinalityResults.filter((entry) => entry.adapter === adapter)) {
        console.log(
          `  ${adapter.padEnd(22)} ${result.opsPerSec.toString().padStart(10)} ops/s | ${result.avgMs.toFixed(6)} ms/op`,
        );
      }
    }

    console.log('');
  }
}

async function writeCardinalityReport(report) {
  const outDirectory = path.resolve('out');
  const reportsDirectory = path.resolve('reports');
  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const latestJson = path.join(outDirectory, 'eager-cardinality.latest.json');
  const archiveJson = path.join(outDirectory, `eager-cardinality.${timestamp}.json`);
  const latestMarkdown = path.join(reportsDirectory, 'eager-cardinality.latest.md');
  const historyPath = path.join(reportsDirectory, 'eager-cardinality.history.json');
  const json = `${JSON.stringify(report, null, 2)}\n`;

  let history = [];

  try {
    history = JSON.parse(await readFile(historyPath, 'utf8'));

    if (!Array.isArray(history)) {
      history = [];
    }
  } catch {
    history = [];
  }

  history.push({
    generatedAt: report.generatedAt,
    environment: report.environment,
    config: report.config,
    cardinalities: report.cardinalities,
    results: report.results,
  });

  const markdownLines = [
    '# OBJX Eager Cardinality Benchmark',
    '',
    `Generated at: \`${report.generatedAt}\``,
    `Environment: \`${report.environment.mode}\` / \`${report.environment.profile}\``,
    `Scenario: \`${report.scenario}\``,
    `People: \`${report.config.people}\``,
    `Runs: \`${report.config.warmup}\` warmup + \`${report.config.iterations}\` measured`,
    '',
    '| Pets / Person | Adapter | Ops/s | ms/op |',
    '| ---: | --- | ---: | ---: |',
  ];

  for (const result of report.results) {
    markdownLines.push(
      `| ${result.petsPerPerson} | ${result.adapter} | ${result.opsPerSec} | ${result.avgMs.toFixed(6)} |`,
    );
  }

  markdownLines.push('');

  await mkdir(outDirectory, { recursive: true });
  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(latestJson, json);
  await writeFile(archiveJson, json);
  await writeFile(latestMarkdown, `${markdownLines.join('\n')}\n`);
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);

  return {
    latestJson,
    archiveJson,
    latestMarkdown,
    historyPath,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const cardinalities = parseCardinalities(argv);
  const config = parseBenchmarkArgs(withoutCardinalityArgs(argv));
  applyDefaultDatabaseEnvironment(config);
  const results = [];

  for (const petsPerPerson of cardinalities) {
    const runConfig = {
      ...config,
      petsPerPerson,
    };

    process.stdout.write(`Resetting benchmark dataset for ${petsPerPerson} pets/person...\n`);
    await resetDatabases(runConfig);

    const adapters = [];

    try {
      for (const adapter of await createAdapters(runConfig)) {
        adapters.push(adapter);
      }

      const eagerResults = await runBenchmarksForScenarios(adapters, runConfig, ['find-with-pets']);
      results.push(
        ...eagerResults.map((entry) => ({
          ...entry,
          petsPerPerson,
        })),
      );
    } finally {
      for (let index = adapters.length - 1; index >= 0; index -= 1) {
        await adapters[index].close().catch(() => {});
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    environment: resolveBenchmarkEnvironmentMetadata(),
    scenario: 'find-with-pets',
    cardinalities,
    config: {
      people: config.people,
      warmup: config.warmup,
      iterations: config.iterations,
      dialects: config.dialects,
      orms: config.orms,
    },
    results,
  };

  printSummary(report);
  const written = await writeCardinalityReport(report);

  console.log(`JSON latest: ${written.latestJson}`);
  console.log(`JSON archive: ${written.archiveJson}`);
  console.log(`Report latest: ${written.latestMarkdown}`);
  console.log(`Report history: ${written.historyPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
