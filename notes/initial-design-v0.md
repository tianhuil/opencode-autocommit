# Auto-Commit Plugin Design

A focused opencode plugin that automatically commits changes after each agent turn.

## Overview

The auto-commit plugin hooks into opencode's session lifecycle and commits any file changes when the agent finishes processing. This provides automatic version control of AI-assisted code changes without manual intervention.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     User sends prompt                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Agent starts processing                        │
│                   session.status → { type: "busy" }              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              Agent modifies files, runs commands, etc.           │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                Agent completes turn                              │
│                session.status → { type: "idle" }                 │
│                         │                                        │
│                         ▼                                        │
│                ┌─────────────────────┐                           │
│                │  Auto-Commit Plugin │                           │
│                │  1. Check git status│                           │
│                │  2. Stage changes   │                           │
│                │  3. Generate msg    │                           │
│                │  4. Commit           │                           │
│                └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

## Plugin Interface

```typescript
import type { Hooks, Plugin } from "@opencode-ai/plugin";

export const AutoCommitPlugin: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      if (
        event.type === "session.status" &&
        event.properties.status.type === "idle"
      ) {
        await autoCommit({
          $: ctx.$,
          directory: ctx.directory,
          sessionID: event.properties.sessionID,
        });
      }
    },
  } satisfies Hooks;
};
```

## Core Implementation

### Types

```typescript
type AutoCommitOptions = {
  $: BunShell;
  directory: string;
  sessionID: string;
};

type CommitResult =
  | { success: true; message: string; filesChanged: number }
  | { success: false; reason: "no_changes" | "error"; error?: string };
```

### Main Function

```typescript
async function autoCommit(options: AutoCommitOptions): Promise<CommitResult> {
  const { $, directory, sessionID } = options;

  // 1. Check for changes
  const status = await checkForChanges($, directory);
  if (!status.hasChanges) {
    return { success: false, reason: "no_changes" };
  }

  // 2. Generate commit message
  const message = await generateCommitMessage($, directory, sessionID, status);

  // 3. Stage and commit
  try {
    await stageChanges($, directory);
    await commitChanges($, directory, message);

    return {
      success: true,
      message,
      filesChanged: status.files.length,
    };
  } catch (error) {
    return {
      success: false,
      reason: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

### Change Detection

```typescript
type GitStatus = {
  hasChanges: boolean;
  files: GitFile[];
};

type GitFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
};

async function checkForChanges(
  $: BunShell,
  directory: string,
): Promise<GitStatus> {
  // Get porcelain status (machine-readable, short format)
  const output = await $`git status --porcelain`.cwd(directory).quiet().text();

  if (!output.trim()) {
    return { hasChanges: false, files: [] };
  }

  const files = output
    .trim()
    .split("\n")
    .map((line) => parseGitStatusLine(line))
    .filter((f): f is GitFile => f !== null);

  return {
    hasChanges: files.length > 0,
    files,
  };
}

function parseGitStatusLine(line: string): GitFile | null {
  // Format: XY PATH or XY OLD_PATH -> NEW_PATH
  const statusCode = line.slice(0, 2);
  const path = line.slice(3);

  const statusMap: Record<string, GitFile["status"]> = {
    "??": "untracked",
    "A ": "added",
    AM: "added",
    "M ": "modified",
    MM: "modified",
    " M": "modified",
    "D ": "deleted",
    " D": "deleted",
    "R ": "renamed",
    RM: "renamed",
  };

  const status = statusMap[statusCode] ?? "modified";
  return { path, status };
}
```

### Commit Message Generation

```typescript
async function generateCommitMessage(
  $: BunShell,
  directory: string,
  sessionID: string,
  status: GitStatus,
): Promise<string> {
  // Try to get a summary from git diff --stat
  const diffStat = await $`git diff --stat`
    .cwd(directory)
    .quiet()
    .text()
    .catch(() => "");

  // Try to get diff of staged changes too
  const stagedStat = await $`git diff --cached --stat`
    .cwd(directory)
    .quiet()
    .text()
    .catch(() => "");

  // Generate summary based on files changed
  const summary = generateSummary(status.files);

  // Build commit message
  const lines = [
    `ai: ${summary}`,
    "",
    `Session: ${sessionID}`,
    "",
    "Files changed:",
  ];

  for (const file of status.files.slice(0, 10)) {
    lines.push(`  ${file.status}: ${file.path}`);
  }

  if (status.files.length > 10) {
    lines.push(`  ... and ${status.files.length - 10} more`);
  }

  if (diffStat.trim() || stagedStat.trim()) {
    lines.push("");
    lines.push("Stats:");
    lines.push(diffStat.trim() || stagedStat.trim());
  }

  return lines.join("\n");
}

