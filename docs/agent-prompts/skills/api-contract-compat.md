---
name: api-contract-compat
description: Check route signature compatibility, newly-required fields, removed or renamed response fields, and changed status codes; call out anything that breaks an existing caller.
---

# API contract compatibility

For every route or exported contract touched by the diff, work through this
checklist. For each hit, cite the exact file and line, name which category it
falls into, and describe the specific caller-visible break.

1. **Route signature compatibility** — has the path, HTTP method, or a path/
   query parameter's name or type changed in a way that a request built
   against the old signature would no longer match?

2. **Newly-required fields** — has a request field moved from optional to
   required, or a new field been added as required, such that a caller
   sending the old request body now fails validation?

3. **Removed or renamed response fields** — has a field a caller could read
   from the old response been removed, renamed, or had its type changed
   (e.g. `string` to `string | null`, an object to an array)? A caller reading
   that field today would now get `undefined` or a shape it doesn't expect.

4. **Changed status codes** — does a request that previously returned a given
   status code (success or error) now return a different one for the same
   condition? A caller branching on that status code would take the wrong
   path.

For each break, state explicitly whether the diff also updates every caller of
that route visible in the diff (`client/src/lib/api.ts`, another service,
tests) — if every visible caller is migrated in the same change, say so; if a
caller is missed, or no caller is visible to check, say that too.
