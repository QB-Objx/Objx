import {
  belongsToOne,
  col,
  defineModel,
  hasMany,
} from '@qbobjx/core';
import {
  createValidationPlugin,
  createZodAdapter,
} from '@qbobjx/validation';
import { z } from 'zod';

const projectStatusSchema = z.enum(['planned', 'in_progress', 'completed']);
const taskStatusSchema = z.enum(['todo', 'doing', 'done']);

const projectInsertSchema = z.object({
  name: z.string().trim().min(1),
  status: projectStatusSchema.default('planned'),
  tenantId: z.string().trim().min(1),
  deletedAt: z.date().nullable().optional(),
});

const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  status: projectStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one project field to update.',
});

const taskInsertSchema = z.object({
  projectId: z.number().int().positive(),
  title: z.string().trim().min(1),
  status: taskStatusSchema.default('todo'),
  tenantId: z.string().trim().min(1),
  deletedAt: z.date().nullable().optional(),
});

const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  status: taskStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one task field to update.',
});

export const Task = defineModel({
  name: 'Task',
  table: 'tasks',
  columns: {
    id: col.int().primary(),
    projectId: col.int(),
    title: col.text(),
    status: col.text(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  relations: (task) => ({
    project: belongsToOne(() => Project, {
      from: task.columns.projectId,
      to: Project.columns.id,
    }),
  }),
  plugins: [
    createValidationPlugin({
      adapter: createZodAdapter(),
      schemas: {
        insert: taskInsertSchema,
        insertGraph: taskInsertSchema,
        update: taskUpdateSchema,
        upsertGraph: taskUpdateSchema,
      },
    }),
  ],
});

export const Project = defineModel({
  name: 'Project',
  table: 'projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    status: col.text(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  relations: (project) => ({
    tasks: hasMany(() => Task, {
      from: project.columns.id,
      to: Task.columns.projectId,
    }),
  }),
  plugins: [
    createValidationPlugin({
      adapter: createZodAdapter(),
      schemas: {
        insert: projectInsertSchema,
        insertGraph: projectInsertSchema,
        update: projectUpdateSchema,
        upsertGraph: projectUpdateSchema,
      },
    }),
  ],
});
