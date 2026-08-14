// USSD gateway callback. The response body IS the next screen (CON/END
// prefixed, text/plain) — USSD has no out-of-band send at all.
import { handleUssdWebhook } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function parseFields(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return (await request.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  try {
    return Object.fromEntries((await request.formData()).entries());
  } catch {
    return {};
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const result = await handleUssdWebhook({
    db: prisma,
    orgSlug: params.org,
    secretHeader: request.headers.get("x-ussd-secret"),
    fields: await parseFields(request),
  });
  return new NextResponse(result.body, {
    status: result.status,
    headers: { "Content-Type": "text/plain" },
  });
}
