# OBJX Microbenchmarks

This benchmark suite focuses on microbenchmarks for OBJX runtime and SQL compilation performance.

For the official real-database comparison against `Prisma`, `Sequelize`, and `Knex`, use:

- `benchmarks`
- `npm run benchmark`

## What It Measures

- structured query compilation (including grouped `AND/OR`)
- relation join planning/compilation (`joinRelated`)
- hydrated single-row lookup execution
- hydrated eager loading execution (`withRelated`)
- raw SQL execution baseline (`sql` + `identifier`)

## Dataset

The benchmark seeds:

- `people`
- `pets`

Default scale:

- `3000` people
- `3` pets per person

## Run

Build first:

```bash
npm run build
```

Run benchmark defaults:

```bash
npm run benchmark
```

The default run executes all official drivers:

- `sqlite` (real local `node:sqlite` database)
- `postgres` (pool-compatible in-memory adapter)
- `mysql` (pool-compatible in-memory adapter)

Run custom workload:

```bash
node examples/benchmarks/src/run.mjs --people 5000 --pets-per-person 4 --warmup 150 --iterations 1500
```

Run only selected drivers:

```bash
node examples/benchmarks/src/run.mjs --drivers sqlite
```

```bash
node examples/benchmarks/src/run.mjs --drivers postgres,mysql
```

## Output

The runner prints:

- grouped results per driver
- per-scenario throughput (`ops/s`)
- average latency (`ms/op`)
- full JSON payload (machine-readable)
