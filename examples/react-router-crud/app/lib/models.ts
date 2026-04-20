import { col, defineModel } from '@qbobjx/core';

export const Project = defineModel({
  name: 'Project',
  table: 'projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    status: col.text().default('planned'),
    createdAt: col.timestamp(),
  },
});
