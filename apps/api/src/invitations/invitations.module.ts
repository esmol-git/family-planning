import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';
import { FamilyEditorGuard } from '../common/guards/family-editor.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, FamilyAccessGuard, FamilyEditorGuard],
  exports: [InvitationsService],
})
export class InvitationsModule {}
