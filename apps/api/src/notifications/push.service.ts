import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  notificationId?: string;
  type?: string;
};

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  private publicKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() ?? '';
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim() ?? '';
    const subject =
      this.config.get<string>('VAPID_SUBJECT')?.trim() ||
      'mailto:family-calendar@localhost';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys missing — Web Push disabled (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)',
      );
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.enabled = true;
      this.logger.log('Web Push enabled');
    } catch (e) {
      this.logger.error(
        `Invalid VAPID keys — Web Push disabled: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  getPublicKey() {
    return { publicKey: this.publicKey || null, enabled: this.enabled };
  }

  async subscribe(
    userId: string,
    data: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    },
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: {
        userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: data.userAgent?.slice(0, 300),
      },
      update: {
        userId,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: data.userAgent?.slice(0, 300),
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { ok: true };
  }

  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.enabled) return;

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (!subs.length) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      notificationId: payload.notificationId,
      type: payload.type,
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (e: unknown) {
          const status =
            e && typeof e === 'object' && 'statusCode' in e
              ? Number((e as { statusCode: number }).statusCode)
              : 0;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
            this.logger.debug(`Removed stale push subscription ${sub.id}`);
          } else {
            this.logger.warn(
              `Push failed for ${sub.id}: ${e instanceof Error ? e.message : e}`,
            );
          }
        }
      }),
    );
  }
}
