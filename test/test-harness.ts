import { $ } from "bun"

/**
 * Setup isolated test environment
 * Creates a new git repository in /tmp with unique naming
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
 * Creates symlink to actual plugin and settings file
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
maxCommitLength: 10000
`
  await Bun.write(`${testDir}/.opencode/auto-commit.settings.yml`, settingsYaml)
}

/**
 * Get git commits from directory
 * Returns array of commit hashes (newest first)
 */
export async function getGitCommits(dir: string): Promise<string[]> {
  const result = await $`cd ${dir} && git log --format="%H"`.quiet()
  return result.stdout.toString().trim().split('\n').filter(Boolean)
}

/**
 * Get last commit message
 * Returns the full commit message of the most recent commit
 */
export async function getLastCommitMessage(dir: string): Promise<string> {
  const result = await $`cd ${dir} && git log -1 --format=%B`.quiet()
  return result.stdout.toString().trim()
}

/**
 * Wait for commit to appear in git log
 * Useful for handling async operations
 */
export async function waitForCommit(
  dir: string,
  expectedCommits: number,
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const commits = await getGitCommits(dir)
    if (commits.length >= expectedCommits) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  const actualCommits = await getGitCommits(dir)
  throw new Error(
    `Timeout waiting for commit. Expected ${expectedCommits}, got ${actualCommits.length}`
  )
}

/**
 * Cleanup test directory
 * Removes the test directory and all its contents
 */
export async function cleanupTestEnvironment(testDir: string): Promise<void> {
  await $`rm -rf ${testDir}`.quiet()
}

/**
 * Create a worktree from a git repository
 * Returns the path to the new worktree
 */
export async function createWorktree(mainDir: string, branchName: string = "test-branch"): Promise<string> {
  const worktreeDir = `/tmp/opencode-worktree-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Create branch and worktree
  await $`cd ${mainDir} && git branch ${branchName}`.quiet()
  await $`cd ${mainDir} && git worktree add ${worktreeDir} ${branchName}`.quiet()

  return worktreeDir
}

/**
 * Remove a worktree
 */
export async function removeWorktree(worktreeDir: string): Promise<void> {
  // Try to remove the worktree using git, but don't fail if it doesn't work
  // The worktree might already be removed or not registered
  await $`git worktree remove ${worktreeDir} 2>/dev/null || true`.quiet()

  // Always cleanup the directory
  await $`rm -rf ${worktreeDir}`.quiet()
}

/**
 * Check if there are uncommitted changes
 * Returns true if there are changes, false otherwise
 */
export async function hasUncommittedChanges(dir: string): Promise<boolean> {
  const result = await $`cd ${dir} && git status --porcelain`.quiet()
  return result.stdout.toString().trim().length > 0
}
