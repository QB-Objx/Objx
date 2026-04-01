# OBJX

`OBJX` e um novo ORM SQL-first para TypeScript inspirado no Objection.js, mas redesenhado para o ecossistema moderno.

O nome foi escolhido como uma evolucao curta e contemporanea de `Objection`:
- `OBJ` preserva a origem e a identidade do projeto.
- `X` comunica nova geracao, extensibilidade e foco em uma arquitetura mais composavel.

## Visao

Construir o melhor ORM SQL-first para TypeScript:
- sem esconder SQL;
- com tipagem forte ponta a ponta;
- com relacoes e graph operations de alto nivel;
- com escape hatch real;
- com arquitetura preparada para plugins.

## Objetivos

1. Ser mais previsivel que ORMs magicos.
2. Ser mais expressivo que query builders puros.
3. Ser mais tipado que o Objection atual.
4. Ser extensivel sem hacks internos.
5. Ter um core pequeno, moderno e facil de manter.

## Referencias Legadas

O projeto agora carrega os dois upstreams de referencia dentro de `old/`:
- `old/objection.js`
- `old/knex`

Esses dois repositorios servem como fonte de extracao de conceitos, runtime e algoritmos.

O plano nao e manter dois motores separados dentro do produto novo. O plano e:
- absorver a camada relacional e de grafo que faz o Objection ser valioso;
- absorver o motor e a maturidade de compilacao/execucao SQL do Knex;
- redesenhar a API publica e o core para que tudo isso vire um unico sistema coeso.

Em outras palavras: `OBJX` nao sera um fork com cola entre Objection e Knex. Sera um novo projeto que usa os dois upstreams como base tecnica para convergir em um core unico.

O codigo do Knex foi trazido para dentro do projeto justamente para que possamos adapta-lo ao `OBJX`. A direcao oficial agora e:
- o motor SQL sera embutido ao projeto;
- o Knex em `old/knex` e a base de estudo e extracao desse motor;
- o produto final nao deve depender de um `knex` externo como peca central do runtime.

## O Que Vamos Preservar Da Ideia Original

- Mentalidade SQL-first.
- Relacoes explicitas.
- Operacoes de grafo como diferencial real.
- Escape hatch para SQL bruto e integracao com o builder subjacente.
- Foco em produtividade de times backend experientes.

## O Que Vamos Mudar

- Sair de uma API centrada em `class extends Model` como contrato principal.
- Sair de uma tipagem baseada em um arquivo monolitico e altamente dinamico.
- Reduzir a superficie publica diretamente acoplada ao Knex.
- Trocar DSLs baseadas em string por APIs tipadas no caminho feliz.
- Projetar extensibilidade e plugins como capacidade de primeira classe.

## Principios De Arquitetura

### 1. TypeScript First

O runtime e a API publica devem nascer do TypeScript, nao receber tipos depois.

### 2. Core Pequeno

O coracao do ORM precisa conhecer:
- metadados de modelos;
- AST de consulta;
- relacoes;
- execucao;
- ciclo de vida de plugins.

Tudo o resto deve ser adaptador ou pacote complementar.

### 3. SQL-First De Verdade

SQL nao e fallback vergonhoso. E parte do produto.

### 4. Compatibilidade Estrategica

Nao vamos copiar o Objection. Vamos herdar a filosofia e corrigir os limites estruturais.

### 5. Plugins Desde O Inicio

Plugins nao serao um remendo. O core precisa expor hooks, registro de capacidades e contratos de extensao estaveis.

### 6. Contexto Assincrono Como Abstracao

Precisamos prever desde cedo uma abstracao de contexto assincrono para:
- propagacao automatica de transacoes;
- unit of work por fluxo assincorno;
- tracing e observabilidade;
- metadata de request, tenant e autenticacao;
- estado efemero de plugins durante a execucao.

No Node.js, `AsyncLocalStorage` pode ser a implementacao padrao.

Mas o core nao deve depender diretamente de `AsyncLocalStorage` como contrato. A ideia correta e expor algo como:
- `ExecutionContext`
- `ContextCarrier`
- `TransactionScope`

