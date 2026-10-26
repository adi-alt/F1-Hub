import { test } from "node:test";
import assert from "node:assert/strict";
import { commentHref } from "../routes";

test("commentHref preserves the community and post while adding the comment focus", () => {
  assert.equal(commentHref("group 1", "post/2", "comment&3"), "/communities?id=group+1&post=post%2F2&comment=comment%263");
});
