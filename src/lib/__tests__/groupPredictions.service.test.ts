// Service-layer tests for the prediction lifecycle (audit SEC-05 / SEC-07 / SEC-08, M0 Batch 2):
// the REAL src/lib/supabase/groupPredictions.ts against an in-memory fake client. They cover what
// lives in TypeScript - who may enter / resolve / create, that nothing reaches the database before
// those gates pass, how the correct answer is worked out from a race's results, the payload sent to
// the atomic database functions, error mapping, idempotent short-circuits, and the deadline shown to
// the UI. What enter_prediction / settle_prediction DECIDE (the deadline comparison, payouts, ledger,
// row locking) is tested against a real schema in src/lib/__tests__/db/predictionLifecycle.test.ts.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, newId, type Row } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";
import { ServiceError } from "../../services/errors";

process.env.SESSION_SECRET = "service-test-secret-0123456789abcdef";
mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

const ADMIN = newId();
const MOD = newId();
const MEMBER = newId();
const OUTSIDER = newId();
const GROUP = newId();
const OTHER_GROUP = newId();
const RACE = "2026_r16_bahrain-grand-prix";
const PREDICTION = newId();

let predictions: typeof import("../supabase/groupPredictions");
let fake: FakeSupabase;

// Lock times the fake database function reports, by race id (null = unknown deadline).
let lockAt: Record<string, string | null>;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  predictions = await import("../supabase/groupPredictions");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t), rpc: (fn: string, a?: Row) => fake.rpc(fn, a) });
});

const raceRow = (over: Row = {}): Row => ({
  id: RACE, year: 2026, round: 16, name: "Bahrain Grand Prix", circuit: "Sakhir", country: "Bahrain", status: "upcoming", race_date: "2026-10-04",
  pole_sitter: null, pole_time_sec: null, weather: null, prediction: null, pole_prediction: null, simulation: null, photo_url: null, photo_urls: null,
  practice: null, updated_at: "2026-10-01T00:00:00Z", tire_compound_pace: null, safety_car_periods: null, traffic_stats: null,
  results_source: "official", data_completeness: null, race_results: [], race_inputs: [], tire_stints: [], ...over,
});
const result = (driver: string, finishPosition: number, over: Row = {}): Row => ({
  driver, driver_name: driver, team: "T", grid: finishPosition, finish_position: finishPosition, finish_gap_sec: null, status: "finished", fastest_lap_sec: null, points: 0, ...over,
});

beforeEach(() => {
  fake = new FakeSupabase();
  lockAt = { [RACE]: "2026-10-03T14:00:00+00:00" };
  fake.unique.group_predictions = ["group_id", "race_id", "type"];
  fake.defaults.group_predictions = () => ({ id: newId(), status: "open", correct_answer: null, created_at: new Date().toISOString(), resolved_at: null });
  fake.defaults.races = () => raceRow();
  fake.seed("group_members", { group_id: GROUP, user_id: ADMIN, role: "admin" }, { group_id: GROUP, user_id: MOD, role: "moderator" }, { group_id: GROUP, user_id: MEMBER, role: "member" }, { group_id: OTHER_GROUP, user_id: OUTSIDER, role: "admin" });
  fake.seed("groups", { id: GROUP, name: "Club", visibility: "private", permissions: null }, { id: OTHER_GROUP, name: "Other", visibility: "private", permissions: null });
  fake.seed("races", raceRow());
  fake.seed("group_predictions", { id: PREDICTION, group_id: GROUP, race_id: RACE, type: "winner", entry_points: 10, created_by: ADMIN });
  fake.rpcs.prediction_lock_times = (args) => ({ data: (args.p_race_ids as string[]).map((id) => ({ race_id: id, lock_at: lockAt[id] ?? null })), error: null });
});

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new assert.AssertionError({ message: "expected the call to be rejected" });
}
const serviceError = async (promise: Promise<unknown>) => {
  const err = await rejection(promise);
  assert.ok(err instanceof ServiceError, `expected a ServiceError, got ${err.constructor.name}: ${err.message}`);
  return err;
};
const rpcsCalled = () => fake.rpcCalls.filter((c) => c.fn !== "prediction_lock_times").map((c) => c.fn);

