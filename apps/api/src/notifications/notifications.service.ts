import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { expandOccurrences } from '../events/recurrence';
import { PushService } from './push.service';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.processDueReminders().catch((e) =>
        this.logger.error('Reminder tick failed', e instanceof Error ? e.stack : e),
      );
    }, 30_000);
    void this.processDueReminders().catch(() => undefined);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async listForUser(userId: string, opts?: { unreadOnly?: boolean; take?: number }) {
    const take = Math.min(opts?.take ?? 50, 100);
    const items = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return items.map((n) => this.serialize(n));
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!existing) {
      return null;
    }
    if (existing.readAt) {
      return this.serialize(existing);
    }
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
    return this.serialize(updated);
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /**
   * Sync reminder rows from minutesBefore[] and recompute nextFireAt.
   */
  async syncEventReminders(eventId: string, minutesBefore: number[] | undefined) {
    if (minutesBefore === undefined) {
      await this.recomputeNextFireForEvent(eventId);
      return;
    }

    const unique = [
      ...new Set(
        minutesBefore
          .map((m) => Math.floor(m))
          .filter((m) => m >= 0 && m <= 60 * 24 * 30),
      ),
    ].sort((a, b) => a - b);

    await this.prisma.$transaction(async (tx) => {
      await tx.reminder.deleteMany({
        where: {
          eventId,
          ...(unique.length ? { minutesBefore: { notIn: unique } } : {}),
        },
      });

      for (const minutes of unique) {
        await tx.reminder.upsert({
          where: {
            eventId_minutesBefore: { eventId, minutesBefore: minutes },
          },
          create: { eventId, minutesBefore: minutes },
          update: {},
        });
      }
    });

    await this.recomputeNextFireForEvent(eventId);
  }

  async recomputeNextFireForEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { exceptions: true, reminders: true },
    });
    if (!event || event.status !== 'active') {
      await this.prisma.reminder.updateMany({
        where: { eventId },
        data: { nextFireAt: null },
      });
      return;
    }

    const now = new Date();
    for (const reminder of event.reminders) {
      const next = this.computeNextFire(event, reminder.minutesBefore, now, reminder);
      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { nextFireAt: next },
      });
    }
  }

  async notifyEventUpdated(eventId: string) {
    const event = await this.loadEventWithUsers(eventId);
    if (!event) return;
    const userIds = await this.familyAccountUserIds(event.familyId);
    await this.createForUsers(userIds, {
      familyId: event.familyId,
      eventId: event.id,
      type: NotificationType.event_updated,
      title: 'Событие изменено',
      body: `«${event.title}» обновлено`,
      meta: { eventId: event.id },
    });
  }

  async notifyEventCancelled(eventId: string, title: string, familyId: string) {
    const userIds = await this.familyAccountUserIds(familyId);
    await this.createForUsers(userIds, {
      familyId,
      eventId,
      type: NotificationType.event_cancelled,
      title: 'Событие отменено',
      body: `«${title}» отменено`,
      meta: { eventId },
    });
    await this.prisma.reminder.updateMany({
      where: { eventId },
      data: { nextFireAt: null },
    });
  }

  async processDueReminders() {
    const now = new Date();
    const due = await this.prisma.reminder.findMany({
      where: {
        nextFireAt: { lte: now },
        event: { status: 'active' },
      },
      include: {
        event: {
          include: {
            exceptions: true,
            participants: { include: { member: true } },
            responsible: true,
          },
        },
      },
      take: 50,
    });

    for (const reminder of due) {
      await this.fireReminder(reminder, now);
    }
  }

  private async fireReminder(
    reminder: Prisma.ReminderGetPayload<{
      include: {
        event: {
          include: {
            exceptions: true;
            participants: { include: { member: true } };
            responsible: true;
          };
        };
      };
    }>,
    now: Date,
  ) {
    const event = reminder.event;
    const occurrence = this.findOccurrenceForFire(event, reminder.minutesBefore, now);
    if (!occurrence) {
      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { nextFireAt: null },
      });
      return;
    }

    const userIds = this.collectUserIds(event);
    const when = occurrence.toLocaleString('ru-RU', { timeZone: event.timezone });
    await this.createForUsers(userIds, {
      familyId: event.familyId,
      eventId: event.id,
      type: NotificationType.reminder,
      title: 'Напоминание',
      body: `«${event.title}» начнётся в ${when}`,
      meta: {
        reminderId: reminder.id,
        minutesBefore: reminder.minutesBefore,
        occurrenceStartsAtUtc: occurrence.toISOString(),
      },
    });

    const next = this.computeNextFire(event, reminder.minutesBefore, now, {
      lastOccurrenceStartsAtUtc: occurrence,
    });
    await this.prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        lastFiredAt: now,
        lastOccurrenceStartsAtUtc: occurrence,
        nextFireAt: next,
      },
    });
  }

  private computeNextFire(
    event: {
      startsAtUtc: Date;
      endsAtUtc: Date;
      recurrenceRule: string | null;
      exceptions: { occurrenceStartsAtUtc: Date }[];
      status: string;
    },
    minutesBefore: number,
    from: Date,
    reminder?: { lastOccurrenceStartsAtUtc?: Date | null },
  ): Date | null {
    if (event.status !== 'active') return null;

    const msBefore = minutesBefore * 60_000;

    if (!event.recurrenceRule) {
      const fireAt = new Date(event.startsAtUtc.getTime() - msBefore);
      if (reminder?.lastOccurrenceStartsAtUtc) return null;
      if (event.startsAtUtc.getTime() <= from.getTime()) return null;
      // past scheduled fire but event still upcoming → fire now
      if (fireAt.getTime() <= from.getTime()) return from;
      return fireAt;
    }

    const horizonEnd = new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);
    const occurrences = expandOccurrences({
      startsAtUtc: event.startsAtUtc,
      endsAtUtc: event.endsAtUtc,
      recurrenceRule: event.recurrenceRule,
      from,
      to: horizonEnd,
      exceptionStarts: event.exceptions.map((e) => e.occurrenceStartsAtUtc),
    });

    for (const occ of occurrences) {
      if (
        reminder?.lastOccurrenceStartsAtUtc &&
        occ.startsAtUtc.getTime() <= reminder.lastOccurrenceStartsAtUtc.getTime()
      ) {
        continue;
      }
      const fireAt = new Date(occ.startsAtUtc.getTime() - msBefore);
      if (fireAt.getTime() <= from.getTime() && occ.startsAtUtc.getTime() > from.getTime()) {
        return from;
      }
      if (fireAt.getTime() > from.getTime()) return fireAt;
    }

    return null;
  }

  private findOccurrenceForFire(
    event: {
      startsAtUtc: Date;
      endsAtUtc: Date;
      recurrenceRule: string | null;
      exceptions: { occurrenceStartsAtUtc: Date }[];
      timezone: string;
    },
    minutesBefore: number,
    now: Date,
  ): Date | null {
    const msBefore = minutesBefore * 60_000;
    if (!event.recurrenceRule) {
      if (now < event.startsAtUtc) return event.startsAtUtc;
      return null;
    }

    const windowStart = new Date(now.getTime() - 5 * 60_000);
    const windowEnd = new Date(now.getTime() + msBefore + 5 * 60_000);
    const occurrences = expandOccurrences({
      startsAtUtc: event.startsAtUtc,
      endsAtUtc: event.endsAtUtc,
      recurrenceRule: event.recurrenceRule,
      from: windowStart,
      to: windowEnd,
      exceptionStarts: event.exceptions.map((e) => e.occurrenceStartsAtUtc),
    });
    const hit = occurrences.find((o) => {
      const fireAt = o.startsAtUtc.getTime() - msBefore;
      return fireAt <= now.getTime() && o.startsAtUtc.getTime() > now.getTime() - 60_000;
    });
    return hit?.startsAtUtc ?? null;
  }

  private async loadEventWithUsers(eventId: string) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        participants: { include: { member: true } },
        responsible: true,
      },
    });
  }

  private collectUserIds(event: {
    participants: { member: { userId: string | null } }[];
    responsible: { userId: string | null } | null;
  }) {
    const ids = new Set<string>();
    for (const p of event.participants) {
      if (p.member.userId) ids.add(p.member.userId);
    }
    if (event.responsible?.userId) ids.add(event.responsible.userId);
    return [...ids];
  }

  private async familyAccountUserIds(familyId: string) {
    const members = await this.prisma.familyMember.findMany({
      where: { familyId, active: true, userId: { not: null } },
      select: { userId: true },
    });
    const ids = new Set(members.map((m) => m.userId!).filter(Boolean));
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { ownerId: true },
    });
    if (family?.ownerId) ids.add(family.ownerId);
    return [...ids];
  }

  private async createForUsers(
    userIds: string[],
    data: {
      familyId: string;
      eventId: string;
      type: NotificationType;
      title: string;
      body: string;
      meta?: Prisma.InputJsonValue;
    },
  ) {
    if (!userIds.length) return;
    const created = await this.prisma.$transaction(
      userIds.map((userId) =>
        this.prisma.notification.create({
          data: {
            userId,
            familyId: data.familyId,
            eventId: data.eventId,
            type: data.type,
            title: data.title,
            body: data.body,
            meta: data.meta,
          },
        }),
      ),
    );

    for (const n of created) {
      const serialized = this.serialize(n);
      this.realtime.notificationNew(n.userId, serialized);
      void this.push.sendToUser(n.userId, {
        title: n.title,
        body: n.body,
        notificationId: n.id,
        type: n.type,
        url: '/',
      });
    }
  }

  private serialize(n: {
    id: string;
    userId: string;
    familyId: string | null;
    eventId: string | null;
    type: NotificationType;
    title: string;
    body: string;
    readAt: Date | null;
    meta: Prisma.JsonValue;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      userId: n.userId,
      familyId: n.familyId,
      eventId: n.eventId,
      type: n.type,
      title: n.title,
      body: n.body,
      readAt: n.readAt?.toISOString() ?? null,
      meta: n.meta,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
