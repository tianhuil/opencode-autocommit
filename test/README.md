# Integration Tests for opencode-autocommit

This directory contains integration tests for the opencode-autocommit plugin.

## Prerequisites

- **Bun** (test runner)
- **Opencode** (installed globally, v1.2.4+)
- **Git** (for test environment setup)

Verify installation:
```bash
bun --version
opencode --version
git --version
```

## Test Structure

### `test-harness.ts`

Utility functions for setting up isolated test environments:

- `setupTestEnvironment()` - Creates a new git repository in `/tmp`
- `setupPlugin()` - Symlinks the plugin and creates settings file
- `getGitCommits()` - Returns commit hashes from a directory
- `getLastCommitMessage()` - Gets the most recent commit message
- `waitForCommit()` - Waits for a commit to appear (handles async operations)
- `cleanupTestEnvironment()` - Removes test directory
- `createWorktree()` - Creates a git worktree
- `removeWorktree()` - Removes a git worktree
- `hasUncommittedChanges()` - Checks for uncommitted git changes

### `integration.test.ts`

Test suite that exercises the plugin functionality:

1. **Test Harness Tests** - Verify setup/cleanup utilities work
2. **Plugin Setup Tests** - Verify plugin symlinking and configuration
3. **Git Operations Tests** - Verify git commit tracking
4. **Worktree Tests** - Verify worktree creation and management
5. **Integration Tests** (skipped) - Actual opencode plugin tests

## Running Tests

### Run All Tests

```bash
bun test
```

### Run Specific Test Pattern

```bash
bun test --test-name-pattern "test harness"
```

### Run Specific File

```bash
bun test ./test/integration.test.ts
```

### Run with Verbose Output

```bash
bun test --verbose
```

## Test Categories

### Passing Tests (8)

These tests validate the test harness infrastructure and are currently passing:

- ✅ `test harness: setup and cleanup`
- ✅ `plugin setup: symlink and settings file`
- ✅ `git operations: initial commit`
- ✅ `git operations: multiple commits`
- ✅ `hasUncommittedChanges: with and without changes`
- ✅ `waitForCommit: waits for commit to appear`
- ✅ `worktree: create and use worktree`
- ✅ `integration: basic auto-commit enabled mode` (setup only)

### Skipped Tests (2)

These tests require actually running opencode and are currently skipped:

- ⏭️ `integration: worktree-only mode`
- ⏭️ `integration: disabled mode`

To enable these tests, remove the `.skip` modifier or run with:

```bash
bun test test/integration.test.ts --test-name-pattern "integration" --todo
```

## How Integration Tests Work

### Test Environment Setup

Each test creates an isolated environment:

```typescript
const testDir = await setupTestEnvironment()
// Creates: /tmp/opencode-autocommit-test-<timestamp>-<random>
// With: git init, user config
```

### Plugin Loading

The plugin is symlinked from the actual source:

```typescript
await setupPlugin(testDir, { mode: 'enabled' })
// Creates symlink: testDir/.opencode/plugins/autocommit.ts → actual plugin
// Creates settings: testDir/.opencode/auto-commit.settings.yml
```

### Running Opencode

Tests would run opencode (currently skipped):

```typescript
await $`cd ${testDir} && opencode run "Add a function to test.ts"`.quiet()
```

### Verification

Tests verify results:

```typescript
const commits = await getGitCommits(testDir)
expect(commits.length).toBe(2) // Initial + auto-commit

const message = await getLastCommitMessage(testDir)
expect(message).toContain("## User Prompt")
expect(message).toContain("## LLM Response")
```

## Manual Testing

To manually test the plugin with opencode:

1. Create a test directory:

```bash
cd /tmp
mkdir test-autocommit
cd test-autocommit
git init
echo "console.log('hello')" > test.ts
git add .
git commit -m "Initial commit"
```

2. Setup plugin:

```bash
mkdir -p .opencode/plugins
ln -s /Volumes/Workspace/opencode-autocommit/.opencode/plugins/autocommit.ts .opencode/plugins/
cat > .opencode/auto-commit.settings.yml << EOF
mode: enabled
maxCommitLength: 10000
EOF
```

3. Run opencode:

```bash
opencode run "Add a function that sums two numbers"
```

4. Check git log:

```bash
git log -1 --format=%B
```

You should see a commit with the auto-commit message format.

## Troubleshooting

### Test Cleanup Fails

If tests fail to clean up `/tmp` directories:

```bash
# Manual cleanup
rm -rf /tmp/opencode-autocommit-test-*
rm -rf /tmp/opencode-worktree-*
```

### Opencode Not Found

If opencode is not installed globally:

```bash
# Install opencode
curl -fsSL https://opencode.ai/install.sh | sh
```

### Worktree Removal Errors

If you see "is not a working tree" errors during cleanup:

```bash
# List worktrees
git worktree list

# Prune worktrees
git worktree prune

# Then retry cleanup
rm -rf /tmp/opencode-worktree-*
```

### Timeout Errors

If tests timeout waiting for commits:

1. Increase timeout in test:

```typescript
test("my test", async () => {
  // ...
}, { timeout: 120000 }) // 120 seconds
```

2. Or increase global timeout:

```bash
bun test --timeout 120000
```

## Continuous Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# .github/workflows/integration-test.yml
name: Integration Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Install opencode
        run: curl -fsSL https://opencode.ai/install.sh | sh
      - name: Run tests
        run: bun test
```

## Notes

- Tests create unique directories using timestamp + random suffix to avoid conflicts
- Integration tests with actual opencode runs are currently skipped to avoid API usage
- The test harness uses symlinks to test the actual plugin code without copying
- Test execution time is primarily due to opencode startup (when enabled)
- For faster development feedback, run unit tests (when available) instead of integration tests

## See Also

- [Integration Test Design](../notes/integration-test.md) - Detailed design documentation
- [Initial Design](../notes/initial-design-v1.md) - Plugin design document
- [Plugin Source](../.opencode/plugins/autocommit.ts) - Main plugin code
- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins/) - Plugin development guide
