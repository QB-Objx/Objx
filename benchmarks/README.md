# OBJX Real ORM Benchmarks

Este e o benchmark oficial com bancos reais do projeto.

Ele compara:

- `OBJX`
- `Prisma`
- `Sequelize`
- `Knex`
- `Drizzle`
- `TypeORM`

Dialetos atuais:

- `Postgres`
- `MySQL`

Importante:

- o adapter de `OBJX` usa o `dist/` local do monorepo;
- os outros ORMs sao instalados como dependencias deste subprojeto;
- o caminho padrao de execucao deve partir da raiz do repositorio.

## Fluxo Padrao

O benchmark oficial agora roda em Docker com um perfil padrao e reproduzivel de recursos:

- stack total alvo: `2 CPU` / `4 GB RAM`
- `runner`: `1 CPU` / `2 GB RAM`
- `postgres`: `0.5 CPU` / `1 GB RAM`
- `mysql`: `0.5 CPU` / `1 GB RAM`

Isso nao torna resultados absolutos identicos entre CPUs diferentes, mas reduz bastante a variacao por ambiente e padroniza o perfil oficial do projeto.

Na raiz do repo:

```bash
npm run benchmark:db:up
npm run benchmark:setup
npm run benchmark
```

Ou, se quiser fazer tudo do zero em uma chamada, o proprio `npm run benchmark` ja:

- builda a imagem do runner;
- sobe Postgres e MySQL;
- reseta e reseeda os bancos;
- executa o benchmark dentro do container.

Benchmark rapido:

```bash
npm run benchmark:quick
```

Benchmark dedicado de eager loading por cardinalidade:

```bash
npm run benchmark:eager
```

Benchmark dedicado de fronteira transacional (`begin/commit` e `begin/rollback`):

```bash
npm run benchmark:tx
```

Comparativo transacional rapido entre `OBJX`, `Knex` e `Prisma`:

```bash
npm run benchmark:tx:compare
```

Benchmark dedicado para separar custo de compile vs execute no `OBJX`:

```bash
npm run benchmark:compile
```

## Fluxo Host Local

Para depuracao e iteracao rapida fora do Docker, o subprojeto ainda expoe o caminho local:

```bash
npm run setup:host
npm run benchmark:host
```

Da raiz do monorepo:

```bash
npm run benchmark:setup:host
npm run benchmark:host
```

## Comandos Locais Do Subprojeto

Se voce quiser executar diretamente dentro desta pasta:

```bash
npm run db:up
npm run setup
npm run benchmark
```

Comandos uteis:

- `npm run docker:build`
- `npm run docker:setup`
- `npm run docker:benchmark`
- `npm run docker:benchmark:quick`
- `npm run docker:benchmark:eager`
- `npm run docker:benchmark:compile`
- `npm run docker:benchmark:tx`
- `npm run docker:benchmark:tx:compare`
- `npm run benchmark:host`
- `npm run benchmark:quick:host`
- `npm run benchmark:eager:host`
- `npm run benchmark:compile:host`
- `npm run benchmark:tx:host`
- `npm run benchmark:tx:compare:host`

## Cenarios Medidos

- `find-by-id`
- `find-with-pets`
- `list-page`
- `count-active`
- `update-active`
- `transaction-read-write`

## Banco E Ambiente

Defaults host:

- `postgresql://objx:objx@127.0.0.1:55432/objx_bench`
- `mysql://objx:objx@127.0.0.1:13306/objx_bench`

Defaults no runner Docker:

- `postgresql://objx:objx@postgres:5432/objx_bench`
- `mysql://objx:objx@mysql:3306/objx_bench`

Voce so precisa de `.env` se quiser sobrescrever valores no caminho host.

Se o MySQL falhou ao inicializar antes, recrie os containers e volumes:

```bash
npm run db:down
npm run db:up
```

## Saida

Os resultados sao escritos em:

- `out/latest.json`
- `out/benchmark-<timestamp>.json`

Tambem incluem metadados de execucao:

- `environment.mode`
- `environment.profile`
- `environment.resources.*`

Benchmark dedicado de eager loading por cardinalidade escreve:

- `out/eager-cardinality.latest.json`
- `reports/eager-cardinality.latest.md`
- `reports/eager-cardinality.history.json`

Benchmark dedicado de transacao escreve:

- `out/transaction-overhead.latest.json`
- `reports/transaction-overhead.latest.md`
- `reports/transaction-overhead.history.json`

Benchmark dedicado de compile vs execute escreve:

- `out/compile-vs-execute.latest.json`
- `reports/compile-vs-execute.latest.md`
- `reports/compile-vs-execute.history.json`

## Proximos Passos

Este benchmark deve ser usado para:

- validar ganhos de performance antes de release;
- medir hot paths de Postgres e MySQL;
- acompanhar regressao por cenario, nao so por media geral.
