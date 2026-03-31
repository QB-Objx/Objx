# Legacy Upstreams

Esta pasta contem os upstreams usados como referencia tecnica para o `OBJX`.

## Objetivo

O objetivo desta pasta nao e virar parte do produto final como dependencia acoplada.

Ela existe para:
- estudar arquitetura e pontos fortes reais dos projetos anteriores;
- extrair algoritmos, conceitos e contratos reutilizaveis;
- comparar comportamento durante a migracao do core novo;
- evitar reescrever cegamente coisas que ja funcionam.

## Conteudo

### objection.js

Origem:
- repositorio: `https://github.com/Vincit/objection.js`
- commit local de referencia: `a7784ded683c62b6dd857fcfd937b83b72b7a183`

Papel no `OBJX`:
- referencia para relacoes
- referencia para graph operations
- referencia para hydration e lifecycle
- referencia para ergonomia SQL-first

### knex

Origem:
- repositorio: `https://github.com/knex/knex`
- commit local de referencia: `8198fa6242871eea0a29886c36ce39e2e55e19c1`

Papel no `OBJX`:
- referencia para compilacao e execucao SQL
- referencia para dialetos
- referencia para primitives de query builder
- referencia para maturidade de runtime

## Regra De Uso

Tudo em `old/` deve ser tratado como material de referencia.

O produto novo deve nascer em pacotes proprios do `OBJX`, com contratos novos e explicitamente desenhados para:
- tipagem forte;
- arquitetura modular;
- suporte a plugins;
- integracao limpa entre camada relacional e motor SQL.

## Direcao

O `OBJX` deve convergir os melhores aspectos dos dois upstreams:
- Objection como camada relacional e de grafo
- Knex como motor SQL e base de execucao

Mas o resultado final precisa ser um unico projeto, com um core proprio e uma API publica propria.
