export type ConflictEventInput = {
  id: string;
  title: string;
  startsAtUtc: Date;
  endsAtUtc: Date;
  participantIds: string[];
  responsibleMemberId?: string | null;
  travelBufferMinutes?: number | null;
};

export type MemberNameMap = Record<string, string>;
