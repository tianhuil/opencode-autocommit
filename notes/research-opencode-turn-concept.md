# Research: Opencode "Turn" Concept

**Date:** 2026-02-15
**Topic:** Understanding the concept of "turn" in opencode

---

## Executive Summary

- In opencode, a "turn" is a complete interaction cycle from user prompt to AI completion
- The `session.idle` event signals the end of a turn
- The `turn-complete` notification type is triggered when a turn finishes
- SessionTurn component displays each turn in the UI

---

## Detailed Findings

### What is a "Turn"?

A **turn** in opencode represents a complete interaction cycle:

1. **Turn Start**: User submits a prompt
2. **Turn Processing**: AI processes the prompt and generates a response
3. **Turn End**: AI finishes and yields back to the user

The turn is considered complete when the `session.idle` event fires.

### Key Technical Components

#### Notification System
- `TurnCompleteNotification` type is used to track completed turns
- Triggered when `session.idle` event fires
- Includes metadata like directory, sessionID, and timestamp

```typescript
type TurnCompleteNotification = NotificationBase & {
  type: "turn-complete"
}
```

#### Session Event Flow
```
user prompt → AI processing → session.idle event → turn-complete notification
```

#### UI Components
- `SessionTurn` component renders each turn
- Located at `packages/ui/src/components/session-turn.tsx`
- Contains user message, AI response, diffs, and status indicators

#### Performance Tracking
- Performance metrics track `"session:first-turn-mounted"` for first turn rendering
- Used to measure initial session load performance

### AI Agent Instructions

AI agents are instructed with turn-based language:

```text
You are an agent - you must keep going until the user's query is completely resolved, 
before ending your turn and yielding back to the user.

Only terminate your turn when you are sure that the problem is solved.
```

This reinforces that a turn is the agent's "thinking" period before yielding control back to the user.

---

## Code Examples

### Notification Handling (packages/app/src/context/notification.tsx)

```typescript
case "session.idle": {
  const sessionID = event.properties.sessionID
  // ... session lookup code ...
  append({
    ...base,
    type: "turn-complete",
    session: sessionID,
  })
  break
}
```

### SessionTurn Component Usage (packages/app/src/pages/session.tsx)

```typescript
import { SessionTurn } from "@opencode-ai/ui/session-turn"

// SessionTurn displays a complete turn in the UI
<SessionTurn />
```

---

## Implementation Notes for Autocommit Plugin

When implementing the autocommit plugin, use turn terminology consistently:

1. **Before turn starts**: Check for uncommitted changes
2. **After turn completes**: Commit changes using `session.idle` event
3. **Commit message structure**: Reflects the turn (user prompt + AI response)

The plugin lifecycle aligns with turn boundaries, making it natural to commit at turn completion.

---

## References

- opencode source code: https://github.com/opencode-org/opencode
- Notification implementation: `packages/app/src/context/notification.tsx`
- SessionTurn component: `packages/ui/src/components/session-turn.tsx`
- Performance tracking: `packages/app/src/utils/perf.ts`
- AI agent prompts: `packages/opencode/src/session/prompt/`
