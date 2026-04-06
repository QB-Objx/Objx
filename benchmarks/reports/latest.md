# OBJX Benchmark Report

Generated at: `2026-04-06T17:06:39.662Z`
Environment: `host` / `host-local`
Runtime: `v24.13.0` on `win32` (`x64`)
Dataset: `3000` people / `3` pets per person
Runs: `100` warmup + `1000` measured

## postgres

| Adapter | Scenario | Ops/s | ms/op |
| --- | --- | ---: | ---: |
| objx-postgres | find-by-id | 1202.17 | 0.831827 |
| objx-postgres | find-with-pets | 598.42 | 1.671069 |
| objx-postgres | list-page | 982.69 | 1.017615 |
| objx-postgres | count-active | 1246.41 | 0.802306 |
| objx-postgres | update-active | 427.23 | 2.340673 |
| objx-postgres | transaction-read-write | 182.56 | 5.477627 |
| knex-postgres | find-by-id | 1133.33 | 0.882359 |
| knex-postgres | find-with-pets | 607.94 | 1.644906 |
| knex-postgres | list-page | 855.64 | 1.168712 |
| knex-postgres | count-active | 956.09 | 1.045927 |
| knex-postgres | update-active | 496.82 | 2.012819 |
| knex-postgres | transaction-read-write | 168.56 | 5.932573 |
| sequelize-postgres | find-by-id | 1011.99 | 0.988148 |
| sequelize-postgres | find-with-pets | 831.54 | 1.202584 |
| sequelize-postgres | list-page | 881.02 | 1.135046 |
| sequelize-postgres | count-active | 540.27 | 1.850921 |
| sequelize-postgres | update-active | 359.73 | 2.779844 |
| sequelize-postgres | transaction-read-write | 95.31 | 10.492379 |
| typeorm-postgres | find-by-id | 717.71 | 1.393316 |
| typeorm-postgres | find-with-pets | 836.64 | 1.195261 |
| typeorm-postgres | list-page | 819.85 | 1.219742 |
| typeorm-postgres | count-active | 956.96 | 1.044978 |
| typeorm-postgres | update-active | 453.53 | 2.204925 |
| typeorm-postgres | transaction-read-write | 156.57 | 6.386721 |

