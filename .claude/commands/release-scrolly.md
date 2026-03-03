Take all uncommitted and committed changes on the current branch and drive them through the full release pipeline until a new Docker image is published. Follow every step below in order.

## 1. Commit & Push Changes

- Run `git status` and `git diff` to see what's uncommitted
- Break uncommitted changes into small, focused conventional commits (feat:, fix:, refactor:, chore:, etc.)
- If pre-commit hooks fail, fix the issue and create a NEW commit (never amend)
- If already on main, create a feature branch first (`git checkout -b <descriptive-branch-name>`)
- **Before pushing**, run the full local CI suite to catch issues early:
  - `npm run check` — must show 0 errors (warnings are OK)
  - `npx eslint --max-warnings 65` — must produce no output (matches CI ratchet)
  - `npx prettier --check .` — must show no formatting issues
  - Fix any failures, commit fixes, and re-verify before pushing
- Push the branch to origin

## 2. Create a PR with Auto-Merge

- Use `gh pr create` targeting main
- Title should summarize the changes concisely (under 70 chars)
- Body should have a ## Summary with bullet points and a ## Test plan
- If a PR already exists for this branch, skip creation
- **Enable auto-merge immediately:** `gh pr merge <number> --squash --delete-branch --auto`
- This arms the PR to merge automatically once all required checks pass

## 3. Watch CI and Fix Failures

- Watch PR checks with `gh pr checks <number> --watch`
- If all checks pass, auto-merge will handle the merge — move to step 4
- If any check fails:
  - Read the failure logs with `gh run view <run-id> --log-failed`
  - Fix the issue locally, run the local CI suite again (step 1 checks), commit, and push
  - Auto-merge remains armed — no need to re-enable it
  - Repeat until all checks pass

## 4. Wait for Automated Release Pipeline

After the PR merges to main:

1. **Release workflow** runs → release-please creates/updates a release PR with auto-merge enabled
2. **Release PR checks** run (release-pr-checks.yml) → posts commit statuses to satisfy branch protection
3. **Release PR auto-merges** when checks pass

Monitor up to this point:
- `gh pr list --label "autorelease: pending"` — check for the release PR
- `gh pr checks <release-pr-number> --watch` — watch release PR checks

**Important: GITHUB_TOKEN limitation.** When the release PR auto-merges, the push to main does NOT trigger the Release workflow (GitHub prevents GITHUB_TOKEN pushes from triggering workflows). You must manually dispatch it:
```
gh workflow run Release
```
This triggers release-please to detect the merged release PR and publish the GitHub release + version tag. Then docker-publish.yml fires automatically via workflow_run.

Monitor the rest:
- `gh run list --workflow=release.yml --limit 1` — confirm Release ran
- `gh run list --workflow=docker-publish.yml --limit 1` — check Docker build

If anything stalls for more than 5 minutes, investigate:
- `gh run list` to see workflow status
- `gh run view <id> --log-failed` for errors

## 5. Verify the Release

- Confirm the GitHub release: `gh release list --limit 1`
- Confirm the Docker image: `gh api /orgs/312-dev/packages/container/scrolly/versions --jq '.[0].metadata.container.tags'`
- Both `<version>` and `latest` tags should be present
- Report the full image reference: `ghcr.io/312-dev/scrolly:<version>`

## 6. Update Documentation

- Review the changes that were released and check if any docs in `docs/` are now outdated or would benefit from updates
- Key docs to check: `docs/api.md` (new/changed endpoints), `docs/data-model.md` (schema changes), `docs/architecture.md` (structural changes, directory tree, ASCII diagrams), `docs/design-guidelines.md` (UI/component changes), `docs/notifications.md` (notification changes)
- Check any ASCII diagrams, directory trees, or architecture diagrams in the docs for inaccuracies — if files were added/removed/moved or the architecture changed, update the diagrams to match reality
- Only update docs that are **clearly affected** by the changes — don't touch docs that are still accurate
- If docs were updated, commit them as `docs: update <file> for <change>` and push directly to main
- Skip this step entirely if the changes are purely internal (refactors, dep bumps, CI tweaks) with no user-facing or API impact

## Important Notes

- Never force-push to main
- The full pipeline (CI + release + Docker build) takes ~15-20 minutes total
- After enabling auto-merge on the feature PR, the rest is hands-off unless a check fails
- Keep the user informed of progress at each major step
