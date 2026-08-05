---
name: test-coverage-rubric
description: List every branch the diff leaves uncovered and every boundary case the tests skip.
---

# Test coverage rubric

For every function or branch touched by the diff, work through this checklist
and report a finding for each item that is NOT covered by a test in the diff or
the existing suite:

1. **Error path** — for every `throw`, rejected promise, or error-response
   branch the diff adds or changes, is there a test that actually triggers it
   and asserts on the resulting error/status?
2. **Empty / zero case** — for every loop, array, or collection the diff
   introduces or touches, is there a test with an empty input (`[]`, `''`,
   `0`, `null`)? Do not assume "empty" behaves like "one item minus one."
3. **Boundary value** — for every comparison, limit, pagination cursor, or
   range check the diff adds, is there a test at the boundary itself (the
   exact limit, one below it, one above it) rather than only a value safely
   inside the range?
4. **Both sides of a conditional** — for every new `if`/`switch`/ternary, is
   there a test that takes each branch, not only the one the happy-path test
   happens to hit?

For each uncovered item, name the exact branch or line, state which of the
four categories it falls into, and describe the input that would exercise it
but currently doesn't. Do not report an item as uncovered if a test — anywhere
in the diff or the pre-existing suite — already exercises it.
