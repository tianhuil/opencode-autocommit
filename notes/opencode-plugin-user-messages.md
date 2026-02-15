# OpenCode Plugin: Sending Messages to Users

**Date**: 2026-02-15
**Topic**: How to display messages and warnings to users from opencode plugins

---

## Executive Summary

- Plugins have **limited options** for displaying messages directly to users
- Main options: `client.app.log()`, external system notifications, or throwing errors in tool hooks
- No direct way to display toast notifications from plugins (current API limitation)

---

## Available Methods

### 1. Structured Logging with `client.app.log()`

**Best for**: Debugging, tracking events, persistent logs

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await client.app.log({
          service: "my-plugin",
          level: "info",
          message: "Plugin initialized",
          extra: { foo: "bar" },
        })
      }
    },
  }
}
```

**Pros**:
- Structured and searchable
- Different log levels: `debug`, `info`, `warn`, `error`
- Can include extra context data

**Cons**:
- **Not immediately visible** to users in the TUI
- Requires checking logs separately

---

### 2. System Notifications (External Commands)

**Best for**: Important alerts, completion notifications

#### macOS (AppleScript)

```typescript
export const NotificationPlugin: Plugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        // Send notification on macOS
        await $`osascript -e 'display notification "Session completed!" with title "opencode"'`
      }
    },
  }
}
```

#### Linux (notify-send)

```typescript
export const NotificationPlugin: Plugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`notify-send "OpenCode" "Session completed!"`
      }
    },
  }
}
```

**Pros**:
- Immediately visible to user
- Works across different platforms (with platform-specific commands)
- Eye-catching alerts

**Cons**:
- Platform-specific code
- Requires platform-specific tools (osascript, notify-send, etc.)
- May not work in all environments (e.g., remote terminals)

---

### 3. Throwing Errors in Tool Hooks

**Best for**: Blocking tool execution with error messages

```typescript
export const EnvProtection: Plugin = async ({ $ }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        // This error message will be displayed to the user
        throw new Error("Do not read .env files")
      }
    },
  }
}
```

**Pros**:
- Error message is immediately displayed to user
- Can prevent tool execution

**Cons**:
- Only works for tool hooks, not general events
- Stops tool execution (might not be desired behavior)

---

## Limitations

### Toast Notifications

The opencode TUI has a toast notification system (`tui.toast.show`), but:

**❌ Plugins cannot directly send toast notifications**

The event system works like this:
```typescript
// Internal TUI code
sdk.event.on(TuiEvent.ToastShow.type, (evt) => {
  toast.show({
    title: evt.properties.title,
    message: evt.properties.message,
    variant: evt.properties.variant,
    duration: evt.properties.duration,
  })
})
```

However, plugins don't have access to publish events to the internal Bus. This is a current API limitation.

---

## Recommended Approaches

### For Auto-Commit Plugin Warnings

**Option 1: Use `client.app.log()` + System Notifications**

```typescript
export const AutoCommitPlugin: Plugin = async ({ client, $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "tui.command.execute" && event.properties.command === "prompt.submit") {
        const status = await $`git status --porcelain`.quiet()

        if (status.stdout.trim()) {
          // Log for debugging/audit trail
          await client.app.log({
            service: "auto-commit",
            level: "warning",
            message: "User submitted prompt with uncommitted changes",
            extra: {
              directory: directory,
              hasChanges: true,
            },
          })

          // Send system notification for immediate visibility
          await $`osascript -e 'display notification "Warning: You have uncommitted git changes!" with title "Auto-Commit"'`
        }
      }
    },
  }
}
```

**Option 2: System Notification Only**

```typescript
export const AutoCommitPlugin: Plugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "tui.command.execute" && event.properties.command === "prompt.submit") {
        const status = await $`git status --porcelain`.quiet()

        if (status.stdout.trim()) {
          await $`osascript -e 'display notification "⚠️ Warning: You have uncommitted git changes. Please commit before proceeding." with title "Auto-Commit Plugin"'`
        }
      }
    },
  }
}
```

---

## Platform Detection

For cross-platform notifications:

```typescript
const getNotificationCommand = (title: string, message: string) => {
  const platform = process.platform

  if (platform === "darwin") {
    return `osascript -e 'display notification "${message}" with title "${title}"'`
  }

  if (platform === "linux") {
    return `notify-send "${title}" "${message}"`
  }

  // Windows or other platforms - no notification
  return null
}

export const MyPlugin: Plugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const cmd = getNotificationCommand("OpenCode", "Session completed!")
        if (cmd) await $(cmd)
      }
    },
  }
}
```

---

## Summary Table

| Method | Immediate Visibility | Cross-Platform | Use Case |
|--------|---------------------|----------------|----------|
| `client.app.log()` | ❌ No (check logs) | ✅ Yes | Debugging, audit trail |
| System notifications | ✅ Yes | ⚠️ Platform-specific | Important alerts |
| Tool hook errors | ✅ Yes | ✅ Yes | Blocking tool execution |
| Toast notifications | ✅ Yes | ✅ Yes | ❌ Not available to plugins |

---

## References

- OpenCode Plugin Docs: `/Volumes/Workspace/opencode/packages/web/src/content/docs/plugins.mdx`
- Plugin Types: `/Volumes/Workspace/opencode/packages/plugin/src/index.ts`
- Event Types: `/Volumes/Workspace/opencode/packages/sdk/js/src/gen/types.gen.ts`
- TUI Events: `/Volumes/Workspace/opencode/packages/opencode/src/cli/cmd/tui/event.ts`
