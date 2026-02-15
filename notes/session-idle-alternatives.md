# Opencode Plugin Events: Session Idle vs Alternatives for Non-Interactive Mode

**Date**: 2026-02-15
**Topic**: Alternative to `session.idle` event for testing with `opencode run`

---

## Executive Summary

- **`session.idle` does NOT fire during `opencode run`** (non-interactive mode)
- **`chat.message` and `tool.execute.after` hooks also do NOT fire during `opencode run`**
- There is currently **no plugin event available** that works similarly to `session.idle` but fires during `opencode run`
- **Alternative approach**: Use manual tool invocation or build a dedicated test tool

---

## Research Findings

### Event Behavior in Interactive vs Non-Interactive Mode

#### Interactive Mode (TUI)

When using OpenCode/Crush interactively (just running `opencode` or `crush`), the following events work:

1. **`session.idle`**: Fires when the AI finishes responding and the turn completes
2. **`chat.message`**: Fires after each message is sent/received
3. **`tool.execute.after`**: Fires after each tool execution

#### Non-Interactive Mode (`opencode run` / `crush run`)

The non-interactive mode (`opencode run "prompt"` or `crush run "prompt"`) works differently:

1. **Creates a temporary session** for the prompt
2. **Runs the agent** and streams output to stdout
3. **Exits immediately** after completion
4. **Does NOT fire plugin hooks** like `session.idle`, `chat.message`, or `tool.execute.after`

Evidence from source code (`internal/cmd/run.go` and `internal/app/app.go`):

```go
// From RunNonInteractive function
func (app *App) RunNonInteractive(ctx context.Context, output io.Writer, prompt, largeModel, smallModel string, hideSpinner bool) error {
    slog.Info("Running in non-interactive mode")
    // ... creates temporary session ...
    sess, err := app.Sessions.Create(ctx, title)

    // Auto-approve permissions for this session
    app.Permissions.AutoApproveSession(sess.ID)

    // Run agent and stream output directly to stdout
    go func(ctx context.Context, sessionID, prompt string) {
        result, err := app.AgentCoordinator.Run(ctx, sess.ID, prompt)
        // ...
    }(ctx, sess.ID, prompt)

    // Message events are only used for streaming output to stdout
    messageEvents := app.Messages.Subscribe(ctx)
    for {
        select {
        case event := <-messageEvents:
            if msg.SessionID == sess.ID && msg.Role == message.Assistant && len(msg.Parts) > 0 {
                content := msg.Content().String()
                fmt.Fprint(output, part)  // Just print output
            }
        case <-ctx.Done():
            return ctx.Err()
        }
    }
}
```

### Why Hooks Don't Fire in Non-Interactive Mode

The plugin hooks are integrated into the TUI event loop, which doesn't run in non-interactive mode:

- **`session.idle`** is published by the TUI when the turn completes and the system becomes idle
- **`chat.message`** is published by the TUI message handling system
- **`tool.execute.after`** is published by the agent coordinator when a tool finishes

In non-interactive mode:
1. The TUI is never initialized
2. Events are only used internally to stream output to stdout
3. The application exits immediately after the agent finishes
4. No "idle" state is reached (the app just exits)

---

## Alternative Approaches for Testing

### Option 1: Manual Tool Invocation (Already Implemented)

**Status**: ✅ Already implemented in your plugin

Your plugin already has a `triggerAutoCommit` tool that can be called manually:

```typescript
const triggerCommitTool = tool({
  description: "Manually trigger a commit of current changes (useful for testing)",
  args: {},
  async execute(_args, context) {
    const sessionID = context.sessionID
    if (!sessionID) {
      throw new Error("No session ID available")
    }

    const messages = await client.session.messages({ sessionID })
    const turn = getLastTurn(messages.data ?? [])
    if (!turn) {
      throw new Error("No turn found")
    }

    const summary = await generateCommitSummary(turn, settings, client)
    const commitMessage = `${summary}

## User Prompt
${turn.userPrompt}

## LLM Response
${turn.assistantResponse}`

    const truncatedMessage = truncateCommitMessage(commitMessage, settings.maxCommitLength)
    const success = await makeCommit($, truncatedMessage, client)

    return JSON.stringify({ success: true, summary }, null, 2)
  },
})
```

**Testing with `opencode run`**:

```bash
# Run a prompt that makes changes
opencode run "Write 'Hello World!' to hello.txt"

# Then manually trigger commit via the tool
# Note: This requires interactive mode or calling the tool programmatically
```

**Limitation**: This only works in interactive mode because tools need to be called within a session.

