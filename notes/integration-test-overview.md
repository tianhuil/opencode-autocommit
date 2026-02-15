# Integration Test Quick Reference

## Core Concept

Test the opencode-autocommit plugin by:
1. Creating isolated git repos in `/tmp`
2. Symlinking the plugin into test environment
3. Running opencode commands
4. Verifying git commit history

## One-Page Summary

```typescript
// Test Environment
const testDir = `/tmp/opencode-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
await $`mkdir -p ${testDir} && cd ${testDir} && git init && git config user.name "Test"`

// Plugin Setup
await $`mkdir -p ${testDir}/.opencode/plugins`
await $`ln -s /Volumes/Workspace/opencode-autocommit/.opencode/plugins/autocommit.ts ${testDir}/.opencode/plugins/`
await Bun.write(`${testDir}/.opencode/auto-commit.settings.yml`, `mode: enabled`)

// Test
await $`cd ${testDir} && opencode run "Add a python function to file ./add.py that adds two numbers."`

// Verify
const commits = await $`cd ${testDir} && git log --format="%H"`.stdout
expect(commits.length).toBeGreaterThan(0)
// do more to verify commit message format ...

// Cleanup
await $`rm -rf ${testDir}`
```


## Commit Message Format

Expected format from plugin:

```
{summary (max 50 chars)}

## User Prompt
{user's prompt}

## LLM Response
{AI's full response}
```

## Running Tests in CI

```yaml
# .github/workflows/test.yml
- uses: actions/checkout@v4
- uses: oven-sh/setup-bun@v2
- run: curl -fsSL https://opencode.ai/install.sh | sh
- run: bun test
```

## References

- [Full Design Doc](../notes/integration-test.md)
- [Test README](./test/README.md)
- [Plugin Design](../notes/initial-design-v1.md)
- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins/)
