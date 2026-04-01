# OBJX NestJS API

Exemplo de API com NestJS usando `@qbobjx/nestjs` em cima de SQLite.

## O Que Esse Exemplo Mostra

- `ObjxModule.forRootAsync(...)` com sessao pronta para Nest
- contexto por request via interceptor global do pacote Nest
- filtro global para `ObjxValidationError`
- `tenant scope`, `soft delete`, `audit trail` e validacao
- migrations e seeds com `@qbobjx/codegen`
- transacoes, eager loading e `insertGraph`

## Instalacao

```bash
npm install
```

## Banco De Dados

Esse exemplo usa o fluxo certo:

- `db/migrations/*.migration.mjs`
- `db/seeds/*.seed.mjs`
- nenhum schema e aplicado automaticamente no startup da API

Prepare o banco antes de subir a aplicacao:

```bash
npm run db:setup
```

Ou, passo a passo:

```bash
npm run db:migrate
npm run db:seed
```

Para desfazer:

```bash
npm run db:seed:revert
npm run db:migrate:down
```

## Rodando

```bash
npm run dev
```

Servidor padrao:

- `http://127.0.0.1:3001`

## Headers

As rotas de negocio usam:

- `x-tenant-id`

Opcionalmente:

- `x-actor-id`
- `x-request-id`

## Rotas

- `GET /health`
- `GET /audit`
- `GET /projects`
- `GET /projects/:projectId`
- `POST /projects`
- `PATCH /projects/:projectId`
- `POST /projects/:projectId/tasks`
- `POST /projects/:projectId/complete`
- `DELETE /projects/:projectId`

## Exemplo Rapido

Listar seed inicial:

```bash
curl -H "x-tenant-id: demo" http://127.0.0.1:3001/projects
```

Criar projeto com tasks:

```bash
curl -X POST http://127.0.0.1:3001/projects \
  -H "content-type: application/json" \
  -H "x-tenant-id: demo" \
  -H "x-actor-id: cli" \
  -d '{
    "name": "Build Nest API",
    "status": "planned",
    "tasks": [
      { "title": "Wire providers", "status": "doing" },
      { "title": "Ship controller", "status": "todo" }
    ]
  }'
```

## Arquivos

- `db/migrations`: schema versionado
- `db/seeds`: dados iniciais versionados
- `src/objx.options.ts`: fabrica do `ObjxModule`
- `src/models.ts`: models e validacao
- `src/projects.service.ts`: regras de aplicacao
- `src/projects.controller.ts`: rotas REST
- `src/main.ts`: bootstrap NestJS
