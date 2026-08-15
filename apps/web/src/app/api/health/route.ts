// The one-request answer to "is the deployment actually working?" — the
// Bank Assist /health pattern. Reports each subsystem separately so a
// failure names its component instead of shipping a mystery 500 to whoever
// touches the product first. The deploy pipeline probes this after every
// deploy and FAILS the run if it is not green, so a broken revision is
// caught in the Actions log — not discovered by a person.
//
// No secret value is ever echoed; checks report ok / a failure reason only.
import { signSession, verifySession } from "@olink-desk/auth";
import { openChannelConfig, sealChannelConfig } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function reason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // First line only — Prisma's multi-line advice is noise in a status field.
  return `fail: ${message.split("\n").filter(Boolean)[0]?.slice(0, 200) ?? "unknown"}`;
}

export async function GET() {
  const checks: Record<string, string> = {};
  let ok = true;

  // Database reachability AND the Prisma engine being present in the image —
  // the two failures that have actually happened, one probe.
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    checks.database = reason(err);
    ok = false;
  }

  // CHANNEL_CONFIG_KEY present and usable: a full seal/unseal round trip.
  try {
    openChannelConfig(sealChannelConfig({ probe: "x" }));
    checks.channelConfigKey = "ok";
  } catch (err) {
    checks.channelConfigKey = reason(err);
    ok = false;
  }

  // JWT_SECRET present and usable: sign and verify a throwaway session.
  try {
    const token = await signSession({
      userId: "health-probe",
      organizationId: "health-probe",
      role: "AGENT",
    });
    checks.jwt = (await verifySession(token)) ? "ok" : "fail: verify returned null";
    if (checks.jwt !== "ok") ok = false;
  } catch (err) {
    checks.jwt = reason(err);
    ok = false;
  }

  // Webhook URLs are built from this; unset means channel connects 503.
  checks.appBaseUrl = process.env.APP_BASE_URL ? "ok" : "unset";

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      // Cloud Run stamps the serving revision; "is main actually live?" is
      // one request instead of an Actions-history dig.
      revision: process.env.K_REVISION ?? null,
      checks,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
