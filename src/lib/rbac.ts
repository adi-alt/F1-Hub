export type Role = "admin" | "moderator" | "user";

export type Permissions = {
  canAccessAdmin: boolean;
  canTriggerPipelineRuns: boolean;
  canManageRoles: boolean;
  canViewUsers: boolean;
  canModeratePicks: boolean;
};

const BASE: Permissions = {
  canAccessAdmin: false,
  canTriggerPipelineRuns: false,
  canManageRoles: false,
  canViewUsers: false,
  canModeratePicks: false,
};

/** Deliberately a plain function, not a store — three tiers with five flags doesn't need state
 * management, just something every server route and client component can call the same way. */
export function permissionsForRole(role: Role): Permissions {
  switch (role) {
    case "admin":
      return {
        canAccessAdmin: true,
        canTriggerPipelineRuns: true,
        canManageRoles: true,
        canViewUsers: true,
        canModeratePicks: true,
      };
    case "moderator":
      return { ...BASE, canAccessAdmin: true, canViewUsers: true, canModeratePicks: true };
    case "user":
      return BASE;
  }
}
