---
name: mock-overuse-gate
description: Flag tests that mock the unit under test, assert on mock call counts instead of behaviour, or stub so much that the test would pass against a broken implementation.
---

# Mock overuse gate

Scan every test the diff adds or modifies for these three patterns. For each
hit, cite the exact test and line, name the category, and explain what real
bug the test would fail to catch.

1. **Mocking the unit under test** — the test mocks, stubs, or spies on the
   very function, class, or module the test claims to verify (directly, or
   through a thin wrapper around it), rather than mocking only its external
   dependencies. If the subject under test is itself replaced by a fake, the
   test proves nothing about its real behaviour.

2. **Asserting on mock mechanics instead of behaviour** — the test's core
   assertion is `toHaveBeenCalled`/`toHaveBeenCalledTimes`/`toHaveBeenCalledWith`
   on a mock, with no assertion on the actual output, return value, state
   change, or response the code under test produces. Call-count checks are
   acceptable as a secondary assertion alongside a behavioural one, never as
   the only assertion.

3. **Over-stubbing** — so many collaborators are mocked, and their mocked
   return values so completely predetermine the result, that the test would
   still pass if the function's real logic were deleted and replaced with
   something wrong. Ask: if the implementation had a bug in the logic this
   test claims to cover, would any of these mocks catch it, or do they hand
   the answer straight through?

Do not flag legitimate mocking of true external boundaries (network, LLM
provider, filesystem, clock, `octokit`, `simple-git`) — the gate is about
mocking away the logic under test, not about isolating it from the outside
world.
