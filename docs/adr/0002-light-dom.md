# Render in the light DOM, theme with CSS custom properties

The custom elements render into the light DOM, with prefixed class names (`.ascii-tabs-*`) and one injected stylesheet, instead of a Shadow DOM. Compound parts and consumer-supplied content (custom buttons, icons, hint text) must be styleable with ordinary page CSS, and a shadow root would force everything through `::part` and slots. Theming goes through `--ascii-tabs-*` custom properties, with built-in `light` and `dark` themes and `prefers-color-scheme` as the default.

## Consequences

- Page CSS can leak in, so the injected styles use prefixed classes and avoid styling bare tags.
