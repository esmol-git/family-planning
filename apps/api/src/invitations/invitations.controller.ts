import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InvitationsService } from './invitations.service';
import { AcceptByCodeDto, CreateInvitationDto, ReinviteMemberDto } from './dto/invitation.dto';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';
import { FamilyEditorGuard } from '../common/guards/family-editor.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('invitations')
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @ApiBearerAuth()
  @UseGuards(FamilyAccessGuard, FamilyEditorGuard)
  @Post('families/:familyId/invitations')
  create(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(user.userId, familyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(FamilyAccessGuard, FamilyEditorGuard)
  @Post('families/:familyId/members/:memberId/reinvite')
  reinvite(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Body() dto: ReinviteMemberDto,
  ) {
    return this.invitationsService.reinvite(user.userId, familyId, memberId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(FamilyAccessGuard)
  @Get('families/:familyId/invitations')
  list(@CurrentUser() user: AuthUser, @Param('familyId') familyId: string) {
    return this.invitationsService.list(user.userId, familyId);
  }

  @ApiBearerAuth()
  @UseGuards(FamilyAccessGuard, FamilyEditorGuard)
  @Delete('families/:familyId/invitations/:invitationId')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.revoke(user.userId, familyId, invitationId);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invitations/accept-by-code')
  acceptCode(@CurrentUser() user: AuthUser, @Body() dto: AcceptByCodeDto) {
    return this.invitationsService.acceptByCode(user.userId, dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('invitations/:token')
  preview(@Param('token') token: string) {
    return this.invitationsService.previewByToken(token);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invitations/:token/accept')
  acceptToken(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.invitationsService.acceptByToken(user.userId, token);
  }
}
