import { ConflictService } from './conflict.service';
import type { ConflictEventInput, MemberNameMap } from './conflict.types';

describe('ConflictService', () => {
  const service = new ConflictService();
  const names: MemberNameMap = {
    misha: 'Миша',
    dmitry: 'Дмитрий',
    anna: 'Анна',
    lisa: 'Лиза',
  };

  const base = (overrides: Partial<ConflictEventInput> & { id: string }): ConflictEventInput => ({
    title: 'Событие',
    startsAtUtc: new Date('2026-09-21T14:00:00.000Z'),
    endsAtUtc: new Date('2026-09-21T15:00:00.000Z'),
    participantIds: ['misha'],
    responsibleMemberId: 'dmitry',
    travelBufferMinutes: 15,
    ...overrides,
  });

  it('detects full overlap', () => {
    const result = service.checkConflicts(
      base({ id: 'a' }),
      [base({ id: 'b', title: 'Футбол' })],
      names,
      15,
    );
    expect(result.hasHardConflicts).toBe(true);
    expect(result.conflicts[0].message).toContain('Миша');
    expect(result.conflicts[0].message).toContain('Футбол');
  });

  it('detects partial overlap', () => {
    const result = service.checkConflicts(
      base({
        id: 'a',
        startsAtUtc: new Date('2026-09-21T14:30:00.000Z'),
        endsAtUtc: new Date('2026-09-21T15:30:00.000Z'),
      }),
      [base({ id: 'b', title: 'Кружок' })],
      names,
      15,
    );
    expect(result.hasHardConflicts).toBe(true);
  });

  it('detects same start time', () => {
    const result = service.checkConflicts(
      base({
        id: 'a',
        endsAtUtc: new Date('2026-09-21T14:45:00.000Z'),
      }),
      [
        base({
          id: 'b',
          title: 'Школа',
          endsAtUtc: new Date('2026-09-21T16:00:00.000Z'),
        }),
      ],
      names,
      15,
    );
    expect(result.hasHardConflicts).toBe(true);
  });

  it('does not treat touching boundaries as overlap', () => {
    const result = service.checkConflicts(
      base({
        id: 'a',
        startsAtUtc: new Date('2026-09-21T15:00:00.000Z'),
        endsAtUtc: new Date('2026-09-21T16:00:00.000Z'),
        travelBufferMinutes: 0,
      }),
      [base({ id: 'b', title: 'Футбол', travelBufferMinutes: 0 })],
      names,
      0,
    );
    expect(result.hasHardConflicts).toBe(false);
    expect(result.hasBufferWarnings).toBe(false);
  });

  it('warns when gap is less than buffer', () => {
    const result = service.checkConflicts(
      base({
        id: 'a',
        startsAtUtc: new Date('2026-09-21T15:10:00.000Z'),
        endsAtUtc: new Date('2026-09-21T16:00:00.000Z'),
        travelBufferMinutes: 15,
      }),
      [base({ id: 'b', title: 'Футбол' })],
      names,
      15,
    );
    expect(result.hasHardConflicts).toBe(false);
    expect(result.hasBufferWarnings).toBe(true);
    expect(result.conflicts[0].gapMinutes).toBe(10);
  });

  it('detects responsible adult conflict', () => {
    const result = service.checkConflicts(
      base({
        id: 'a',
        participantIds: ['lisa'],
        responsibleMemberId: 'dmitry',
      }),
      [
        base({
          id: 'b',
          title: 'Футбол',
          participantIds: ['misha'],
          responsibleMemberId: 'dmitry',
        }),
      ],
      names,
      15,
    );
    expect(result.hasHardConflicts).toBe(true);
    expect(result.conflicts.some((c) => c.kind === 'responsible_overlap')).toBe(true);
    expect(result.conflicts.find((c) => c.kind === 'responsible_overlap')?.message).toContain(
      'Дмитрий',
    );
    expect(result.conflicts.find((c) => c.kind === 'responsible_overlap')?.message).toContain(
      'конфликт ответственности',
    );
  });

  it('does not conflict for different participants', () => {
    const result = service.checkConflicts(
      base({
        id: 'a',
        participantIds: ['lisa'],
        responsibleMemberId: 'anna',
      }),
      [
        base({
          id: 'b',
          title: 'Футбол',
          participantIds: ['misha'],
          responsibleMemberId: 'dmitry',
        }),
      ],
      names,
      15,
    );
    expect(result.hasHardConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it('ignores self when updating the same event id', () => {
    const event = base({ id: 'same' });
    const result = service.checkConflicts(event, [event], names, 15);
    expect(result.conflicts).toHaveLength(0);
  });
});
