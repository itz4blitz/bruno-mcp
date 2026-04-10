# raw-dto-overlay

This is a product-specific preset, not a generic Bruno pattern.

## When to use

Use this preset when the API exposes both:

- raw entity routes
- DTO routes

and both need explicit coverage because the product behaves differently across them.

## Rules

- treat raw and DTO as separate contracts
- do not make `raw + dto` the top-level package default
- keep bug-revealing DTO assertions truthful
- document DTO/raw divergence clearly

## Typical structure

- `Auth`
- `Raw`
- `DTO`

This structure belongs in the Workspace overlay, not in the generic package default.
