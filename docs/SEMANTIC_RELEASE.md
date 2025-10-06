# Semantic Release Setup

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) to automate versioning and changelog generation based on commit messages.

## How It Works

When you push to `main`, semantic-release:

1. **Analyzes commits** since the last release
2. **Determines version bump** (major/minor/patch) based on commit messages
3. **Generates CHANGELOG.md** with release notes
4. **Creates a GitHub release** with the changelog
5. **Commits version changes** back to the repository

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types and Version Bumps

- **feat**: New feature → **MINOR** version bump (1.0.0 → 1.1.0)
- **fix**: Bug fix → **PATCH** version bump (1.0.0 → 1.0.1)
- **perf**: Performance improvement → **PATCH** version bump
- **BREAKING CHANGE**: Breaking change → **MAJOR** version bump (1.0.0 → 2.0.0)

### Other Types (no version bump)

- **docs**: Documentation changes
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring (neither fixes a bug nor adds a feature)
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, build, etc.)
- **ci**: CI/CD changes

### Examples

```bash
# Patch release (1.0.0 → 1.0.1)
git commit -m "fix: correct MySQL connection timeout"

# Minor release (1.0.0 → 1.1.0)
git commit -m "feat: add support for SQLite databases"

# Major release (1.0.0 → 2.0.0)
git commit -m "feat!: remove support for MySQL 5.x

BREAKING CHANGE: MySQL 5.x is no longer supported. Minimum version is now 8.0."

# No release
git commit -m "docs: update README with new examples"
git commit -m "chore: update dependencies"
```

## Configuration

### `.releaserc.json`

Configuration file for semantic-release:

- **Branches**: Releases only from `main`
- **Plugins**:
  - `commit-analyzer`: Analyzes commits to determine version bump
  - `release-notes-generator`: Generates changelog content
  - `changelog`: Updates `CHANGELOG.md`
  - `git`: Commits `CHANGELOG.md` and `package.json`
  - `github`: Creates GitHub releases

### GitHub Actions Workflow

The `.github/workflows/release.yml` workflow:

- Triggers on push to `main`
- Skips if commit message contains `[skip ci]`
- Runs tests before releasing
- Uses `GITHUB_TOKEN` (automatically provided by GitHub Actions)

## Permissions

The workflow has these permissions:

- `contents: write` - Push commits and create tags
- `issues: write` - Comment on issues
- `pull-requests: write` - Comment on PRs

## First Release

If this is the first release, semantic-release will:

1. Analyze all commits in the repository
2. Determine the initial version (usually 1.0.0)
3. Create the first CHANGELOG.md
4. Create the first GitHub release

## Skipping CI

To prevent infinite loops, release commits include `[skip ci]`:

```
chore(release): 1.2.0 [skip ci]
```

This prevents the release workflow from triggering again.

## Local Testing

You can test semantic-release locally (dry-run mode):

```bash
# Will fail without GITHUB_TOKEN, but shows what would happen
bunx semantic-release --dry-run

# With a GitHub token (for actual testing)
GITHUB_TOKEN=your_token bunx semantic-release --dry-run
```

## Troubleshooting

### No release created

Check that:

- Commits follow conventional format
- Commits include types that trigger releases (`feat`, `fix`, `perf`)
- You're pushing to the `main` branch
- Tests are passing

### Release workflow failed

Check the workflow logs in GitHub Actions. Common issues:

- Test failures
- Permission issues
- Network timeouts

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Release Docs](https://semantic-release.gitbook.io/semantic-release/)
- [Commit Analyzer Rules](https://github.com/semantic-release/commit-analyzer#default-rules-matching)
