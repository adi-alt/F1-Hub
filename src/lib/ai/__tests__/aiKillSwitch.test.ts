// AI_DISABLED (audit R-14): the provider chain refuses before calling any model, so every AI path
// falls back to its deterministic content through the failure handling it already has.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mockModule } from "../../__tests__/support/mockModule";

let providerCalls = 0;
mockModule("@/lib/ai/provider", {
  ProviderHttpError: class extends Error {},
  registerProvider: () => {},
  getDefaultProvider: () => ({ name: "groq", chat: async () => (providerCalls++, { content: "x", toolCalls: [], finishReason: "stop" }) }),
  getFallbackProvider: () => ({ name: "openrouter", chat: async () => (providerCalls++, { content: "x", toolCalls: [], finishReason: "stop" }) }),
});
mockModule("@/lib/ai/telemetry", { logAIError: () => {}, logProviderRequest: () => {} });

let chain: typeof import("../providerFallback");
before(async () => {
  chain = await import("../providerFallback");
});
beforeEach(() => {
  providerCalls = 0;
  delete process.env.AI_DISABLED;
});

const ask = () => chain.chatWithProviderFallback([{ role: "user", content: "hi" }], null, { maxTokens: 10, temperature: 0 }, "req_test");

describe("AI_DISABLED", () => {
  it("throws AiDisabledError without calling any provider", async () => {
    process.env.AI_DISABLED = "true";
    await assert.rejects(ask(), chain.AiDisabledError);
    assert.equal(providerCalls, 0);
  });

  it("is off by default, and for any other value", async () => {
    assert.equal((await ask()).response.content, "x");
    process.env.AI_DISABLED = "0";
    assert.equal((await ask()).response.content, "x");
    assert.equal(providerCalls, 2);
  });
});
