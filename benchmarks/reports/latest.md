# OBJX Benchmark Report

Generated at: `2026-04-06T14:43:21.498Z`
Environment: `host` / `host-local`
Runtime: `v24.13.0` on `win32` (`x64`)
Dataset: `3000` people / `3` pets per person
Runs: `50` warmup + `250` measured

## postgres

| Adapter | Scenario | Ops/s | ms/op |
| --- | --- | ---: | ---: |
| objx-postgres | find-by-id | 1304.77 | 0.766417 |
| objx-postgres | find-with-pets | 741.91 | 1.347878 |
| objx-postgres | list-page | 1038.85 | 0.962604 |
| objx-postgres | count-active | 997.75 | 1.002253 |
| objx-postgres | update-active | 317.93 | 3.145375 |
| objx-postgres | transaction-read-write | 178.88 | 5.590332 |
| prisma-postgres | find-by-id | 727.16 | 1.375213 |
| prisma-postgres | find-with-pets | 466.57 | 2.143324 |
| prisma-postgres | list-page | 632.23 | 1.581696 |
| prisma-postgres | count-active | 756.62 | 1.321671 |
| prisma-postgres | update-active | 217.06 | 4.607125 |
| prisma-postgres | transaction-read-write | 134.8 | 7.418311 |
| sequelize-postgres | find-by-id | 1111.36 | 0.899798 |
| sequelize-postgres | find-with-pets | 759.09 | 1.317363 |
| sequelize-postgres | list-page | 743.78 | 1.344484 |
| sequelize-postgres | count-active | 798.51 | 1.252335 |
| sequelize-postgres | update-active | 275.08 | 3.635358 |
| sequelize-postgres | transaction-read-write | 154.46 | 6.474247 |
| knex-postgres | find-by-id | 1145.57 | 0.872926 |
| knex-postgres | find-with-pets | 679.85 | 1.470915 |
| knex-postgres | list-page | 1033.09 | 0.967969 |
| knex-postgres | count-active | 1138.13 | 0.878632 |
| knex-postgres | update-active | 318.09 | 3.143797 |
| knex-postgres | transaction-read-write | 157.77 | 6.338367 |
| drizzle-postgres | find-by-id | 1431.63 | 0.698505 |
| drizzle-postgres | find-with-pets | 543.9 | 1.838590 |
| drizzle-postgres | list-page | 984.18 | 1.016079 |
| drizzle-postgres | count-active | 1164.78 | 0.858534 |
| drizzle-postgres | update-active | 306.53 | 3.262342 |
| drizzle-postgres | transaction-read-write | 129.26 | 7.736154 |
| typeorm-postgres | find-by-id | 1319.17 | 0.758050 |
| typeorm-postgres | find-with-pets | 950.54 | 1.052031 |
| typeorm-postgres | list-page | 772.27 | 1.294880 |
| typeorm-postgres | count-active | 1178.53 | 0.848515 |
| typeorm-postgres | update-active | 179.92 | 5.557916 |
| typeorm-postgres | transaction-read-write | 161.31 | 6.199402 |

## mysql

| Adapter | Scenario | Ops/s | ms/op |
| --- | --- | ---: | ---: |
| objx-mysql | find-by-id | 1225.78 | 0.815807 |
| objx-mysql | find-with-pets | 576.61 | 1.734270 |
| objx-mysql | list-page | 996.29 | 1.003722 |
| objx-mysql | count-active | 1261.1 | 0.792957 |
| objx-mysql | update-active | 113.97 | 8.774505 |
| objx-mysql | transaction-read-write | 94.74 | 10.555656 |
| prisma-mysql | find-by-id | 932.98 | 1.071833 |
| prisma-mysql | find-with-pets | 537.7 | 1.859781 |
| prisma-mysql | list-page | 695.79 | 1.437218 |
| prisma-mysql | count-active | 841.88 | 1.187816 |
| prisma-mysql | update-active | 115.9 | 8.628006 |
| prisma-mysql | transaction-read-write | 98.08 | 10.195982 |
| sequelize-mysql | find-by-id | 903.07 | 1.107335 |
| sequelize-mysql | find-with-pets | 748.95 | 1.335204 |
| sequelize-mysql | list-page | 748.77 | 1.335531 |
| sequelize-mysql | count-active | 882.22 | 1.133501 |
| sequelize-mysql | update-active | 199.78 | 5.005404 |
| sequelize-mysql | transaction-read-write | 103.61 | 9.651576 |
| knex-mysql | find-by-id | 785.57 | 1.272956 |
| knex-mysql | find-with-pets | 478.96 | 2.087846 |
| knex-mysql | list-page | 812.54 | 1.230707 |
| knex-mysql | count-active | 916.5 | 1.091104 |
| knex-mysql | update-active | 181.65 | 5.505150 |
| knex-mysql | transaction-read-write | 122.32 | 8.175505 |
| drizzle-mysql | find-by-id | 985.57 | 1.014640 |
| drizzle-mysql | find-with-pets | 481.52 | 2.076772 |
| drizzle-mysql | list-page | 726.72 | 1.376036 |
| drizzle-mysql | count-active | 842.26 | 1.187282 |
| drizzle-mysql | update-active | 217.85 | 4.590396 |
| drizzle-mysql | transaction-read-write | 119.94 | 8.337522 |
| typeorm-mysql | find-by-id | 1021.59 | 0.978867 |
| typeorm-mysql | find-with-pets | 940.81 | 1.062912 |
| typeorm-mysql | list-page | 855.54 | 1.168854 |
| typeorm-mysql | count-active | 943.73 | 1.059630 |
| typeorm-mysql | update-active | 209.85 | 4.765217 |
| typeorm-mysql | transaction-read-write | 89.22 | 11.207658 |

