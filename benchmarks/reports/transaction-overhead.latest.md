# OBJX Transaction Benchmark Report

Generated at: `2026-04-06T14:35:27.756Z`
Environment: `host` / `host-local`
Runtime: `v24.13.0` on `win32` (`x64`)
Runs: `1` warmup + `2` measured

## postgres

| Adapter | Scenario | Ops/s | ms/op |
| --- | --- | ---: | ---: |
| objx-postgres | begin-commit | 434.38 | 2.302150 |
| objx-postgres | begin-rollback | 488.81 | 2.045800 |
| knex-postgres | begin-commit | 443.59 | 2.254350 |
| knex-postgres | begin-rollback | 465.24 | 2.149450 |
| prisma-postgres | begin-commit | 359.07 | 2.785000 |
| prisma-postgres | begin-rollback | 549.75 | 1.819000 |

## mysql

| Adapter | Scenario | Ops/s | ms/op |
| --- | --- | ---: | ---: |
| objx-mysql | begin-commit | 564.51 | 1.771450 |
| objx-mysql | begin-rollback | 370.23 | 2.701000 |
| knex-mysql | begin-commit | 380.84 | 2.625750 |
| knex-mysql | begin-rollback | 505.86 | 1.976850 |
| prisma-mysql | begin-commit | 485.65 | 2.059100 |
| prisma-mysql | begin-rollback | 470.31 | 2.126250 |

