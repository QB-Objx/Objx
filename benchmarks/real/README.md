# OBJX Real ORM Benchmarks

Este e o benchmark oficial com bancos reais do projeto.

Ele compara:

- `OBJX`
- `Prisma`
- `Sequelize`
- `Knex`

Dialetos atuais:

- `Postgres`
- `MySQL`

Importante:

- o adapter de `OBJX` usa o `dist/` local do monorepo;
- os outros ORMs sao instalados como dependencias deste subprojeto;
- o caminho padrao de execucao deve partir da raiz do repositorio.

## Fluxo Padrao

Na raiz do repo:

```bash
npm run benchmark:install
npm run benchmark:db:up
npm run benchmark:setup
npm run benchmark:quick
```

Benchmark completo:

```bash
npm run benchmark
```

## Comandos Locais Do Subprojeto

Se voce quiser executar diretamente dentro desta pasta:

```bash
npm install
npm run db:up
npm run setup
npm run benchmark
```

## Cenarios Medidos

- `find-by-id`
- `find-with-pets`
- `list-page`
- `count-active`
- `update-active`
- `transaction-read-write`

## Banco E Ambiente

Defaults:

- `postgresql://objx:objx@127.0.0.1:5432/objx_bench`
- `mysql://objx:objx@127.0.0.1:3306/objx_bench`

Voce so precisa de `.env` se quiser sobrescrever esses valores.

Se o MySQL falhou ao inicializar antes, recrie os containers e volumes:

```bash
npm run db:down
npm run db:up
```

## Saida

Os resultados sao escritos em:

- `out/latest.json`
- `out/benchmark-<timestamp>.json`

## Proximos Passos

Este benchmark deve ser usado para:

- validar ganhos de performance antes de release;
- medir hot paths de Postgres e MySQL;
- acompanhar regressao por cenario, nao so por media geral.
