import { Module } from '@nestjs/common';
import { AuditTrailStore } from './audit-trail.store.js';

@Module({
  providers: [AuditTrailStore],
  exports: [AuditTrailStore],
})
export class AuditTrailModule {}
