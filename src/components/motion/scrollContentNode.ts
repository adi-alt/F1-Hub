/** Anything with element children - real DOM nodes in the app, plain objects in the test. */
export type ScrollNode = { readonly children: ArrayLike<ScrollNode> };

/** The node whose height Lenis should treat as a scroll region's content.
 *
 * Kept as its own dependency-free function so it can be tested directly: getting it wrong has no
 * visible symptom at setup time and only shows up later as a region that refuses to scroll to its
 * own end - a hard bug to attribute, and one that has been reintroduced once already.
 *
 * The rule is deliberately narrow. A single child IS the content - that's the conventional
 * wrapper pattern, and measuring it excludes the container's own padding. Anything else measures
 * the container, whose scrollHeight already spans every child; picking the first of several
 * children instead would cap the limit at that one child's height, and a first child that is
 * `hidden` at the current breakpoint would collapse it to zero.
 */
export function resolveScrollContent(container: ScrollNode): ScrollNode {
  return container.children.length === 1 ? container.children[0] : container;
}
