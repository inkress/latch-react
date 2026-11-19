# @latch/react

Latch React bindings: a provider and hooks over @latch/js.

[Latch](https://latch.inkress.com) is feature flags you can hand to the whole team.

## Install

The package isn't on npm yet. Install it from GitHub:

```sh
pnpm add github:inkress/latch-react
```

## Use

```tsx
import { LatchProvider, useFlag } from "@latch/react";

<LatchProvider clientKey="cli-…" signedContext={signedContext} bootstrap={bootstrap}>
  <App />
</LatchProvider>;

function Checkout() {
  const newCheckout = useFlag("new-checkout", false);
  // …
}
```

See `examples/react-app`.

## Develop

```sh
pnpm install
pnpm typecheck
pnpm test
```

## License

MIT
