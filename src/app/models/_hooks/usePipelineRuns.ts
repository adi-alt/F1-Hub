import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modelsKeys } from "../_queries/modelsKeys";
import { fetchPipelineRuns, triggerPipelineRun } from "../_service/pipelineRuns.client";

export function usePipelineRuns() {
  return useQuery({ queryKey: modelsKeys.runs(), queryFn: fetchPipelineRuns });
}

export function useTriggerPipelineRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerPipelineRun,
    onSuccess: async () => {
      // GitHub takes a moment to register a dispatched run before it shows up in the list.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await queryClient.invalidateQueries({ queryKey: modelsKeys.runs() });
    },
  });
}