### Option 2: Use `immediate` Mode with `tool.execute.after`

**Status**: ⚠️ Only works in interactive mode

Your plugin already implements `tool.execute.after` hook:

```typescript
"tool.execute.after": async ({ tool, sessionID }) => {
  await client.app.log({
    body: {
      service: "opencode-autocommit",
      level: "info",
      message: `tool.execute.after hook called: tool=${tool}, sessionID=${sessionID}, mode=${settings.mode}`,
    },
  })

  if (settings.mode !== "immediate") return

  await performCommit(sessionID)
},
```

**Problem**: This hook also does NOT fire during `opencode run`.

**Reason**: The hook system is tied to the TUI event loop, not the agent execution.

### Option 3: Post-Commit Hook (Best for Automated Testing)

**Status**: ✅ Works with `opencode run`

Use a Git post-commit hook to perform the auto-commit functionality:

```bash
#!/bin/bash
# .git/hooks/post-commit

# This runs after every commit, including those made by opencode run
echo "Post-commit hook triggered"

# You could:
# 1. Generate a summary from the last commit
# 2. Update a changelog
# 3. Send notifications
# 4. Run custom scripts
```

**Installation**:

```bash
# Create the hook
cat > .git/hooks/post-commit <<'EOF'
#!/bin/bash
echo "Auto-commit plugin: Post-commit hook triggered"
# Add your custom logic here
EOF

# Make it executable
chmod +x .git/hooks/post-commit
```

**Pros**:
- ✅ Works with `opencode run`
- ✅ Triggers after every commit
- ✅ Can perform any post-commit actions

**Cons**:
- ❌ Not a plugin hook (runs separately from plugin)
- ❌ Can't access OpenCode context directly (sessionID, messages, etc.)
- ❌ Requires Git hook configuration in each repository

### Option 4: Wrapper Script with Commit Detection

**Status**: ✅ Works with `opencode run`

Create a wrapper script that detects changes after `opencode run` and commits:

```typescript
// script/test-autocommit.ts
#!/usr/bin/env bun
import { $ } from "bun";

async function testAutoCommit(prompt: string) {
  console.log(`Running opencode with: ${prompt}`);

  // Get current commit count
  const beforeCommit = await $`git rev-list --count HEAD`.text();

  // Run opencode
  await $`opencode run ${prompt}`;

  // Get new commit count
  const afterCommit = await $`git rev-list --count HEAD`.text();

  // Check if a new commit was made
  if (parseInt(beforeCommit.trim()) < parseInt(afterCommit.trim())) {
    console.log("✅ New commit detected!");
    const lastCommit = await $`git log -1 --pretty=format:"%H"`.text();
    const commitMsg = await $`git log -1 --pretty=format:"%B"`.text();

    console.log("Commit message:");
    console.log(commitMsg);
  } else {
    console.log("❌ No new commit (opencode run didn't make changes)");
  }
}

await testAutoCommit(process.argv.slice(2).join(" "));
```

**Usage**:

```bash
bun script/test-autocommit.ts "Write 'Hello World!' to hello.txt"
```

**Pros**:
- ✅ Works with `opencode run`
- ✅ Can verify commit was made
- ✅ Can test commit message format

**Cons**:
- ❌ Doesn't test plugin functionality directly
- ❌ Only verifies output, not plugin logic

### Option 5: Mock Plugin Testing with Direct SDK Calls

**Status**: ✅ Best for testing plugin logic

Create a test that simulates the plugin behavior without relying on events:

```typescript
// test/plugin-logic.test.ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";

const testDir = `/tmp/opencode-test-${Date.now()}`;

beforeAll(async () => {
  await $`mkdir -p ${testDir}/.opencode/plugins`;
  await $`cd ${testDir} && git init`.quiet();
  await $`cd ${testDir} && git config user.name "Test"`.quiet();
  await $`cd ${testDir} && git config user.email "test@test.com"`.quiet();
});

test("plugin logic: generates commit message correctly", async () => {
  // Simulate a turn
  const turn = {
    userMessageID: "msg-123",
    userPrompt: "Write a hello world file",
    assistantResponse: "I've created hello.txt with 'Hello World!' content.",
  };

  // Import and call the plugin's internal functions
  const { getLastTurn, generateCommitSummary, truncateCommitMessage } =
    await import("../.opencode/plugins/autocommit.ts");

  // Mock client.generate
  const mockClient = {
    app: {
      generate: async () => ({ text: "Add hello world file" }),
      log: async () => {},
    },
  };

  const settings = {
    mode: "worktree",
    maxCommitLength: 10000,
  };

  const summary = await generateCommitSummary(turn, settings, mockClient);
  expect(summary.length).toBeLessThanOrEqual(50);

  const fullMessage = `${summary}

