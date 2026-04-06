import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function printSummary(report) {
  console.log('\nReal ORM Benchmarks\n');
  console.log(`node: ${report.runtime.node}`);
  console.log(`platform: ${report.runtime.platform} (${report.runtime.arch})`);
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
