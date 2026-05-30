# Changelog

## 0.0.1

Initial monorepo release for the Howaboua Pi package collection.

This repository brings the previously separate Pi packages into one Bun workspace while keeping every package separately installable. It also adds aggregate packages for installing everything, extensions only, or skills only:

- `@howaboua/pi-stuff`
- `@howaboua/pi-extensions`
- `@howaboua/pi-skills`

Legacy package history remains in the original package changelogs where available:

- [`@howaboua/pi-auto-reasoning-tool`](./packages/pi-auto-reasoning-tool/CHANGELOG.md)
- [`@howaboua/pi-codex-conversion`](./packages/pi-codex-conversion/CHANGELOG.md)

Going forward, package-level changelogs remain the source of truth for each package, and this top-level changelog summarizes monorepo-wide releases.

<!-- package-changelog-summary -->

## Latest package changelogs

### @howaboua/pi-auto-reasoning-tool — 0.1.6

- Restored reasoning to the session's starting level instead of always resetting to `low`.
- Preserved agent-selected reasoning across retryable provider and transport failures.
- Added GitHub Sponsor button config.

[Full changelog](./packages/pi-auto-reasoning-tool/CHANGELOG.md)

### @howaboua/pi-auto-trees — 0.1.4

### Changes

- [#11](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/11) [`78ac21f`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/78ac21f443f2e14e00e0252b423b09182c31f0be) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Show temporary UI feedback while `/end` summarizes back to the marker.

[Full changelog](./packages/pi-auto-trees/CHANGELOG.md)

### @howaboua/pi-codex-conversion — 1.5.17

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`d57f0cb`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/d57f0cbb5b92ce5cb7cf4736b6012c5ff0bebaae) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Fix TypeScript errors under the shared workspace typecheck settings.

[Full changelog](./packages/pi-codex-conversion/CHANGELOG.md)

### @howaboua/pi-explore-subagents — 0.1.6

### Changes

- [#11](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/11) [`78ac21f`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/78ac21f443f2e14e00e0252b423b09182c31f0be) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Persist explore subagent config under the user agent directory, migrating existing package-local config on first use.

[Full changelog](./packages/pi-explore-subagents/CHANGELOG.md)

### @howaboua/pi-extensions — 0.0.4

### Changes

- Include bundled package updates:

  - @howaboua/pi-subagent-review: Add `/review loop` markers that summarize completed review-fix increments before the next review pass.

- Updated dependencies [[`26d4e8b`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/26d4e8b89fb050463bf5cf3486ba1fa0ba84d8b3)]:
  - @howaboua/pi-subagent-review@0.2.0

[Full changelog](./packages/pi-extensions/CHANGELOG.md)

### @howaboua/pi-markdown-workflows — 0.2.10

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`d57f0cb`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/d57f0cbb5b92ce5cb7cf4736b6012c5ff0bebaae) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Fix TypeScript errors under the shared workspace typecheck settings.

- [`9a7890b`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/9a7890b63c7a9fb5be8ab2bdd16c41e78017a5b9) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Make the bundled skill-creator skill less tied to local personal workflow language.

[Full changelog](./packages/pi-markdown-workflows/CHANGELOG.md)

### @howaboua/pi-memories — 0.1.0

### Changes

- [`3c8c222`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/3c8c2222bb8d907a85517dd2155f8ea77d2441fb) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Initial public release from the Howaboua Pi Stuff monorepo.

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`d57f0cb`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/d57f0cbb5b92ce5cb7cf4736b6012c5ff0bebaae) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Fix TypeScript errors under the shared workspace typecheck settings.

[Full changelog](./packages/pi-memories/CHANGELOG.md)

### @howaboua/pi-semantic-grep — 0.1.11

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`d57f0cb`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/d57f0cbb5b92ce5cb7cf4736b6012c5ff0bebaae) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Fix TypeScript errors under the shared workspace typecheck settings.

[Full changelog](./packages/pi-semantic-grep/CHANGELOG.md)

### @howaboua/pi-skill-agent-native-hardening — 0.0.2

### Changes

- [#15](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/15) [`26d4e8b`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/26d4e8b89fb050463bf5cf3486ba1fa0ba84d8b3) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Makes the agent native hardening skill language-agnostic and adds JavaScript/TypeScript-, Python-, Rust-, and Go-specific reference guidance.

[Full changelog](./packages/pi-skill-agent-native-hardening/CHANGELOG.md)

### @howaboua/pi-skill-anti-ai-copy — 0.0.1

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`f252da3`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/f252da342444236f06c6da3f7d92cbdab420d770) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Initial public skill packages from the Howaboua Pi Stuff monorepo.