## User Prompt
${turn.userPrompt}

## LLM Response
${turn.assistantResponse}`;

  const truncated = truncateCommitMessage(fullMessage, settings.maxCommitLength);
  expect(truncated.length).toBeLessThanOrEqual(10000);
});

test("plugin logic: getLastTurn extracts correct messages", async () => {
  const { getLastTurn } = await import("../.opencode/plugins/autocommit.ts");

  const messages = [
    {
      info: { id: "msg-1", role: "user" },
      parts: [{ type: "text", text: "First prompt" }],
    },
    {
      info: { id: "msg-2", role: "assistant", parentID: "msg-1" },
      parts: [{ type: "text", text: "First response" }],
    },
    {
      info: { id: "msg-3", role: "user" },
      parts: [{ type: "text", text: "Second prompt" }],
    },
    {
      info: { id: "msg-4", role: "assistant", parentID: "msg-3" },
      parts: [{ type: "text", text: "Second response" }],
    },
  ];

  const turn = getLastTurn(messages);
  expect(turn).not.toBeNull();
  expect(turn?.userPrompt).toBe("Second prompt");
  expect(turn?.assistantResponse).toBe("Second response");
});

afterAll(async () => {
  await $`rm -rf ${testDir}`.quiet();
});
```

**Pros**:
- ✅ Tests plugin logic directly
- ✅ No need for OpenCode events
- ✅ Can mock dependencies (client, $, directory)
- ✅ Fast and reliable

**Cons**:
- ❌ Requires refactoring plugin code to export internal functions
- ❌ Doesn't test event integration

---

## Recommended Approach for Testing

### For Automated Tests

**Use Option 5: Direct Unit Testing**

1. Refactor plugin to export internal functions as testable modules
2. Write unit tests for each function:
   - `getLastTurn` - message extraction logic
   - `generateCommitSummary` - LLM call to generate summary
   - `truncateCommitMessage` - message truncation
   - `makeCommit` - git operations
3. Use mocks for `client`, `$`, and `directory` parameters

### For Manual Testing

**Use Interactive Mode with `immediate` Mode**

1. Set plugin mode to `immediate` in settings:
   ```yaml
   # .opencode/auto-commit.settings.yml
   mode: immediate
   maxCommitLength: 10000
   ```

2. Test in interactive mode:
   ```bash
   opencode
   # Enter prompts and verify commits happen after each message/tool execution
   ```

3. The `tool.execute.after` hook will fire and perform commits

### For Integration Testing with `opencode run`

**Use Option 3: Git Post-Commit Hook**

1. Create a post-commit hook that validates commit format
2. Run `opencode run` commands
3. Verify commits are made correctly
4. Check commit message format

---

## Summary Table

| Approach | Works with `opencode run` | Tests Plugin Logic | Tests Event System | Recommended For |
|----------|---------------------------|-------------------|-------------------|------------------|
| `session.idle` | ❌ No | ✅ Yes | ✅ Yes | Interactive manual testing |
| `chat.message` | ❌ No | ✅ Yes | ✅ Yes | Interactive mode only |
| `tool.execute.after` | ❌ No | ✅ Yes | ✅ Yes | Interactive mode only |
| Manual tool invocation | ❌ No | ✅ Yes | ❌ No | Interactive debugging |
| Git post-commit hook | ✅ Yes | ❌ No | ❌ No | Automated testing |
| Wrapper script | ✅ Yes | ❌ No | ❌ No | Smoke testing |
| Unit testing | ✅ Yes | ✅ Yes | ❌ No | **Automated testing** |

---

## Conclusion

**There is currently no plugin event that works similarly to `session.idle` but fires during `opencode run`**. The plugin system is designed around the TUI event loop, which doesn't run in non-interactive mode.

**Best practices for testing**:
1. **Automated tests**: Unit test plugin logic directly (Option 5)
2. **Integration tests**: Use Git hooks to verify commit behavior (Option 3)
3. **Manual testing**: Use interactive mode with `immediate` setting

If you need to test the full plugin integration including events, you must use interactive mode (`opencode`) rather than non-interactive mode (`opencode run`).

---

## References

- OpenCode Plugin Types: `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts`
- Crush Run Implementation: https://github.com/charmbracelet/crush/blob/main/internal/cmd/run.go
- Crush App Non-Interactive: https://github.com/charmbracelet/crush/blob/main/internal/app/app.go
- Plugin Session Idle: `./notes/opencode-plugin-session-idle.md`
