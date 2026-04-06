# OBJX Eager Cardinality Benchmark

Generated at: `2026-04-06T16:53:09.969Z`
Environment: `host` / `host-local`
Scenario: `find-with-pets`
People: `3000`
Runs: `10` warmup + `40` measured

| Pets / Person | Adapter | Ops/s | ms/op |
| ---: | --- | ---: | ---: |
| 1 | objx-postgres | 247.39 | 4.042197 |
| 3 | objx-postgres | 204.3 | 4.894720 |

