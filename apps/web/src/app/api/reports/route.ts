// The report a manager actually asks for: what came in, what it was about,
// how fast we answered, and whether that is better or worse than last time.
//
// The wallboard answers "right now". This answers "how did we do", which is a
// different question and the one that gets quoted in a board pack — so every
// number here either carries its denominator or refuses to appear.
import { prisma, UserRole } from "@olink-desk/database";
import {
  bucketByDay,
  countBy,
  delta,
  measure,
  median,
  rate,
  type Measure,
} from "@olink-desk/reports";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

// Windows offered. Not free-form: a report is compared against the previous
// window of the SAME length, and an arbitrary range makes that comparison
// meaningless to explain.
const WINDOWS = [7, 30, 90] as const;
const READERS: UserRole[] = [UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR];

const minutesBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60000);

export async function GET(request: NextRequest) {
  const principal = await requireUser(request, READERS);
  if (isDenied(principal)) return principal;

  const asked = Number(request.nextUrl.searchParams.get("days"));
  const days = (WINDOWS as readonly number[]).includes(asked) ? asked : 30;

  // The tenant's day, not UTC: a ticket at half past midnight in Addis
  // belongs to that day, and the report is read by somebody living in it.
  const TENANT_OFFSET_MINUTES = 180;

  const now = new Date();
  // Align the window to the START of a local day, `days` days back INCLUSIVE
  // of today. A naive `now - days` starts mid-afternoon, so the last bucket
  // ends yesterday and everything that arrived today falls off the chart —
  // which is exactly what happened, and what the drive caught by summing the
  // series against the real ticket count.
  const shifted = new Date(now.getTime() + TENANT_OFFSET_MINUTES * 60000);
  const startOfLocalDayUtc = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      TENANT_OFFSET_MINUTES * 60000,
  );
  const from = new Date(startOfLocalDayUtc.getTime() - (days - 1) * 86400000);
  // The previous window is the same length, immediately before — so "better
  // or worse" compares like with like.
  const prevFrom = new Date(from.getTime() - days * 86400000);

  const select = {
    id: true,
    createdAt: true,
    channel: true,
    language: true,
    firstRespondedAt: true,
    firstResponseDueAt: true,
    resolvedAt: true,
    csatScore: true,
    tags: { select: { tag: { select: { name: true, slug: true } } } },
  } as const;

  const [current, previous] = await Promise.all([
    prisma.ticket.findMany({
      where: { organizationId: principal.organization.id, createdAt: { gte: from } },
      select,
    }),
    prisma.ticket.findMany({
      where: {
        organizationId: principal.organization.id,
        createdAt: { gte: prevFrom, lt: from },
      },
      select,
    }),
  ]);

  type Row = (typeof current)[number];

  const firstResponseMinutes = (rows: Row[]) =>
    rows
      .filter((t) => t.firstRespondedAt)
      .map((t) => minutesBetween(t.firstRespondedAt as Date, t.createdAt));
  const resolveMinutes = (rows: Row[]) =>
    rows.filter((t) => t.resolvedAt).map((t) => minutesBetween(t.resolvedAt as Date, t.createdAt));
  const csatScores = (rows: Row[]) =>
    rows.map((t) => t.csatScore).filter((n): n is number => typeof n === "number");

  // On-time first response: of the tickets that HAVE been answered and had a
  // promise, how many made it. Tickets still waiting are deliberately out of
  // both halves — counting an unanswered ticket as a miss would report a
  // failure that has not happened yet.
  const onTime = (rows: Row[]): Measure => {
    const answered = rows.filter((t) => t.firstRespondedAt && t.firstResponseDueAt);
    const met = answered.filter(
      (t) => (t.firstRespondedAt as Date) <= (t.firstResponseDueAt as Date),
    );
    return rate(met.length, answered.length);
  };

  const stat = (rows: Row[]) => ({
    opened: { value: rows.length, n: rows.length } as Measure,
    firstResponse: measure(firstResponseMinutes(rows), (v) => median(v) as number),
    resolution: measure(resolveMinutes(rows), (v) => median(v) as number),
    onTime: onTime(rows),
    csat: measure(csatScores(rows), (v) =>
      Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10,
    ),
  });

  const cur = stat(current);
  const prev = stat(previous);

  // Tag names travel with their slug: the name is what a person reads, the
  // slug is what the drill-down link filters on (ADR 0011).
  const tagRows = current.flatMap((t) => t.tags.map((j) => j.tag));
  const tagNames = new Map(tagRows.map((t) => [t.slug, t.name]));

  return NextResponse.json(
    {
      range: { days, from: from.toISOString(), to: now.toISOString() },
      volume: bucketByDay(
        current.map((t) => t.createdAt),
        from,
        days,
        TENANT_OFFSET_MINUTES,
      ),
      totals: {
        opened: cur.opened,
        resolved: { value: resolveMinutes(current).length, n: current.length },
      },
      metrics: {
        firstResponse: { current: cur.firstResponse, previous: prev.firstResponse, delta: delta(cur.firstResponse, prev.firstResponse) },
        resolution: { current: cur.resolution, previous: prev.resolution, delta: delta(cur.resolution, prev.resolution) },
        onTime: { current: cur.onTime, previous: prev.onTime, delta: delta(cur.onTime, prev.onTime) },
        csat: { current: cur.csat, previous: prev.csat, delta: delta(cur.csat, prev.csat) },
        volume: { current: cur.opened, previous: prev.opened, delta: delta(cur.opened, prev.opened) },
      },
      byChannel: countBy(current, (t) => t.channel),
      // The report nobody else in this market produces: what fraction of your
      // customers wrote to you in which language.
      byLanguage: countBy(current, (t) => t.language),
      topTags: countBy(tagRows, (t) => t.slug)
        .slice(0, 12)
        .map((r) => ({ slug: r.key, name: tagNames.get(r.key) ?? r.key, count: r.count })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
