import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { $ } from "bun"
import {
  setupTestEnvironment,
  setupPlugin,
  getGitCommits,
  getLastCommitMessage,
  cleanupTestEnvironment,
  createWorktree,
  removeWorktree,
  waitForCommit,
  hasUncommittedChanges,
} from "./test-harness"

// Track test directories for cleanup
const testDirs: string[] = []
const worktrees: string[] = []

beforeAll(async () => {
  console.log("Starting opencode-autocommit integration tests...")
  console.log("Note: These tests require opencode to be installed globally")
})

afterAll(async () => {
  console.log("Cleaning up test environments...")
  // Remove all worktrees first
  for (const worktree of worktrees) {
    try {
      await removeWorktree(worktree)
    } catch (error) {
      console.error(`Failed to remove worktree ${worktree}:`, error)
    }
  }

  // Then cleanup test directories
  for (const dir of testDirs) {
    try {
      await cleanupTestEnvironment(dir)
    } catch (error) {
      console.error(`Failed to cleanup ${dir}:`, error)
    }
  }
})

beforeEach(async () => {
  // Reset before each test if needed
})

afterEach(async () => {
  // Cleanup after each test if needed
})

test("test harness: setup and cleanup", async () => {
  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  // Verify directory exists using ls
  const existsResult = await $`ls -d ${testDir}`.quiet()
  expect(existsResult.exitCode).toBe(0)

  // Verify git is initialized
  const gitResult = await $`cd ${testDir} && git status`.quiet()
  expect(gitResult.exitCode).toBe(0)

  // Cleanup
  await cleanupTestEnvironment(testDir)

  // Verify directory is removed
  const existsAfterResult = await $`ls -d ${testDir} 2>/dev/null || echo "not found"`.quiet()
  expect(existsAfterResult.stdout.toString().trim()).toBe("not found")

  // Remove from tracking since we manually cleaned up
  const index = testDirs.indexOf(testDir)
  if (index !== -1) {
    testDirs.splice(index, 1)
  }
})

test("plugin setup: symlink and settings file", async () => {
  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  await setupPlugin(testDir, { mode: 'enabled' })

  // Verify plugin symlink exists
  const pluginExists = await Bun.file(`${testDir}/.opencode/plugins/autocommit.ts`).exists()
  expect(pluginExists).toBe(true)

  // Verify settings file exists
  const settingsExists = await Bun.file(`${testDir}/.opencode/auto-commit.settings.yml`).exists()
  expect(settingsExists).toBe(true)

  // Verify settings content
  const settings = await Bun.file(`${testDir}/.opencode/auto-commit.settings.yml`).text()
  expect(settings).toContain("mode: enabled")
})

test("git operations: initial commit", async () => {
  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  // Create a test file
  await Bun.write(`${testDir}/test.ts`, "console.log('hello')")

  // Make initial commit
  await $`cd ${testDir} && git add . && git commit -m "Initial commit"`.quiet()

  // Verify commit exists
  const commits = await getGitCommits(testDir)
  expect(commits.length).toBe(1)

  // Verify commit message
  const message = await getLastCommitMessage(testDir)
  expect(message).toContain("Initial commit")
})

test("git operations: multiple commits", async () => {
  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  // Create initial file
  await Bun.write(`${testDir}/test.ts`, "console.log('hello')")
  await $`cd ${testDir} && git add . && git commit -m "First commit"`.quiet()

  // Modify file
  await Bun.write(`${testDir}/test.ts`, "console.log('hello world')")
  await $`cd ${testDir} && git add . && git commit -m "Second commit"`.quiet()

  // Verify two commits
  const commits = await getGitCommits(testDir)
  expect(commits.length).toBe(2)

  // Verify last commit message
  const message = await getLastCommitMessage(testDir)
  expect(message).toContain("Second commit")
})

test("hasUncommittedChanges: with and without changes", async () => {
  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  // No changes initially
  let hasChanges = await hasUncommittedChanges(testDir)
  expect(hasChanges).toBe(false)

  // Create uncommitted file
  await Bun.write(`${testDir}/test.ts`, "console.log('hello')")

  // Now there should be changes
  hasChanges = await hasUncommittedChanges(testDir)
  expect(hasChanges).toBe(true)

  // Commit the file
  await $`cd ${testDir} && git add . && git commit -m "Commit"`.quiet()

  // No changes again
  hasChanges = await hasUncommittedChanges(testDir)
  expect(hasChanges).toBe(false)
})

