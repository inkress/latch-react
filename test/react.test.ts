import { createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { act, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FetchLike } from "@latch/js";
import { LatchProvider, useFlag, useFlagDetail } from "../src/index.ts";

afterEach(cleanup);

const body = (tier: string): string => JSON.stringify({ flags: [{ key: "checkout", value: true, reason: "STATIC" }, { key: "tier", value: tier, reason: "TARGETING_MATCH", variant: "a" }] });

function Probe(): ReturnType<typeof createElement> {
  const checkout = useFlag("checkout", false);
  const tier = useFlagDetail("tier", "none");
  return createElement("p", { "data-testid": "out" }, `${String(checkout)}|${tier.value}|${tier.errorCode ?? tier.reason}`);
}

function controllable(): { fetch: FetchLike; calls: string[]; answer: (b: string) => void } {
  let next = body("gold");
  const calls: string[] = [];
  return {
    calls,
    answer: (b) => {
      next = b;
    },
    fetch: (url, init) => {
      calls.push(`${url} ${init.headers["x-latch-signed-context"] ?? "-"} ${init.body ?? ""}`);
      return Promise.resolve(new Response(next, { status: 200 }));
    },
  };
}

describe("React bindings", () => {
  it("shows defaults, then the fetched values, passing the user and signed context", async () => {
    const f = controllable();
    render(createElement(LatchProvider, { clientKey: "cli-dev-x", baseUrl: "https://edge.test", fetch: f.fetch, context: { targetingKey: "u1" }, signedContext: "a.b.c", refreshMs: 0 }, createElement(Probe)));
    expect(screen.getByTestId("out").textContent).toBe("false|none|PROVIDER_NOT_READY");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("out").textContent).toBe("true|gold|TARGETING_MATCH");
    expect(f.calls).toEqual(['https://edge.test/ofrep/v1/evaluate/flags a.b.c {"context":{"targetingKey":"u1"}}']);
  });

  it("refetches when the user changes, but not when the same context is passed again", async () => {
    const f = controllable();
    const tree = (ctx: Record<string, unknown>): ReturnType<typeof createElement> =>
      createElement(LatchProvider, { clientKey: "cli-dev-x", baseUrl: "https://edge.test", fetch: f.fetch, context: ctx, refreshMs: 0 }, createElement(Probe));
    const view = render(tree({ targetingKey: "u1" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    view.rerender(tree({ targetingKey: "u1" }));
    expect(f.calls).toHaveLength(1);
    f.answer(body("base"));
    view.rerender(tree({ targetingKey: "u2" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(f.calls).toHaveLength(2);
    expect(screen.getByTestId("out").textContent).toBe("true|base|TARGETING_MATCH");
  });

  it("works under StrictMode: the remounted effect restarts the client and flags load", async () => {
    const f = controllable();
    render(createElement(StrictMode, null, createElement(LatchProvider, { clientKey: "cli-dev-x", baseUrl: "https://edge.test", fetch: f.fetch, context: { targetingKey: "u1" }, refreshMs: 0 }, createElement(Probe))));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("out").textContent).toBe("true|gold|TARGETING_MATCH");
    expect(f.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the bootstrap on the server with no flicker and no request", () => {
    const f = controllable();
    const html = renderToString(createElement(LatchProvider, { clientKey: "cli-dev-x", fetch: f.fetch, bootstrap: JSON.parse(body("gold")) as { flags: unknown[] } }, createElement(Probe)));
    expect(html).toContain("true|gold|TARGETING_MATCH");
    expect(f.calls).toHaveLength(0);
  });

  it("useFlag outside a provider throws a clear error", () => {
    expect(() => renderToString(createElement(Probe))).toThrow(/LatchProvider/);
  });
});