Assim, a engine pode suportar:
- transacoes ambientadas sem precisar passar `trx` manualmente por toda a stack;
- plugins que leem contexto de execucao sem acoplamento com frameworks;
- adaptadores alternativos no futuro, caso o runtime mude.

## Proposta De Arquitetura

### Pacotes Planejados

- `@objx/core`
  - metadados de modelos
  - AST de consultas
  - relacoes
  - contexto de execucao
  - lifecycle e plugin runtime
- `@objx/sql-engine`
  - motor SQL embutido do projeto
  - extracao e adaptacao progressiva das capacidades do Knex
  - compilacao da AST para SQL
  - dialetos e helpers comuns
- `@objx/validation`
  - adapters para Ajv, Zod, Valibot
- `@objx/codegen`
  - geracao de tipos e modelos a partir do banco
- `@objx/plugins`
  - plugins oficiais reutilizaveis
- `@objx/sqlite-driver`
  - driver oficial SQLite para sessao/runtime
- `@objx/postgres-driver`
  - driver oficial Postgres para sessao/runtime
- `@objx/mysql-driver`
  - driver oficial MySQL para sessao/runtime

### Camadas

1. Definicao de schema/modelo
2. Query API tipada
3. AST interna
4. Planner e pipeline de execucao
5. Compilador e executor do motor SQL embutido
6. Resultado tipado e hydration opcional

## API Alvo

Queremos uma API que seja previsivel e inferivel:

```ts
export const Person = defineModel({
  table: 'persons',
  columns: {
    id: col.int().primary(),
    firstName: col.text(),
    lastName: col.text().nullable(),
  },
  relations: (m) => ({
    pets: hasMany(() => Pet, {
      from: m.id,
      to: Pet.columns.ownerId,
    }),
  }),
})

const people = await Person.query(db)
  .select((p) => [p.id, p.firstName])
  .where((p, op) => op.eq(p.lastName, 'Lawrence'))
  .with('pets', (q) => q.select((pet) => [pet.id, pet.name]))
```

## Diferenciais Que Precisam Existir

- Inferencia forte para select, insert, patch, relations e resultados.
- Relacoes tipadas sem depender de strings.
- Operacoes de grafo reais.
- Transactions ergonomicas.
- Escape hatch para SQL e integracao com ferramentas existentes.
- Sistema de plugins robusto.

## Sistema De Plugins

Plugins sao parte do roadmap principal, nao backlog distante.

### Objetivo

Permitir que features avancadas sejam entregues sem inflar o core e sem depender de monkey patching.

### Casos De Uso

- soft delete
- audit trail
- multi-tenancy
- timestamps
- slug generation
- row-level security helpers
- observabilidade
- cache de leitura
- validacao customizada
- naming conventions
- serializers
- policy enforcement

### Contratos Minimos

Um plugin deve poder:
- registrar metadados de modelo;
- adicionar hooks de lifecycle;
- estender o query pipeline;
- inspecionar ou transformar a AST;
- registrar helpers e macros;
- expor configuracao tipada;
- declarar compatibilidade de versao.

### Hooks Planejados

- `onModelDefine`
- `onQueryCreate`
- `onQueryBuild`
- `onQueryCompile`
- `onQueryExecute`
- `onResult`
- `onError`

### Regras

- plugins nao podem depender de campos internos nao documentados;
- plugins devem operar sobre contratos publicos;
- plugins oficiais servem como referencia de qualidade;
- qualquer extensao que exija patch interno indica falha de design do core.

## Roadmap

### Fase 0: Fundacao

- definir nome, tese e escopo
- montar arquitetura base
- decidir projeto-base a ser usado como bootstrap
- inicializar monorepo ou workspace
- configurar TypeScript estrito, lint, testes e build

### Fase 1: Core Minimo

- `defineModel`
- tipos de coluna
- registry de modelos
- metadados de relacao
- contexto de execucao
- primeira versao do plugin runtime

### Fase 2: Query AST

- AST interna para `select`, `insert`, `update`, `delete`
- operadores de filtro
- joins basicos
- projections tipadas
- compilacao SQL inicial

### Fase 3: Runtime De Execucao

- executor de query
- transactions
- hydration opcional
- tratamento padronizado de erros
- tracing interno

### Fase 4: Relacoes

