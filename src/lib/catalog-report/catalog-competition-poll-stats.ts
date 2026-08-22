import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/server-public-error";

const EMPTY_POLL_STATS = (timeZone: string) => ({
  todayCount: 0,
  lastRunAt: null as string | null,
  lastRunSource: null as string | null,
  timezone: timeZone,
});

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

function localDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const guessDate = new Date(utcGuess);
  const inTz = guessDate.toLocaleString("en-US", { timeZone });
  const inUtc = guessDate.toLocaleString("en-US", { timeZone: "UTC" });
  const offsetMs =
    new Date(inTz).getTime() - new Date(inUtc).getTime();
  return new Date(utcGuess - offsetMs);
}

export function getTodayRangeInTimezone(
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): { from: Date; to: Date } {
  const now = new Date();
  const zoned = getZonedParts(now, timeZone);
  const from = localDateTimeToUtc(
    zoned.year,
    zoned.month,
    zoned.day,
    0,
    0,
    0,
    0,
    timeZone,
  );
  return { from, to: now };
}

export async function getCatalogPollStats(
  organizationId: string,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
) {
  try {
    const pollRun = prisma.catalogCompetitionPollRun;
    if (!pollRun) {
      return EMPTY_POLL_STATS(timeZone);
    }

    const { from, to } = getTodayRangeInTimezone(timeZone);
    const [todayCount, lastRun] = await Promise.all([
      pollRun.count({
        where: {
          organizationId,
          ranAt: { gte: from, lte: to },
          ok: true,
        },
      }),
      pollRun.findFirst({
        where: { organizationId, ok: true },
        orderBy: { ranAt: "desc" },
        select: { ranAt: true, source: true },
      }),
    ]);

    return {
      todayCount,
      lastRunAt: lastRun?.ranAt.toISOString() ?? null,
      lastRunSource: lastRun?.source ?? null,
      timezone: timeZone,
    };
  } catch (e) {
    logServerError("catalog-competition-poll-stats/getCatalogPollStats", e);
    return EMPTY_POLL_STATS(timeZone);
  }
}

export async function recordCatalogPollRun(params: {
  organizationId: string;
  source: "cron" | "manual_poll";
  itemsChecked: number;
  itemsChanged: number;
  ok: boolean;
  errorSummary?: string | null;
}) {
  const ranAt = new Date();
  try {
    const pollRun = prisma.catalogCompetitionPollRun;
    if (!pollRun) {
      return { ranAt };
    }
    return await pollRun.create({
      data: {
        organizationId: params.organizationId,
        source: params.source,
        itemsChecked: params.itemsChecked,
        itemsChanged: params.itemsChanged,
        ok: params.ok,
        errorSummary: params.errorSummary ?? null,
      },
    });
  } catch (e) {
    logServerError("catalog-competition-poll-stats/recordCatalogPollRun", e);
    return { ranAt };
  }
}
