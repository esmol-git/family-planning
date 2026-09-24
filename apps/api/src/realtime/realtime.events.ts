export const FAMILY_ROOM = (familyId: string) => `family:${familyId}`;
export const USER_ROOM = (userId: string) => `user:${userId}`;

export const RealtimeEvent = {
  EventsChanged: 'events:changed',
  MembersChanged: 'members:changed',
  CategoriesChanged: 'categories:changed',
  FamilyChanged: 'family:changed',
  NotificationNew: 'notification:new',
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export type FamilyRealtimePayload = {
  familyId: string;
  action?: string;
  at: string;
};
