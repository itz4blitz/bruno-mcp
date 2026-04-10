# bruno-coverage-matrix

Use this skill to derive a repeatable scenario matrix for a REST endpoint.

## Default create matrix

- positive
- boundary
- negative
- security

## Positive

- minimum valid payload
- full valid payload

## Boundary

- min/max lengths
- enum edges
- optional/null boundaries
- numeric boundaries

## Negative

- missing required fields
- invalid types
- invalid enums
- invalid combinations

## Security

- XSS payloads
- SQL injection payloads
- CRLF / header injection
- path traversal strings
- template injection

Use one request template with iteration data when possible instead of many near-identical requests.
