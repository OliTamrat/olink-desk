// SMS aggregator callback. Aggregators send form-encoded or JSON — accept
// both; the shared secret in X-SMS-Secret is the authentication.
import { handleSmsWebhook } from "@olink-desk/channels";
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
  const result = await handleSmsWebhook({
    db: prisma,
    orgSlug: params.org,
    secretHeader: request.headers.get("x-sms-secret"),
    fields: await parseFields(request),
  });
  return NextResponse.json(result.body, { status: result.status });
}
