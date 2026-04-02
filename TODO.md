# OBJX TODO

Este arquivo e o backlog vivo do projeto.

Regra:
- marcar com `x` apenas o que foi implementado e validado;
- sempre revisar a ordem de execucao depois de concluir um bloco;
- preferir backlog orientado por impacto real em runtime, DX e adocao;
- usar benchmark e testes reais para priorizar, nao opiniao.

## Norte Do Projeto

Objetivo:
- fazer o `OBJX` ser o melhor ORM/query builder SQL-first para TypeScript no ecossistema Node.

Tese:
- mais previsivel que ORMs magic-first;
- mais relacional e mais graph-aware que query builders puros;
- mais rapido e mais coerente em runtime do que stacks generalistas;
- com escape hatch SQL de primeira classe e plugins reais.

Metricas de sucesso:
- Postgres: competir com `knex` e `sequelize` no hot path sem perder tipagem e graph runtime
- MySQL: manter vantagem frente a `prisma` e `sequelize`
- TypeScript: reduzir duplicacao de tipos e melhorar naming strategy/physical column mapping
- DX: setup real para Express, NestJS, migrations, seeds, codegen, docs e benchmark publico
- Ecosystem: CI confiavel, publish previsivel, exemplos reais e docs publicas em Pages

## Baseline Atual

Estado ja entregue:
- [x] core tipado com `defineModel`
- [x] query builder interno
- [x] SQL engine embutido
- [x] drivers oficiais SQLite/Postgres/MySQL
- [x] graph ops (`insertGraph`, `upsertGraph`, `relate`, `unrelate`)
- [x] eager loading simples e nested eager loading
- [x] plugins oficiais (`timestamps`, `soft delete`, `audit trail`, `tenant scope`)
- [x] `@qbobjx/validation` com adapters oficiais
- [x] `@qbobjx/codegen` com introspection, templates, migrations e seeds
- [x] `@qbobjx/nestjs`
- [x] docs estaticas para GitHub Pages
- [x] benchmark real interno com Postgres e MySQL

Snapshot de benchmark real em 2026-04-02:
- Postgres: `OBJX` esta competitivo em `find-by-id`, `list-page`, `count-active` e `update-active`
- Postgres: `OBJX` esta atras de `sequelize`/`knex` principalmente em `find-with-pets` e `transaction-read-write`
- MySQL: `OBJX` esta bem posicionado e vence `prisma`/`sequelize` em varios cenarios

Conclusao:
- o gargalo principal nao e mais "falta de feature";
- agora o trabalho e otimizar hot paths, fechar lacunas de modelagem e endurecer DX/adocao.

## Proximo Passo Imediato

- [ ] naming strategy real: mapear nome logico para nome fisico de coluna/tabela
- [ ] fast path de resultado para Postgres no driver oficial
- [ ] fast path de eager loading simples (`belongsToOne`, `hasMany`)
- [ ] fast path de transacao para Postgres
- [ ] fixtures reutilizaveis para suites multi-dialeto
- [ ] relatorio comparativo de benchmark versionado dentro do repo

## Fase 0: Fundacao

- [x] definir nome, tese e escopo
- [x] montar arquitetura base
- [x] inicializar monorepo/workspace
- [x] configurar TypeScript estrito
- [x] configurar lint
- [x] configurar testes automatizados

## Fase 1: Core Minimo

- [x] `defineModel`
- [x] tipos de coluna
- [x] registry de modelos
- [x] metadados de relacao
- [x] contexto de execucao
- [x] primeira versao do plugin runtime
- [x] adaptador Node para contexto assincrono com `AsyncLocalStorage`

## Fase 2: Query AST

- [x] AST interna para `select`
- [x] AST interna para `insert`
- [x] AST interna para `update`
- [x] AST interna para `delete`
- [x] operadores de filtro
- [x] joins basicos
- [x] projections tipadas
- [x] compilacao SQL inicial

## Fase 3: Runtime De Execucao

- [x] executor de query basico via sessao/driver
- [x] transacoes com `TransactionScope`
- [x] hydration opcional
- [x] tratamento padronizado de erros
- [x] tracing interno

## Fase 4: Relacoes

- [x] `belongsToOne`
- [x] `hasOne`
- [x] `hasMany`
- [x] `manyToMany`
- [x] eager loading tipado
- [x] query planning orientado por relacao

## Fase 5: Graph Operations

- [x] insert graph
- [x] upsert graph
- [x] relate/unrelate
- [x] regras de consistencia

## Fase 6: Plugins Oficiais

- [x] plugin base de timestamps
- [x] soft delete
- [x] audit trail
- [x] tenant scope

## Fase 7: Tooling

- [x] pacote `@qbobjx/codegen`
- [x] introspection real do banco
- [x] CLI
- [x] templates
- [x] docs e exemplos reais

## Fase 8: Paridade De Runtime

- [x] driver SQLite oficial
- [x] driver Postgres oficial
- [x] driver MySQL oficial
- [x] nested eager loading
- [x] expressions compostas de relacao
- [x] benchmarks publicos
- [x] schemas de migrations
- [x] schemas de seeds
- [x] runner de migrations
- [x] runner de seeds

