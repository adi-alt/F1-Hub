/** Query key factory for users' client-side TanStack Query usage. Two independent root families
 * (not one nested under a shared "all") because useSetUserRole invalidates them independently —
 * the search key intentionally isn't a child of the list key. */
export const usersKeys = {
  list: () => ["users"] as const,
  search: (email: string) => ["users-search", email] as const,
  searchAll: () => ["users-search"] as const,
};
