---
name: flaky-test-signals
description: Flag timing dependence, shared mutable state, real network or filesystem access, and order dependence in the tests this diff adds or changes.
---

# Flaky test signals

Scan every test the diff adds or modifies for these four sources of flakiness.
For each hit, cite the exact test and line, name which category it falls into,
and state the concrete failure mode (what makes it flaky, not just that it
"could be").

1. **Timing dependence** — a hardcoded `sleep`/`setTimeout`/`wait(ms)` used to
   let async work "settle," an assertion against `Date.now()` or `new Date()`
   without a fake/injected clock, or a race between two async operations with
   no explicit synchronization (`await`, a promise, a deterministic wait
   condition).

2. **Shared mutable state between tests** — a module-level or `describe`-level
   variable, in-memory cache, counter, or singleton mutated by one test and
   read by another, with no reset in `beforeEach`/`afterEach`. Also flag tests
   that depend on a database row, file, or fixture left behind by a previous
   test rather than creating their own.

3. **Real network or filesystem access** — a test that calls a live external
   API, hits a real GitHub/LLM endpoint, or reads/writes to disk instead of
   using a mock, stub, or in-memory fixture. This includes an unmocked
   `fetch`/`octokit`/`simple-git` call left in a unit test.

4. **Order dependence** — a test that only passes when run after another
   specific test (relies on state, a counter, or a side effect established
   earlier in the file), or a test suite that would fail if the runner
   parallelized or reordered test files.

Do not flag e2e tests for using real browser timing or real network calls —
those are expected in `e2e/`. This rubric applies to unit and integration
tests in `server/`, `client/`, and `reviewer-core/`.
