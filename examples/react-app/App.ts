/**
 * The browser side with @latch/react. The server (see ../node-server) passes `bootstrap` and `signedContext`,
 * so the first render already shows the right values and flags that require a signed context work.
 */
import { createElement } from "react";
import { LatchProvider, useFlag, useFlagDetail } from "@latch/react";
import type { Bootstrap } from "@latch/react";

function Checkout(): ReturnType<typeof createElement> {
  const enabled = useFlag("new-checkout", false);
  const limit = useFlagDetail("order-limit", 10);
  return createElement("main", null, enabled ? "New checkout" : "Classic checkout", ` (limit ${String(limit.value)}, ${limit.reason})`);
}

export function App(props: { bootstrap: Bootstrap; signedContext: string }): ReturnType<typeof createElement> {
  return createElement(
    LatchProvider,
    { clientKey: "cli-dev-…", baseUrl: "https://latch-edge-dev.inkress.com", context: { targetingKey: "user-42", plan: "pro" }, signedContext: props.signedContext, bootstrap: props.bootstrap },
    createElement(Checkout),
  );
}
