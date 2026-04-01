# OBJX TODO

Este arquivo e o plano vivo do projeto.

Regra:
- sempre que algo for implementado de verdade, marcar com `x`;
- ao concluir uma etapa, revisar qual e o proximo item desbloqueado;
- evitar marcar como feito algo que esta apenas esbocado.

## Proximo Passo Imediato

- [x] benchmarks publicos
- [x] schemas de migrations
- [x] schemas de seeds
- [x] runner de migrations
- [x] runner de seeds
- [x] driver MySQL oficial

## Fase 0: Fundacao

- [x] definir nome, tese e escopo
- [x] montar arquitetura base
- [x] importar upstreams em `old/objection.js`
- [x] importar upstreams em `old/knex`
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

- [x] pacote `@objx/codegen`
- [x] introspection real do banco
- [x] CLI
- [x] templates
- [x] docs e exemplos reais

## Fase 8: Proxima Onda

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

## Infra Do Motor SQL

- [x] pacote `@objx/sql-engine`
- [x] compilador SQL ANSI
- [x] compilador SQL Postgres
- [x] sessao de execucao
- [x] interface de driver
- [x] extrair primitives uteis de `old/knex`
- [x] dialetos adicionais
- [x] normalizacao de resultados por driver
- [x] builder de SQL bruto/escape hatch de primeira classe
