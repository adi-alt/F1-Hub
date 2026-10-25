import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUrlFor, sectionHref } from "../sectionRoutes";
import { archiveDriverHref, profileHref, raceHref } from "../routes";

const redirect = (url: string) => {
  const u = new URL(url, "http://x");
  return cleanUrlFor(u.pathname, u.searchParams);
};

test("old ?section= links redirect to their clean paths", () => {
  const cases: [string, string][] = [
    ["/?section=season", "/season"],
    ["/?section=season&year=2026", "/season/2026"],
    ["/?section=season&year=2026&race=united-states-grand-prix", "/season/2026/united-states-grand-prix"],
    ["/?section=season&year=2026&race=united-states-grand-prix&tab=qualifying", "/season/2026/united-states-grand-prix?tab=qualifying"],
    ["/?section=season&year=2026&race=18", "/season/2026?race=18"],
    ["/?section=season&year=2026&compare=VER-NOR", "/season/2026?compare=VER-NOR"],
    ["/?section=profile", "/profile"],
    ["/?section=profile&tab=profile", "/profile/profile"],
    ["/?section=profile&tab=personalisation&kind=drivers", "/profile/personalisation?kind=drivers"],
    ["/?section=communities", "/communities"],
    ["/?section=communities&id=abc&invite=t", "/communities?id=abc&invite=t"],
    ["/?section=circuits", "/circuits"],
    ["/?section=circuits&circuit=suzuka", "/circuits/suzuka"],
    ["/?section=archive", "/archive"],
    ["/?section=archive&tab=driver", "/archive?tab=driver"],
    ["/?section=archive&driver=hamilton", "/archive/drivers/hamilton"],
    ["/?section=archive&team=ferrari", "/archive/teams/ferrari"],
    ["/?section=archive&circuit=monza", "/archive/circuits/monza"],
    ["/?section=archive&year=1988", "/archive/1988"],
    ["/?section=archive&year=1988&round=3", "/archive/1988?round=3"],
    ["/?section=photos&race=x", "/admin/race-photos?race=x"],
    ["/?section=users", "/users"],
    ["/?section=models", "/models"],
  ];
  for (const [from, to] of cases) assert.equal(redirect(from), to, from);
});

test("the older path-style links redirect too", () => {
  assert.equal(redirect("/race?year=2026&race=bahrain-grand-prix"), "/season/2026/bahrain-grand-prix");
  assert.equal(redirect("/season?year=2026"), "/season/2026");
  assert.equal(redirect("/groups?id=abc"), "/communities?id=abc");
  assert.equal(redirect("/archive?driver=hamilton"), "/archive/drivers/hamilton");
  assert.equal(redirect("/archive?section=team"), "/archive?tab=team");
  assert.equal(redirect("/profile?section=notifications"), "/profile/notifications");
});

test("today's URLs, and pages outside the sections, are left alone", () => {
  for (const url of ["/", "/?ref=x", "/?section=nope", "/season", "/season?race=18", "/archive?tab=track", "/communities?id=abc&tab=predictions", "/profile", "/models"]) {
    assert.equal(redirect(url), null, url);
  }
});

test("the link builders produce clean paths", () => {
  assert.equal(raceHref(2026, 18, "United States Grand Prix"), "/season/2026/united-states-grand-prix");
  assert.equal(archiveDriverHref("hamilton"), "/archive/drivers/hamilton");
  assert.equal(profileHref("notifications"), "/profile/notifications");
  assert.equal(sectionHref("season", { year: 2026, compare: "open" }), "/season/2026?compare=open");
});
