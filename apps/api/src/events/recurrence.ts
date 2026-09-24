import { RRule, rrulestr, Weekday } from 'rrule';

export type RecurrenceInput = {
  freq: 'daily' | 'weekly' | 'monthly';
  interval?: number;
  /** ISO weekdays: 1=Mon … 7=Sun */
  byWeekday?: number[];
  /** Inclusive end date YYYY-MM-DD (interpreted as end of that day UTC) */
  until?: string;
};

const ISO_TO_RRULE: Record<number, Weekday> = {
  1: RRule.MO,
  2: RRule.TU,
  3: RRule.WE,
  4: RRule.TH,
  5: RRule.FR,
  6: RRule.SA,
  7: RRule.SU,
};

export function buildRRuleString(
  input: RecurrenceInput,
  dtstart: Date,
): string {
  const interval = input.interval && input.interval > 0 ? input.interval : 1;
  const options: ConstructorParameters<typeof RRule>[0] = {
    freq:
      input.freq === 'daily'
        ? RRule.DAILY
        : input.freq === 'monthly'
          ? RRule.MONTHLY
          : RRule.WEEKLY,
    interval,
    dtstart,
  };

  if (input.freq === 'weekly' && input.byWeekday?.length) {
    options.byweekday = input.byWeekday
      .map((d) => ISO_TO_RRULE[d])
      .filter(Boolean);
  }

  if (input.until) {
    const until = new Date(`${input.until}T23:59:59.000Z`);
    options.until = until;
  }

  return new RRule(options).toString().replace(/^DTSTART:[^\n]*\n?/, '');
}

export function parseRecurrenceRule(rule: string, dtstart: Date): RRule {
  const normalized = rule.includes('DTSTART')
    ? rule
    : `DTSTART:${formatRRuleDate(dtstart)}\nRRULE:${rule.replace(/^RRULE:/, '')}`;

  // Always parse as set so typing is stable across rrule versions
  const set = rrulestr(normalized, { forceset: true }) as {
    rrules: () => RRule[];
  };
  const rules = set.rrules();
  if (!rules.length) {
    throw new Error('Некорректное правило повторения');
  }
  return rules[0];
}

function formatRRuleDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export type Occurrence = {
  startsAtUtc: Date;
  endsAtUtc: Date;
};

/**
 * Expand a recurring (or one-off) event into occurrences overlapping [from, to).
 */
export function expandOccurrences(params: {
  startsAtUtc: Date;
  endsAtUtc: Date;
  recurrenceRule?: string | null;
  from: Date;
  to: Date;
  exceptionStarts?: Date[];
  /** Safety cap */
  maxOccurrences?: number;
}): Occurrence[] {
  const durationMs = params.endsAtUtc.getTime() - params.startsAtUtc.getTime();
  const exceptionKeys = new Set(
    (params.exceptionStarts ?? []).map((d) => d.toISOString()),
  );
  const max = params.maxOccurrences ?? 400;

  if (!params.recurrenceRule) {
    if (params.startsAtUtc < params.to && params.endsAtUtc > params.from) {
      if (!exceptionKeys.has(params.startsAtUtc.toISOString())) {
        return [{ startsAtUtc: params.startsAtUtc, endsAtUtc: params.endsAtUtc }];
      }
    }
    return [];
  }

  const rule = parseRecurrenceRule(params.recurrenceRule, params.startsAtUtc);
  // between is inclusive on both ends for start times; pad window by duration
  const windowStart = new Date(params.from.getTime() - durationMs);
  const starts = rule.between(windowStart, params.to, true).slice(0, max);

  const result: Occurrence[] = [];
  for (const start of starts) {
    const end = new Date(start.getTime() + durationMs);
    if (start < params.to && end > params.from) {
      if (!exceptionKeys.has(start.toISOString())) {
        result.push({ startsAtUtc: start, endsAtUtc: end });
      }
    }
  }
  return result;
}

export function instanceId(eventId: string, startsAtUtc: Date): string {
  return `${eventId}__${startsAtUtc.toISOString()}`;
}

export function parseInstanceId(
  id: string,
): { eventId: string; occurrenceStartsAtUtc?: string } {
  const sep = id.indexOf('__');
  if (sep === -1) {
    return { eventId: id };
  }
  return {
    eventId: id.slice(0, sep),
    occurrenceStartsAtUtc: id.slice(sep + 2),
  };
}
