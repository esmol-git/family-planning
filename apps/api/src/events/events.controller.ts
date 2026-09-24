import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CheckConflictsDto, CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';
import { FamilyEditorGuard } from '../common/guards/family-editor.guard';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(FamilyAccessGuard)
@Controller('families/:familyId')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('events')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'memberId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  list(
    @Param('familyId') familyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('memberId') memberId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.eventsService.list(familyId, { from, to, memberId, categoryId });
  }

  @UseGuards(FamilyEditorGuard)
  @Post('events')
  create(@Param('familyId') familyId: string, @Body() dto: CreateEventDto) {
    return this.eventsService.create(familyId, dto);
  }

  @Post('events/check-conflicts')
  checkNew(@Param('familyId') familyId: string, @Body() dto: CheckConflictsDto) {
    return this.eventsService.checkConflicts(familyId, null, dto);
  }

  @Get('conflicts')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  listConflicts(
    @Param('familyId') familyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.eventsService.listConflicts(familyId, from, to);
  }

  @Get('events/:eventId')
  findOne(@Param('familyId') familyId: string, @Param('eventId') eventId: string) {
    return this.eventsService.findOne(familyId, eventId);
  }

  @UseGuards(FamilyEditorGuard)
  @Patch('events/:eventId')
  update(
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(familyId, eventId, dto);
  }

  @UseGuards(FamilyEditorGuard)
  @Delete('events/:eventId')
  @ApiQuery({ name: 'scope', required: false, enum: ['series', 'occurrence'] })
  @ApiQuery({ name: 'occurrenceStartsAtUtc', required: false })
  remove(
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @Query('scope') scope?: 'series' | 'occurrence',
    @Query('occurrenceStartsAtUtc') occurrenceStartsAtUtc?: string,
  ) {
    return this.eventsService.remove(familyId, eventId, {
      scope,
      occurrenceStartsAtUtc,
    });
  }

  @Post('events/:eventId/check-conflicts')
  checkExisting(
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CheckConflictsDto,
  ) {
    return this.eventsService.checkConflicts(familyId, eventId, dto);
  }
}
