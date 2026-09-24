import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  FAMILY_ROOM,
  RealtimeEvent,
  USER_ROOM,
  type RealtimeEventName,
} from './realtime.events';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  emitFamily(
    familyId: string,
    event: RealtimeEventName,
    action?: string,
  ) {
    if (!this.server) return;
    this.server.to(FAMILY_ROOM(familyId)).emit(event, {
      familyId,
      action,
      at: new Date().toISOString(),
    });
  }

  eventsChanged(familyId: string, action?: string) {
    this.emitFamily(familyId, RealtimeEvent.EventsChanged, action);
  }

  membersChanged(familyId: string, action?: string) {
    this.emitFamily(familyId, RealtimeEvent.MembersChanged, action);
  }

  categoriesChanged(familyId: string, action?: string) {
    this.emitFamily(familyId, RealtimeEvent.CategoriesChanged, action);
  }

  familyChanged(familyId: string, action?: string) {
    this.emitFamily(familyId, RealtimeEvent.FamilyChanged, action);
  }

  notificationNew(userId: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(USER_ROOM(userId)).emit(RealtimeEvent.NotificationNew, payload);
  }
}
