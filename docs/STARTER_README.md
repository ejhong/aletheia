# Athanatos Evidence Atlas — Cursor Starter

This package is designed to be dropped into a new, empty repository and opened in Cursor.

## Recommended workflow

1. Create a new empty folder or GitHub repository.
2. Copy the contents of this package into the repository root.
3. Open the repository in Cursor.
4. Start a coding agent and paste the complete contents of `BOOTSTRAP_PROMPT.md`.
5. Let the agent plan briefly and then build **Phase 1: the high-fidelity mockup**.
6. Review the mockup before allowing backend, authentication, research automation, or live AI features.
7. Record design decisions in `docs/MOCKUP_REVIEW_CHECKLIST.md`.
8. After the visual and information architecture are approved, use the Phase 2 prompt at the end of `docs/ROADMAP.md`.

## Why start with the mockup

The central product risk is not whether an agent can build CRUD screens. It is whether the site makes a complex body of claims understandable without collapsing into a wiki, a debate forum, or a false “AI truth score.”

The mockup should settle:

- what a visitor sees first;
- how an overview article connects to atomic claims;
- how supporting and undermining evidence are balanced;
- how uncertainty is represented;
- how a user descends from a broad thesis to fine-grained claims;
- what makes the site feel credible, beautiful, and intellectually serious.

Do not build the production backend until those questions feel resolved.

## Files in this package

- `BOOTSTRAP_PROMPT.md` — the complete first instruction to paste into Cursor.
- `AGENTS.md` — persistent project rules for every coding or research agent.
- `docs/PRODUCT_SPEC.md` — product goals, audiences, and user experience.
- `docs/INFORMATION_ARCHITECTURE.md` — routes, screens, and key components.
- `docs/DATA_MODEL.md` — initial domain objects and relationships.
- `docs/DEMO_CONTENT.md` — safe illustrative content for the mockup.
- `docs/ROADMAP.md` — staged development plan and a Phase 2 prompt.
- `docs/MOCKUP_REVIEW_CHECKLIST.md` — review criteria before engineering the real system.
