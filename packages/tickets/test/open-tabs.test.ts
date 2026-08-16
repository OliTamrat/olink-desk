import { describe, expect, it } from "vitest";

import { closeTab, MAX_OPEN_TABS, nextAfterClose, openTab, type OpenTab } from "../src/open-tabs";

const tab = (id: string, touchedAt: number): OpenTab => ({
  id,
  number: Number(id.replace(/\D/g, "")) || 1,
  subject: `Ticket ${id}`,
  channel: "WEB",
  touchedAt,
});

const noDrafts = () => false;

describe("openTab", () => {
  it("adds a ticket to the desk", () => {
    const list = openTab([], { id: "a", number: 1, subject: "x", channel: "WEB" }, noDrafts, 100);
    expect(list.map((t) => t.id)).toEqual(["a"]);
  });

  it("brings an already-open ticket forward rather than duplicating it", () => {
    let list = openTab([], { id: "a", number: 1, subject: "x", channel: "WEB" }, noDrafts, 100);
    list = openTab(list, { id: "b", number: 2, subject: "y", channel: "WEB" }, noDrafts, 200);
    list = openTab(list, { id: "a", number: 1, subject: "x", channel: "WEB" }, noDrafts, 300);
    expect(list.map((t) => t.id)).toEqual(["b", "a"]);
    expect(list).toHaveLength(2);
  });

  it("evicts the least recently touched when the cap is reached", () => {
    let list: OpenTab[] = Array.from({ length: MAX_OPEN_TABS }, (_, i) => tab(`t${i}`, i));
    list = openTab(list, { id: "new", number: 99, subject: "n", channel: "WEB" }, noDrafts, 9999);
    expect(list).toHaveLength(MAX_OPEN_TABS);
    expect(list.map((t) => t.id)).not.toContain("t0"); // the oldest
    expect(list.map((t) => t.id)).toContain("new");
  });

  it("NEVER evicts a tab holding an unsent reply, however old it is", () => {
    // The rule that stops tabs losing work. t0 is the oldest and would be the
    // natural victim; it is holding a draft, so t1 goes instead.
    let list: OpenTab[] = Array.from({ length: MAX_OPEN_TABS }, (_, i) => tab(`t${i}`, i));
    list = openTab(
      list,
      { id: "new", number: 99, subject: "n", channel: "WEB" },
      (id) => id === "t0",
      9999,
    );
    expect(list.map((t) => t.id)).toContain("t0");
    expect(list.map((t) => t.id)).not.toContain("t1");
  });

  it("goes OVER the cap rather than discard work when every tab has a draft", () => {
    // A crowded strip is a nuisance; a discarded draft is a loss. When the
    // only choices are the two, it takes the nuisance.
    let list: OpenTab[] = Array.from({ length: MAX_OPEN_TABS }, (_, i) => tab(`t${i}`, i));
    list = openTab(list, { id: "new", number: 99, subject: "n", channel: "WEB" }, () => true, 9999);
    expect(list).toHaveLength(MAX_OPEN_TABS + 1);
    expect(list.map((t) => t.id)).toContain("new");
  });

  it("does not evict the tab it was just asked to open", () => {
    let list: OpenTab[] = Array.from({ length: MAX_OPEN_TABS }, (_, i) => tab(`t${i}`, i));
    // Everything holds a draft except the newcomer — it must still survive.
    list = openTab(
      list,
      { id: "new", number: 99, subject: "n", channel: "WEB" },
      (id) => id !== "new",
      9999,
    );
    expect(list.map((t) => t.id)).toContain("new");
  });
});

describe("nextAfterClose", () => {
  const three = [tab("a", 1), tab("b", 2), tab("c", 3)];

  it("moves to the neighbour on the RIGHT, like every browser", () => {
    expect(nextAfterClose(three, "b")).toBe("c");
  });

  it("falls back to the left when closing the last one", () => {
    expect(nextAfterClose(three, "c")).toBe("b");
  });

  it("returns nothing when the last tab closes, so the list is shown", () => {
    expect(nextAfterClose([tab("a", 1)], "a")).toBeNull();
  });

  it("returns nothing for a tab that is not open", () => {
    expect(nextAfterClose(three, "zzz")).toBeNull();
  });
});

describe("closeTab", () => {
  it("removes only the one named", () => {
    expect(closeTab([tab("a", 1), tab("b", 2)], "a").map((t) => t.id)).toEqual(["b"]);
  });
});
