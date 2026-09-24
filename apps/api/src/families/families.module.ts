import { Module } from '@nestjs/common';
import { FamiliesService } from './families.service';
import { FamiliesController } from './families.controller';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [FamiliesController],
  providers: [FamiliesService, FamilyAccessGuard],
  exports: [FamiliesService, FamilyAccessGuard],
})
export class FamiliesModule {}
