import { defineSeed } from '@qbobjx/codegen';

export default defineSeed({
  name: '000001_demo',
  description: 'seed initial demo tenant',
  run: [
    "insert into projects (id, name, status, tenantId, deletedAt) values (1, 'OBJX NestJS API', 'planned', 'demo', null);",
    "insert into tasks (id, projectId, title, status, tenantId, deletedAt) values (1, 1, 'Wire Nest providers', 'doing', 'demo', null);",
    "insert into tasks (id, projectId, title, status, tenantId, deletedAt) values (2, 1, 'Ship controller', 'todo', 'demo', null);",
  ],
  revert: [
    'delete from tasks where id in (1, 2);',
    'delete from projects where id = 1;',
  ],
});
