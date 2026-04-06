# OBJX Eager Cardinality Benchmark

Generated at: `2026-04-06T13:38:28.153Z`
Environment: `host` / `host-local`
Scenario: `find-with-pets`
People: `3000`
Runs: `1` warmup + `2` measured

| Pets / Person | Adapter | Ops/s | ms/op |
| ---: | --- | ---: | ---: |
| 1 | objx-postgres | 452.12 | 2.211800 |
| 1 | objx-mysql | 431.56 | 2.317150 |

