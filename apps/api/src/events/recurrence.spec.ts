import {
  buildRRuleString,
  expandOccurrences,
  instanceId,
  parseInstanceId,
  type RecurrenceInput,
} from './recurrence';

describe('recurrence', () => {
  const start = new Date('2026-09-21T14:00:00.000Z');
  const end = new Date('2026-09-21T15:00:00.000Z');

  it('expands daily occurrences in range', () => {
    const rule = buildRRuleString({ freq: 'daily', until: '2026-09-25' }, start);
    const occ = expandOccurrences({
      startsAtUtc: start,
      endsAtUtc: end,
      recurrenceRule: rule,
      from: new Date('2026-09-21T00:00:00.000Z'),
      to: new Date('2026-09-24T00:00:00.000Z'),
    });
    expect(occ).toHaveLength(3);
    expect(occ[0].startsAtUtc.toISOString()).toBe('2026-09-21T14:00:00.000Z');
    expect(occ[2].startsAtUtc.toISOString()).toBe('2026-09-23T14:00:00.000Z');
  });

  it('expands weekly by selected weekdays', () => {
    // Mon=1, Wed=3
    const rule = buildRRuleString(
      { freq: 'weekly', byWeekday: [1, 3], until: '2026-10-05' },
      start,
    );
    const occ = expandOccurrences({
      startsAtUtc: start,
      endsAtUtc: end,
      recurrenceRule: rule,
      from: new Date('2026-09-21T00:00:00.000Z'),
      to: new Date('2026-10-01T00:00:00.000Z'),
    });
    const days = occ.map((o) => o.startsAtUtc.getUTCDay());
    // 21 Sep 2026 is Monday (1), Wed=3
    expect(days.every((d) => d === 1 || d === 3)).toBe(true);
    expect(occ.length).toBeGreaterThanOrEqual(2);
  });

  it('skips exception dates', () => {
    const rule = buildRRuleString({ freq: 'daily', until: '2026-09-24' }, start);
    const occ = expandOccurrences({
      startsAtUtc: start,
      endsAtUtc: end,
      recurrenceRule: rule,
      from: new Date('2026-09-21T00:00:00.000Z'),
      to: new Date('2026-09-25T00:00:00.000Z'),
      exceptionStarts: [new Date('2026-09-22T14:00:00.000Z')],
    });
    expect(occ.map((o) => o.startsAtUtc.toISOString())).toEqual([
      '2026-09-21T14:00:00.000Z',
      '2026-09-23T14:00:00.000Z',
      '2026-09-24T14:00:00.000Z',
    ]);
  });

  it('returns single occurrence without rule', () => {
    const occ = expandOccurrences({
      startsAtUtc: start,
      endsAtUtc: end,
      from: new Date('2026-09-21T00:00:00.000Z'),
      to: new Date('2026-09-22T00:00:00.000Z'),
    });
    expect(occ).toHaveLength(1);
  });

  it('parses instance ids', () => {
    const id = instanceId('evt1', start);
    expect(parseInstanceId(id)).toEqual({
      eventId: 'evt1',
      occurrenceStartsAtUtc: start.toISOString(),
    });
    expect(parseInstanceId('evt1')).toEqual({ eventId: 'evt1' });
  });

  it('builds monthly rule', () => {
    const rule = buildRRuleString({ freq: 'monthly', until: '2026-12-21' }, start);
    expect(rule).toContain('FREQ=MONTHLY');
    const occ = expandOccurrences({
      startsAtUtc: start,
      endsAtUtc: end,
      recurrenceRule: rule,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-12-01T00:00:00.000Z'),
    });
    expect(occ.length).toBeGreaterThanOrEqual(3);
  });
});

// silence unused type import in some tooling
void (null as unknown as RecurrenceInput);
