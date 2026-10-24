# Ship style: pull request

Every change reaches the default branch (`main`) through a pull request — never push directly.
Netlify builds a deploy preview for every PR and deploys `main` to production.

## Conventions

- Work on a feature branch. Branch names should reference the issue or feature.
- Open a PR whose body references the `.scratch/` issues it resolves.
- Do not merge. Leave that to the human.

## When a skill says "ship the change"

1. Create a feature branch (if on the default branch).
2. Commit and push.
3. Open a PR referencing the resolved `.scratch/` issues.
4. Stop — do not merge.
