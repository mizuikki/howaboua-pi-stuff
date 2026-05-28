# AGENTS.md

## Overview

Pi extension that provides workflow tooling (`workflows`, `workflows_create`, `/workflow`) and embedded subdirectory `AGENTS.md` autoloading.

## Build & Verification

- Typecheck: `bun run typecheck`
- Check: `bun run check`
- Build: `bun run build`

## Notes

- Workflow storage path: `./.pi/workflows/<slug>/SKILL.md`
- Do not edit `dist/` manually.
