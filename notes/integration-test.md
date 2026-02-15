# OpenCode Auto-Commit Plugin: Integration Test Harness

**Date**: 2026-02-15
**Topic**: Design and implementation of automated integration testing for opencode-autocommit plugin

---

## Executive Summary

- **Integration testing approach**: Create isolated test environments in `/tmp` to validate plugin behavior end-to-end
- **Test harness design**: Programmatic setup of git repos, opencode config, and plugin loading to verify auto-commit functionality
- **Verification strategy**: Check git commit history before/after opencode operations to confirm plugin creates expected commits

---

## Detailed Findings

### Plugin Architecture Overview

Based on analysis of the plugin code and OpenCode documentation, the auto-commit plugin operates as follows:

1. **Event-driven**: Listens for `session.idle` event which fires when AI completes a turn
2. **Session-based**: Uses `client.session.messages()` to retrieve turn history
3. **Git integration**: Uses Bun's shell API (`$`) to execute git commands
4. **Settings management**: Supports three modes (disabled, worktree, enabled) with customizable commit model and max length

### OpenCode CLI Capabilities

Key commands relevant for testing:

- `opencode run <prompt>`: Execute opencode non-interactively with a prompt
- `opencode serve`: Start headless server (useful for avoiding MCP cold boot times)
- `opencode attach <url>`: Connect TUI to running server

### Plugin Loading Mechanisms

For integration testing, we'll use **project-level plugins** (`.opencode/plugins/`) to ensure isolation.

### Bun Test Runner Capabilities

Bun's test runner provides:
- Jest-compatible API
- Shell execution via `Bun.$`
- Process management
- Lifecycle hooks (`beforeEach`, `afterEach`)
- Good for integration testing

---

## Integration Test Harness Design

### Test Environment Isolation Strategy

Create fresh test environment for each test:

```typescript
// Create unique test directory in /tmp
const testDir = `/tmp/opencode-autocommit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Directory structure:
// /tmp/opencode-autocommit-test-xxx/
//   ├── .git/              (git repo)
//   ├── .opencode/
//   │   ├── plugins/
//   │   │   └── autocommit.ts  (symlink to actual plugin)
//   │   └── auto-commit.settings.yml
//   └── test-file.ts        (file to modify)
```

### Plugin Loading Approaches

#### Approach: Symlink to Current Repo (Recommended)

Create symlink in test repo pointing to actual plugin:

```typescript
import { $ } from "bun"

// Create test directory
await $`mkdir -p ${testDir}/.opencode/plugins`

// Symlink to actual plugin
const pluginSource = "/Volumes/Workspace/opencode-autocommit/.opencode/plugins/autocommit.ts"
const pluginDest = `${testDir}/.opencode/plugins/autocommit.ts`
await $`ln -s ${pluginSource} ${pluginDest}`

