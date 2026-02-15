# Integration Tests

This directory contains integration tests for the opencode-autocommit plugin.

## Overview

The integration tests verify the plugin's functionality by:
1. Creating isolated git repositories in `/tmp`
2. Symlinking the plugin into the test environment
3. Configuring the plugin with settings
4. Running git operations
5. Verifying commit history and message format

## Running Tests

### Run all tests
```bash
bun test
```

### Run specific test file
```bash
bun test test/autocommit-integration.test.ts
```

### Run with verbose output
```bash
bun test --verbose
```

## Test Structure

### `autocommit-integration.test.ts`

Contains the following test suites:

1. **Plugin Setup** - Verifies that the plugin is correctly symlinked and configured
2. **Git Repository Setup** - Ensures the test git repository is properly initialized
3. **Manual Commit Format** - Tests that commit messages follow the expected format
4. **File Creation and Modification** - Simulates creating and committing files
5. **Commit Message Validation** - Tests various commit message formats

## Expected Commit Message Format

```
{summary (max 50 chars)}

## User Prompt
{user's prompt}

## LLM Response
{AI's full response}
```

## Test Environment

- Test directories are created in `/tmp/opencode-test-*`
- Each test gets a unique temporary directory
- Directories are automatically cleaned up after tests complete
- Git repositories are initialized with test user credentials

## CI/CD Integration

For GitHub Actions, use the following workflow:

```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: curl -fsSL https://opencode.ai/install.sh | sh
      - run: bun test
```

## Notes

- Tests use Bun's built-in test framework
- Git operations are performed using Bun's shell API (`$`)
- Temporary test directories are automatically cleaned up in `afterAll` hook
- Tests are designed to be fast and isolated from each other

## References

- [Integration Test Quick Reference](../notes/integration-test-overview.md)
- [Full Design Doc](../notes/integration-test.md)
- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins/)
