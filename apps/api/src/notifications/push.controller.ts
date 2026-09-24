import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PushService } from './push.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

class PushKeysDto {
  @ApiProperty()
  @IsString()
  p256dh!: string;

  @ApiProperty()
  @IsString()
  auth!: string;
}

class SubscribePushDto {
  @ApiProperty()
  @IsString()
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  @IsObject()
  keys!: PushKeysDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;
}

class UnsubscribePushDto {
  @ApiProperty()
  @IsString()
  endpoint!: string;
}

@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Public()
  @Get('vapid-public-key')
  vapidPublicKey() {
    return this.pushService.getPublicKey();
  }

  @ApiBearerAuth()
  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribePushDto) {
    return this.pushService.subscribe(user.userId, {
      endpoint: dto.endpoint,
      keys: dto.keys,
      userAgent: dto.userAgent,
    });
  }

  @ApiBearerAuth()
  @Delete('subscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribePushDto) {
    return this.pushService.unsubscribe(user.userId, dto.endpoint);
  }
}
