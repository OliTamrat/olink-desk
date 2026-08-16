// Inbound email, from whichever parse service the tenant forwards through.
//
// The tenant points `support@theirdomain` at a service (Postmark, Mailgun,
// SendGrid, Cloudflare Email Workers); the service parses the message and
// POSTs it here with the shared secret. Forwarding rather than OAuth is a
// deliberate choice for this market — see `packages/channels/src/email.ts`.
//
// Vendors send JSON or multipart form data, so both are accepted. The secret
// header is the authentication and it fails closed.
import { handleEmailWebhook } from "@olink-desk/channels";
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
  const result = await handleEmailWebhook({
    db: prisma,
    organizationSlug: params.org,
    // A vendor that can only send one custom header gets to choose either.
    secret:
      request.headers.get("x-email-secret") ?? request.nextUrl.searchParams.get("secret"),
    fields: await parseFields(request),
  });

  if (result.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (result.status === 400) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  // 200 for everything else, including messages we deliberately did not act
  // on. A non-2xx tells the inbound service to retry, and retrying somebody's
  // out-of-office forever is how a mail loop starts.
  return NextResponse.json(
    result.threaded
      ? { received: true, ticket: result.result.ticketNumber }
      : { received: true, skipped: result.reason },
  );
}
