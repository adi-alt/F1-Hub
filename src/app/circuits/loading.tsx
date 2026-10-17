"use client";

import { useSearchParams } from "next/navigation";
import { CircuitDetailSkeleton, CircuitsHomeSkeleton } from "./components/CircuitsSkeletons";

// The fallback while /circuits loads: one circuit's shape when the URL names one (`?circuit=`), else the circuits
// home's. A client component only so it can read the URL it is loading.
export default function CircuitsLoading() {
  return useSearchParams().get("circuit") ? <CircuitDetailSkeleton /> : <CircuitsHomeSkeleton />;
}
