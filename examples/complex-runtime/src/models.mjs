import {
  belongsToOne,
  col,
  defineModel,
  hasMany,
} from '../../../packages/core/dist/index.js';
import {
  createAuditTrailPlugin,
  createSnakeCaseNamingPlugin,
  createSoftDeletePlugin,
  createTenantScopePlugin,
} from '../../../packages/plugins/dist/index.js';

export const auditTrailEntries = [];

function createAuditPlugin() {
  return createAuditTrailPlugin({
    actorKey: 'actorId',
    operations: ['insert', 'update', 'delete'],
    emit(entry) {
      auditTrailEntries.push(entry);
    },
  });
}

function createTenantPlugin() {
  return createTenantScopePlugin();
}

function createSnakePlugin() {
  return createSnakeCaseNamingPlugin();
}

export const Company = defineModel({
  name: 'Company',
  table: 'companies',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text(),
  },
  plugins: [createSnakePlugin(), createTenantPlugin(), createAuditPlugin()],
});

export const User = defineModel({
  name: 'User',
  table: 'users',
  columns: {
    id: col.int().primary(),
    email: col.text(),
    companyId: col.int().nullable(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  relations: (user) => ({
    company: belongsToOne(() => Company, {
      from: user.columns.companyId,
      to: Company.columns.id,
    }),
  }),
  plugins: [createSnakePlugin(), createTenantPlugin(), createSoftDeletePlugin(), createAuditPlugin()],
});

export const TaskComment = defineModel({
  name: 'TaskComment',
  table: 'task_comments',
  columns: {
    id: col.int().primary(),
    taskId: col.int(),
    authorId: col.int().nullable(),
    body: col.text(),
    tenantId: col.text(),
  },
  relations: (comment) => ({
    author: belongsToOne(() => User, {
      from: comment.columns.authorId,
      to: User.columns.id,
    }),
  }),
  plugins: [createSnakePlugin(), createTenantPlugin(), createAuditPlugin()],
});

export const Task = defineModel({
  name: 'Task',
  table: 'tasks',
  columns: {
    id: col.int().primary(),
    projectId: col.int().nullable(),
    assigneeId: col.int().nullable(),
    title: col.text(),
    status: col.text(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  relations: (task) => ({
    assignee: belongsToOne(() => User, {
      from: task.columns.assigneeId,
      to: User.columns.id,
    }),
    comments: hasMany(() => TaskComment, {
      from: task.columns.id,
      to: TaskComment.columns.taskId,
    }),
  }),
  plugins: [createSnakePlugin(), createTenantPlugin(), createSoftDeletePlugin(), createAuditPlugin()],
});

export const Project = defineModel({
  name: 'Project',
  table: 'projects',
  columns: {
    id: col.int().primary(),
    companyId: col.int(),
    ownerId: col.int().nullable(),
    name: col.text(),
    status: col.text(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  relations: (project) => ({
    company: belongsToOne(() => Company, {
      from: project.columns.companyId,
      to: Company.columns.id,
    }),
    owner: belongsToOne(() => User, {
      from: project.columns.ownerId,
      to: User.columns.id,
    }),
    tasks: hasMany(() => Task, {
      from: project.columns.id,
      to: Task.columns.projectId,
    }),
  }),
  plugins: [createSnakePlugin(), createTenantPlugin(), createSoftDeletePlugin(), createAuditPlugin()],
});