describe("enterPrediction", () => {
  test("a valid entry is passed to the atomic database function for the SESSION user, with no clock or deadline argument", async () => {
    fake.rpcs.enter_prediction = () => ({ data: { created: true, lockAt: "2026-10-03T14:00:00+00:00" }, error: null });
    const res = await predictions.enterPrediction(GROUP, PREDICTION, MEMBER, "VER");
    assert.deepEqual(res, { created: true, lockAt: "2026-10-03T14:00:00+00:00" });
    const call = fake.rpcCalls.find((c) => c.fn === "enter_prediction")!;
    assert.deepEqual(call.args, { p_prediction_id: PREDICTION, p_group_id: GROUP, p_user_id: MEMBER, p_guess: "VER" });
    assert.ok(!("p_now" in call.args), "the application never supplies the time; the database uses its own clock");
  });

  test("a non-member is refused before anything reaches the database", async () => {
    const err = await serviceError(predictions.enterPrediction(GROUP, PREDICTION, OUTSIDER, "VER"));
    assert.equal(err.httpStatus, 403);
    assert.deepEqual(rpcsCalled(), []);
  });

  test("a prediction from another group is not found (no cross-group entry)", async () => {
    const err = await serviceError(predictions.enterPrediction(OTHER_GROUP, PREDICTION, OUTSIDER, "VER"));
    assert.deepEqual([err.httpStatus, err.code], [404, "prediction_not_found"]);
    assert.deepEqual(rpcsCalled(), []);
  });

  test("malformed guesses are rejected in TypeScript, before the database, for every type", async () => {
    fake.seed("group_predictions", { id: newId(), group_id: GROUP, race_id: RACE, type: "podium", entry_points: 0, created_by: ADMIN });
    fake.seed("group_predictions", { id: newId(), group_id: GROUP, race_id: RACE, type: "dnf_count", entry_points: 0, created_by: ADMIN });
    const idOf = (type: string) => fake.rows("group_predictions").find((p) => p.type === type)!.id as string;
    const cases: [string, unknown][] = [
      ["winner", ""], ["winner", 5], ["winner", null],
      ["podium", ["VER", "VER", "NOR"]], ["podium", ["VER", "NOR"]], ["podium", "VER"], ["podium", ["VER", "NOR", ""]],
      ["dnf_count", -1], ["dnf_count", 1.5], ["dnf_count", "3"],
    ];
    for (const [type, guess] of cases) {
      const err = await serviceError(predictions.enterPrediction(GROUP, idOf(type), MEMBER, guess));
      assert.equal(err.httpStatus, 400, `${type} ${JSON.stringify(guess)}`);
    }
    assert.deepEqual(rpcsCalled(), []);
  });

  test("the database's named failures map to specific statuses and stable codes", async () => {
    const cases: [string, number, string][] = [
      ["prediction_locked", 409, "prediction_locked"],
      ["lock_unknown", 409, "lock_unknown"],
      ["prediction_resolved", 409, "prediction_resolved"],
      ["not_a_member", 403, "not_a_member"],
      ["prediction_not_found", 404, "prediction_not_found"],
      ["invalid_guess", 400, "invalid_guess"],
    ];
    for (const [message, status, code] of cases) {
      fake.rpcs.enter_prediction = () => ({ data: null, error: { message } });
      const err = await serviceError(predictions.enterPrediction(GROUP, PREDICTION, MEMBER, "VER"));
      assert.deepEqual([err.httpStatus, err.code], [status, code], message);
    }
  });

  test("the locked message tells people the actual rule", async () => {
    fake.rpcs.enter_prediction = () => ({ data: null, error: { message: "prediction_locked" } });
    const err = await serviceError(predictions.enterPrediction(GROUP, PREDICTION, MEMBER, "VER"));
    assert.match(err.message, /qualifying/i);
  });

  test("insufficient points explains the shortfall from the database's own numbers", async () => {
    fake.rpcs.enter_prediction = () => ({ data: null, error: { message: "insufficient_points", details: "balance=4 needed=10" } });
    const err = await serviceError(predictions.enterPrediction(GROUP, PREDICTION, MEMBER, "VER"));
    assert.equal(err.httpStatus, 400);
    assert.equal(err.code, "insufficient_points");
    assert.match(err.message, /at least 10 points/);
    assert.match(err.message, /balance: 4/);
  });

  test("an unrecognised database error is a real failure, never a guessed friendly message", async () => {
    fake.rpcs.enter_prediction = () => ({ data: null, error: { message: "connection reset by peer" } });
    assert.ok(!((await rejection(predictions.enterPrediction(GROUP, PREDICTION, MEMBER, "VER"))) instanceof ServiceError));
  });
});

