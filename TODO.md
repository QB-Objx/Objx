# OBJX TODO

Este arquivo e o plano vivo do projeto.

Regra:
- sempre que algo for implementado de verdade, marcar com `x`;
- ao concluir uma etapa, revisar qual e o proximo item desbloqueado;
- evitar marcar como feito algo que esta apenas esbocado.

## Proximo Passo Imediato

- [ ] benchmark com banco real para Postgres/MySQL
- [ ] fixtures reutilizaveis para suites de integracao multi-dialeto
- [x] validation adapters oficiais (`zod`, `ajv` e `valibot`)

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

- [x] pacote `@qbobjx/codegen`
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

## Infra Do Motor SQL

- [x] pacote `@qbobjx/sql-engine`
- [x] compilador SQL ANSI
- [x] compilador SQL Postgres
- [x] sessao de execucao
- [x] interface de driver
- [x] extrair primitives uteis de `old/knex`
- [x] dialetos adicionais
- [x] normalizacao de resultados por driver
- [x] builder de SQL bruto/escape hatch de primeira classe
