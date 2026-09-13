/** Query key factory for models' client-side TanStack Query usage. */
export const modelsKeys = {
  all: ["models"] as const,
  runs: () => [...modelsKeys.all, "runs"] as const,
};
