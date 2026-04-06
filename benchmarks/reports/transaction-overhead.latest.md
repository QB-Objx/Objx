# OBJX Transaction Benchmark Report

Generated at: `2026-04-06T16:53:09.414Z`
Environment: `host` / `host-local`
Runtime: `v24.13.0` on `win32` (`x64`)
Runs: `20` warmup + `80` measured

## postgres

| Adapter | Scenario | Ops/s | ms/op |
| --- | --- | ---: | ---: |
| objx-postgres | begin-commit | 333.69 | 2.996830 |
| objx-postgres | begin-rollback | 306.93 | 3.258046 |
| knex-postgres | begin-commit | 324.99 | 3.077014 |
| knex-postgres | begin-rollback | 249.56 | 4.007104 |
| sequelize-postgres | begin-commit | 291.88 | 3.426110 |
| sequelize-postgres | begin-rollback | 392.22 | 2.549584 |
| typeorm-postgres | begin-commit | 383.32 | 2.608781 |
| typeorm-postgres | begin-rollback | 358.31 | 2.790903 |

