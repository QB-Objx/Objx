import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProjectsService } from './projects.service.js';

@Controller()
export class AppController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      packageScope: '@qbobjx',
    };
  }

  @Get('audit')
  audit() {
    return {
      data: this.projectsService.getAuditTrail(),
    };
  }
}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async list(
    @Query('deleted') deleted?: string,
    @Query('status') status?: string,
  ) {
    return {
      data: await this.projectsService.listProjects({
        deleted,
        status,
      }),
    };
  }

  @Get(':projectId')
  async getOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('deleted') deleted?: string,
  ) {
    return {
      data: await this.projectsService.getProject(projectId, deleted),
    };
  }

  @Post()
  async create(
    @Body()
    body: {
      readonly name: string;
      readonly status?: string;
      readonly tasks?: readonly {
        readonly title: string;
        readonly status?: string;
      }[];
    },
  ) {
    return {
      data: await this.projectsService.createProject(body),
    };
  }

  @Patch(':projectId')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body()
    body: {
      readonly name?: string;
      readonly status?: string;
    },
  ) {
    return {
      data: await this.projectsService.updateProject(projectId, body),
    };
  }

  @Post(':projectId/tasks')
  async createTask(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body()
    body: {
      readonly title: string;
      readonly status?: string;
    },
  ) {
    return {
      data: await this.projectsService.createTask(projectId, body),
    };
  }

  @Post(':projectId/complete')
  async complete(
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return {
      data: await this.projectsService.completeProject(projectId),
    };
  }

  @Delete(':projectId')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    await this.projectsService.deleteProject(projectId);
  }
}