describe("resolvePrediction", () => {
  const setRace = (over: Row) => {
    fake.tables.races = [raceRow(over)];
  };
  const podiumResults = [result("VER", 1), result("NOR", 2), result("LEC", 3), result("HAM", 4)];
  const settle = () => fake.rpcCalls.filter((c) => c.fn === "settle_prediction");
  const ok = (over: Row = {}) => ({ data: { alreadyResolved: false, paidCount: 1, paidTotal: 20, correctAnswer: "VER", ...over }, error: null });

  test("only a community admin can resolve; nothing else runs for anyone else", async () => {
    setRace({ status: "completed", race_results: podiumResults });
    for (const user of [MOD, MEMBER, OUTSIDER]) assert.equal((await serviceError(predictions.resolvePrediction(GROUP, PREDICTION, user))).httpStatus, 403);
    assert.equal(settle().length, 0);
  });

  test("an unknown prediction, or one from another group, is not found", async () => {
    assert.equal((await serviceError(predictions.resolvePrediction(GROUP, newId(), ADMIN))).httpStatus, 404);
    assert.equal((await serviceError(predictions.resolvePrediction(OTHER_GROUP, PREDICTION, OUTSIDER))).httpStatus, 404);
  });

  test("IDEMPOTENT: an already-resolved round reports so without reading the race or calling the database function", async () => {
    fake.rows("group_predictions")[0].status = "resolved";
    const res = await predictions.resolvePrediction(GROUP, PREDICTION, ADMIN);
    assert.deepEqual(res, { alreadyResolved: true, paidCount: 0, paidTotal: 0 });
    assert.equal(settle().length, 0);
  });

  test("a race that has not finished cannot be resolved against", async () => {
    setRace({ status: "upcoming", race_results: [] });
    assert.equal((await serviceError(predictions.resolvePrediction(GROUP, PREDICTION, ADMIN))).httpStatus, 400);
    setRace({ status: "completed", race_results: [] });
    assert.equal((await serviceError(predictions.resolvePrediction(GROUP, PREDICTION, ADMIN))).httpStatus, 400);
    assert.equal(settle().length, 0);
  });

  test("the correct answer is worked out from the results for each round type, and sent with the results source", async () => {
    setRace({
      status: "completed", pole_sitter: "LEC", results_source: "openf1_preliminary",
      race_results: [result("VER", 1, { fastest_lap_sec: 92.5 }), result("NOR", 2, { fastest_lap_sec: 91.9 }), result("LEC", 3, { fastest_lap_sec: 93 }), result("HAM", 4, { status: "dnf" }), result("RUS", 5, { status: "dnf" })],
    });
    const expected: Record<string, unknown> = { winner: "VER", pole: "LEC", fastest_lap: "NOR", dnf_count: 2, podium: ["VER", "NOR", "LEC"] };
    fake.rpcs.settle_prediction = () => ok();
    for (const [type, answer] of Object.entries(expected)) {
      fake.tables.group_predictions = [];
      const id = newId();
      fake.seed("group_predictions", { id, group_id: GROUP, race_id: RACE, type, entry_points: 10, created_by: ADMIN });
      fake.rpcCalls.length = 0;
      await predictions.resolvePrediction(GROUP, id, ADMIN);
      const call = settle()[0];
      assert.deepEqual(call.args, { p_prediction_id: id, p_group_id: GROUP, p_correct_answer: answer, p_results_source: "openf1_preliminary" }, type);
    }
  });

  test("a round type the race data can't answer yet is refused before settlement", async () => {
    setRace({ status: "completed", pole_sitter: null, race_results: podiumResults });
    fake.rows("group_predictions")[0].type = "pole";
    assert.equal((await serviceError(predictions.resolvePrediction(GROUP, PREDICTION, ADMIN))).httpStatus, 400);
    setRace({ status: "completed", race_results: [result("VER", 1), result("NOR", 2)] });
    fake.rows("group_predictions")[0].type = "podium";
    assert.equal((await serviceError(predictions.resolvePrediction(GROUP, PREDICTION, ADMIN))).httpStatus, 400, "fewer than three classified finishers has no podium");
    assert.equal(settle().length, 0);
  });

  test("DUPLICATE RESOLUTION (sequential): the second call short-circuits once the round is resolved", async () => {
    setRace({ status: "completed", race_results: podiumResults });
    fake.rpcs.settle_prediction = () => {
      fake.rows("group_predictions")[0].status = "resolved"; // what the database function does, atomically
      return ok();
    };
    const first = await predictions.resolvePrediction(GROUP, PREDICTION, ADMIN);
    const second = await predictions.resolvePrediction(GROUP, PREDICTION, ADMIN);
    assert.equal(first.alreadyResolved, false);
    assert.equal(second.alreadyResolved, true);
    assert.equal(settle().length, 1, "settlement ran exactly once");
  });

  test("DUPLICATE RESOLUTION (racing): if another request settled it between our read and our call, the database's answer is passed through and nothing is paid twice", async () => {
    setRace({ status: "completed", race_results: podiumResults });
    // Our read saw 'open'; by the time settle_prediction runs, someone else already resolved it.
    fake.rpcs.settle_prediction = () => ({ data: { alreadyResolved: true, paidCount: 0, paidTotal: 0, correctAnswer: "VER" }, error: null });
    const res = await predictions.resolvePrediction(GROUP, PREDICTION, ADMIN);
    assert.deepEqual(res, { alreadyResolved: true, paidCount: 0, paidTotal: 0, correctAnswer: "VER" });
  });

  test("settlement failures map to stable errors; an unknown failure stays a real error", async () => {
    setRace({ status: "completed", race_results: podiumResults });
    fake.rpcs.settle_prediction = () => ({ data: null, error: { message: "prediction_not_found" } });
    assert.equal((await serviceError(predictions.resolvePrediction(GROUP, PREDICTION, ADMIN))).httpStatus, 404);
    fake.rpcs.settle_prediction = () => ({ data: null, error: { message: "invalid_answer" } });
    assert.equal((await serviceError(predictions.resolvePrediction(GROUP, PREDICTION, ADMIN))).httpStatus, 400);
    fake.rpcs.settle_prediction = () => ({ data: null, error: { message: "deadlock detected" } });
    assert.ok(!((await rejection(predictions.resolvePrediction(GROUP, PREDICTION, ADMIN))) instanceof ServiceError));
  });
});