// This loads the plugin automatically
```

**Advantages**:
- Tests actual code
- No need to reinstall/rebuild
- Immediate feedback on changes

**Disadvantages**:
- Requires absolute path to plugin source
- Symlink dependencies on filesystem

### Configuration Setup

Create settings file to enable plugin:

```yaml
# .opencode/auto-commit.settings.yml
mode: enabled  # Always enable for testing
commitModel:  # Don't set - use default model
maxCommitLength: 10000
```

### Test Scenarios

#### Scenario 1: Basic Auto-Commit (Enabled Mode)

**Objective**: Verify plugin creates commit after opencode makes changes

**Steps**:
1. Initialize git repo in test directory
2. Create a test file with some code
3. Commit initial state
4. Configure plugin with `mode: enabled`
5. Run opencode: `opencode run "Add a python script ./add.py that sums two numbers"`
6. Check git log for new commit
7. Verify commit message contains the user prompt in the message

**Expected Result**: New commit with auto-commit message format

```typescript
test("basic auto-commit enabled mode", async () => {
  const testDir = await setupTestEnvironment()

  // Create initial file
  const testFile = `${testDir}/test.ts`
  await Bun.write(testFile, "console.log('hello')")

  // Initial commit
  await $`cd ${testDir} && git add . && git commit -m "Initial commit"`

  // Setup plugin
  await setupPlugin(testDir, { mode: 'enabled' })

  // Run opencode to modify file
  await $`cd ${testDir} && opencode run "Add a python script ./add.py that sums two numbers"`

  // Check for new commit
  const commits = await getGitCommits(testDir)
  expect(commits.length).toBe(2) // Initial + auto-commit

  const message = await getLastCommitMessage(testDir)
  const lines = message.split('\n')

  // Check for sections
  expect(lines[0].length).toBeLessThanOrEqual(50) // Summary
  expect(message).toContain("## User Prompt")
  expect(message).toContain("## LLM Response")
})
```

#### Scenario 2: Disabled Mode

**Objective**: Verify plugin does not commit when disabled

**Steps**:
1. Setup test environment
2. Configure plugin with `mode: disabled`
3. Run opencode to make changes
4. Verify no commit was created

**Expected Result**: No auto-commit

```typescript
test("disabled mode", async () => {
  const testDir = await setupTestEnvironment()

  await setupPlugin(testDir, { mode: 'disabled' })

  await $`cd ${testDir} && opencode run "Make some changes"`

  const commits = await getGitCommits(testDir)
  expect(commits.length).toBe(0)
})
```

#### Scenario 4: No Changes Case

**Objective**: Verify plugin doesn't create commit when no changes exist

**Steps**:
1. Setup test environment with `mode: enabled`
2. Run opencode with a prompt that doesn't modify files
3. Verify no commit was created

**Expected Result**: No commit (plugin should skip when no changes)

```typescript
test("no changes", async () => {
  const testDir = await setupTestEnvironment()
  await setupPlugin(testDir, { mode: 'enabled' })

  // Run opencode without making changes (e.g., ask a question)
  await $`cd ${testDir} && opencode run "What is 2+2?; do not edit any files."`

  const commits = await getGitCommits(testDir)
  expect(commits.length).toBe(0)
})
```

---

## Implementation Details

### Test Harness Functions

```typescript
// test-harness.ts
import { $ } from "bun"

/**
 * Setup isolated test environment
 */
