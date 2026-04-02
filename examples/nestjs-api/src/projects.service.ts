import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ObjxSessionHost } from '@qbobjx/nestjs';
import { AuditTrailStore } from './audit-trail.store.js';
import type { AppObjxSession } from './objx.options.js';
import { Project, Task } from './models.js';

interface CreateProjectInput {
  readonly name: string;
  readonly status?: string;
  readonly tasks?: readonly {
    readonly title: string;
    readonly status?: string;
  }[];
}

interface UpdateProjectInput {
  readonly name?: string;
  readonly status?: string;
}

interface CreateTaskInput {
  readonly title: string;
  readonly status?: string;
}

type SoftDeleteMode = 'default' | 'include' | 'only';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly objx: ObjxSessionHost<AppObjxSession>,
    private readonly auditTrailStore: AuditTrailStore,
  ) {}

  listProjects(filters: { deleted?: string; status?: string }) {
    const { session } = this.objx;
    const deleted = this.#normalizeSoftDeleteMode(filters.deleted);
    let query = Project.query()
      .withRelated({
        tasks: true,
      })
      .orderBy(({ id }) => id, 'desc');

    query = this.#applySoftDeleteMode(query, deleted);

    if (filters.status) {
      query = query.where(({ status }, op) => op.eq(status, filters.status));
    }

    return session.execute(query);
  }

  async getProject(projectId: number, deleted?: string) {
    const project = await this.#loadProject(projectId, this.#normalizeSoftDeleteMode(deleted));

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return project;
  }

  async createProject(input: CreateProjectInput) {
    const inserted = await this.objx.session.insertGraph(
      Project,
      {
        name: input.name,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(Array.isArray(input.tasks)
          ? {
              tasks: input.tasks.map((task) => ({
                title: task.title,
                ...(task.status !== undefined ? { status: task.status } : {}),
              })),
            }
          : {}),
      },
      {
        hydrate: true,
      },
    );

    return this.#loadProject(inserted.id, 'include');
  }

  async updateProject(projectId: number, input: UpdateProjectInput) {
    const updated = await this.objx.session.execute(
      Project.update({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
        .where(({ id }, op) => op.eq(id, projectId))
        .returning(({ id }) => [id]),
      {
        hydrate: true,
      },
    );

    if (updated.length === 0) {
      throw new NotFoundException('Project not found.');
    }

    return this.#loadProject(projectId, 'include');
  }

  async createTask(projectId: number, input: CreateTaskInput) {
    const project = await this.#loadProject(projectId, 'include');

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const inserted = await this.objx.session.execute(
      Task.insert({
        projectId,
        title: input.title,
        ...(input.status !== undefined ? { status: input.status } : {}),
      }).returning(({ id, projectId, title, status }) => [id, projectId, title, status]),
      {
        hydrate: true,
      },
    );

    return inserted[0];
  }

  async completeProject(projectId: number) {
    const completedProject = await this.objx.session.transaction(async (transactionSession) => {
      const rows = await transactionSession.execute(
        Project.query()
          .withSoftDeleted()
          .where(({ id }, op) => op.eq(id, projectId))
          .limit(1),
      );

      if (rows.length === 0) {
        return null;
      }

      await transactionSession.execute(
        Task.update({
          status: 'done',
        })
          .withSoftDeleted()
          .where(({ projectId: taskProjectId }, op) => op.eq(taskProjectId, projectId)),
      );

      const updated = await transactionSession.execute(
        Project.update({
          status: 'completed',
        })
          .withSoftDeleted()
          .where(({ id }, op) => op.eq(id, projectId))
          .returning(({ id }) => [id]),
        {
          hydrate: true,
        },
      );

      return updated[0] ?? null;
    });

    if (!completedProject) {
      throw new NotFoundException('Project not found.');
    }

    return this.#loadProject(projectId, 'include');
  }

  async deleteProject(projectId: number) {
    const deletedCount = await this.objx.session.execute(
      Project.delete().where(({ id }, op) => op.eq(id, projectId)),
    );

    if (deletedCount === 0) {
      throw new NotFoundException('Project not found.');
    }
  }

  getAuditTrail() {
    return this.auditTrailStore.all();
  }

  async #loadProject(projectId: number, deleted: SoftDeleteMode) {
    const { session } = this.objx;
    let query = Project.query()
      .where(({ id }, op) => op.eq(id, projectId))
      .withRelated({
        tasks: true,
      });

    query = this.#applySoftDeleteMode(query, deleted);

    const rows = await session.execute(query);
    return rows[0] ?? null;
  }

  #normalizeSoftDeleteMode(rawValue: string | undefined): SoftDeleteMode {
    if (rawValue === 'include' || rawValue === 'only') {
      return rawValue;
    }

    return 'default';
  }

  #applySoftDeleteMode<TBuilder extends { withSoftDeleted(): TBuilder; onlySoftDeleted(): TBuilder }>(
    builder: TBuilder,
    mode: SoftDeleteMode,
  ): TBuilder {
    if (mode === 'include') {
      return builder.withSoftDeleted();
    }

    if (mode === 'only') {
      return builder.onlySoftDeleted();
    }

    return builder;
  }
}
