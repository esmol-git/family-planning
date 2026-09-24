import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { ConflictService } from '../conflicts/conflict.service';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  controllers: [EventsController],
  providers: [EventsService, ConflictService, FamilyAccessGuard],
})
export class EventsModule {}
