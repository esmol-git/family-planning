export enum MemberType {
  OWNER = 'owner',
  ADULT = 'adult',
  CHILD = 'child',
  HELPER = 'helper',
}

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  [MemberType.OWNER]: 'Организатор',
  [MemberType.ADULT]: 'Взрослый',
  [MemberType.CHILD]: 'Ребёнок',
  [MemberType.HELPER]: 'Помощник',
};

export enum MemberRelation {
  MOTHER = 'mother',
  FATHER = 'father',
  DAUGHTER = 'daughter',
  SON = 'son',
  GRANDMOTHER = 'grandmother',
  GRANDFATHER = 'grandfather',
  NANNY = 'nanny',
  OTHER = 'other',
}

export const MEMBER_RELATION_LABELS: Record<MemberRelation, string> = {
  [MemberRelation.MOTHER]: 'Мама',
  [MemberRelation.FATHER]: 'Папа',
  [MemberRelation.DAUGHTER]: 'Дочь',
  [MemberRelation.SON]: 'Сын',
  [MemberRelation.GRANDMOTHER]: 'Бабушка',
  [MemberRelation.GRANDFATHER]: 'Дедушка',
  [MemberRelation.NANNY]: 'Няня',
  [MemberRelation.OTHER]: 'Другое',
};

export const MEMBER_RELATION_OPTIONS = (
  Object.keys(MEMBER_RELATION_LABELS) as MemberRelation[]
).map((value) => ({ value, label: MEMBER_RELATION_LABELS[value] }));

export enum EventStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
}

/** Стартовый набор категорий при создании семьи */
export const DEFAULT_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: 'Школа', color: '#2563EB' },
  { name: 'Детский сад', color: '#7C3AED' },
  { name: 'Футбол', color: '#16A34A' },
  { name: 'Спорт', color: '#0D9488' },
  { name: 'Кружок', color: '#CA8A04' },
  { name: 'Врач', color: '#DC2626' },
  { name: 'Работа', color: '#475569' },
  { name: 'Поездка', color: '#EA580C' },
  { name: 'Праздник', color: '#DB2777' },
  { name: 'Домашние дела', color: '#65A30D' },
  { name: 'Другое', color: '#5B6F64' },
];

export type ConflictSeverity = 'hard' | 'buffer';

export type ConflictKind = 'participant_overlap' | 'responsible_overlap' | 'travel_buffer';

export interface ConflictItem {
  severity: ConflictSeverity;
  kind: ConflictKind;
  message: string;
  memberId?: string;
  memberName?: string;
  conflictingEventId: string;
  conflictingEventTitle: string;
  startsAtUtc: string;
  endsAtUtc: string;
  gapMinutes?: number;
  recommendedBufferMinutes?: number;
}

export interface ConflictCheckResult {
  hasHardConflicts: boolean;
  hasBufferWarnings: boolean;
  conflicts: ConflictItem[];
}

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  code?: string;
  details?: unknown;
}

export interface CategoryDto {
  id: string;
  familyId: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
}
