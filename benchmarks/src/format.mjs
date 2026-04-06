import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function printSummary(report) {
  console.log('\nReal ORM Benchmarks\n');
  console.log(`node: ${report.runtime.node}`);
  console.log(`platform: ${report.runtime.platform} (${report.runtime.arch})`);
  console.log(`environment: ${report.environment.mode} | ${report.environment.profile}`);
  if (report.environment.resources.stackCpus || report.environment.resources.stackMemory) {
    console.log(
      `resources: stack ${report.environment.resources.stackCpus ?? '?'} CPU / ${report.environment.resources.stackMemory ?? '?'} RAM | runner ${report.environment.resources.runnerCpus ?? '?'} CPU / ${report.environment.resources.runnerMemory ?? '?'} RAM`,
    );
  }
  console.log(`dialects: ${report.config.dialects.join(', ')}`);
  console.log(`orms: ${report.config.orms.join(', ')}`);
  console.log(`dataset: ${report.config.people} people | ${report.config.petsPerPerson} pets/person`);
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

export async function writeReport(outputPath, report) {
  const absoluteOutput = path.resolve(outputPath);
  const outputDirectory = path.dirname(absoluteOutput);
  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const archivePath = path.join(outputDirectory, `benchmark-${timestamp}.json`);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  await mkdir(outputDirectory, {
    recursive: true,
  });
  await writeFile(absoluteOutput, json);
  await writeFile(archivePath, json);

  return {
    latest: absoluteOutput,
    archive: archivePath,
  };
}

function summarizeHistoryEntry(report) {
  return {
    generatedAt: report.generatedAt,
    runtime: report.runtime,
    environment: report.environment,
    config: report.config,
    results: report.results.map((result) => ({
      adapter: result.adapter,
      dialect: result.dialect,
      scenario: result.scenario,
      opsPerSec: result.opsPerSec,
      avgMs: result.avgMs,
    })),
  };
}

function renderMarkdownReport(report) {
  const lines = [
    '# OBJX Benchmark Report',
    '',
    `Generated at: \`${report.generatedAt}\``,
    `Environment: \`${report.environment.mode}\` / \`${report.environment.profile}\``,
    `Runtime: \`${report.runtime.node}\` on \`${report.runtime.platform}\` (\`${report.runtime.arch}\`)`,
    `Dataset: \`${report.config.people}\` people / \`${report.config.petsPerPerson}\` pets per person`,
    `Runs: \`${report.config.warmup}\` warmup + \`${report.config.iterations}\` measured`,
    '',
  ];

  for (const dialect of report.config.dialects) {
    lines.push(`## ${dialect}`);
    lines.push('');
    lines.push('| Adapter | Scenario | Ops/s | ms/op |');
    lines.push('| --- | --- | ---: | ---: |');

    const dialectResults = report.results.filter((result) => result.dialect === dialect);

    for (const result of dialectResults) {
      lines.push(
        `| ${result.adapter} | ${result.scenario} | ${result.opsPerSec} | ${result.avgMs.toFixed(6)} |`,
      );
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

export async function writeVersionedBenchmarkReport(report) {
  const reportsDirectory = path.resolve('reports');
  const latestMarkdownPath = path.join(reportsDirectory, 'latest.md');
  const historyPath = path.join(reportsDirectory, 'history.json');
  let history = [];

  try {
    history = JSON.parse(await readFile(historyPath, 'utf8'));

    if (!Array.isArray(history)) {
      history = [];
    }
  } catch {
    history = [];
  }

  history.push(summarizeHistoryEntry(report));

  await mkdir(reportsDirectory, {
    recursive: true,
  });
  await writeFile(latestMarkdownPath, renderMarkdownReport(report));
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);

  return {
    latestMarkdown: latestMarkdownPath,
    history: historyPath,
  };
}
