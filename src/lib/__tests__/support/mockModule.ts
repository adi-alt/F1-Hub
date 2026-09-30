import { mock } from "node:test";

// This project's @types/node is v20 (package.json), which predates mock.module()'s `exports` option;
// the runtime (Node 24 locally and in CI, `lts/*`) supports it and deprecates the older
// namedExports/defaultExport. Widening the options type with the one missing property keeps this
// type-checked without a cast. Requires --experimental-test-module-mocks (see the `test` script).
type ModuleMockOptions = NonNullable<Parameters<typeof mock.module>[1]> & { exports?: Record<string, unknown> };

/** Replaces `specifier` with `exports` for every later import in this test file's process. */
export function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const options: ModuleMockOptions = { exports };
  mock.module(specifier, options);
}
