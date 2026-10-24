# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): one file per
user-visible change to a published package, turned into the changelog and the next version
by the "Version Packages" pull request.

## Repo policy

Write the entry for someone scanning a release, not someone reviewing the PR.

- Normally use one direct sentence that states the user-visible outcome.
- Add a second sentence only when an important behaviour needs clarification.
- Add a short migration note or example only for a breaking change.
- Leave implementation details, investigation, tests, rationale, benchmarks,
  alternatives, and review history in the pull request.

If an entry needs headings, bullets, or multiple paragraphs, it is too long.

`privatePackages.version` is `false`, so `examples/*` and `e2e` are never bumped and carry
no changelog.
