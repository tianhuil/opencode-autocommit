import { test, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";

// Generate unique test directory name
const testDir = `/tmp/opencode-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let cleanup: (() => Promise<void>) | null = null;

beforeAll(async () => {
  // Clean up any existing test directory
  await $`rm -rf ${testDir}`.quiet();

  // Create test directory and initialize git
  await $`mkdir -p ${testDir}`.quiet();
  await $`cd ${testDir} && git init`.quiet();
  await $`cd ${testDir} && git config user.name "Test User"`.quiet();
  await $`cd ${testDir} && git config user.email "test@example.com"`.quiet();

  // Create .opencode directories
  await $`mkdir -p ${testDir}/.opencode/plugins`.quiet();

  // Symlink the autocommit plugin
  await $`ln -sf /Volumes/Workspace/opencode-autocommit/.opencode/plugins/autocommit.ts ${testDir}/.opencode/plugins/`.quiet();

  // Create settings file with immediate mode for testing
  await Bun.write(
    `${testDir}/.opencode/auto-commit.settings.yml`,
    `mode: immediate\nmaxCommitLength: 10000\n`
  );

  // Store cleanup function
  cleanup = async () => {
    await $`rm -rf ${testDir}`.quiet();
  };
});

afterAll(async () => {
  if (cleanup) {
    await cleanup();
  }
});

test("integration test: plugin setup with plugin", async () => {
  // Verify test directory exists
  const dirExists = await $`test -d ${testDir}`.quiet().then(() => true).catch(() => false);
  expect(dirExists).toBe(true);

  // Verify .opencode directory exists
  const opencodeExists = await $`test -d ${testDir}/.opencode`.quiet().then(() => true).catch(() => false);
  expect(opencodeExists).toBe(true);

  // Verify plugin symlink exists
  const pluginExists = await $`test -f ${testDir}/.opencode/plugins/autocommit.ts`.quiet().then(() => true).catch(() => false);
  expect(pluginExists).toBe(true);

  // Verify settings file exists
  const settingsExists = await $`test -f ${testDir}/.opencode/auto-commit.settings.yml`.quiet().then(() => true).catch(() => false);
  expect(settingsExists).toBe(true);

  // Verify settings content
  const settings = await Bun.file(`${testDir}/.opencode/auto-commit.settings.yml`).text();
  expect(settings).toContain("mode: immediate");
});

test("integration test: git repository setup", async () => {
  // Verify git is initialized
  const gitDir = await $`cd ${testDir} && test -d .git`.quiet().then(() => true).catch(() => false);
  expect(gitDir).toBe(true);

  // Verify git config
  const userName = await $`cd ${testDir} && git config user.name`.text();
  expect(userName.trim()).toBe("Test User");

  const userEmail = await $`cd ${testDir} && git config user.email`.text();
  expect(userEmail.trim()).toBe("test@example.com");

  // Verify initial state: no commits
  let commits = "0";
  try {
    commits = await $`cd ${testDir} && git rev-list --count HEAD`.text();
  } catch (e) {
    // Expected error when no commits exist
    commits = "0";
  }
  expect(commits).toBe("0");
});

test("integration test: file creation and modification", async () => {
  // Use opencode to create the text file
  const result = await $`cd ${testDir} &&  opencode run -m zai-coding-plan/glm-4.7-flash "Write 'Hello World!' in file ./hello.txt"`.quiet();

  // Verify file exists
  const fileExists = await $`test -f ${testDir}/hello.txt`.quiet().then(() => true).catch(() => false);
  expect(fileExists).toBe(true);

  // Verify file content
  const fileContent = await Bun.file(`${testDir}/hello.txt`).text();
  expect(fileContent).toContain("Hello World!");

  // Manually commit to verify git is working
  await $`cd ${testDir} && git add hello.txt`.quiet();
  await $`cd ${testDir} && git commit -m "Test commit"`.quiet();

  // Verify commit was created
  const commitCount = await $`cd ${testDir} && git rev-list --count HEAD`.text();
  expect(parseInt(commitCount)).toBeGreaterThanOrEqual(1);

  // Verify commit contains the text file
  const filesChanged = await $`cd ${testDir} && git show --name-only --format="" HEAD`.text();
  expect(filesChanged).toContain("hello.txt");

  // Note: Testing the auto-commit message format is not possible in automated tests
  // because the session.idle event doesn't fire during opencode run commands.
  // The auto-commit functionality should be tested manually in an interactive session.
}, {timeout: 30_000});

