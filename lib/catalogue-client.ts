"use client";

/**
 * The free models, in the browser: fetched once from the server and kept in
 * this browser, so the picker opens at once and says the same thing offline.
 */

import { useEffect, useState } from "react";
import { prettyModel, type ModelInfo } from "./models";

const KEY = "gloss:models";

type Stored = { at: number; models: ModelInfo[] };

/** The models this browser already knows, without waiting for the network. */
export function cachedModels(): ModelInfo[] {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
    return Array.isArray(j?.models) ? j.models : [];
  } catch {
    return [];
  }
}

/** The name of a model, as far as this browser knows it. */
export function modelLabel(id: string): string {
  return cachedModels().find((m) => m.id === id)?.name ?? prettyModel(id);
}

let inflight: Promise<ModelInfo[]> | null = null;

/** The free models, from the server: fetched once, then kept. */
export function loadModels(): Promise<ModelInfo[]> {
  const p = (inflight ??= fetch("/api/models")
    .then((r) => r.json())
    .then((j: { models?: ModelInfo[] }) => {
      const models = Array.isArray(j.models) ? j.models : [];
      if (models.length) {
        try {
          localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), models } satisfies Stored));
        } catch {}
      }
      return models;
    })
    .catch(() => cachedModels())
    .finally(() => {
      if (inflight === p) inflight = null;
    }));
  return p;
}

/** The free models, for the picker: the ones this browser knows, then the fresh ones. */
export function useModels(): { models: ModelInfo[]; loading: boolean; refresh: () => void } {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    const cached = cachedModels();
    if (cached.length) setModels(cached);
    setLoading(true);
    void loadModels().then((m) => {
      if (!live) return;
      setModels(m);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return {
    models,
    loading,
    refresh: () => {
      setLoading(true);
      void loadModels().then((m) => {
        setModels(m);
        setLoading(false);
      });
    },
  };
}