test("waitForCommit: waits for commit to appear", async () => {
  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  // Create initial commit
  await Bun.write(`${testDir}/test.ts`, "console.log('hello')")
  await $`cd ${testDir} && git add . && git commit -m "Initial commit"`.quiet()

  // Start a delayed commit in background
  const delayedCommit = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    await Bun.write(`${testDir}/test.ts`, "console.log('hello world')")
    await $`cd ${testDir} && git add . && git commit -m "Delayed commit"`.quiet()
  }

  const commitPromise = delayedCommit()

  // Wait for the commit (should resolve after 2-3 seconds)
  await waitForCommit(testDir, 2)

  await commitPromise

  // Verify we have 2 commits
  const commits = await getGitCommits(testDir)
  expect(commits.length).toBe(2)
}, { timeout: 10000 })

test("worktree: create and use worktree", async () => {
  const mainDir = await setupTestEnvironment()
  testDirs.push(mainDir)

  // Create initial commit in main
  await Bun.write(`${mainDir}/main.txt`, "main content")
  await $`cd ${mainDir} && git add . && git commit -m "Initial commit in main"`.quiet()

  // Create worktree
  const worktreeDir = await createWorktree(mainDir)
  worktrees.push(worktreeDir)

  // Verify worktree exists using ls
  const worktreeExistsResult = await $`ls -d ${worktreeDir}`.quiet()
  expect(worktreeExistsResult.exitCode).toBe(0)

  // Create file in worktree
  await Bun.write(`${worktreeDir}/worktree.txt`, "worktree content")
  await $`cd ${worktreeDir} && git add . && git commit -m "Commit in worktree"`.quiet()

  // Verify commits in worktree
  const worktreeCommits = await getGitCommits(worktreeDir)
  expect(worktreeCommits.length).toBeGreaterThanOrEqual(1)

  // Verify file exists in worktree
  const fileExists = await Bun.file(`${worktreeDir}/worktree.txt`).exists()
  expect(fileExists).toBe(true)
})

test("integration: basic auto-commit enabled mode", async () => {
  // This is a placeholder for the actual integration test
  // The real test would require running opencode which may not be available in all environments

  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  // Create initial file
  await Bun.write(`${testDir}/test.ts`, "console.log('hello')")

  // Initial commit
  await $`cd ${testDir} && git add . && git commit -m "Initial commit"`.quiet()

  // Setup plugin
  await setupPlugin(testDir, { mode: 'enabled' })

  // NOTE: Running opencode here would be:
  // await $`cd ${testDir} && opencode run "Add a function to test.ts"`.quiet()

  // Then we would verify:
  // const commits = await getGitCommits(testDir)
  // expect(commits.length).toBe(2)
  // const message = await getLastCommitMessage(testDir)
  // expect(message).toContain("## User Prompt")

  // For now, just verify the setup
  const pluginExists = await Bun.file(`${testDir}/.opencode/plugins/autocommit.ts`).exists()
  expect(pluginExists).toBe(true)

  console.log("Skipping actual opencode run - add 'skip: false' to run full integration test")
})

test.skip("integration: worktree-only mode", async () => {
  // This is a placeholder for testing worktree-only mode

  const mainDir = await setupTestEnvironment()
  testDirs.push(mainDir)

  const worktreeDir = await createWorktree(mainDir)
  worktrees.push(worktreeDir)

  // Setup plugin in both locations
  await setupPlugin(mainDir, { mode: 'worktree' })
  await setupPlugin(worktreeDir, { mode: 'worktree' })

  // NOTE: Would run opencode in both locations here
  // await $`cd ${mainDir} && opencode run "test"`.quiet()
  // await $`cd ${worktreeDir} && opencode run "test"`.quiet()

  // Verify commit only in worktree
  console.log("Skipping actual opencode run - add 'skip: false' to run full integration test")
})

test.skip("integration: disabled mode", async () => {
  // This is a placeholder for testing disabled mode

  const testDir = await setupTestEnvironment()
  testDirs.push(testDir)

  await setupPlugin(testDir, { mode: 'disabled' })

  // NOTE: Would run opencode here
  // await $`cd ${testDir} && opencode run "test"`.quiet()

  // Verify no commit was created
  console.log("Skipping actual opencode run - add 'skip: false' to run full integration test")
})
