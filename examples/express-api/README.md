# OBJX Express API

Exemplo de API REST com Express usando `OBJX` como ORM/query builder.

## O Que Esse Exemplo Mostra

- sessao SQLite com `@qbobjx/sqlite-driver`
- plugins globais configurados na criacao da sessao
- `tenant scope`, `soft delete` e `audit trail`
- validacao por model com `@qbobjx/validation` + `zod`
- `insertGraph`, eager loading e transacoes
- middleware HTTP que injeta `tenantId` e `actorId` no `ExecutionContext`

## Dependencias

```bash
npm install
```

## Rodando

```bash
npm run dev
```

Servidor padrao:

- `http://127.0.0.1:3000`

O schema em `schema.sql` e aplicado automaticamente no bootstrap.

## Headers

Todas as rotas de negocio exigem:

- `x-tenant-id`

Opcionalmente:

- `x-actor-id`

Exemplo:

```bash
curl -H "x-tenant-id: demo" http://127.0.0.1:3000/projects
```

## Rotas

- `GET /health`
- `GET /projects`
- `GET /projects/:projectId`
- `POST /projects`
- `PATCH /projects/:projectId`
- `POST /projects/:projectId/tasks`
- `POST /projects/:projectId/complete`
- `DELETE /projects/:projectId`
- `GET /audit`

## Fluxo Basico

Criar projeto com tasks:

```bash
curl -X POST http://127.0.0.1:3000/projects \
  -H "content-type: application/json" \
  -H "x-tenant-id: demo" \
  -H "x-actor-id: cli" \
  -d '{
    "name": "Launch API",
    "status": "planned",
    "tasks": [
      { "title": "Ship CRUD", "status": "doing" },
      { "title": "Write docs", "status": "todo" }
    ]
  }'
```

Listar projetos com relacionados:

```bash
curl -H "x-tenant-id: demo" http://127.0.0.1:3000/projects
```

Concluir projeto dentro de transacao:

```bash
curl -X POST \
  -H "x-tenant-id: demo" \
  -H "x-actor-id: cli" \
  http://127.0.0.1:3000/projects/1/complete
```

Soft delete:

```bash
curl -X DELETE \
  -H "x-tenant-id: demo" \
  -H "x-actor-id: cli" \
  http://127.0.0.1:3000/projects/1
```

Consultar incluindo deletados:

```bash
curl -H "x-tenant-id: demo" \
  "http://127.0.0.1:3000/projects?deleted=include"
```

## Arquivos

- `schema.sql`: schema SQLite
- `src/db.mjs`: bootstrap da sessao e plugins globais
- `src/models.mjs`: models e validacao
- `src/app.mjs`: API Express
