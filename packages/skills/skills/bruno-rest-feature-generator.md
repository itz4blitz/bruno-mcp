# bruno-rest-feature-generator

Use this skill when generating a new Bruno feature slice for a REST API.

## Required outputs

- happy-path CRUD or workflow requests
- reusable create/update templates when appropriate
- docs, tags, settings, vars, assertions, and tests where they add real value
- environment assumptions documented explicitly

## Generation rules

- collection/folder defaults should hold shared headers/auth/scripts/tests/docs where possible
- request files should only keep request-specific logic
- assertions tab should contain stable contract checks
- tests tab should contain richer multi-step logic
- tags should classify resource, scenario class, and notable state such as `known-bug`
