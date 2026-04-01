# OBJX Agent Rules

Este arquivo define as regras de implementacao do projeto `OBJX`.

## Identidade Do Projeto

- `OBJX` e um ORM novo, inspirado em Objection.js.
- O objetivo e unificar camada relacional, graph operations e motor SQL em um unico projeto coeso.
- O projeto deve continuar SQL-first, TypeScript-first e plugin-first.

## Referencias De Arquitetura

- O projeto nasceu a partir de estudo de Objection.js e Knex, mas o runtime atual e autonomo.
- Pacotes novos do `OBJX` nao devem depender de codigo legado ou espelhar APIs antigas por inercia.

## Regra Central Sobre O Motor

- O motor SQL deve ser embutido ao projeto.
- O Knex nao deve ser tratado como dependencia central permanente do runtime final.
- Nao espelhar cegamente a API publica do Knex.

## Arquitetura Alvo

- `packages/core`: metadata, modelos, relacoes, AST, contexto de execucao, plugin runtime.
- `packages/sql-engine`: motor SQL embutido, dialetos, compilacao e execucao.
- `packages/plugins`: plugins oficiais e contratos auxiliares.
- `packages/validation`: validacao e adapters.
- `packages/codegen`: introspection e geracao de tipos/modelos.

## Regras De Implementacao

- O caminho feliz deve ser tipado e previsivel.
- O caminho explicito deve sempre existir, mesmo se houver contexto ambientado.
- Strings podem existir como compatibilidade, mas nao como API principal.
- Nao copiar API legada so por familiaridade.
- Preferir contratos pequenos, composaveis e testaveis.

## Transacoes E Contexto

- O projeto deve prever um `ExecutionContext` abstrato desde cedo.
- `AsyncLocalStorage` pode ser a implementacao padrao no Node.js.
- O core nao deve acoplar sua modelagem diretamente a `AsyncLocalStorage`.
- Transacoes devem funcionar tanto por contexto ambientado quanto por passagem explicita.

## Plugins

- Plugins sao feature de primeira classe.
- Nao usar monkey patching como extensibilidade principal.
- Hooks, metadata e contexto devem ser contratos publicos e estaveis.
- Plugins devem operar sobre API documentada, nao sobre campos internos acidentais.

## Quando Editar Documentacao

- Se a arquitetura alvo mudar, atualizar `README.md`.
- Se uma regra operacional mudar, atualizar este `AGENTS.md`.
- Se um pacote novo nascer, ele deve ser refletido em ambos quando fizer parte da arquitetura base.