[Full changelog](./packages/pi-skill-anti-ai-copy/CHANGELOG.md)

### @howaboua/pi-skill-chrome-cdp — 0.0.1

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`f252da3`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/f252da342444236f06c6da3f7d92cbdab420d770) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Initial public skill packages from the Howaboua Pi Stuff monorepo.

[Full changelog](./packages/pi-skill-chrome-cdp/CHANGELOG.md)

### @howaboua/pi-skill-gh-issue-pr-flow — 0.0.2

### Changes

- [#11](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/11) [`78ac21f`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/78ac21f443f2e14e00e0252b423b09182c31f0be) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Document file-based GitHub comment and PR body posting to avoid escaped newline formatting mistakes.

[Full changelog](./packages/pi-skill-gh-issue-pr-flow/CHANGELOG.md)

### @howaboua/pi-skill-omarchy-help — 0.0.1

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`f252da3`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/f252da342444236f06c6da3f7d92cbdab420d770) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Initial public skill packages from the Howaboua Pi Stuff monorepo.

[Full changelog](./packages/pi-skill-omarchy-help/CHANGELOG.md)

### @howaboua/pi-skill-project-reference-research — 0.0.1

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`f252da3`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/f252da342444236f06c6da3f7d92cbdab420d770) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Initial public skill packages from the Howaboua Pi Stuff monorepo.

[Full changelog](./packages/pi-skill-project-reference-research/CHANGELOG.md)

### @howaboua/pi-skill-skill-creator — 0.0.1

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`f252da3`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/f252da342444236f06c6da3f7d92cbdab420d770) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Initial public skill packages from the Howaboua Pi Stuff monorepo.

[Full changelog](./packages/pi-skill-skill-creator/CHANGELOG.md)

### @howaboua/pi-skills — 0.0.4

### Changes

- Include bundled package updates:

  - @howaboua/pi-skill-agent-native-hardening: Makes the agent native hardening skill language-agnostic and adds JavaScript/TypeScript-, Python-, Rust-, and Go-specific reference guidance.

- Updated dependencies [[`26d4e8b`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/26d4e8b89fb050463bf5cf3486ba1fa0ba84d8b3)]:
  - @howaboua/pi-skill-agent-native-hardening@0.0.2

[Full changelog](./packages/pi-skills/CHANGELOG.md)

### @howaboua/pi-smart-btw — 0.1.2

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`d57f0cb`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/d57f0cbb5b92ce5cb7cf4736b6012c5ff0bebaae) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Fix TypeScript errors under the shared workspace typecheck settings.

[Full changelog](./packages/pi-smart-btw/CHANGELOG.md)

### @howaboua/pi-stuff — 0.0.4

### Changes

- Include bundled package updates:

  - @howaboua/pi-subagent-review: Add `/review loop` markers that summarize completed review-fix increments before the next review pass.
  - @howaboua/pi-skill-agent-native-hardening: Makes the agent native hardening skill language-agnostic and adds JavaScript/TypeScript-, Python-, Rust-, and Go-specific reference guidance.

- Updated dependencies [[`26d4e8b`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/26d4e8b89fb050463bf5cf3486ba1fa0ba84d8b3), [`26d4e8b`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/26d4e8b89fb050463bf5cf3486ba1fa0ba84d8b3)]:
  - @howaboua/pi-skill-agent-native-hardening@0.0.2
  - @howaboua/pi-subagent-review@0.2.0

[Full changelog](./packages/pi-stuff/CHANGELOG.md)

### @howaboua/pi-subagent-review — 0.2.0

### Changes

- [#15](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/15) [`26d4e8b`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/26d4e8b89fb050463bf5cf3486ba1fa0ba84d8b3) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Add `/review loop` markers that summarize completed review-fix increments before the next review pass.

[Full changelog](./packages/pi-subagent-review/CHANGELOG.md)

### @howaboua/pi-vent — 0.2.5

### Changes

- [#1](https://github.com/IgorWarzocha/howaboua-pi-stuff/pull/1) [`d57f0cb`](https://github.com/IgorWarzocha/howaboua-pi-stuff/commit/d57f0cbb5b92ce5cb7cf4736b6012c5ff0bebaae) Thanks [@IgorWarzocha](https://github.com/IgorWarzocha)! - Fix TypeScript errors under the shared workspace typecheck settings.

[Full changelog](./packages/pi-vent/CHANGELOG.md)

