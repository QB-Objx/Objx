import {
  Module,
} from '@nestjs/common';
import { ObjxModule } from '@qbobjx/nestjs';
import { AuditTrailModule } from './audit-trail.module.js';
import { AuditTrailStore } from './audit-trail.store.js';
import { createObjxNestModuleOptions } from './objx.options.js';
import { AppController, ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [
    AuditTrailModule,
    ObjxModule.forRootAsync({
      global: true,
      imports: [AuditTrailModule],
      inject: [AuditTrailStore],
      useFactory: (auditTrailStore: AuditTrailStore) =>
        createObjxNestModuleOptions(auditTrailStore),
    }),
  ],
  controllers: [AppController, ProjectsController],
  providers: [ProjectsService],
})
export class AppModule {}
