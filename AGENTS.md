# Agent Instructions

## Versioning

This plugin follows [Semantic Versioning](https://semver.org/). Every pull request that changes the plugin must bump the version, with two exceptions:

- Changes that only touch installation scripts (`scripts/install.*`, `scripts/uninstall.*`).
- Changes that only touch CI pipeline definitions (`.github/workflows/`).

Documentation-only changes, source changes, test changes, style changes, and dependency changes all require a bump.

### Choosing the bump level

| Level | When to use | Examples |
| --- | --- | --- |
| **major** | Major releases, especially backwards-incompatible changes. | Removing or renaming a setting without migration, changing stored data formats, raising `minAppVersion` in a way that drops support for older Obsidian versions. |
| **minor** | New features or functionality changes. | A new view, a new setting, a change to how an existing feature behaves (for example, which date a new event defaults to). |
| **patch** | Dependency upgrades, and bug fixes that do not change behavior. | Bumping `react`, fixing a crash or rendering glitch, refactors with no user-visible change. |

If a PR mixes kinds of change, use the highest level that applies. When unsure between two levels, pick the higher one.

### Files that carry the version

The version lives in four files, and they must always agree:

- `package.json`
- `package-lock.json` (both the top-level `version` and `packages[""].version`)
- `manifest.json` (this is what Obsidian reads, and what the release workflow publishes)
- `versions.json` (maps plugin version to minimum Obsidian version; `version-bump.mjs` only adds an entry when `minAppVersion` is not already listed)

Do not edit these by hand. Use the steps below so they stay in sync.

### Procedure

1. Decide the level (`major`, `minor` or `patch`) using the table above.
2. Run the three steps from the repository root:

   ```bash
   npm version <major|minor|patch> --no-git-tag-version
   node version-bump.mjs
   npm install
   ```

   `npm version` updates `package.json`, `version-bump.mjs` copies the new version into `manifest.json` and `versions.json`, and `npm install` syncs `package-lock.json`.

   `npm run release -- <major|minor|patch>` (`scripts/release.sh`) runs the same steps and then creates a commit itself. Prefer the manual steps above when the commit message must follow other conventions (for example, attribution lines), or when the version bump should be part of an existing commit.
3. Check `git diff`: only version lines should change in `package.json`, `package-lock.json` and `manifest.json`, plus at most one new line in `versions.json`. If `npm install` changed dependency versions, revert those changes.
4. Commit the bump on the PR branch, either in the feature commit or as a separate `chore: update version to X.Y.Z` commit.
5. Do not create git tags or GitHub releases by hand.

### Releases

The `Release` workflow (`.github/workflows/release.yml`) runs when `manifest.json` changes on `master`. It builds the plugin and creates a GitHub release named after the `manifest.json` version, skipping the step if that release already exists. Merging a PR with a version bump therefore publishes a release, so make sure the bump is correct before merge, and bump once per PR rather than once per commit.

### Before pushing

Run `npm run typecheck`, `npm run lint` and `npm test` and confirm they pass.