## Fase 9: Paridade Multi-Dialeto

- [x] introspection Postgres no `@qbobjx/codegen`
- [x] introspection MySQL no `@qbobjx/codegen`
- [x] runner de migrations para Postgres
- [x] runner de migrations para MySQL
- [x] runner de seeds para Postgres
- [x] runner de seeds para MySQL
- [x] templates starter para Postgres
- [x] templates starter para MySQL
- [x] templates de migration/seed por dialeto
- [x] CLI multi-dialeto para introspection/migrate/seed
- [x] smoke tests e testes unitarios de paridade
- [x] testes de integracao reais com Postgres
- [x] testes de integracao reais com MySQL
- [x] introspection em banco real para Postgres/MySQL no CI

## Fase 10: Performance P0

### 10.1 Driver Fast Paths

- [ ] `PostgresResultNormalizer` nativo no `@qbobjx/postgres-driver`
- [ ] `MySqlResultNormalizer` nativo no `@qbobjx/mysql-driver`
- [ ] reduzir alocacao de objetos no hot path de `execute`
- [ ] evitar normalizacao generica quando o driver ja retorna envelope conhecido
- [ ] fast path para `rowCount` e `rows` sem clonagem desnecessaria

### 10.2 Eager Loading

- [ ] fast path de eager loading para uma unica relacao `hasMany`
- [ ] fast path de eager loading para `belongsToOne`
- [ ] reduzir `Map`/`Set` temporarios na montagem de relacoes
- [ ] evitar trabalho extra quando o resultado vem com `limit 1`
- [ ] benchmark dedicado de eager loading por cardinalidade

### 10.3 Transacoes

- [ ] reduzir overhead do caminho `session.transaction(...)`
- [ ] revisar custo de `ExecutionContext` por transacao
- [ ] minimizar custo de nested transactions/savepoints
- [ ] benchmark separado de `begin/commit/rollback`
- [ ] comparar `OBJX` vs `knex` vs `prisma` em transacao read-write simples

### 10.4 Compilacao E Cache

- [ ] cache de query plan/compile para builders repetidos
- [ ] medir custo de compile vs execute em cenarios reais
- [ ] estudar cache por assinatura de AST
- [ ] garantir invalidacao segura em presence de raw SQL e plugins

## Fase 11: Modelagem E Naming Strategy

### 11.1 Nome Logico vs Nome Fisico

- [ ] suporte oficial a `dbName`/`columnName` por coluna
- [ ] suporte oficial a nome fisico de tabela
- [ ] hydration respeitando alias logico
- [ ] compilador SQL respeitando nome fisico
- [ ] codegen gerando mapping quando necessario
- [ ] exemplos oficiais com `createdAt -> created_at` e `ownerId -> owner_id`

### 11.2 Naming Strategy Global

- [ ] `camelCase <-> snake_case` como estrategia configuravel
- [ ] estrategia por sessao
- [ ] estrategia por modelo
- [ ] estrategia usada por codegen e templates

### 11.3 Tipos De Coluna Avancados

- [ ] `decimal` / `numeric`
- [ ] `float`
- [ ] `double`
- [ ] `date`
- [ ] `time`
- [ ] `jsonb` explicito para Postgres
- [ ] enums tipados
- [ ] arrays tipados para Postgres
- [ ] custom codecs por coluna

## Fase 12: Query Builder De Elite

### 12.1 SQL Expressiveness

- [ ] `groupBy`
- [ ] `having`
- [ ] `distinct`
- [ ] aggregates tipados
- [ ] `exists` / `notExists`
- [ ] subqueries tipadas
- [ ] CTE / `with`
- [ ] `union` / `unionAll`
- [ ] `case when`

### 12.2 Write Capabilities

- [ ] bulk insert otimizado
- [ ] bulk update estrategico
- [ ] `insert ... on conflict` / `on duplicate key`
- [ ] upsert nativo por dialeto
- [ ] lock hints (`for update`, `skip locked`, etc.)

### 12.3 Projection E Inference

- [ ] inferencia melhor para selects parciais
- [ ] inferencia melhor para aggregates
- [ ] inferencia melhor para `returning`
- [ ] inferencia melhor para subqueries e aliases

## Fase 13: Graph Runtime Superior

- [ ] reduzir custo de `upsertGraph` em arvores medias/grandes
- [ ] diffs mais eficientes por relacao
- [ ] modo explicito de estrategia de reconcile
- [ ] controle de profundidade e batch size
- [ ] graph ops com melhor explain/debug trace
- [ ] benchmark especifico de graph ops vs abordagem manual

## Fase 14: Plugins Como Plataforma

### 14.1 API De Plugin

- [ ] hooks antes de compile
- [ ] hooks depois de compile
- [ ] hooks antes de execute
- [ ] hooks depois de execute
- [ ] hooks de transacao
- [ ] capacidade de extender AST
- [ ] capacidade de extender hydration/serialization

### 14.2 Runtime De Plugin

- [ ] ordem e prioridade explicitas
- [ ] deduplicacao de plugin entre sessao e modelo
- [ ] isolamento de metadata por plugin
- [ ] melhor trace/debug de plugin pipeline

