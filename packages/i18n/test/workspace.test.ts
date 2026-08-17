import { describe, expect, it } from "vitest";

import { cleanWorkspaceProfile, humanMinutes, MAX_ORG_NAME } from "../src/workspace";

const good = {
  name: "Nehm Trucking",
  timezone: "Africa/Addis_Ababa",
  languages: ["am", "en"],
  defaultLanguage: "am",
};

describe("cleanWorkspaceProfile", () => {
  it("accepts a sensible profile", () => {
    const r = cleanWorkspaceProfile(good);
    expect(r.ok).toBe(true);
    expect(r.profile?.name).toBe("Nehm Trucking");
    expect(r.profile?.defaultLanguage).toBe("am");
  });

  it("stores languages in canonical order however they were ticked", () => {
    // So two workspaces serving the same languages compare equal.
    expect(cleanWorkspaceProfile({ ...good, languages: ["sw", "en", "am"] }).profile?.languages)
      .toEqual(["en", "am", "sw"]);
    expect(cleanWorkspaceProfile({ ...good, languages: ["am", "am", "en"] }).profile?.languages)
      .toEqual(["en", "am"]);
  });

  it("REFUSES a default language the desk does not serve", () => {
    // The rule this module exists for. The default is what a reply falls back
    // to when we cannot tell what somebody wrote in — a default outside the
    // served set answers customers in a language nobody on the team staffs,
    // and it fails silently because every individual field looks valid.
    const r = cleanWorkspaceProfile({ ...good, languages: ["en"], defaultLanguage: "so" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("ui_ws_error_default_unserved");
  });

  it("refuses a desk that serves no language at all", () => {
    // An empty set is not "unrestricted", it is a desk that cannot answer.
    for (const languages of [[], ["klingon"], "en", null]) {
      expect(cleanWorkspaceProfile({ ...good, languages }).error).toBe("ui_ws_error_no_languages");
    }
  });

  it("refuses a missing or overlong name", () => {
    expect(cleanWorkspaceProfile({ ...good, name: "  " }).error).toBe("ui_ws_error_name");
    expect(cleanWorkspaceProfile({ ...good, name: undefined }).error).toBe("ui_ws_error_name");
    expect(cleanWorkspaceProfile({ ...good, name: "x".repeat(MAX_ORG_NAME + 1) }).error).toBe(
      "ui_ws_error_name_long",
    );
    expect(cleanWorkspaceProfile({ ...good, name: "x".repeat(MAX_ORG_NAME) }).ok).toBe(true);
  });

  it("refuses a time zone that is not on the offered list", () => {
    // Not the full IANA set: an unrecognised zone would be stored and then
    // silently mis-schedule every business-hours calculation.
    expect(cleanWorkspaceProfile({ ...good, timezone: "Mars/Olympus" }).error).toBe(
      "ui_ws_error_timezone",
    );
    expect(cleanWorkspaceProfile({ ...good, timezone: "" }).error).toBe("ui_ws_error_timezone");
    expect(cleanWorkspaceProfile({ ...good, timezone: "UTC" }).ok).toBe(true);
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, 7, "nonsense", []]) {
      expect(() => cleanWorkspaceProfile(junk)).not.toThrow();
      expect(cleanWorkspaceProfile(junk).ok).toBe(false);
    }
  });
});

describe("humanMinutes", () => {
  it("reads the way a person would say it", () => {
    // 240 on a settings page is arithmetic homework; 4h is an answer.
    expect(humanMinutes(45)).toBe("45m");
    expect(humanMinutes(60)).toBe("1h");
    expect(humanMinutes(90)).toBe("1h 30m");
    expect(humanMinutes(240)).toBe("4h");
    expect(humanMinutes(1620)).toBe("1d 3h");
    expect(humanMinutes(2880)).toBe("2d");
  });

  it("does not produce nonsense from a bad number", () => {
    expect(humanMinutes(0)).toBe("0m");
    expect(humanMinutes(-5)).toBe("0m");
    expect(humanMinutes(59.6)).toBe("1h");
  });
});