describe("createPrediction", () => {
  const create = (user = ADMIN, over: Partial<{ raceId: string; type: "winner" | "podium" | "fastest_lap" | "pole" | "dnf_count"; entryPoints: number }> = {}) =>
    predictions.createPrediction(GROUP, user, { raceId: RACE, type: "podium", entryPoints: 10, ...over });
  const rounds = () => fake.rows("group_predictions").filter((p) => p.type === "podium");

  test("opens a round while qualifying has not begun", async () => {
    lockAt[RACE] = new Date(Date.now() + 3600_000).toISOString();
    const { id } = await create();
    assert.ok(id);
    assert.deepEqual(rounds().map((p) => [p.group_id, p.race_id, p.entry_points, p.created_by]), [[GROUP, RACE, 10, ADMIN]]);
  });

  test("REFUSED once qualifying has begun: no round is created", async () => {
    lockAt[RACE] = new Date(Date.now() - 1000).toISOString();
    const err = await serviceError(create());
    assert.deepEqual([err.httpStatus, err.code], [409, "prediction_locked"]);
    assert.equal(rounds().length, 0);
  });

  test("the deadline instant itself is closed (boundary: now >= deadline)", async () => {
    const realNow = Date.now;
    const boundary = Date.parse("2026-10-03T14:00:00Z");
    lockAt[RACE] = new Date(boundary).toISOString();
    try {
      Date.now = () => boundary - 1;
      await create();
      assert.equal(rounds().length, 1);
      fake.tables.group_predictions = fake.rows("group_predictions").filter((p) => p.type !== "podium");
      Date.now = () => boundary;
      assert.equal((await serviceError(create())).code, "prediction_locked");
    } finally {
      Date.now = realNow;
    }
  });

  test("REFUSED when the schedule has no known Qualifying session (fail closed)", async () => {
    lockAt[RACE] = null;
    const err = await serviceError(create());
    assert.deepEqual([err.httpStatus, err.code], [409, "lock_unknown"]);
    assert.equal(rounds().length, 0);
  });

  test("permissions and inputs are checked first: a member can't create; bad entry values are refused", async () => {
    lockAt[RACE] = new Date(Date.now() + 3600_000).toISOString();
    assert.equal((await serviceError(create(MEMBER))).httpStatus, 403);
    assert.equal((await serviceError(create(OUTSIDER))).httpStatus, 403);
    for (const entryPoints of [-1, 1.5, Number.NaN]) assert.equal((await serviceError(create(ADMIN, { entryPoints }))).httpStatus, 400);
    assert.equal(rounds().length, 0);
  });

  test("a finished race, an unknown race, and a duplicate round are refused", async () => {
    lockAt[RACE] = new Date(Date.now() + 3600_000).toISOString();
    fake.tables.races = [raceRow({ status: "completed" })];
    assert.equal((await serviceError(create())).httpStatus, 400);
    fake.tables.races = [raceRow()];
    assert.equal((await serviceError(create(ADMIN, { raceId: "2026_r99_nowhere" }))).httpStatus, 404);
    await create();
    assert.equal((await serviceError(create())).httpStatus, 409);
  });

  test("a calendar-only race is promoted to a real race row first, then its deadline is checked", async () => {
    const placeholder = "2026_r17_next-grand-prix";
    fake.seed("calendar", { id: placeholder, year: 2026, round: 17, name: "Next Grand Prix", circuit: "Somewhere", country: "X", race_date: "2026-10-18" });
    lockAt[placeholder] = new Date(Date.now() + 3600_000).toISOString();
    await create(ADMIN, { raceId: placeholder });
    assert.ok(fake.rows("races").some((r) => r.id === placeholder), "the races row now exists for the foreign key");
    assert.ok(fake.rows("group_predictions").some((p) => p.race_id === placeholder));
  });
});

