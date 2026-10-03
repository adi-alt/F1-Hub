// The provider chain against a deadline (audit AI-07, R-23). Without one, Groq + a retry +
// OpenRouter could run ~36.7s, past the 30s maxDuration of ask-apex and compose-assist, so the
// platform killed the function before its fallback was returned. Providers here are fakes that
// answer after a set time or fail when their timeout passes, as the real ones do; time is faked.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { mockModule } from "../../__tests__/support/mockModule";

class ProviderHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Reply = { content: string; toolCalls: []; finishReason: string };
type Behaviour = (timeoutMs: number) => Promise<Reply>;
const calls: { provider: string; timeoutMs: number; at: number }[] = [];
let primary: Behaviour;
let secondary: Behaviour;

/** Answers after `ms`, or fails like an aborted fetch when its timeout comes first. */
const answersAfter =
  (ms: number, content = "an answer"): Behaviour =>
  (timeoutMs) =>
    new Promise((resolve, reject) => {
      const answer = setTimeout(() => {
        clearTimeout(timeout);
        resolve({ content, toolCalls: [], finishReason: "stop" });
      }, ms);
      const timeout = setTimeout(() => {
        clearTimeout(answer);
        reject(Object.assign(new Error(`timed out after ${timeoutMs}ms`), { name: "AbortError" }));
      }, timeoutMs);
    });
/** Only ever fails, when its timeout passes. (Not answersAfter(huge): setTimeout treats a delay past
 * 2^31-1 ms as 1 ms.) */
const neverAnswers: Behaviour = (timeoutMs) =>
  new Promise((_resolve, reject) => {
    setTimeout(() => reject(Object.assign(new Error(`timed out after ${timeoutMs}ms`), { name: "AbortError" })), timeoutMs);
  });

const fakeProvider = (name: string, behaviour: () => Behaviour) => ({
  name,
  chat: (_messages: unknown, _tools: unknown, config: { timeoutMs: number }) => {
    calls.push({ provider: name, timeoutMs: config.timeoutMs, at: Date.now() });
    return behaviour()(config.timeoutMs);
  },
});

mockModule("@/lib/ai/provider", {
  ProviderHttpError,
  registerProvider: () => {},
  getDefaultProvider: () => fakeProvider("groq", () => primary),
  getFallbackProvider: () => fakeProvider("openrouter", () => secondary),
});
mockModule("@/lib/ai/telemetry", { logAIError: () => {}, logProviderRequest: () => {} });

let chain: typeof import("../providerFallback");
before(async () => {
  chain = await import("../providerFallback");
});

const T0 = 1_000_000;
beforeEach(() => {
  calls.length = 0;
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
});
afterEach(() => mock.timers.reset());

/** Runs fake time forward until the promise settles (or `limitMs` passes). */
async function settle<T>(promise: Promise<T>, limitMs = 60_000): Promise<{ value?: T; error?: unknown; elapsed: number }> {
  let done = false;
  let value: T | undefined;
  let error: unknown;
  promise.then(
    (v) => ((done = true), (value = v)),
    (e) => ((done = true), (error = e)),
  );
  while (!done && Date.now() - T0 < limitMs) {
    mock.timers.tick(50);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { value, error, elapsed: Date.now() - T0 };
}

const ask = (deadlineAt?: number) => chain.chatWithProviderFallback([{ role: "user", content: "Who wins?" }], null, { maxTokens: 100, temperature: 0, deadlineAt }, "req_test");

describe("attemptTimeout", () => {
  it("is the provider's own timeout without a deadline, or with time to spare", () => {
    assert.equal(chain.attemptTimeout(8_000, undefined, 0), 8_000);
    assert.equal(chain.attemptTimeout(8_000, 30_000, 0), 8_000);
  });
  it("is cut to the time left, and refused below the minimum", () => {
    assert.equal(chain.attemptTimeout(8_000, 5_000, 0), 5_000);
    assert.equal(chain.attemptTimeout(8_000, 1_500, 0), null);
  });
});

describe("chatWithProviderFallback with a deadline (AI-07)", () => {
  it("without one, the worst case runs past a 30s maxDuration (the bug)", async () => {
    primary = neverAnswers;
    secondary = neverAnswers;
    const { error, elapsed } = await settle(ask());
    assert.ok(error);
    assert.ok(elapsed > 30_000, `${elapsed}ms`);
  });

  it("providers that never answer still give up by the deadline, so the caller's fallback goes out in time", async () => {
    primary = neverAnswers;
    secondary = neverAnswers;
    const { error, elapsed } = await settle(ask(T0 + 24_000));
    assert.ok(error, "the chain throws; the route catches it and answers with its fallback");
    assert.ok(elapsed <= 24_050, `${elapsed}ms`);
    assert.deepEqual(
      calls.map((c) => c.provider),
      ["groq", "groq", "openrouter"],
    );
    const last = calls.at(-1)!;
    assert.ok(last.at + last.timeoutMs <= T0 + 24_000, "the last attempt ends at the deadline");
  });

  it("a stalled primary still leaves the secondary time to answer", async () => {
    primary = neverAnswers;
    secondary = answersAfter(3_000, "from OpenRouter");
    const { value, elapsed } = await settle(ask(T0 + 24_000));
    assert.equal(value?.response.content, "from OpenRouter");
    assert.equal(value?.fallbackUsed, true);
    assert.ok(elapsed < 24_000, `${elapsed}ms`);
  });

  it("with too little time for Groq, goes straight to OpenRouter with what is left", async () => {
    primary = answersAfter(100);
    secondary = answersAfter(1_000, "quick");
    const { value } = await settle(ask(T0 + 3_000));
    assert.equal(value?.response.content, "quick");
    assert.deepEqual(
      calls.map((c) => c.provider),
      ["openrouter"],
    );
  });

  it("past the deadline, makes no call at all", async () => {
    primary = answersAfter(100);
    secondary = answersAfter(100);
    const { error } = await settle(ask(T0 + 500));
    assert.ok(error instanceof chain.AiDeadlineError);
    assert.equal(calls.length, 0);
  });

  it("an answer in time is unaffected", async () => {
    primary = answersAfter(1_700, "from Groq");
    const { value } = await settle(ask(T0 + 24_000));
    assert.equal(value?.response.content, "from Groq");
    assert.equal(value?.fallbackUsed, false);
  });
});
