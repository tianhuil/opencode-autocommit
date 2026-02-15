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

  // Create settings file with enabled mode
  await Bun.write(
    `${testDir}/.opencode/auto-commit.settings.yml`,
    `mode: enabled\nmaxCommitLength: 10000\n`
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

test("integration test: plugin setup", async () => {
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
  expect(settings).toContain("mode: enabled");
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

test("integration test: manual commit with correct format", async () => {
  // Create a test file
  await Bun.write(`${testDir}/test.txt`, "Test content\n");

  // Stage and commit manually
  const commitMessage = `Add test file

## User Prompt
Create a test file with some content

## LLM Response
I'll create a test file for you.`;

  await $`cd ${testDir} && git add test.txt`.quiet();
  await $`cd ${testDir} && git commit -m ${commitMessage}`.quiet();

  // Verify commit was created
  const commitCount = await $`cd ${testDir} && git rev-list --count HEAD`.text();
  expect(parseInt(commitCount)).toBeGreaterThan(0);

  // Verify commit message format
  const fullCommitMessage = await $`cd ${testDir} && git log -1 --format=%B`.text();
  
  // Check structure
  expect(fullCommitMessage).toContain("## User Prompt");
  expect(fullCommitMessage).toContain("## LLM Response");
  expect(fullCommitMessage).toContain("Create a test file with some content");
  expect(fullCommitMessage).toContain("I'll create a test file for you");

  // Check that summary is on first line
  const lines = fullCommitMessage.split("\n");
  const firstLine = lines[0] || "";
  expect(firstLine.length).toBeLessThanOrEqual(50);
  expect(firstLine).toBe("Add test file");
});

test("integration test: file creation and modification", async () => {
  // Create a Python file as mentioned in the overview
  await Bun.write(`${testDir}/add.py`, `def add(a, b):
    return a + b
`);

  // Stage and commit
  await $`cd ${testDir} && git add add.py`.quiet();
  await $`cd ${testDir} && git commit -m "Add Python function\n\n## User Prompt\nAdd a python function to file ./add.py that adds two numbers.\n\n## LLM Response\nI'll create a Python function that adds two numbers."`.quiet();

  // Verify file exists
  const fileExists = await $`test -f ${testDir}/add.py`.quiet().then(() => true).catch(() => false);
  expect(fileExists).toBe(true);

  // Verify file content
  const fileContent = await Bun.file(`${testDir}/add.py`).text();
  expect(fileContent).toContain("def add(a, b):");
  expect(fileContent).toContain("return a + b");

  // Verify commit was created
  const commitCount = await $`cd ${testDir} && git rev-list --count HEAD`.text();
  expect(parseInt(commitCount)).toBeGreaterThan(1);

  // Verify commit contains the Python file
  const filesChanged = await $`cd ${testDir} && git show --name-only --format="" HEAD`.text();
  expect(filesChanged).toContain("add.py");
});

test("integration test: commit message format validation", async () => {
  // Test various commit message formats
  const testCases = [
    {
      message: `Fix bug in parser

## User Prompt
Fix the parser bug

## LLM Response
Fixed it`,
      expectedSummary: "Fix bug in parser",
    },
    {
      message: `Add new feature

## User Prompt
Add a new feature

## LLM Response
Feature added successfully`,
      expectedSummary: "Add new feature",
    },
  ];

  for (const testCase of testCases) {
    await Bun.write(`${testDir}/temp.txt`, `temp-${Date.now()}\n`);
    await $`cd ${testDir} && git add temp.txt`.quiet();
    await $`cd ${testDir} && git commit -m ${testCase.message}`.quiet();

    const commitMessage = await $`cd ${testDir} && git log -1 --format=%B`.text();
    const lines = commitMessage.split("\n");
    const firstLine = lines[0] || "";
    
    expect(firstLine).toBe(testCase.expectedSummary);
    expect(firstLine.length).toBeLessThanOrEqual(50);
    expect(commitMessage).toContain("## User Prompt");
    expect(commitMessage).toContain("## LLM Response");
  }
});
