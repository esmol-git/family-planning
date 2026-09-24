import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, FamilyAccessGuard],
  exports: [CategoriesService],
})
export class CategoriesModule {}