function generateSummary(files: GitFile[]): string {
  if (files.length === 0) return "no changes";

  const byStatus = {
    added: files.filter(
      (f) => f.status === "added" || f.status === "untracked",
    ),
    modified: files.filter((f) => f.status === "modified"),
    deleted: files.filter((f) => f.status === "deleted"),
    renamed: files.filter((f) => f.status === "renamed"),
  };

  const parts: string[] = [];

  if (byStatus.modified.length > 0) {
    parts.push(
      `modified ${byStatus.modified.length} file${byStatus.modified.length > 1 ? "s" : ""}`,
    );
  }
  if (byStatus.added.length > 0) {
    parts.push(
      `added ${byStatus.added.length} file${byStatus.added.length > 1 ? "s" : ""}`,
    );
  }
  if (byStatus.deleted.length > 0) {
    parts.push(
      `deleted ${byStatus.deleted.length} file${byStatus.deleted.length > 1 ? "s" : ""}`,
    );
  }
  if (byStatus.renamed.length > 0) {
    parts.push(
      `renamed ${byStatus.renamed.length} file${byStatus.renamed.length > 1 ? "s" : ""}`,
    );
  }

  return parts.join(", ");
}
```

### Git Operations

```typescript
async function stageChanges($: BunShell, directory: string): Promise<void> {
  // Stage all changes (modified, deleted, new files)
  await $`git add -A`.cwd(directory).quiet();
}

async function commitChanges(
  $: BunShell,
  directory: string,
  message: string,
): Promise<void> {
  await $`git commit -m ${message}`.cwd(directory).quiet();
}
```

## Configuration

The plugin can be configured via `opencode.json`:

```json
{
  "plugin": ["auto-commit"]
}
```

### Optional: Custom Configuration

```typescript
type AutoCommitConfig = {
  /** Enable/disable auto-commit (default: true) */
  enabled?: boolean;

  /** Commit message prefix (default: "ai:") */
  prefix?: string;

  /** Skip committing files matching these patterns */
  ignorePatterns?: string[];

  /** Require staged changes only (default: false - stage all) */
  stagedOnly?: boolean;
};
```

Example `opencode.json`:

```json
{
  "plugin": ["auto-commit"],
  "autoCommit": {
    "prefix": "🤖 ",
    "ignorePatterns": ["*.lock", "package-lock.json"]
  }
}
```

## Edge Cases

### 1. Merge Conflicts

If there are unresolved merge conflicts, skip committing:

```typescript
async function hasMergeConflicts(
  $: BunShell,
  directory: string,
): Promise<boolean> {
  const output = await $`git diff --check`
    .cwd(directory)
    .quiet()
    .text()
    .catch(() => "");

  return output.includes("conflict");
}
```

### 2. Detached HEAD

If in detached HEAD state, create a temporary branch:

```typescript
async function ensureBranch(
  $: BunShell,
  directory: string,
  sessionID: string,
): Promise<void> {
  const head = await $`git symbolic-ref -q HEAD`
    .cwd(directory)
    .quiet()
    .text()
    .catch(() => "");

  if (!head.trim()) {
    // Detached HEAD - create a branch
    await $`git checkout -b ai/session-${sessionID.slice(0, 8)}`
      .cwd(directory)
      .quiet();
  }
}
```

### 3. No Git Repository

Gracefully handle non-git directories:

```typescript
async function isGitRepo($: BunShell, directory: string): Promise<boolean> {
  const result = await $`git rev-parse --git-dir`
    .cwd(directory)
    .quiet()
    .nothrow()
    .text();

  return result.trim().length > 0;
}
```

### 4. Pre-commit Hooks

Let git handle pre-commit hooks normally. If a hook fails, the commit fails - this is expected behavior.

## File Structure

```
auto-commit-plugin/
├── src/
│   ├── index.ts          # Plugin export
│   ├── plugin.ts         # Main plugin implementation
│   ├── commit.ts         # Auto-commit logic
│   ├── git.ts            # Git operations
│   └── types.ts          # Type definitions
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.1.65"
  },
  "devDependencies": {
    "@types/bun": "^1.2.0",
    "typescript": "^5.8.0"
  }
}
```

## Usage

1. Install the plugin:

   ```bash
   bun add auto-commit-plugin
   ```

2. Add to `opencode.json`:

   ```json
   {
     "plugin": ["auto-commit-plugin"]
   }
   ```

3. Use opencode normally - commits happen automatically after each agent turn

## Example Commit

```
ai: modified 3 files, added 1 file

Session: ses_abc123def456

Files changed:
  modified: src/index.ts
  modified: src/utils.ts
  modified: README.md
  added: src/new-feature.ts

Stats:
 src/index.ts         | 15 ++++++++++-----
 src/utils.ts         |  8 ++++++++
 src/new-feature.ts   | 42 ++++++++++++++++++++++++++++++++++++++++++
 README.md            |  3 ++-
 4 files changed, 65 insertions(+), 3 deletions(-)
```

## Tasks

- [ ] Implement core plugin with `session.status` event hook
- [ ] Implement `checkForChanges()` with porcelain parsing
- [ ] Implement `generateCommitMessage()` with smart summaries
- [ ] Handle edge cases (merge conflicts, detached HEAD, non-git)
- [ ] Add optional configuration via opencode.json
- [ ] Add logging/debug mode
- [ ] Write tests
- [ ] Document installation and usage
