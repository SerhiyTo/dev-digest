# The UI layer, styles, a11y and i18n

## Primitives vs feature components

Two different kinds of component, two different homes, and the distinction is
about **knowledge**, not size.

| | UI primitive | Feature component |
|---|---|---|
| Knows about your domain | No | Yes |
| Example | `Button`, `Modal`, `Badge`, `Tabs` | `FindingCard`, `AgentCard`, `SeverityFilterBar` |
| Owns | Roles, focus, keyboard, variants, tokens | Data shape, domain rules, copy |
| Changes when | The design system changes | The product changes |

A primitive that starts taking a `finding` prop has stopped being a primitive.
When that happens, keep the primitive generic and put the domain knowledge in a
feature component that composes it.

The modern default for the primitive layer is **owned code, not a dependency**:
the components live in your repo so you can edit them, rather than fighting a
library's escape hatches. The trade is that you also own upgrades.

## Design tokens

Tokens — colour, spacing, radius, typography — sit **below** components and are
referenced by name, never duplicated.

The property that makes tokens work is that theming changes values, not
components: light and dark differ by overriding the same variables, and no
component's code changes. Pairs are the usual convention (a surface token and
its matching foreground token) so text contrast travels with the background.

**One source per token family.** A hand-rolled second copy of a colour map is not
a shortcut, it is a future inconsistency — and it is usually discovered only
when the two copies have already diverged.

## Where styles live

Styles belong with the component. The component boundary *is* the style
boundary — a parallel stylesheet hierarchy means every change is a two-place
edit and dead styles are impossible to spot.

Whatever the project's mechanism, the placement rule holds:

- Utility classes → in the component's markup.
- CSS Modules → `<Name>.module.css` in the component's folder.
- Style objects → `styles.ts` in the component's folder.

Pick the project's existing mechanism and stay with it. Mixing three approaches
in one codebase costs more than any of them individually saves.

Two mechanism-specific notes worth knowing:

- With utility classes, reach for a component rather than extracting a class
  alias for anything more complex than a single element — the component is the
  reuse unit.
- Runtime CSS-in-JS and React Server Components are in tension: styled
  components must be client components, which drags otherwise-static markup into
  the client bundle and needs a style-registry setup. Zero-runtime approaches and
  CSS Modules avoid the problem because they compile away. (Library support here
  moves; check current docs rather than trusting a blog post.)

## Accessibility is layered

Accessibility splits cleanly, and knowing the seam prevents both duplicated work
and gaps:

- **The primitive layer owns mechanics**: roles, ARIA attributes, focus
  management, keyboard navigation. Written once, correct everywhere. Do not
  reimplement a dropdown's keyboard handling in a feature component.
- **The feature layer owns names and copy**: what the button is called, what the
  error says. A primitive cannot know this, so it must be supplied.

Priority for an accessible name:

1. Visible text — best, and it also means the name is translated automatically
   along with everything else.
2. Native HTML association (`<label>` for inputs, `<caption>` for tables).
3. `aria-labelledby`, which wins over the next option when both exist.
4. `aria-label`, only when there is no visible text to use.

One trap: applying `aria-label` to an element whose role takes its name from
children **hides those children** from assistive technology. Icon-only buttons
need it; a container full of content generally must not have it.

## i18n is a structural boundary

Every user-facing string goes through the messages layer. This is not only about
translation — it is what stops copy from being scattered across 40 components
where nobody can review or change it consistently.

- Namespace by the component or feature that consumes the messages, and give a
  component the lowest common namespace that covers what it needs, rather than
  reaching from the root. That keeps the message tree shaped like the UI tree.
- Anything genuinely cross-cutting (actions like Save/Cancel, common errors)
  goes in a shared namespace.
- Strings that are *not* user-facing — log messages, internal enum values, test
  ids — stay out of the messages layer. Putting them there implies they should
  be translated.
- The accessible names from the section above are user-facing strings too, and
  are the ones most often forgotten.
