/**
 * React bindings (LAT-31). `LatchProvider` owns one browser client; `useFlag` and `useFlagDetail` read its store with
 * `useSyncExternalStore`, so components re-render when flags change and server rendering with a `bootstrap` shows the
 * real values with no flicker. Written with `createElement`, so the package needs no JSX transform.
 */
import { createContext, createElement, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";
import { createLatchClient } from "@latch/js";
import type { Bootstrap, EvaluationDetail, JsonPlain, LatchContext, LatchJsClient, LatchJsOptions } from "@latch/js";

export type { Bootstrap, EvaluationDetail, JsonPlain, LatchContext } from "@latch/js";

/** Props the provider handles itself; the rest are client options. */
const PROVIDER_ONLY: ReadonlySet<string> = new Set(["client", "children", "context", "signedContext", "bootstrap"]);

const ClientContext = createContext<LatchJsClient | null>(null);

export type LatchProviderProps = (
  | (Omit<LatchJsOptions, "context" | "signedContext" | "bootstrap"> & { readonly client?: undefined })
  | { readonly client: LatchJsClient }
) & {
  /** The user. A new value (by content) refetches the flags. */
  readonly context?: LatchContext;
  readonly signedContext?: LatchJsOptions["signedContext"];
  /** Flags rendered on the server: shown on the first render. */
  readonly bootstrap?: Bootstrap;
  readonly children?: ReactNode;
};

/**
 * Provide a Latch client to the tree. Pass `clientKey` (and friends) to let the provider make and own one, or pass your
 * own `client`. The provider starts the client after mount and closes the one it made on unmount.
 */
export function LatchProvider(props: LatchProviderProps): ReactElement {
  const { children, context, signedContext, bootstrap } = props;
  const supplied = props.client;
  const owned = useRef<LatchJsClient | null>(null);
  // Made once, during the first render, so a bootstrap is already in the store when children render.
  if (supplied === undefined && owned.current === null) {
    const rest: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(props)) if (!PROVIDER_ONLY.has(name)) rest[name] = value;
    const options = rest as unknown as LatchJsOptions;
    owned.current = createLatchClient({ ...options, ...(context === undefined ? {} : { context }), ...(signedContext === undefined ? {} : { signedContext }), ...(bootstrap === undefined ? {} : { bootstrap }) });
  }
  const client = supplied ?? owned.current;
  if (client === null) throw new Error("LatchProvider could not make a client");

  const contextKey = JSON.stringify(context ?? null);
  const identified = useRef(contextKey);
  useEffect(() => {
    // `start` is restartable, so StrictMode's unmount and remount of this effect leaves a working client.
    if (supplied === undefined) void client.start();
    return () => {
      if (supplied === undefined) client.close();
    };
  }, [client, supplied]);
  useEffect(() => {
    // The client was made with the first context; only a later change identifies the new user.
    if (identified.current === contextKey) return;
    identified.current = contextKey;
    void client.identify(context ?? {}, signedContext);
    // The context is compared by content (contextKey), not identity.
  }, [contextKey]);

  return createElement(ClientContext.Provider, { value: client }, children);
}

/** The client itself, for `identify`, `allFlags` or `subscribe`. */
export function useLatchClient(): LatchJsClient {
  const client = useContext(ClientContext);
  if (client === null) throw new Error("useLatchClient must be used inside <LatchProvider>");
  return client;
}

function useStoreVersion(client: LatchJsClient): number {
  const subscribe = useMemo(() => (onChange: () => void): (() => void) => client.subscribe(onChange), [client]);
  return useSyncExternalStore(subscribe, () => client.version, () => client.version);
}

/** The flag's value, typed by the default you pass (boolean, string, number or JSON). Returns the default until flags load. */
export function useFlag<T extends JsonPlain>(key: string, fallback: T): T {
  return useFlagDetail(key, fallback).value;
}

export function useFlagDetail<T extends JsonPlain>(key: string, fallback: T): EvaluationDetail<T> {
  const client = useLatchClient();
  const version = useStoreVersion(client);
  // `version` is a dependency so the component re-renders with fresh values when the store changes.
  return useMemo(() => {
    if (typeof fallback === "boolean") return client.boolVariationDetail(key, fallback) as EvaluationDetail<T>;
    if (typeof fallback === "string") return client.stringVariationDetail(key, fallback) as EvaluationDetail<T>;
    if (typeof fallback === "number") return client.numberVariationDetail(key, fallback) as EvaluationDetail<T>;
    return client.jsonVariationDetail(key, fallback) as EvaluationDetail<T>;
  }, [client, key, fallback, version]);
}
