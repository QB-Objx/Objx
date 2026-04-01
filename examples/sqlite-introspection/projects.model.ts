import { col, defineModel } from '@objx/core';

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