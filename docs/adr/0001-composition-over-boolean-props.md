# Features are turned on by composing parts, not by boolean attributes

`<ascii-tabs>` turns each optional feature on when its part element is present (`<ascii-tabs-copy>`, `<ascii-tabs-hint>`, `<ascii-tabs-spacing>`, …), not with flags like `copyable="false"`. This follows Kent C. Dodds' compound components and inversion of control. The editor this library comes from had already started the "apropcalypse": `readOnly`, `deletable`, `copyable`, `addable`, and each new feature would have added another flag. With parts, the consumer decides what appears, where it goes, and what it looks like (a part's content replaces its default icon or text). The root also exposes imperative methods so a consumer can skip the parts entirely and wire up their own controls.

## Consequences

- A bare `<ascii-tabs>` uses a default composition (hint, copy, delete, add; copy only when `readonly`), so the simplest case is still one tag.
- Removing a single default feature means writing out the whole composition. We accept that verbosity as the price of having no flags.
- `readonly` is the only mode attribute. Parts that only make sense while editing (hint, delete, add) hide themselves in read-only even when they are declared.
- Values that are data rather than features stay as attributes: `spacing`, `labels`, `theme`, `lang`.
