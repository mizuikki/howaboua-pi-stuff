# Howaboua Pi Stuff

A small pile of Pi extensions and skills I use every day, kept in one repo but still published as separate npm packages.

Use the bundle if you want the whole setup. Install individual packages if you only want one tool.

## Install

Everything:

```bash
pi install npm:@howaboua/pi-stuff
```

Only extensions:

```bash
pi install npm:@howaboua/pi-extensions
```

Only skills:

```bash
pi install npm:@howaboua/pi-skills
```

Individual packages stay installable too:

```bash
pi install npm:@howaboua/pi-codex-conversion
pi install npm:@howaboua/pi-semantic-grep
pi install npm:@howaboua/pi-vent
```

Pi packages run with your local permissions. Install only what you trust.

## What's inside

| Package | What it adds |
| --- | --- |
| `@howaboua/pi-codex-conversion` | Codex-style tools for Pi: `exec_command`, `write_stdin`, `apply_patch`, image viewing/generation, native Codex web search, and prompt/tool adaptation. |
| `@howaboua/pi-semantic-grep` | `semantic_grep`, a meaning-based code/docs search tool backed by local SQLite indexes and OpenAI-compatible embeddings. |
| `@howaboua/pi-explore-subagents` | `explore_subagent`, isolated discovery-only subagents for reading and summarizing code without touching files. |
| `@howaboua/pi-subagent-review` | A `/review` workflow using an isolated review subagent. |
| `@howaboua/pi-smart-btw` | Side-session questions and explicit injection back into the main chat. |
| `@howaboua/pi-auto-trees` | Session tree helpers for long-running Pi sessions. |
| `@howaboua/pi-auto-reasoning-tool` | `change_reasoning`, a tool for raising/lowering reasoning level when work complexity changes. |
| `@howaboua/pi-vent` | `vent`, a tool for logging repeated workflow friction into `VENT.md`. |
| `@howaboua/pi-markdown-workflows` | Workflow/skill management UI, bundled skill creator, and repo workflow capture. |
| `@howaboua/pi-memories` | Local memory helpers for Pi sessions. |

## Bundles

The three bundle packages do not contain separate source code. They depend on and bundle the individual packages, then point Pi at the resources inside `node_modules`.

- `@howaboua/pi-stuff`: all extensions and skills
- `@howaboua/pi-extensions`: all extension resources
- `@howaboua/pi-skills`: all skill resources

If one individual package changes, the release workflow publishes that package plus the relevant bundle(s), so bundle installs stay current.

## Development

```bash
bun install
bun run check:changed
```

For a package change that should ship:

```bash
bun changeset
```

Pick the directly changed package. Do not manually bump the bundle packages; CI adds those bumps automatically.

Useful scripts:

```bash
bun run check:changed          # validate changed workspace packages
bun run changeset:aggregates   # generate bundle changesets from package changesets
bun run changelog:sync         # refresh the top-level changelog summary
bun run hooks:install          # install local git hooks
```

## Release model

This repo uses Changesets.

1. A package change gets a changeset.
2. CI adds bundle changesets when needed.
3. Changesets opens a version PR.
4. Merging the version PR publishes changed packages to npm.

`pi-codex-conversion` has a special `apply_patch` binary bundle. Normal TypeScript changes reuse existing binaries. The multi-platform binary workflow only runs when apply-patch source or wrapper files change.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). Package-level changelogs remain next to their packages where they exist.

## License

Individual packages keep their own license files. Current packages are MIT-licensed unless noted in the package directory.
