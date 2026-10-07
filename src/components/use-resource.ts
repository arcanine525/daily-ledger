"use client";
import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import { callApi } from "./api-client";
export function useResource<T>(path: string, schema: z.ZodType<T>) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setData(schema.parse(await callApi(path)));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "REQUEST_FAILED");
    }
  }, [path, schema]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload, setError };
}
