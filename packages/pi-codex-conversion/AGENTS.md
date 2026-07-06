# pi-codex-conversion rules

- Goal: make Pi behave as close as practical to Codex's toolkit.
- Reference Codex repo for comparisons: `/home/igorw/Frameworks/codex`.
- When explicitly preparing npm/publish/release/merge, compare `src/providers/openai-codex-custom-provider.ts` against Pi's stock `openai-codex-responses` provider.
- Compatibility pass covers request shape, transport/headers, reasoning/service-tier handling, retry/stream terminal semantics, and touched code.
- Built-in tool surfaces: `pi` keeps Pi's native `read`/`bash`/`edit`/`write`; `codex` swaps to the Codex-shaped toolkit.
- Within the Codex tool surface, PATH mode structured tools are only `exec_command` + `write_stdin`; Codex extras live on PATH.
- PATH tools: `apply_patch`, `view_image`, `web_run`, `imagegen`.
- PATH tool build notes live in `PATH_TOOLS.md`.
- For `GLIBC_* not found`, loader errors, `exec_bridge` startup failures, or bundled binary incompatibility: read `PATH_TOOLS.md`, rebuild the failing local-platform binary, and wire Pi to the checkout instead of patching installed npm files.
- Keep prompt guidance short and argv-shaped. Pi tool surface keeps Pi's native prompt/tool guidance. Codex normal mode uses flat TS tools; Codex PATH mode uses shell commands.
- Call out intentional divergences: PATH web/image tools are local wrappers, not provider-native function tools.
- Do not accept review-bot drift from stock Pi behavior unless backend-verified or intentional.
