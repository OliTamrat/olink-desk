// The embed loader: one <script> tag on any page adds a floating chat
// button that opens the org's widget in an iframe. Plain JS, no framework,
// no external requests beyond the iframe itself — it runs on the CUSTOMER'S
// site, so it must be tiny and must never conflict with their page
// (all ids prefixed, styles inline, z-index high but sane).
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const organization = await prisma.organization.findUnique({
    where: { slug: params.org },
    select: { slug: true },
  });
  if (!organization) {
    return new NextResponse("/* Unknown organization */", {
      status: 404,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }
  const origin = request.nextUrl.origin;
  const widgetUrl = `${origin}/widget/${organization.slug}`;

  const js = `(function () {
  if (document.getElementById("olink-desk-btn")) return;
  var open = false;
  var btn = document.createElement("button");
  btn.id = "olink-desk-btn";
  btn.setAttribute("aria-label", "Chat");
  btn.style.cssText = "position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;z-index:2147483000;background:linear-gradient(135deg,#7c7cf5,#5b5bd6);box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0;";
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var frame = document.createElement("iframe");
  frame.id = "olink-desk-frame";
  frame.title = "Chat";
  frame.src = ${JSON.stringify(widgetUrl)};
  frame.style.cssText = "position:fixed;bottom:88px;right:20px;width:370px;height:560px;max-width:calc(100vw - 24px);max-height:calc(100vh - 110px);max-height:calc(100dvh - 110px);border:1px solid #26262e;border-radius:14px;z-index:2147483000;background:#0a0a0c;box-shadow:0 12px 40px rgba(0,0,0,.5);display:none;";
  btn.onclick = function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
  };
  function mount() {
    document.body.appendChild(btn);
    document.body.appendChild(frame);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
`;
  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
