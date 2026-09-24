import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.listForUser(user.userId, {
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.notificationsService.unreadCount(user.userId);
    return { count };
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user.userId);
  }

  @Patch(':id/read')
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const updated = await this.notificationsService.markRead(user.userId, id);
    if (!updated) {
      throw new NotFoundException('Уведомление не найдено');
    }
    return updated;
  }
}