- `belongsToOne`
- `hasOne`
- `hasMany`
- `manyToMany`
- eager loading tipado

### Fase 5: Graph Operations

- insert graph
- upsert graph
- relate/unrelate
- regras de consistencia

### Fase 6: Plugins Oficiais

- timestamps
- soft delete
- audit trail
- tenant scope

### Fase 7: Tooling

- codegen
- introspection
- CLI
- templates
- docs e exemplos reais

## Exemplos Atuais

- `examples/sqlite-introspection`: fluxo de introspecao e modelo gerado
- `examples/complex-runtime`: fluxo completo com plugins, graph operations, eager nested e expressoes compostas de relacao
- `examples/benchmarks`: suite publica e reproduzivel de benchmark para compilacao SQL e runtime

## Benchmarks Publicos

Comando padrao:

```bash
npm run benchmark
```

Referencia:

- `examples/benchmarks/README.md`

## Schemas De Migrations E Seeds

Gerar estrutura tipada de migrations/seeds:

```bash
npm run codegen -- template --template migration-seed-schemas --out ./db
```

Arquivos gerados:

- `db/migrations/000001_init.migration.mjs`
- `db/seeds/000001_projects.seed.mjs`
- `db/README.md`

Executar migrations:

```bash
npm run codegen -- migrate --dialect sqlite3 --database ./app.sqlite --dir ./db/migrations --direction up
```

Executar seeds:

```bash
npm run codegen -- seed --dialect sqlite3 --database ./app.sqlite --dir ./db/seeds --direction run
```

## Ordem Recomendada De Implementacao

1. Inicializar workspace do projeto novo.
2. Criar `@objx/core`.
3. Implementar `defineModel` e tipos de coluna.
4. Implementar metadados e registry.
5. Criar AST minima de query.
6. Criar executor minimo com `select` e `insert`.
7. Introduzir hooks e plugin runtime cedo.
8. So depois expandir relacoes e grafo.

## Riscos

- tentar copiar API antiga demais e carregar a mesma divida de tipos;
- acoplar demais a API publica ao Knex;
- adiar plugins e depois ter que quebrar o core;
- construir relacoes antes de estabilizar a AST e metadados;
- adicionar magia cedo demais.

## Lembretes De Arquitetura

- prever um sistema de contexto assincrono desde o inicio;
- evitar transacoes ambientadas acopladas diretamente ao runtime Node no core;
- tratar `AsyncLocalStorage` como adaptador padrao, nao como contrato de dominio;
- projetar o pipeline para suportar `transaction scope`, `unit of work` e contexto de plugins;
- garantir que o caminho explicito continue existindo, mesmo com contexto ambientado.
- tratar `old/knex` como material para extracao de um motor proprio, nao como dependencia final do runtime;
- evitar desenhar a API publica do `OBJX` como um espelho literal da API do Knex.

## Decisoes Iniciais

- linguagem: TypeScript
- runtime alvo: Node.js moderno
- arquitetura: pacote core + motor SQL embutido + extensoes
- caminho feliz: API tipada, nao string-based
- escape hatch: obrigatorio
- plugins: previstos desde o core
- motor SQL: embutido ao `OBJX`, tomando `old/knex` como base de extracao e adaptacao

## Nome De Trabalho

Nome atual de trabalho: `OBJX`

Se quisermos variar mantendo a referencia ao Objection, alternativas plausiveis:
- `Objx`
- `Objex`
- `Objexion`
- `Objecta`

No momento, `OBJX` e o melhor nome de trabalho porque e curto, memoravel e facil de usar como namespace de pacotes.

## Proximo Passo

Com este plano aprovado, o proximo passo pratico e criar a estrutura inicial do projeto:

1. workspace
2. pacote `@objx/core`
3. tipos de coluna
4. `defineModel`
5. registry
6. runtime minimo de plugins

Agora que os upstreams estao em `old/`, o proximo passo recomendado ja nao e mais escolher uma base externa. E iniciar o workspace do `OBJX` com:

1. `packages/core`
2. `packages/sql-engine`
3. `packages/plugins`
4. `packages/validation`
5. `packages/codegen`
5. contracts iniciais de metadata, AST e plugin runtime