describe("what the UI is told about the deadline", () => {
  const list = () => predictions.listPredictions(GROUP, MEMBER);
  const only = async () => (await list())[0];

  test("an open round with a future deadline is open and carries the server's lockAt", async () => {
    lockAt[RACE] = new Date(Date.now() + 3600_000).toISOString();
    const p = await only();
    assert.equal(p.lockAt, lockAt[RACE]);
    assert.equal(p.state, "open");
    assert.equal(p.status, "open");
  });

  test("a round whose deadline has passed reads as locked even before the scheduled lock has run", async () => {
    lockAt[RACE] = new Date(Date.now() - 60_000).toISOString();
    const p = await only();
    assert.equal(p.status, "open", "the stored status hasn't been flipped yet");
    assert.equal(p.state, "locked");
  });

  test("an unknown deadline is closed, not open-ended", async () => {
    lockAt[RACE] = null;
    const p = await only();
    assert.equal(p.lockAt, null);
    assert.equal(p.state, "locked");
  });

  test("resolved stays resolved regardless of the clock", async () => {
    fake.rows("group_predictions")[0].status = "resolved";
    lockAt[RACE] = new Date(Date.now() + 3600_000).toISOString();
    assert.equal((await only()).state, "resolved");
  });

  test("if the deadline lookup itself fails (e.g. the migration isn't applied yet) pages still render and every round reads closed", async () => {
    fake.rpcs.prediction_lock_times = () => ({ data: null, error: { message: "function public.prediction_lock_times(text[]) does not exist" } });
    const originalError = console.error;
    console.error = () => {};
    try {
      const p = await only();
      assert.equal(p.lockAt, null);
      assert.equal(p.state, "locked");
    } finally {
      console.error = originalError;
    }
  });

  test("the feed query keeps LOCKED rounds (awaiting their result) as well as open and recently resolved ones", async () => {
    await predictions.listMyPredictions(MEMBER);
    const filter = fake.orCalls.find((c) => c.includes("status"));
    assert.ok(filter, "the feed applies a status filter");
    assert.match(filter!, /status\.in\.\(open,locked\)/, "without 'locked' a closed round would vanish from the feed the moment it locks");
    assert.match(filter!, /status\.eq\.resolved/);
  });

  test("getPredictionLockTimes maps every requested race, unknown ones to null, and asks the database once", async () => {
    const times = await predictions.getPredictionLockTimes([RACE, RACE, "no-such-race"]);
    assert.deepEqual([...times.entries()], [[RACE, lockAt[RACE]], ["no-such-race", null]]);
    assert.equal(fake.rpcCalls.filter((c) => c.fn === "prediction_lock_times").length, 1);
  });
});
