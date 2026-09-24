import { Module } from '@nestjs/common';
import { FamiliesService } from './families.service';
import { FamiliesController } from './families.controller';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';
import { FamilyEditorGuard } from '../common/guards/family-editor.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [FamiliesController],
  providers: [FamiliesService, FamilyAccessGuard, FamilyEditorGuard],
  exports: [FamiliesService, FamilyAccessGuard, FamilyEditorGuard],
})
export class FamiliesModule {}
