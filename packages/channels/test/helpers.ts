import { randomBytes } from "node:crypto";

import { prisma, type Organization } from "@olink-desk/database";

// Every test creates its own uniquely-slugged organization, so suites can run
// in parallel against one database without stepping on each other.
export async function createOrg(
  overrides: Partial<{ name: string; defaultLanguage: string }> = {},
): Promise<Organization> {
  const slug = `test-${randomBytes(6).toString("hex")}`;
  return prisma.organization.create({
    data: {
      name: overrides.name ?? "Test Org",
      slug,
      defaultLanguage: overrides.defaultLanguage ?? "en",
    },
  });
}

export { prisma };
