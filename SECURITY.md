# Security Policy

## Supported versions

Security fixes are made against the latest release only. Please update to the newest version from the [releases page](https://github.com/mpfilbin/obsidian-m356-calendar-plugin/releases) (or via BRAT) before reporting.

## Reporting a vulnerability

**Please do not open a public issue or pull request for a suspected vulnerability.**

Report it privately through GitHub: [Report a vulnerability](https://github.com/mpfilbin/obsidian-m356-calendar-plugin/security/advisories/new) (Security tab → *Report a vulnerability*). Include:

- the affected version (`manifest.json` / Settings → Community plugins),
- what an attacker needs (access, network position, a crafted invite, a modified vault, …),
- the impact, and steps or a proof of concept to reproduce it.

You can expect an acknowledgement within a few days. This is a volunteer-maintained project, so fix timelines depend on severity and effort; we will keep you informed and credit you in the release notes if you wish.

## Scope

In scope: the plugin source in `src/`, the build, CI and release pipeline (`.github/`, `esbuild.config.mjs`), and the install/uninstall scripts (`scripts/`).

Out of scope: vulnerabilities in Obsidian itself, Microsoft Entra / Microsoft Graph, OpenWeather or OpenStreetMap, and your own Azure app registration — report those to the respective vendor.

## What we already know

The [threat model](docs/security/threat-model.md) lists the known weaknesses, their ratings and the planned mitigations. Details that would help exploit still-unfixed issues (exact payloads, proof-of-concept code) are deliberately withheld from the public edition until fixes ship. If you find something already listed there, you are welcome to report it privately anyway, especially if you can show greater impact.
