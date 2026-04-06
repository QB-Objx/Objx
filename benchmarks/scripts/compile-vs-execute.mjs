import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { Pool } from 'pg';
import mysql from 'mysql2/promise';

import { Person } from '../src/models/objx.mjs';
import {
  applyDefaultDatabaseEnvironment,
  parseBenchmarkArgs,
  resolveBenchmarkEnvironmentMetadata,
} from '../src/config.mjs';
import { ObjxSqlCompiler } from '../../packages/sql-engine/dist/index.js';
import {
  createPostgresDriver,
  createPostgresSession,
} from '../../packages/postgres-driver/dist/index.js';
import {
  createMySqlDriver,
  createMySqlSession,
} from '../../packages/mysql-driver/dist/index.js';

function createMySqlConnectionOptions(connectionString) {
  const url = new URL(connectionString);

  return {
    host: url.hostname,
    port: Number.parseInt(url.port || '3306', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: 10,
  };
}

function createCompileScenarios(config) {
  return [
    {
      id: 'find-by-id',
      build() {
        return Person.query().where(({ id }, operators) => operators.eq(id, 1)).limit(1);
      },
      executeOptions: {
        hydrate: true,
      },
    },
    {
      id: 'list-page',
      build() {
        return Person.query().orderBy(({ id }) => id, 'asc').limit(config.pageSize).offset(0);
      },
      executeOptions: {
        hydrate: true,
      },
    },
    {
      id: 'update-active',
      build() {
        return Person.update({
          active: true,
        }).where(({ id }, operators) => operators.eq(id, 1));
      },
      executeOptions: {},
    },
  ];
}

async function createObjxRuntime(dialect, config) {
  if (dialect === 'postgres') {
    const pool = new Pool({
      connectionString: config.postgresUrl,
    });
    const driver = createPostgresDriver({
      pool,
      closePoolOnDispose: true,
    });
    const session = createPostgresSession({
      driver,
      hydrateByDefault: true,
    });

    return {
      driver,
      session,
      async close() {
        await driver.close();
      },
    };
  }

  if (dialect === 'mysql') {
    const pool = mysql.createPool(createMySqlConnectionOptions(config.mysqlUrl));
    const driver = createMySqlDriver({
      pool,
      closePoolOnDispose: true,
    });
    const session = createMySqlSession({
      driver,
      hydrateByDefault: true,
    });

    return {
      driver,
      session,
      async close() {
        await driver.close();
      },
    };
  }

  throw new Error(`Unsupported dialect "${dialect}" for compile benchmark.`);
}

async function measurePhase(name, run, config) {
  for (let iteration = 0; iteration < config.warmup; iteration += 1) {
    await run();
  }

  if (typeof global.gc === 'function') {
    global.gc();
  }

  const startedAt = performance.now();

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    await run();
  }

  const totalMs = performance.now() - startedAt;
  const avgMs = totalMs / config.iterations;
  const opsPerSec = config.iterations / (totalMs / 1000);

  return {
    phase: name,
    iterations: config.iterations,
    warmup: config.warmup,
    totalMs: Number(totalMs.toFixed(3)),
    avgMs: Number(avgMs.toFixed(6)),
    opsPerSec: Number(opsPerSec.toFixed(2)),
  };
}

async function runCompileBenchmarks(config) {
  const results = [];

  for (const dialect of config.dialects) {
    const runtime = await createObjxRuntime(dialect, config);

    try {
      const compilerWithCache = new ObjxSqlCompiler({
        dialect,
      });
      const compilerWithoutCache = new ObjxSqlCompiler({
        dialect,
        compileCacheSize: 0,
      });

      for (const scenario of createCompileScenarios(config)) {
        const query = scenario.build();
        const compiled = compilerWithCache.compile(query);
        const phases = [
          {
            name: 'compile-cache-hit',
            run: () => compilerWithCache.compile(query),
          },
          {
            name: 'compile-no-cache',
            run: () => compilerWithoutCache.compile(query),
          },
          {
            name: 'driver-execute-precompiled',
            run: () => runtime.driver.execute(compiled),
          },
          {
            name: 'session-execute-precompiled',
            run: () => runtime.session.execute(compiled),
          },
          {
            name: 'session-execute-builder',
            run: () => runtime.session.execute(query, scenario.executeOptions),
          },
        ];

        for (const phase of phases) {
          const measured = await measurePhase(phase.name, phase.run, config);

          results.push({
            dialect,
            scenario: scenario.id,
            ...measured,
          });
        }
      }
    } finally {
      await runtime.close().catch(() => {});
    }
  }

  return results;
}

function printSummary(report) {
  console.log('\nOBJX Compile vs Execute Benchmarks\n');
  console.log(`node: ${report.runtime.node}`);
  console.log(`platform: ${report.runtime.platform} (${report.runtime.arch})`);
  console.log(`environment: ${report.environment.mode} | ${report.environment.profile}`);
  console.log(`dialects: ${report.config.dialects.join(', ')}`);
  console.log(`runs: ${report.config.warmup} warmup + ${report.config.iterations} measured`);
  console.log('');

  for (const dialect of report.config.dialects) {
    console.log(`[${dialect}]`);

    const dialectResults = report.results.filter((result) => result.dialect === dialect);
    const scenarios = [...new Set(dialectResults.map((result) => result.scenario))];

    for (const scenario of scenarios) {
      console.log(`  ${scenario}`);

      for (const result of dialectResults.filter((entry) => entry.scenario === scenario)) {
        console.log(
          `    ${result.phase.padEnd(26)} ${result.opsPerSec.toString().padStart(10)} ops/s | ${result.avgMs.toFixed(6)} ms/op`,
        );
      }
    }

    console.log('');
  }
}

function renderMarkdownReport(report) {
  const lines = [
    '# OBJX Compile vs Execute Report',
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
    lines.push('| Scenario | Phase | Ops/s | ms/op |');
    lines.push('| --- | --- | ---: | ---: |');

    for (const result of report.results.filter((entry) => entry.dialect === dialect)) {
      lines.push(
        `| ${result.scenario} | ${result.phase} | ${result.opsPerSec} | ${result.avgMs.toFixed(6)} |`,
      );
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function writeCompileReport(report) {
  const outputDirectory = path.resolve('out');
  const reportsDirectory = path.resolve('reports');
  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const latestJson = path.join(outputDirectory, 'compile-vs-execute.latest.json');
  const archiveJson = path.join(outputDirectory, `compile-vs-execute-${timestamp}.json`);
  const latestMarkdown = path.join(reportsDirectory, 'compile-vs-execute.latest.md');
  const historyPath = path.join(reportsDirectory, 'compile-vs-execute.history.json');
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
  const results = await runCompileBenchmarks(config);
  const report = {
    generatedAt: new Date().toISOString(),
    kind: 'compile-vs-execute',
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    environment: resolveBenchmarkEnvironmentMetadata(),
    config: {
      warmup: config.warmup,
      iterations: config.iterations,
      pageSize: config.pageSize,
      dialects: config.dialects,
    },
    results,
  };

  printSummary(report);
  const written = await writeCompileReport(report);

  console.log(`JSON latest: ${written.latestJson}`);
  console.log(`JSON archive: ${written.archiveJson}`);
  console.log(`Report latest: ${written.latestMarkdown}`);
  console.log(`Report history: ${written.historyPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
