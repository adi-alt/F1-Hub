import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, countDescendants, sortComments, type LocalComment } from "./useComments";

function comment(id: string, parentCommentId: string | null, over: Partial<LocalComment> = {}): LocalComment {
  return {
    id,
    postId: "p1",
    userId: "u1",
    authorName: "A",
    content: id,
    parentCommentId,
    createdAt: "2026-01-01T00:00:00Z",
    score: 0,
    myVote: 0,
    ...over,
  };
}

const ids = (list: { id: string }[]) => list.map((c) => c.id);

test("sortComments orders by score for 'top' and by recency for 'newest'", () => {
  const list = [
    comment("a", null, { score: 1, createdAt: "2026-01-03T00:00:00Z" }),
    comment("b", null, { score: 9, createdAt: "2026-01-01T00:00:00Z" }),
    comment("c", null, { score: 5, createdAt: "2026-01-02T00:00:00Z" }),
  ];
  assert.deepEqual(ids(sortComments(list, "top")), ["b", "c", "a"]);
  assert.deepEqual(ids(sortComments(list, "newest")), ["a", "c", "b"]);
});

test("sortComments breaks score ties by age, so an all-zero thread is stable", () => {
  const list = [
    comment("second", null, { createdAt: "2026-01-02T00:00:00Z" }),
    comment("first", null, { createdAt: "2026-01-01T00:00:00Z" }),
    comment("third", null, { createdAt: "2026-01-03T00:00:00Z" }),
  ];
  assert.deepEqual(ids(sortComments(list, "top")), ["first", "second", "third"]);
  // Stable across repeated calls - no shuffling on re-render.
  assert.deepEqual(ids(sortComments(sortComments(list, "top"), "top")), ["first", "second", "third"]);
});

test("buildTree nests children under their parent and sorts every level", () => {
  const list = [
    comment("root", null),
    comment("childLow", "root", { score: 1 }),
    comment("childHigh", "root", { score: 8 }),
    comment("grandchild", "childHigh"),
  ];
  const { roots, childrenOf } = buildTree(list, "top");
  assert.deepEqual(ids(roots), ["root"]);
  // Sorting applies to siblings at every depth, not just the top level.
  assert.deepEqual(ids(childrenOf.get("root") ?? []), ["childHigh", "childLow"]);
  assert.deepEqual(ids(childrenOf.get("childHigh") ?? []), ["grandchild"]);
});

test("buildTree promotes an orphan rather than silently dropping it", () => {
  // Parent deleted while the page was open: the reply still has text someone wrote.
  const list = [comment("root", null), comment("orphan", "deleted-parent")];
  const { roots } = buildTree(list, "newest");
  assert.equal(roots.length, 2);
  assert.ok(ids(roots).includes("orphan"));
});

test("countDescendants counts the whole subtree, not just direct children", () => {
  const list = [
    comment("root", null),
    comment("a", "root"),
    comment("b", "root"),
    comment("a1", "a"),
    comment("a1x", "a1"),
  ];
  const { childrenOf } = buildTree(list, "top");
  assert.equal(countDescendants("root", childrenOf), 4);
  assert.equal(countDescendants("a", childrenOf), 2);
  assert.equal(countDescendants("b", childrenOf), 0);
});

test("buildTree handles an empty list", () => {
  const { roots, childrenOf } = buildTree([], "top");
  assert.deepEqual(roots, []);
  assert.equal(childrenOf.size, 0);
});
