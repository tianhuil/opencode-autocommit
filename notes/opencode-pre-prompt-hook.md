# OpenCode Plugin: Pre-Prompt Git Check

**Date**: 2026-02-15
**Topic**: Hook to intercept before user submits a prompt in opencode plugin

---

## Executive Summary

- **`tui.command.execute`** is the hook that fires when a user submits a prompt
- Check if `event.properties.command === "prompt.submit"` to detect prompt submission
- This fires BEFORE the turn starts, making it ideal for checking git status

---

## The Hook: `tui.command.execute`

### Event Type

```typescript
type EventTuiCommandExecute = {
  type: "tui.command.execute"
  properties: {
    command: string
  }
}
```

The command can be one of:
- `"session.list"`
- `"session.new"`
- `"session.share"`
- `"session.interrupt"`
- `"session.compact"`
- `"session.page.up"`
- `"session.page.down"`
- `"session.half.page.up"`
- `"session.half.page.down"`
- `"session.first"`
- `"session.last"`
- `"prompt.clear"`
- **`"prompt.submit"`** ← This is what we need!
- `"agent.cycle"`

---

## Implementation Example

Check for uncommitted changes before allowing the prompt to be submitted:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const AutoCommitPlugin: Plugin = async ({ client, $, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      // Check if user is submitting a prompt
      if (event.type === "tui.command.execute" && event.properties.command === "prompt.submit") {
        // Check for uncommitted changes
        const status = await $`git status --porcelain`.quiet()

        if (status.stdout.trim()) {
          // There are uncommitted changes
          await client.app.log({
            service: "auto-commit",
            level: "error",
            message: "Cannot submit prompt: uncommitted changes detected",
            extra: { directory },
          })

          // Note: This will log the error but won't prevent the prompt from being submitted
          // As of current opencode plugin API, there's no way to block event propagation
        }
      }
    },
  }
}
```

---

## Event Flow

1. **User types prompt** → `tui.prompt.append` fires (for each character/text appended)
2. **User submits prompt** → `tui.command.execute` with `command: "prompt.submit"` fires
3. **AI processes** → Turn starts
4. **AI finishes** → `session.idle` fires

---

## Key Difference from `session.idle`

| Event | When it fires | Use case |
|-------|---------------|----------|
| `tui.command.execute` (prompt.submit) | **BEFORE** user submits prompt | Pre-submit validation (check git status, etc.) |
| `session.idle` | **AFTER** AI finishes responding | Post-turn actions (commit changes, etc.) |

---

## Important Limitation

Currently, the opencode plugin API does not support blocking event propagation or preventing the prompt from being submitted. The `tui.command.execute` hook can log errors or take actions, but cannot stop the prompt from being processed.

If this blocking behavior is needed, it may require:
1. Submitting a feature request to opencode
2. Looking for alternative approaches
3. Using custom tools that check git status before proceeding

---

## References

- OpenCode Plugin Docs: `/Volumes/Workspace/opencode/packages/web/src/content/docs/plugins.mdx`
- Plugin Types: `/Volumes/Workspace/opencode/packages/plugin/src/index.ts`
- Event Types: `/Volumes/Workspace/opencode/packages/sdk/js/src/gen/types.gen.ts`
- TUI Events: `/Volumes/Workspace/opencode/packages/opencode/src/cli/cmd/tui/event.ts`
