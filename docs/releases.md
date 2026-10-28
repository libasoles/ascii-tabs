# Releases

This repo distributes the component through Git tags, GitHub Releases and the [`ascii-tabs`](https://www.npmjs.com/package/ascii-tabs) npm package. Consumers use `npm install ascii-tabs` or tagged jsDelivr URLs from the README. The npm tarball contains only `ascii-tabs.js`, `README.md`, `LICENSE` and `package.json` (see `files`).

## Prepare

1. Inspect `git status --short`, the current branch, and `git remote -v`. Fetch remote branches and tags with `git fetch origin --tags`, then compare the local branch with `origin/main` before publishing.
2. Check both `git tag --sort=-version:refname` and `gh release list --limit 10`. A Git tag can exist without a GitHub Release; the latest GitHub Release and the package version may lag or lead the latest tag. Choose an unused version based on the changes and any version explicitly requested by the user. New features used a minor bump for v0.4.0.
3. Update the version in `package.json` and both root version fields in `package-lock.json`. Update every tagged jsDelivr URL in `README.md` to the same version.
4. Run the tests and accessibility checks using the scripts in `package.json`, and run `git diff --check`. Continue once required checks pass. Tests run Chromium against a local HTTP server; sandbox errors such as `listen EPERM` require rerunning with the environment's escalation mechanism.

Accessibility checks cover light and dark themes, idle and editing. Read the failures even if unit tests pass. For v0.4.0, the check caught a pre-existing flat Staff with a white background and light text in dark mode; fixing the automatic and forced dark palettes made the check pass. The script intentionally counts incomplete `color-contrast` findings for short labels and frets as failures.

## Publish

Use the chosen version in place of `X.Y.Z` below. Stage the reviewed release files explicitly and commit them with the existing `Release vX.Y.Z` convention.

```sh
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push --atomic origin main vX.Y.Z
gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --notes-file /path/to/release-notes.md --latest
```

The push publishes the commit and annotated tag together; create the GitHub Release only after it succeeds. Write release notes to a file with real newlines and use `--notes-file`: older releases contain literal `\n` from inline notes. Describe the final changes and only claim validation that has completed successfully.

Creating the GitHub Release runs `.github/workflows/publish.yml`, which tests the tagged commit and runs `npm stage publish` through npm trusted publishing (OIDC, no token). The Trusted Publisher on npm only allows staging, so `npm publish` is rejected. The version is not public until a maintainer approves it with 2FA:

```sh
npm stage list
npm stage approve <stage-id>
```

Check the tarball first with `npm pack --dry-run`. npm versions are immutable and a tag whose publish failed cannot be reused: fix forward with a new version.

## Verify

```sh
gh release view vX.Y.Z --json tagName,url,isDraft,isPrerelease
gh run list --workflow publish.yml --limit 1
npm view ascii-tabs version
git status --short
```

Completion means the commit and tag are pushed, the GitHub Release exists with the intended draft/prerelease status, the publish workflow succeeded, the staged version is approved and `npm view ascii-tabs version` returns `X.Y.Z`, and the local working tree is clean. Report the release URL and completed checks. Distinguish local validation from remote CI or Pages deployment; verify those separately before claiming they succeeded.

If publishing is interrupted, inspect the remote tag and GitHub Release first and resume from the missing step, preserving an already published tag.
