#!/usr/bin/env bun

/**
 * Setup Test Repo Script
 *
 * Creates an isolated git repository in /tmp for integration testing
 * of the opencode-autocommit plugin.
 *
 * Usage:
 *   bun script/setup-test-repo.ts
 */

import { $ } from "bun";

// Generate unique test directory name
const testDir = `/tmp/opencode-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

console.log(`Creating test repository at: ${testDir}`);

// Create test directory and initialize git
await $`mkdir -p ${testDir}`;
await $`cd ${testDir} && git init`;
await $`cd ${testDir} && git config user.name "Test"`;
await $`cd ${testDir} && git config user.email "test@example.com"`;

console.log("✓ Git repository initialized");

// Create .opencode/plugins directory
await $`mkdir -p ${testDir}/.opencode/plugins`;

console.log("✓ Plugin directory created");

// Symlink the autocommit plugin
const pluginPath = "/Volumes/Workspace/opencode-autocommit/.opencode/plugins/autocommit.ts";
await $`ln -sf ${pluginPath} ${testDir}/.opencode/plugins/`;

console.log("✓ Plugin symlinked");

// Write auto-commit settings
const settingsContent = `mode: enabled`;
await Bun.write(`${testDir}/.opencode/auto-commit.settings.yml`, settingsContent);

console.log("✓ Auto-commit settings written");

// Create an initial commit to establish the repo
await Bun.write(`${testDir}/README.md`, "# Test Repository\n\nThis is a test repository for opencode-autocommit integration testing.\n");
await $`cd ${testDir} && git add .`;
await $`cd ${testDir} && git commit -m "Initial commit"`;

console.log("✓ Initial commit created");

console.log(`\n✨ Test repository setup complete!`);
console.log(`\nTo use this repository:`);
console.log(`  cd ${testDir}`);
console.log(`\nTo run opencode commands in this repository:`);
console.log(`  opencode run "your prompt here"`);
console.log(`\nTo verify git history:`);
console.log(`  git log --format="%H %s"`);
console.log(`\nTo cleanup when done:`);
console.log(`  rm -rf ${testDir}`);

// Change directory to the test repo
process.chdir(testDir);
console.log(`\n📁 Changed directory to: ${testDir}`);
