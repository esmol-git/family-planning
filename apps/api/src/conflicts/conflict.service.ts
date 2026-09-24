import { Injectable } from '@nestjs/common';
import type { ConflictCheckResult, ConflictItem } from '@family-calendar/shared-types';
import type { ConflictEventInput, MemberNameMap } from './conflict.types';

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function gapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  if (overlaps(aStart, aEnd, bStart, bEnd)) {
    return 0;
  }
  if (aEnd <= bStart) {
    return (bStart.getTime() - aEnd.getTime()) / 60_000;
  }
  return (aStart.getTime() - bEnd.getTime()) / 60_000;
}

function formatTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

@Injectable()
export class ConflictService {
  checkConflicts(
    candidate: ConflictEventInput,
    existing: ConflictEventInput[],
    memberNames: MemberNameMap,
    defaultBufferMinutes: number,
  ): ConflictCheckResult {
    const conflicts: ConflictItem[] = [];
    const candidateBuffer = candidate.travelBufferMinutes ?? defaultBufferMinutes;

    for (const other of existing) {
      if (other.id === candidate.id) {
        continue;
      }

      const sharedParticipants = candidate.participantIds.filter((id) =>
        other.participantIds.includes(id),
      );

      for (const memberId of sharedParticipants) {
        if (overlaps(candidate.startsAtUtc, candidate.endsAtUtc, other.startsAtUtc, other.endsAtUtc)) {
          const name = memberNames[memberId] ?? 'Участник';
          conflicts.push({
            severity: 'hard',
            kind: 'participant_overlap',
            message: `У ${name} уже есть событие «${other.title}» с ${formatTime(other.startsAtUtc)} до ${formatTime(other.endsAtUtc)}`,
            memberId,
            memberName: name,
            conflictingEventId: other.id,
            conflictingEventTitle: other.title,
            startsAtUtc: other.startsAtUtc.toISOString(),
            endsAtUtc: other.endsAtUtc.toISOString(),
          });
        } else {
          const gap = gapMinutes(
            candidate.startsAtUtc,
            candidate.endsAtUtc,
            other.startsAtUtc,
            other.endsAtUtc,
          );
          const otherBuffer = other.travelBufferMinutes ?? defaultBufferMinutes;
          const needed = Math.max(candidateBuffer, otherBuffer);
          if (gap > 0 && gap < needed) {
            const name = memberNames[memberId] ?? 'Участник';
            conflicts.push({
              severity: 'buffer',
              kind: 'travel_buffer',
              message: `Между событиями у ${name} остается только ${Math.round(gap)} минут. Рекомендуемый буфер — ${needed} минут`,
              memberId,
              memberName: name,
              conflictingEventId: other.id,
              conflictingEventTitle: other.title,
              startsAtUtc: other.startsAtUtc.toISOString(),
              endsAtUtc: other.endsAtUtc.toISOString(),
              gapMinutes: Math.round(gap),
              recommendedBufferMinutes: needed,
            });
          }
        }
      }

      const responsibleId = candidate.responsibleMemberId;
      if (
        responsibleId &&
        other.responsibleMemberId === responsibleId &&
        overlaps(candidate.startsAtUtc, candidate.endsAtUtc, other.startsAtUtc, other.endsAtUtc)
      ) {
        const alreadyHard = conflicts.some(
          (c) =>
            c.kind === 'responsible_overlap' &&
            c.conflictingEventId === other.id &&
            c.memberId === responsibleId,
        );
        if (!alreadyHard) {
          const name = memberNames[responsibleId] ?? 'Ответственный';
          conflicts.push({
            severity: 'hard',
            kind: 'responsible_overlap',
            message: `${name}: конфликт ответственности — два события пересекаются`,
            memberId: responsibleId,
            memberName: name,
            conflictingEventId: other.id,
            conflictingEventTitle: other.title,
            startsAtUtc: other.startsAtUtc.toISOString(),
            endsAtUtc: other.endsAtUtc.toISOString(),
          });
        }
      }
    }

    return {
      hasHardConflicts: conflicts.some((c) => c.severity === 'hard'),
      hasBufferWarnings: conflicts.some((c) => c.severity === 'buffer'),
      conflicts,
    };
  }
}
