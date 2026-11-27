# Agent Instructions

## Branches, commits and pull requests

- The default branch is `master` (not `main`). Open pull requests against `master`.
- Do all work on a feature branch, never directly on `master`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes in commit messages and PR titles, matching the existing history: `feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `refactor:`, `test:`. Use `chore(deps)` / `chore(deps-dev)` for dependency changes.
- Every PR description includes one line on the threat model: `Threat model: no impact` or `Threat model: updated (IDs)`. See [Security](#security-sensitive-changes).
- Every PR includes the version bump described below, unless it only touches installation scripts or CI pipeline definitions.

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

## Checks before pushing

CI (`.github/workflows/ci.yml`) runs all of the following on every PR, and all must pass. Run them locally first (`npm ci` or `npm install` if `node_modules/` is missing):

```bash
npm run lint
npm run typecheck
npm run typecheck:tests
npm run build
npm run test:coverage
```

Date handling is timezone-sensitive, so CI runs the tests in three timezones: `UTC`, `America/Los_Angeles` and `Pacific/Auckland`. When a change touches dates, times, or anything derived from `new Date()`, run the tests in at least the two non-UTC zones too:

```bash
TZ=America/Los_Angeles npm test
TZ=Pacific/Auckland npm test
```

Lint warnings are tolerated, but lint errors are not. Do not commit build output (`main.js`) or `coverage/`; both are gitignored.

## Documentation to keep in sync

Update the docs in the same PR as the code change:

- `docs/security/threat-model.md`: update it when the change matches the "When you MUST update it" table in section 1.1 (new endpoints or hosts, new OAuth scopes, new persisted data, new rendering of remote content, CI/release/build changes, new bundled dependencies, and so on).
- `docs/README.md`: its code-layout table lists the files under `src/` and what each is for. Update it when you add, remove, rename or repurpose a file or module.
- `README.md`: update the feature list, setup steps and permission lists when user-facing behavior, settings, or required Azure permissions change.
- `docs/architecture/`: update the relevant page when you change a flow it describes (for example, the sign-in flow in `auth-flow.md`).
- `docs/superpowers/specs/` and `docs/superpowers/plans/` are a dated historical record of past designs. Do not edit them to match current code.

## Security-sensitive changes

- Never open a public issue, PR, comment or commit message that describes a suspected vulnerability. Follow `SECURITY.md`: report it privately through GitHub's "Report a vulnerability" form.
- Read `docs/security/threat-model.md` before changing anything that touches credentials, network calls, persisted data, rendering of remote content, or the release pipeline.
- Treat these as needing explicit human review, and call them out in the PR description:
  - authentication and token storage (`AuthService`, the `obsidian://m365-callback` handler);
  - new or changed OAuth scopes or Microsoft Graph permissions;
  - any new outbound network request, host, or URL built from remote data (Graph, OpenStreetMap, weather);
  - new data written to disk or the vault (`saveData`, caches);
  - rendering remote text as markup (`innerHTML`, `dangerouslySetInnerHTML`, `MarkdownRenderer`);
  - opening links or launching external programs (`shell.openExternal`);
  - changes to `.github/workflows/`, `esbuild.config.mjs`, or `scripts/`.
- Never commit secrets, tokens, client IDs tied to a private tenant, or real account data. Tests must use fake values.
- Do not relax a control listed in section 6 of the threat model without recording it in sections 6 and 7 of that document.
