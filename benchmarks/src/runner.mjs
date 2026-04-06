import { performance } from 'node:perf_hooks';

const scenarios = [
  {
    id: 'find-by-id',
    run(adapter, context, iteration) {
      return adapter.findPersonById(context.lookupId(iteration));
    },
  },
  {
    id: 'find-with-pets',
    run(adapter, context, iteration) {
      return adapter.findPersonWithPets(context.lookupId(iteration));
    },
  },
  {
    id: 'list-page',
    run(adapter, context, iteration) {
      return adapter.listPeoplePage(
        context.pageSize,
        (iteration * context.pageSize) % Math.max(1, context.people - context.pageSize),
      );
    },
  },
  {
    id: 'count-active',
    run(adapter) {
      return adapter.countActivePeople();
    },
  },
  {
    id: 'update-active',
    run(adapter, context, iteration) {
      return adapter.updatePersonActive(context.lookupId(iteration), iteration % 2 === 0);
    },
  },
  {
    id: 'transaction-read-write',
    run(adapter, context, iteration) {
      return adapter.transactionReadWrite(context.lookupId(iteration), iteration % 2 !== 0);
    },
  },
];

async function measureScenario(adapter, scenario, config, context) {
  for (let iteration = 0; iteration < config.warmup; iteration += 1) {
    await scenario.run(adapter, context, iteration);
  }

  if (typeof global.gc === 'function') {
    global.gc();
  }

  const startedAt = performance.now();

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    await scenario.run(adapter, context, iteration);
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

export async function runBenchmarks(adapters, config) {
  const context = {
    people: config.people,
    pageSize: config.pageSize,
    lookupId(index) {
      return (index % config.people) + 1;
    },
  };
  const results = [];

  for (const adapter of adapters) {
    for (const scenario of scenarios) {
      results.push(await measureScenario(adapter, scenario, config, context));
    }
  }

  return results;
}