### 14.3 Plugins Oficiais Futuramente

- [ ] optimistic locking
- [ ] caching
- [ ] row level security helper
- [ ] outbox/audit persistente
- [ ] multitenancy avancada

## Fase 15: Validation E Schema Unificado

- [x] adapters oficiais (`zod`, `ajv`, `valibot`)
- [ ] reduzir custo de validacao em hot path
- [ ] cache de schema compilado quando aplicavel
- [ ] melhor erro agregado para graph validation
- [ ] aproximar modelo, coluna e validation schema
- [ ] gerar schemas a partir de metadados do modelo
- [ ] opcao de inferir metadados do modelo a partir de schema

## Fase 16: NestJS E Framework Integrations

### 16.1 NestJS

- [x] pacote `@qbobjx/nestjs`
- [x] `ObjxSessionHost<TSession>`
- [x] `InferObjxSession<typeof factory>`
- [ ] helper oficial para multi-sessao no NestJS
- [ ] suporte melhor para request context fora de HTTP
- [ ] health checks / lifecycle helpers
- [ ] documentacao de teste unitario e teste e2e com NestJS

### 16.2 Outros Frameworks

- [ ] Fastify example oficial
- [ ] Next.js backend example
- [ ] worker/background jobs example

## Fase 17: Tooling De Producao

### 17.1 Codegen

- [ ] naming strategy integrada ao codegen
- [ ] generated models com comentarios melhores
- [ ] filtros de introspection
- [ ] hooks de pos-geracao

### 17.2 Migrations E Seeds

- [ ] diff de schema assistido
- [ ] plano de migration dry-run com SQL preview
- [ ] rollback safety checks
- [ ] seeds idempotentes por estrategia oficial

### 17.3 CLI

- [ ] UX melhor para erros de conexao
- [ ] `objx doctor`
- [ ] `objx benchmark` como comando do ecossistema

## Fase 18: Testing E Confiabilidade

- [ ] fixtures reutilizaveis multi-dialeto
- [ ] stress tests de concorrencia
- [ ] testes de isolamento transacional
- [ ] testes de nested transactions por dialeto
- [ ] testes de graph ops com dados grandes
- [ ] testes de naming strategy
- [ ] testes de regressao de performance

## Fase 19: Benchmark E Perf Governance

- [x] benchmark real versionado dentro do repo
- [ ] adicionar `drizzle`
- [ ] adicionar `typeorm`
- [ ] adicionar comparativos por cenario e nao so media geral
- [ ] versionar resultados baseline dentro do repo
- [ ] gerar relatorio Markdown/CSV automaticamente
- [ ] rodar benchmark periodico antes de releases maiores
- [ ] definir metas de throughput por cenario

## Fase 20: Docs, Examples E Adocao

- [x] README principal forte
- [x] Pages estatico
- [x] exemplo Express
- [x] exemplo NestJS
- [ ] cookbook de naming strategy
- [ ] cookbook de multitenancy
- [ ] cookbook de transacoes complexas
- [ ] cookbook de graph ops
- [ ] docs de plugins customizados
- [ ] docs de benchmark publico
- [ ] docs de "por que OBJX vs Prisma/Sequelize/Knex"

## Fase 21: Release, CI E Ecosystem

- [x] publish local sequencial
- [x] smoke test de pacote
- [x] Pages deploy workflow
- [ ] consertar publish automatizado no GitHub com trusted publishing
- [ ] facade package publico `@qbobjx/objx`
- [ ] changelog de release mais opinativo
- [ ] politica de compatibilidade por Node/dialeto
- [ ] matriz CI por Node 22/24 e por banco

## Ordem Recomendada De Execucao

### Bloco A: Ganho Tecnico Rapido

- [ ] naming strategy real
- [ ] normalizador nativo de Postgres
- [ ] normalizador nativo de MySQL
- [ ] fast path de eager loading simples
- [ ] fixture multi-dialeto

### Bloco B: Ganho De Benchmark

- [ ] benchmark com `drizzle` e `typeorm`
- [ ] relatorio baseline versionado
- [ ] otimizar transacao Postgres
- [ ] otimizar eager loading Postgres

### Bloco C: Ganho De Produto

- [ ] aggregates/subqueries/CTE
- [ ] plugins mais poderosos
- [ ] naming strategy end-to-end no codegen
- [ ] docs/cookbook comparativo

## Definicao De "Melhor"

Para considerar o projeto pronto para uma primeira narrativa forte de "melhor entre os melhores",
precisamos chegar neste conjunto:

- [ ] `OBJX` com naming strategy real e sem friccao de `snake_case`
- [ ] `OBJX` competitivo com `knex`/`sequelize` no Postgres em eager loading e transacao
- [ ] `OBJX` liderando ou empatando no MySQL nos cenarios principais
- [ ] query builder mais expressivo com aggregates/subqueries/CTE
- [ ] runtime de plugin de primeira classe
- [ ] docs e exemplos que reduzam a distancia ate producao
- [ ] benchmark publico, reprodutivel e atualizado
