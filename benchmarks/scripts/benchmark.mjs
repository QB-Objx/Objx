import { createAdapters } from '../src/adapters/index.mjs';
import {
  applyDefaultDatabaseEnvironment,
  parseBenchmarkArgs,
  resolveBenchmarkEnvironmentMetadata,
} from '../src/config.mjs';
import {
  printSummary,
  writeReport,
  writeVersionedBenchmarkReport,
} from '../src/format.mjs';
import { runBenchmarks } from '../src/runner.mjs';

async function main() {
  const config = parseBenchmarkArgs(process.argv.slice(2));
  applyDefaultDatabaseEnvironment(config);
  const adapters = [];

  try {
    for (const adapter of await createAdapters(config)) {
      adapters.push(adapter);
    }

    const results = await runBenchmarks(adapters, config);
    const report = {
      generatedAt: new Date().toISOString(),
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      environment: resolveBenchmarkEnvironmentMetadata(),
      config: {
        people: config.people,
        petsPerPerson: config.petsPerPerson,
        warmup: config.warmup,
        iterations: config.iterations,
        pageSize: config.pageSize,
        dialects: config.dialects,
        orms: config.orms,
      },
      results,
    };

    printSummary(report);
    const written = await writeReport(config.outputPath, report);
    const versioned = await writeVersionedBenchmarkReport(report);

    console.log(`JSON latest: ${written.latest}`);
    console.log(`JSON archive: ${written.archive}`);
    console.log(`Report latest: ${versioned.latestMarkdown}`);
    console.log(`Report history: ${versioned.history}`);
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
