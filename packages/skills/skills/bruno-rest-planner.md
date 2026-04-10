# bruno-rest-planner

Use this skill to plan a Bruno collection for a generic REST API.

## Objectives

- choose collection/folder structure that fits Bruno UX
- decide what belongs in collection defaults, folder defaults, and request files
- identify setup/auth/environment requirements
- decide which scenario matrices should be data-driven

## Default structure

- `Auth`
- `Resources/<resource>/Happy Path`
- `Resources/<resource>/Templates`
- `Resources/<resource>/Read`
- `Workflows`

Keep scenario JSON/CSV files outside the collection tree when it improves Bruno usability.

## Rules

- prefer folder defaults over repeated request headers/auth/scripts
- prefer data-driven templates for create-heavy matrices
- keep tests truthful to the intended contract
- classify bugs separately from collection defects
