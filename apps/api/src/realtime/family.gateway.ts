import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';
import { FAMILY_ROOM, USER_ROOM } from './realtime.events';
import type { JwtPayload } from '../auth/jwt.strategy';

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    email?: string;
  };
};

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  },
})
export class FamilyGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(FamilyGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
    this.logger.log('Realtime gateway ready (/realtime)');
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
      client.data.email = payload.email;
      await client.join(USER_ROOM(payload.sub));
      this.logger.debug(`WS connected user=${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    this.logger.debug(`WS disconnected user=${client.data.userId ?? '?'}`);
  }

  @SubscribeMessage('family:join')
  async joinFamily(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { familyId?: string } | string,
  ) {
    const userId = client.data.userId;
    const familyId = typeof body === 'string' ? body : body?.familyId;
    if (!userId || !familyId) {
      return { ok: false, error: 'unauthorized' };
    }

    const member = await this.prisma.familyMember.findFirst({
      where: { familyId, userId, active: true },
      select: { id: true },
    });
    if (!member) {
      // owner without member row? check ownership
      const family = await this.prisma.family.findFirst({
        where: { id: familyId, ownerId: userId },
        select: { id: true },
      });
      if (!family) {
        return { ok: false, error: 'forbidden' };
      }
    }

    await client.join(FAMILY_ROOM(familyId));
    return { ok: true, familyId };
  }

  @SubscribeMessage('family:leave')
  async leaveFamily(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { familyId?: string } | string,
  ) {
    const familyId = typeof body === 'string' ? body : body?.familyId;
    if (!familyId) return { ok: false };
    await client.leave(FAMILY_ROOM(familyId));
    return { ok: true, familyId };
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    const query = client.handshake.query.token;
    if (typeof query === 'string' && query) return query;

    return null;
  }
}
