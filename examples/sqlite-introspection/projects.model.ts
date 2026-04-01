import { col, defineModel } from '@qbobjx/core';

export const Projects = defineModel({
  name: 'Projects',
  table: 'projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text(),
    deletedAt: col.custom("TEXT").nullable(),
  },
});