export async function setupTestEnvironment(): Promise<string> {
  const testDir = `/tmp/opencode-autocommit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Create directory
  await $`mkdir -p ${testDir}`.quiet()

  // Initialize git repo
  await $`cd ${testDir} && git init`.quiet()
  await $`cd ${testDir} && git config user.name "Test User"`.quiet()
  await $`cd ${testDir} && git config user.email "test@example.com"`.quiet()

  return testDir
}

/**
 * Setup plugin in test directory
 */
export async function setupPlugin(
  testDir: string,
  settings: { mode: string }
): Promise<void> {
  // Create plugin directory
  await $`mkdir -p ${testDir}/.opencode/plugins`.quiet()

  // Symlink to actual plugin
  const pluginSource = "/Volumes/Workspace/opencode-autocommit/.opencode/plugins/autocommit.ts"
  const pluginDest = `${testDir}/.opencode/plugins/autocommit.ts`

  // Remove existing symlink if it exists
  await $`rm -f ${pluginDest}`.quiet()
  await $`ln -s ${pluginSource} ${pluginDest}`.quiet()

  // Create settings file
  const settingsYaml = `mode: ${settings.mode}
commitModel:
maxCommitLength: 10000
`
  await Bun.write(`${testDir}/.opencode/auto-commit.settings.yml`, settingsYaml)
}

/**
 * Get git commits from directory
 */
export async function getGitCommits(dir: string): Promise<string[]> {
  const result = await $`cd ${dir} && git log --format="%H"`.quiet()
  return result.stdout.toString().trim().split('\n').filter(Boolean)
}

/**
 * Get last commit message
 */
export async function getLastCommitMessage(dir: string): Promise<string> {
  const result = await $`cd ${dir} && git log -1 --format=%B`.quiet()
  return result.stdout.toString().trim()
}

/**
 * Cleanup test directory
 */
export async function cleanupTestEnvironment(testDir: string): Promise<void> {
  await $`rm -rf ${testDir}`.quiet()
}
```

---

## Challenges and Solutions

### Challenge 1: Async Timing

**Problem**: Opencode `run` command may complete before plugin's async commit operation finishes.

**Solution**: Add delays/polling:

```typescript
async function waitForCommit(dir: string, expectedCommits: number, timeoutMs = 30000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const commits = await getGitCommits(dir)
    if (commits.length >= expectedCommits) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error(`Timeout waiting for commit. Expected ${expectedCommits}, got ${await getGitCommits(dir).length}`)
}
```

### Challenge 2: Opencode Output Capturing

**Problem**: Need to capture opencode output for debugging without it interfering with test output.

**Solution**: Use quiet mode and redirect stderr:

```typescript
const result = await $`cd ${testDir} && opencode run "test" 2>&1`.quiet()
console.log("Opencode output:", result.stdout.toString())
```

### Challenge 3: Test Data Cleanup

**Problem**: Test directories accumulate in `/tmp` if tests fail.

**Solution**: Use `afterAll` cleanup with try-catch:

```typescript
afterAll(async () => {
  for (const dir of testDirs) {
    try {
      await cleanupTestEnvironment(dir)
    } catch (error) {
      console.error(`Failed to cleanup ${dir}:`, error)
    }
  }
})
```

### Challenge 4: Global Opencode State

**Problem**: Opencode may cache state between test runs.

**Solution**: Use unique test directory names and consider clearing opencode cache:

```typescript
// Clear cache before test (experimental)
await $`rm -rf ~/.local/share/opencode/cache/*`.quiet()
```

---

## Alternative Testing Approaches

### Approach A: Unit Tests with Mocked Client

Test plugin logic without running opencode:

```typescript
import { test, expect, mock } from "bun:test"

test("plugin generates correct commit message", async () => {
  // Mock client
  const mockClient = {
    session: {
      messages: mock(() => ({
        data: [
          {
            info: { role: "user", id: "1" },
            parts: [{ type: "text", text: "Add a function" }]
          },
          {
            info: { role: "assistant", parentID: "1" },
            parts: [{ type: "text", text: "I added a function" }]
          }
        ]
      }))
    },
    app: {
      generate: mock(() => ({ text: "Added function" })),
      log: mock()
    }
  }

  // Import and test plugin
  const { AutoCommitPlugin } = await import("../.opencode/plugins/autocommit.ts")
  // Test plugin behavior...
})
```

**Advantages**:
- Fast (no external process)
- Deterministic
- Easy to test edge cases

**Disadvantages**:
- Doesn't test actual git integration
- Doesn't test real opencode interaction

### Approach B: Headless Opencode Server

Use `opencode serve` to run tests faster (avoid MCP cold boot):

```typescript
test("with serve", async () => {
  const testDir = await setupTestEnvironment()

  // Start server
  const serverProcess = Bun.spawn(["opencode", "serve", "--port", "4096"], {
    cwd: testDir,
    stdout: "pipe",
    stderr: "pipe"
  })

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 3000))

  try {
    // Run commands attached to server
    await $`cd ${testDir} && opencode run --attach http://localhost:4096 "test"`.quiet()

    // Verify results
    const commits = await getGitCommits(testDir)
    expect(commits.length).toBeGreaterThan(0)
  } finally {
    // Cleanup
    serverProcess.kill()
  }
})
```

### Approach C: Docker Isolation

Run tests in Docker container for complete isolation:

```dockerfile
# Dockerfile.test
FROM oven/bun:latest

# Install opencode
RUN curl -fsSL https://opencode.ai/install.sh | sh

WORKDIR /app
COPY . .

CMD ["bun", "test"]
```

**Advantages**:
- Complete isolation
- Reproducible
- Good for CI

**Disadvantages**:
- Slower startup
- More complex setup

---

## Recommended Test Strategy

### Phase 1: Unit Tests (Immediate)
- Test individual functions (e.g., `getLastTurn`, `truncateCommitMessage`)
- Mock `client` and `$` objects
- Fast feedback during development

### Phase 2: Integration Tests (Recommended)
- Use `/tmp` isolation approach
- Test with actual opencode CLI
- Symlink to plugin for immediate feedback
- Start with basic scenarios, expand coverage

### Phase 3: CI/CD Integration
- Add integration tests to GitHub Actions
- Run on PRs and main branch
- Use Docker for consistent environment

---

## Code Snippets and Examples

### File: `test/integration.test.ts`

```typescript
import { test, expect, beforeAll, afterAll } from "bun:test"
import { $ } from "bun"
import { setupTestEnvironment, setupPlugin, getGitCommits, getLastCommitMessage, cleanupTestEnvironment } from "../test-harness"

const testDirs: string[] = []

beforeAll(async () => {
  console.log("Starting integration tests...")
})

afterAll(async () => {
  console.log("Cleaning up...")
  for (const dir of testDirs) {
    try {
      await cleanupTestEnvironment(dir)
    } catch (error) {
      console.error(`Failed to cleanup ${dir}:`, error)
    }
  }
})

test("auto-commit creates commit after opencode run", async () => {
  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  // Setup
  await Bun.write(`${testDir}/test.ts`, "console.log('hello')")
  await $`cd ${testDir} && git add . && git commit -m "Initial commit"`.quiet()
  await setupPlugin(testDir, { mode: 'enabled' })

  // Run opencode
  await $`cd ${testDir} && timeout 30 opencode run "Add a function to test.ts"`.quiet()

  // Wait for async commit
  await new Promise(resolve => setTimeout(resolve, 3000))

  // Verify
  const commits = await getGitCommits(testDir)
  expect(commits.length).toBeGreaterThanOrEqual(2)

  const message = await getLastCommitMessage(testDir)
  expect(message).toContain("## User Prompt")
  expect(message).toContain("## LLM Response")
}, { timeout: 60000 })
```

### File: `test/test-harness.ts`

```typescript
import { $ } from "bun"

export async function setupTestEnvironment(): Promise<string> {
  const testDir = `/tmp/opencode-autocommit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  await $`mkdir -p ${testDir}`.quiet()
  await $`cd ${testDir} && git init`.quiet()
  await $`cd ${testDir} && git config user.name "Test User"`.quiet()
  await $`cd ${testDir} && git config user.email "test@example.com"`.quiet()

  return testDir
}

export async function setupPlugin(testDir: string, settings: { mode: string }): Promise<void> {
  await $`mkdir -p ${testDir}/.opencode/plugins`.quiet()

  const pluginSource = "/Volumes/Workspace/opencode-autocommit/.opencode/plugins/autocommit.ts"
  const pluginDest = `${testDir}/.opencode/plugins/autocommit.ts`

  await $`rm -f ${pluginDest}`.quiet()
  await $`ln -s ${pluginSource} ${pluginDest}`.quiet()

  const settingsYaml = `mode: ${settings.mode}
maxCommitLength: 10000
`
  await Bun.write(`${testDir}/.opencode/auto-commit.settings.yml`, settingsYaml)
}

export async function getGitCommits(dir: string): Promise<string[]> {
  const result = await $`cd ${dir} && git log --format="%H"`.quiet()
  return result.stdout.toString().trim().split('\n').filter(Boolean)
}

export async function getLastCommitMessage(dir: string): Promise<string> {
  const result = await $`cd ${dir} && git log -1 --format=%B`.quiet()
  return result.stdout.toString().trim()
}

export async function cleanupTestEnvironment(testDir: string): Promise<void> {
  await $`rm -rf ${testDir}`.quiet()
}
```

---

## References

- OpenCode Plugins Documentation: https://opencode.ai/docs/plugins/
- OpenCode CLI Documentation: https://opencode.ai/docs/cli/
- Bun Test Runner: https://bun.sh/docs/test
- Plugin source: `.opencode/plugins/autocommit.ts`
- Design document: `@notes/initial-design-v1.md`
- Session idle event notes: `@notes/opencode-plugin-session-idle.md`
- Pre-prompt hook notes: `@notes/opencode-pre-prompt-hook.md`

---

## Notes

- Integration tests require opencode to be installed globally (currently at v1.2.4)
- Test execution time is significant due to opencode startup and AI processing
- Consider using `opencode serve` + `--attach` for faster test runs
- Mock-based unit tests should be prioritized for rapid development feedback
- Integration tests can be run manually or in CI with longer timeouts
- Test directory naming uses timestamp + random suffix to avoid conflicts
