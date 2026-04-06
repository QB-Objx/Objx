# OBJX Compile vs Execute Report

Generated at: `2026-04-06T14:35:39.674Z`
Environment: `host` / `host-local`
Runtime: `v24.13.0` on `win32` (`x64`)
Runs: `1` warmup + `2` measured

## postgres

| Scenario | Phase | Ops/s | ms/op |
| --- | --- | ---: | ---: |
| find-by-id | compile-cache-hit | 42016.81 | 0.023800 |
| find-by-id | compile-no-cache | 49875.31 | 0.020050 |
| find-by-id | driver-execute-precompiled | 534.64 | 1.870400 |
| find-by-id | session-execute-precompiled | 671.7 | 1.488750 |
| find-by-id | session-execute-builder | 672.92 | 1.486050 |
| list-page | compile-cache-hit | 93023.26 | 0.010750 |
| list-page | compile-no-cache | 57971.01 | 0.017250 |
| list-page | driver-execute-precompiled | 530.67 | 1.884400 |
| list-page | session-execute-precompiled | 630.91 | 1.585000 |
| list-page | session-execute-builder | 434.48 | 2.301600 |
| update-active | compile-cache-hit | 85106.38 | 0.011750 |
| update-active | compile-no-cache | 83682.01 | 0.011950 |
| update-active | driver-execute-precompiled | 175.32 | 5.703950 |
| update-active | session-execute-precompiled | 134.36 | 7.442950 |
| update-active | session-execute-builder | 193.04 | 5.180350 |

## mysql

| Scenario | Phase | Ops/s | ms/op |
| --- | --- | ---: | ---: |
| find-by-id | compile-cache-hit | 67796.61 | 0.014750 |
| find-by-id | compile-no-cache | 119047.62 | 0.008400 |
| find-by-id | driver-execute-precompiled | 624.77 | 1.600600 |
| find-by-id | session-execute-precompiled | 901.75 | 1.108950 |
| find-by-id | session-execute-builder | 906.74 | 1.102850 |
| list-page | compile-cache-hit | 344827.59 | 0.002900 |
| list-page | compile-no-cache | 138888.89 | 0.007200 |
| list-page | driver-execute-precompiled | 720.23 | 1.388450 |
| list-page | session-execute-precompiled | 850.92 | 1.175200 |
| list-page | session-execute-builder | 737.27 | 1.356350 |
| update-active | compile-cache-hit | 200000 | 0.005000 |
| update-active | compile-no-cache | 82987.55 | 0.012050 |
| update-active | driver-execute-precompiled | 640.98 | 1.560100 |
| update-active | session-execute-precompiled | 1251.49 | 0.799050 |
| update-active | session-execute-builder | 1159.15 | 0.862700 |

