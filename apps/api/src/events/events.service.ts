import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictService } from '../conflicts/conflict.service';
import type { ConflictEventInput } from '../conflicts/conflict.types';
import {
  CheckConflictsDto,
  CreateEventDto,
  RecurrenceDto,
  UpdateEventDto,
} from './dto/event.dto';
import {
  buildRRuleString,
  expandOccurrences,
  instanceId,
  parseInstanceId,
} from './recurrence';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

const eventInclude = {
  participants: { include: { member: true } },
  responsible: true,
  category: true,
  exceptions: true,
  reminders: true,
} satisfies Prisma.EventInclude;

type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictService: ConflictService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    familyId: string,
    query: {
      from?: string;
      to?: string;
      memberId?: string;
      categoryId?: string;
    },
  ) {
    const { from, to } = this.resolveWindow(query.from, query.to);

    const where: Prisma.EventWhereInput = {
      familyId,
      status: EventStatus.active,
      startsAtUtc: { lt: to },
      OR: [
        { recurrenceRule: null, endsAtUtc: { gt: from } },
        { recurrenceRule: { not: null } },
      ],
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.memberId) {
      where.participants = { some: { memberId: query.memberId } };
    }

    const events = await this.prisma.event.findMany({
      where,
      include: eventInclude,
      orderBy: { startsAtUtc: 'asc' },
    });

    const expanded = events.flatMap((e) => this.expandEvent(e, from, to));
    expanded.sort(
      (a, b) => new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime(),
    );
    return expanded;
  }

  async findOne(familyId: string, eventId: string) {
    const { eventId: masterId } = parseInstanceId(eventId);
    const event = await this.prisma.event.findFirst({
      where: { id: masterId, familyId },
      include: eventInclude,
    });
    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }
    return this.serializeMaster(event);
  }

  async create(familyId: string, dto: CreateEventDto) {
    this.assertTimeRange(dto.startsAtUtc, dto.endsAtUtc);
    await this.assertMembersBelong(familyId, dto.participantIds, dto.responsibleMemberId);
    await this.assertCategoryBelong(familyId, dto.categoryId);
    this.assertRecurrence(dto.recurrence);

    const recurrenceRule = dto.recurrence
      ? buildRRuleString(dto.recurrence, new Date(dto.startsAtUtc))
      : null;

    const family = await this.prisma.family.findUniqueOrThrow({ where: { id: familyId } });
    const conflicts = await this.runConflictCheck(familyId, {
      id: 'new',
      title: dto.title,
      startsAtUtc: new Date(dto.startsAtUtc),
      endsAtUtc: new Date(dto.endsAtUtc),
      participantIds: dto.participantIds,
      responsibleMemberId: dto.responsibleMemberId,
      travelBufferMinutes: dto.travelBufferMinutes,
      recurrenceRule,
    });

    this.throwIfConflicts(conflicts, dto.confirmConflict);

    const event = await this.prisma.event.create({
      data: {
        familyId,
        title: dto.title,
        description: dto.description,
        startsAtUtc: new Date(dto.startsAtUtc),
        endsAtUtc: new Date(dto.endsAtUtc),
        timezone: dto.timezone,
        location: dto.location,
        categoryId: dto.categoryId,
        responsibleMemberId: dto.responsibleMemberId,
        travelBufferMinutes: dto.travelBufferMinutes ?? family.travelBufferDefault,
        recurrenceRule,
        participants: {
          create: dto.participantIds.map((memberId) => ({ memberId })),
        },
      },
      include: eventInclude,
    });

    this.realtime.eventsChanged(familyId, 'created');
    await this.notifications.syncEventReminders(event.id, dto.reminderMinutes ?? []);
    const fresh = await this.prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: eventInclude,
    });
    return { event: this.serializeMaster(fresh), conflicts };
  }

  async update(familyId: string, eventId: string, dto: UpdateEventDto) {
    const { eventId: masterId } = parseInstanceId(eventId);
    const existing = await this.prisma.event.findFirst({
      where: { id: masterId, familyId },
      include: { participants: true, exceptions: true },
    });
    if (!existing) {
      throw new NotFoundException('Событие не найдено');
    }

    const startsAtUtc = dto.startsAtUtc ?? existing.startsAtUtc.toISOString();
    const endsAtUtc = dto.endsAtUtc ?? existing.endsAtUtc.toISOString();
    this.assertTimeRange(startsAtUtc, endsAtUtc);

    const participantIds =
      dto.participantIds ?? existing.participants.map((p) => p.memberId);
    const responsibleMemberId =
      dto.responsibleMemberId === undefined
        ? existing.responsibleMemberId
        : dto.responsibleMemberId;

    await this.assertMembersBelong(
      familyId,
      participantIds,
      responsibleMemberId ?? undefined,
    );
    if (dto.categoryId) {
      await this.assertCategoryBelong(familyId, dto.categoryId);
    }

    let recurrenceRule: string | null | undefined = undefined;
    if (dto.recurrence === null) {
      recurrenceRule = null;
    } else if (dto.recurrence) {
      this.assertRecurrence(dto.recurrence);
      recurrenceRule = buildRRuleString(dto.recurrence, new Date(startsAtUtc));
    }

    const effectiveRule =
      recurrenceRule === undefined ? existing.recurrenceRule : recurrenceRule;

    const conflicts = await this.runConflictCheck(familyId, {
      id: masterId,
      title: dto.title ?? existing.title,
      startsAtUtc: new Date(startsAtUtc),
      endsAtUtc: new Date(endsAtUtc),
      participantIds,
      responsibleMemberId,
      travelBufferMinutes: dto.travelBufferMinutes ?? existing.travelBufferMinutes,
      recurrenceRule: effectiveRule,
    });

    this.throwIfConflicts(conflicts, dto.confirmConflict);

    const event = await this.prisma.$transaction(async (tx) => {
      if (dto.participantIds) {
        await tx.eventParticipant.deleteMany({ where: { eventId: masterId } });
        await tx.eventParticipant.createMany({
          data: dto.participantIds.map((memberId) => ({
            eventId: masterId,
            memberId,
          })),
        });
      }

      return tx.event.update({
        where: { id: masterId },
        data: {
          title: dto.title,
          description: dto.description,
          startsAtUtc: dto.startsAtUtc ? new Date(dto.startsAtUtc) : undefined,
          endsAtUtc: dto.endsAtUtc ? new Date(dto.endsAtUtc) : undefined,
          timezone: dto.timezone,
          location: dto.location,
          categoryId: dto.categoryId,
          responsibleMemberId:
            dto.responsibleMemberId === undefined
              ? undefined
              : dto.responsibleMemberId,
          travelBufferMinutes: dto.travelBufferMinutes,
          recurrenceRule,
        },
        include: eventInclude,
      });
    });

    this.realtime.eventsChanged(familyId, 'updated');
    if (dto.reminderMinutes !== undefined) {
      await this.notifications.syncEventReminders(event.id, dto.reminderMinutes);
    } else {
      await this.notifications.recomputeNextFireForEvent(event.id);
    }
    await this.notifications.notifyEventUpdated(event.id);
    const fresh = await this.prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: eventInclude,
    });
    return { event: this.serializeMaster(fresh), conflicts };
  }

  /**
   * scope=series — отменить всю серию
   * scope=occurrence — исключить одну дату (нужен occurrenceStartsAtUtc)
   */
  async remove(
    familyId: string,
    eventId: string,
    options?: { scope?: 'series' | 'occurrence'; occurrenceStartsAtUtc?: string },
  ) {
    const { eventId: masterId, occurrenceStartsAtUtc: fromId } =
      parseInstanceId(eventId);
    const existing = await this.prisma.event.findFirst({
      where: { id: masterId, familyId },
    });
    if (!existing) {
      throw new NotFoundException('Событие не найдено');
    }

    const scope = options?.scope ?? 'series';
    const occurrenceStartsAtUtc =
      options?.occurrenceStartsAtUtc ?? fromId;

    if (scope === 'occurrence') {
      if (!existing.recurrenceRule) {
        await this.prisma.event.update({
          where: { id: masterId },
          data: { status: EventStatus.cancelled },
        });
        this.realtime.eventsChanged(familyId, 'deleted');
        await this.notifications.notifyEventCancelled(
          masterId,
          existing.title,
          familyId,
        );
        return { ok: true, scope: 'series' as const };
      }
      if (!occurrenceStartsAtUtc) {
        throw new BadRequestException(
          'Для удаления одного вхождения укажите occurrenceStartsAtUtc',
        );
      }
      await this.prisma.eventException.upsert({
        where: {
          eventId_occurrenceStartsAtUtc: {
            eventId: masterId,
            occurrenceStartsAtUtc: new Date(occurrenceStartsAtUtc),
          },
        },
        create: {
          eventId: masterId,
          occurrenceStartsAtUtc: new Date(occurrenceStartsAtUtc),
        },
        update: {},
      });
      this.realtime.eventsChanged(familyId, 'occurrence_deleted');
      await this.notifications.recomputeNextFireForEvent(masterId);
      return { ok: true, scope: 'occurrence' as const };
    }

    await this.prisma.event.update({
      where: { id: masterId },
      data: { status: EventStatus.cancelled },
    });
    this.realtime.eventsChanged(familyId, 'deleted');
    await this.notifications.notifyEventCancelled(
      masterId,
      existing.title,
      familyId,
    );
    return { ok: true, scope: 'series' as const };
  }

  async checkConflicts(
    familyId: string,
    eventId: string | null,
    dto: CheckConflictsDto,
  ) {
    this.assertTimeRange(dto.startsAtUtc, dto.endsAtUtc);
    await this.assertMembersBelong(familyId, dto.participantIds, dto.responsibleMemberId);
    this.assertRecurrence(dto.recurrence);

    const { eventId: masterId } = eventId
      ? parseInstanceId(eventId)
      : { eventId: null };

    const recurrenceRule = dto.recurrence
      ? buildRRuleString(dto.recurrence, new Date(dto.startsAtUtc))
      : null;

    return this.runConflictCheck(familyId, {
      id: masterId ?? 'new',
      title: dto.title ?? 'Новое событие',
      startsAtUtc: new Date(dto.startsAtUtc),
      endsAtUtc: new Date(dto.endsAtUtc),
      participantIds: dto.participantIds,
      responsibleMemberId: dto.responsibleMemberId,
      travelBufferMinutes: dto.travelBufferMinutes,
      recurrenceRule,
    });
  }

  async listConflicts(familyId: string, from?: string, to?: string) {
    const events = await this.list(familyId, { from, to });
    const family = await this.prisma.family.findUniqueOrThrow({
      where: { id: familyId },
    });
    const members = await this.prisma.familyMember.findMany({ where: { familyId } });
    const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

    const inputs: ConflictEventInput[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      startsAtUtc: new Date(e.startsAtUtc),
      endsAtUtc: new Date(e.endsAtUtc),
      participantIds: e.participantIds,
      responsibleMemberId: e.responsibleMemberId,
      travelBufferMinutes: e.travelBufferMinutes,
    }));

    const all = [];
    for (const candidate of inputs) {
      const others = inputs.filter((e) => e.id !== candidate.id);
      const result = this.conflictService.checkConflicts(
        candidate,
        others,
        names,
        family.travelBufferDefault,
      );
      for (const c of result.conflicts) {
        all.push({
          eventId: candidate.id,
          eventTitle: candidate.title,
          ...c,
        });
      }
    }

    const seen = new Set<string>();
    const unique = [];
    for (const item of all) {
      const pair = [item.eventId, item.conflictingEventId].sort().join(':');
      const key = `${pair}:${item.kind}:${item.memberId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    return { conflicts: unique };
  }

  private expandEvent(event: EventRow, from: Date, to: Date) {
    const exceptions = event.exceptions.map((x) => x.occurrenceStartsAtUtc);
    const occurrences = expandOccurrences({
      startsAtUtc: event.startsAtUtc,
      endsAtUtc: event.endsAtUtc,
      recurrenceRule: event.recurrenceRule,
      from,
      to,
      exceptionStarts: exceptions,
    });

    return occurrences.map((occ) =>
      this.serializeOccurrence(event, occ.startsAtUtc, occ.endsAtUtc),
    );
  }

  private async runConflictCheck(
    familyId: string,
    candidate: ConflictEventInput & { recurrenceRule?: string | null },
  ) {
    const family = await this.prisma.family.findUniqueOrThrow({
      where: { id: familyId },
    });
    const members = await this.prisma.familyMember.findMany({ where: { familyId } });
    const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

    const windowStart = new Date(candidate.startsAtUtc.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(
      candidate.startsAtUtc.getTime() + 14 * 24 * 60 * 60 * 1000,
    );

    const existing = await this.prisma.event.findMany({
      where: {
        familyId,
        status: EventStatus.active,
        startsAtUtc: { lt: windowEnd },
        OR: [
          { recurrenceRule: null, endsAtUtc: { gt: windowStart } },
          { recurrenceRule: { not: null } },
        ],
      },
      include: eventInclude,
    });

    const inputs: ConflictEventInput[] = [];
    for (const e of existing) {
      if (e.id === candidate.id) continue;
      const occs = expandOccurrences({
        startsAtUtc: e.startsAtUtc,
        endsAtUtc: e.endsAtUtc,
        recurrenceRule: e.recurrenceRule,
        from: windowStart,
        to: windowEnd,
        exceptionStarts: e.exceptions.map((x) => x.occurrenceStartsAtUtc),
      });
      for (const occ of occs) {
        inputs.push({
          id: instanceId(e.id, occ.startsAtUtc),
          title: e.title,
          startsAtUtc: occ.startsAtUtc,
          endsAtUtc: occ.endsAtUtc,
          participantIds: e.participants.map((p) => p.memberId),
          responsibleMemberId: e.responsibleMemberId,
          travelBufferMinutes: e.travelBufferMinutes,
        });
      }
    }

    const candidateOccs = expandOccurrences({
      startsAtUtc: candidate.startsAtUtc,
      endsAtUtc: candidate.endsAtUtc,
      recurrenceRule: candidate.recurrenceRule,
      from: windowStart,
      to: windowEnd,
    });

    const merged = {
      hasHardConflicts: false,
      hasBufferWarnings: false,
      conflicts: [] as ReturnType<ConflictService['checkConflicts']>['conflicts'],
    };

    for (const occ of candidateOccs.slice(0, 30)) {
      const result = this.conflictService.checkConflicts(
        {
          ...candidate,
          id: candidate.id === 'new' ? 'new' : instanceId(candidate.id, occ.startsAtUtc),
          startsAtUtc: occ.startsAtUtc,
          endsAtUtc: occ.endsAtUtc,
        },
        inputs,
        names,
        family.travelBufferDefault,
      );
      merged.hasHardConflicts ||= result.hasHardConflicts;
      merged.hasBufferWarnings ||= result.hasBufferWarnings;
      merged.conflicts.push(...result.conflicts);
    }

    return merged;
  }

  private throwIfConflicts(
    conflicts: { hasHardConflicts: boolean; hasBufferWarnings: boolean },
    confirmConflict?: boolean,
  ) {
    if (conflicts.hasHardConflicts) {
      throw new ConflictException({
        message: 'Обнаружены пересечения по времени',
        code: 'HARD_CONFLICT',
        details: conflicts,
      });
    }
    if (conflicts.hasBufferWarnings && !confirmConflict) {
      throw new ConflictException({
        message: 'Недостаточно времени между событиями. Подтвердите сохранение.',
        code: 'BUFFER_WARNING',
        details: conflicts,
      });
    }
  }

  private assertRecurrence(recurrence?: RecurrenceDto | null) {
    if (!recurrence) return;
    if (recurrence.freq === 'weekly' && recurrence.byWeekday?.length === 0) {
      throw new BadRequestException('Выберите хотя бы один день недели');
    }
  }

  private assertTimeRange(startsAtUtc: string, endsAtUtc: string) {
    if (new Date(startsAtUtc) >= new Date(endsAtUtc)) {
      throw new BadRequestException('Время окончания должно быть позже начала');
    }
  }

  /** Default ±45 days; max span 180 days — protects recurrence expand */
  private resolveWindow(fromRaw?: string, toRaw?: string): { from: Date; to: Date } {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let from = fromRaw ? new Date(fromRaw) : new Date(now - 45 * day);
    let to = toRaw ? new Date(toRaw) : new Date(now + 45 * day);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Некорректный диапазон дат');
    }
    if (to <= from) {
      throw new BadRequestException('Параметр to должен быть позже from');
    }
    const maxSpan = 180 * day;
    if (to.getTime() - from.getTime() > maxSpan) {
      to = new Date(from.getTime() + maxSpan);
    }
    return { from, to };
  }

  private async assertMembersBelong(
    familyId: string,
    participantIds: string[],
    responsibleMemberId?: string | null,
  ) {
    const ids = [
      ...new Set([
        ...participantIds,
        ...(responsibleMemberId ? [responsibleMemberId] : []),
      ]),
    ];
    const members = await this.prisma.familyMember.findMany({
      where: { familyId, id: { in: ids }, active: true },
    });
    if (members.length !== ids.length) {
      throw new BadRequestException(
        'Один или несколько участников не принадлежат этой семье',
      );
    }
  }

  private async assertCategoryBelong(familyId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, familyId, active: true },
    });
    if (!category) {
      throw new BadRequestException('Категория не найдена в этой семье');
    }
  }

  private serializeMaster(event: EventRow) {
    return {
      ...this.serializeOccurrence(event, event.startsAtUtc, event.endsAtUtc),
      id: event.id,
      isRecurring: !!event.recurrenceRule,
      recurrenceRule: event.recurrenceRule,
      occurrenceStartsAtUtc: event.startsAtUtc.toISOString(),
      reminderMinutes: event.reminders.map((r) => r.minutesBefore).sort((a, b) => a - b),
    };
  }

  private serializeOccurrence(event: EventRow, startsAtUtc: Date, endsAtUtc: Date) {
    const recurring = !!event.recurrenceRule;
    return {
      id: recurring ? instanceId(event.id, startsAtUtc) : event.id,
      masterEventId: event.id,
      familyId: event.familyId,
      title: event.title,
      description: event.description,
      startsAtUtc: startsAtUtc.toISOString(),
      endsAtUtc: endsAtUtc.toISOString(),
      occurrenceStartsAtUtc: startsAtUtc.toISOString(),
      timezone: event.timezone,
      location: event.location,
      categoryId: event.categoryId,
      category: {
        id: event.category.id,
        name: event.category.name,
        color: event.category.color,
      },
      responsibleMemberId: event.responsibleMemberId,
      responsible: event.responsible
        ? {
            id: event.responsible.id,
            name: event.responsible.name,
            color: event.responsible.color,
          }
        : null,
      travelBufferMinutes: event.travelBufferMinutes,
      status: event.status,
      isRecurring: recurring,
      recurrenceRule: event.recurrenceRule,
      reminderMinutes: event.reminders.map((r) => r.minutesBefore).sort((a, b) => a - b),
      participantIds: event.participants.map((p) => p.memberId),
      participants: event.participants.map((p) => ({
        id: p.member.id,
        name: p.member.name,
        color: p.member.color,
        type: p.member.type,
      })),
    };
  }
}
