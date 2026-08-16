// The tenancy guard.
//
// `docs/architecture.md` has always described this as mandatory — "a guard
// test walks the schema and asserts every tenant model has the column +
// index". It did not exist. Adding a doc line that claims a safety property
// nobody checks is worse than having neither, so the claim is made true here
// rather than softened.
//
// It reads `schema.prisma` as TEXT on purpose. Reading the generated Prisma
// client would only tell us what Prisma parsed; reading the file tells us
// what a reviewer sees, and it catches a model added without an index before
// any migration exists for it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCHEMA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "schema.prisma"),
  "utf8",
);

// Models that legitimately hold no organizationId, each for a stated reason.
// Adding a name here is a deliberate act: it is the one way to opt a model
// out of tenant scoping, so it should be uncomfortable.
const NOT_TENANT_SCOPED: Record<string, string> = {
  Organization: "it IS the tenant",
};

interface Model {
  name: string;
  body: string;
}

function models(): Model[] {
  const out: Model[] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SCHEMA)) !== null) out.push({ name: m[1], body: m[2] });
  return out;
}

describe("multi-tenancy schema guard", () => {
  it("finds the models (the parser itself must not silently match nothing)", () => {
    // Without this, a regex that stops matching turns the whole suite green
    // while checking zero models — the failure mode this file exists to
    // prevent, reproduced inside the file that prevents it.
    const found = models();
    expect(found.length).toBeGreaterThan(10);
    expect(found.map((x) => x.name)).toContain("Ticket");
  });

  it("every tenant model carries organizationId", () => {
    const missing = models()
      .filter((x) => !(x.name in NOT_TENANT_SCOPED))
      .filter((x) => !/^\s*organizationId\s+String/m.test(x.body))
      .map((x) => x.name);
    expect(
      missing,
      `these models have no organizationId; scope them or justify them in NOT_TENANT_SCOPED: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every tenant model is indexed on organizationId FIRST", () => {
    // First column matters: a composite index led by something else does not
    // serve `where: { organizationId }`, which is every query in the product.
    // A unique constraint led by organizationId counts — Postgres backs it
    // with an index that serves the same prefix.
    const unindexed = models()
      .filter((x) => !(x.name in NOT_TENANT_SCOPED))
      .filter((x) => !/@@(index|unique)\(\[organizationId[,\]]/.test(x.body))
      .map((x) => x.name);
    expect(
      unindexed,
      `these models are not indexed on organizationId first: ${unindexed.join(", ")}`,
    ).toEqual([]);
  });

  it("every tenant model relates to Organization", () => {
    // The column alone is a string. The relation is what makes a row with a
    // fabricated organizationId impossible to insert.
    const unrelated = models()
      .filter((x) => !(x.name in NOT_TENANT_SCOPED))
      .filter((x) => !/organization\s+Organization\s+@relation/.test(x.body))
      .map((x) => x.name);
    expect(unrelated, `no Organization relation: ${unrelated.join(", ")}`).toEqual([]);
  });

  it("AuditLog.entityId stays TEXT", () => {
    // Fleet convention, and a real bug pattern: entityId is String so callers
    // must pass String(uuid). Typing it as a native uuid would make the
    // convention silently wrong everywhere it is already followed.
    const audit = models().find((x) => x.name === "AuditLog");
    expect(audit).toBeDefined();
    expect(audit?.body).toMatch(/^\s*entityId\s+String\s*$/m);
  });
});
