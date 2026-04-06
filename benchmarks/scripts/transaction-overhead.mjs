import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { createAdapters } from '../src/adapters/index.mjs';
import {
  applyDefaultDatabaseEnvironment,
  parseBenchmarkArgs,
  resolveBenchmarkEnvironmentMetadata,
} from '../src/config.mjs';

const scenarios = [
  {
    id: 'begin-commit',
    run(adapter) {
      if (typeof adapter.transactionBeginCommit !== 'function') {
        throw new Error(`Adapter "${adapter.name}" does not implement transactionBeginCommit().`);
      }

      return adapter.transactionBeginCommit();
    },
  },
  {
    id: 'begin-rollback',
    run(adapter) {
      if (typeof adapter.transactionBeginRollback !== 'function') {
        throw new Error(`Adapter "${adapter.name}" does not implement transactionBeginRollback().`);
      }

      return adapter.transactionBeginRollback();
    },
  },
];

async function measureScenario(adapter, scenario, config) {
  for (let iteration = 0; iteration < config.warmup; iteration += 1) {
    await scenario.run(adapter);
  }

  if (typeof global.gc === 'function') {
    global.gc();
  }

  const startedAt = performance.now();

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    await scenario.run(adapter);
  }

  const totalMs = performance.now() - startedAt;
  const avgMs = totalMs / config.iterations;
  const opsPerSec = config.iterations / (totalMs / 1000);

  return {
    orm: adapter.orm,
    dialect: adapter.dialect,
    adapter: adapter.name,
    scenario: scenario.id,
    iterations: config.iterations,
    warmup: config.warmup,
    totalMs: Number(totalMs.toFixed(3)),
    avgMs: Number(avgMs.toFixed(6)),
    opsPerSec: Number(opsPerSec.toFixed(2)),
  };
}

async function runTransactionBenchmarks(adapters, config) {
  const results = [];

  for (const adapter of adapters) {
    for (const scenario of scenarios) {
      results.push(await measureScenario(adapter, scenario, config));
    }
  }

  return results;
}

function printSummary(report) {
  console.log('\nTransaction Boundary Benchmarks\n');
  console.log(`node: ${report.runtime.node}`);
  console.log(`platform: ${report.runtime.platform} (${report.runtime.arch})`);
  console.log(`environment: ${report.environment.mode} | ${report.environment.profile}`);
  console.log(`dialects: ${report.config.dialects.join(', ')}`);
  console.log(`orms: ${report.config.orms.join(', ')}`);
  console.log(`runs: ${report.config.warmup} warmup + ${report.config.iterations} measured`);
  console.log('');

  for (const dialect of report.config.dialects) {
    console.log(`[${dialect}]`);

    const dialectResults = report.results.filter((result) => result.dialect === dialect);
    const adapters = [...new Set(dialectResults.map((result) => result.adapter))];

    for (const adapter of adapters) {
      console.log(`  ${adapter}`);

      for (const result of dialectResults.filter((entry) => entry.adapter === adapter)) {
        console.log(
          `    ${result.scenario.padEnd(24)} ${result.opsPerSec.toString().padStart(10)} ops/s | ${result.avgMs.toFixed(6)} ms/op`,
        );
      }
    }

    console.log('');
  }
}

function renderMarkdownReport(report) {
  const lines = [
    '# OBJX Transaction Benchmark Report',
    '',
    `Generated at: \`${report.generatedAt}\``,
    `Environment: \`${report.environment.mode}\` / \`${report.environment.profile}\``,
    `Runtime: \`${report.runtime.node}\` on \`${report.runtime.platform}\` (\`${report.runtime.arch}\`)`,
    `Runs: \`${report.config.warmup}\` warmup + \`${report.config.iterations}\` measured`,
    '',
  ];

  for (const dialect of report.config.dialects) {
    lines.push(`## ${dialect}`);
    lines.push('');
    lines.push('| Adapter | Scenario | Ops/s | ms/op |');
    lines.push('| --- | --- | ---: | ---: |');

    for (const result of report.results.filter((entry) => entry.dialect === dialect)) {
      lines.push(
        `| ${result.adapter} | ${result.scenario} | ${result.opsPerSec} | ${result.avgMs.toFixed(6)} |`,
      );
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function writeTransactionReport(report) {
  const outputDirectory = path.resolve('out');
  const reportsDirectory = path.resolve('reports');
  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const latestJson = path.join(outputDirectory, 'transaction-overhead.latest.json');
  const archiveJson = path.join(outputDirectory, `transaction-overhead-${timestamp}.json`);
  const latestMarkdown = path.join(reportsDirectory, 'transaction-overhead.latest.md');
  const historyPath = path.join(reportsDirectory, 'transaction-overhead.history.json');
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
    runtime: report.runtime,
    environment: report.environment,
    config: report.config,
    results: report.results,
  });

  await mkdir(outputDirectory, { recursive: true });
  await mkdir(reportsDirectory, { recursive: true });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(latestJson, json);
  await writeFile(archiveJson, json);
  await writeFile(latestMarkdown, renderMarkdownReport(report));
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);

  return {
    latestJson,
    archiveJson,
    latestMarkdown,
    historyPath,
  };
}

async function main() {
  const config = parseBenchmarkArgs(process.argv.slice(2));
  applyDefaultDatabaseEnvironment(config);
  const adapters = [];

  try {
    for (const adapter of await createAdapters(config)) {
      adapters.push(adapter);
    }

    const results = await runTransactionBenchmarks(adapters, config);
    const report = {
      generatedAt: new Date().toISOString(),
      kind: 'transaction-overhead',
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      environment: resolveBenchmarkEnvironmentMetadata(),
      config: {
        warmup: config.warmup,
        iterations: config.iterations,
        dialects: config.dialects,
        orms: config.orms,
      },
      results,
    };

    printSummary(report);
    const written = await writeTransactionReport(report);

    console.log(`JSON latest: ${written.latestJson}`);
    console.log(`JSON archive: ${written.archiveJson}`);
    console.log(`Report latest: ${written.latestMarkdown}`);
    console.log(`Report history: ${written.historyPath}`);
  } finally {
    for (let index = adapters.length - 1; index >= 0; index -= 1) {
      await adapters[index].close().catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
