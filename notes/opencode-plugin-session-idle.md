# OpenCode Plugin: Handling Session Idle and Message Access

**Date**: 2026-02-15
**Topic**: How to access user input / LLM response when `session.idle` fires in an OpenCode plugin

---

## Executive Summary

- When `session.idle` fires, you only receive the `sessionID` - you must call `client.session.messages({ sessionID })` to get messages
- A "turn" = user message + associated assistant messages (linked via `parentID`)
- Multiple prompts in one turn create "steps" (`step-start` / `step-finish` parts) within a single assistant message

---

## The `session.idle` Event

When the AI finishes responding, the `session.idle` event fires:

```typescript
type EventSessionIdle = {
  type: "session.idle"
  properties: {
    sessionID: string
  }
}
```

**Important**: The event only provides `sessionID`. You must fetch messages separately.

### Plugin Hook Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const { sessionID } = event.properties
        
        // Fetch all messages in the session
        const response = await client.session.messages({ sessionID })
        const messages = response.data ?? []
        
        // Get the latest turn (last user message + its assistant responses)
        const lastTurn = getLastTurn(messages)
        
        console.log("User prompt:", lastTurn.userPrompt)
        console.log("LLM response:", lastTurn.assistantResponse)
      }
    },
  }
}
```

---

## Getting Messages

### SDK Method

```typescript
const response = await client.session.messages({ 
  sessionID: string,
  limit?: number,  // optional limit
  directory?: string  // optional directory filter
})
```

### Response Structure

```typescript
type MessageWithParts = {
  info: UserMessage | AssistantMessage
  parts: Part[]
}

// User message
type UserMessage = {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  agent: string
  model: { providerID: string; modelID: string }
  // ...
}

// Assistant message  
type AssistantMessage = {
  id: string
  sessionID: string
  role: "assistant"
  time: { 
    created: number
    completed?: number  // undefined until response finishes
  }
  parentID: string  // Links to the user message this responds to
  // ...
}
```

---

## Turn Structure

A **turn** consists of:
1. One user message
2. One or more assistant messages with `parentID` = user message ID

### Distinguishing the Current Turn from Previous Turns

```typescript
function getLastTurn(messages: MessageWithParts[]) {
  // Find the last user message (start of most recent turn)
  let lastUserMsg: MessageWithParts | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") {
      lastUserMsg = messages[i]
      break
    }
  }
  
  if (!lastUserMsg) return null
  
  // Get all assistant messages in this turn (same parentID)
  const assistantMessages = messages.filter(
    m => m.info.role === "assistant" && m.info.parentID === lastUserMsg!.info.id
  )
  
  // Extract user prompt text
  const userPrompt = lastUserMsg.parts
    .filter(p => p.type === "text")
    .map(p => (p as TextPart).text)
    .join("\n")
  
  // Extract LLM response text
  const assistantResponse = assistantMessages
    .flatMap(m => m.parts.filter(p => p.type === "text"))
    .map(p => (p as TextPart).text)
    .join("\n")
  
  return {
    userMessageID: lastUserMsg.info.id,
    userPrompt,
    assistantResponse,
    assistantMessages,
  }
}
```

---

## Multiple Prompts in a Single Turn (Agentic Loops)

When the LLM makes multiple tool calls in a turn, each iteration is called a **step**:

### Step Parts

```typescript
type StepStartPart = {
  id: string
  sessionID: string
  messageID: string
  type: "step-start"
  snapshot?: string
}

type StepFinishPart = {
  id: string
  sessionID: string
  messageID: string
  type: "step-finish"
  reason: string
  snapshot?: string
  cost: number
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
}
```

### Understanding Steps

- All steps are parts within **one** assistant message
- `step-start` marks the beginning of each iteration
- `step-finish` marks the end with reason (e.g., "stop", "tool-calls")
- The assistant message is complete when `time.completed` is set

### Counting Steps in a Turn

```typescript
function countStepsInTurn(assistantMessages: MessageWithParts[]) {
  let stepCount = 0
  for (const msg of assistantMessages) {
    for (const part of msg.parts) {
      if (part.type === "step-start") stepCount++
    }
  }
  return stepCount
}
```

---

## Complete Example: Auto-Commit Plugin

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const AutoCommitPlugin: Plugin = async ({ client, $, directory }) => {
  // Track last committed turn to avoid duplicates
  let lastCommittedTurnID: string | undefined

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      
      const { sessionID } = event.properties
      
      // Fetch messages
      const response = await client.session.messages({ sessionID })
      const messages = response.data ?? []
      
      // Get last turn
      const turn = getLastTurn(messages)
      if (!turn || turn.userMessageID === lastCommittedTurnID) return
      
      // Mark as committed to prevent duplicate commits
      lastCommittedTurnID = turn.userMessageID
      
      // Check for uncommitted changes
      const status = await $`git status --porcelain`.quiet()
      if (!status.stdout.trim()) {
        console.log("No changes to commit")
        return
      }
      
      // Commit with turn info
      const commitMessage = `${generateSummary(turn)}

## User Prompt
${turn.userPrompt}

## LLM Response
${turn.assistantResponse}`
      
      await $`git add -A`
      await $`git commit -m ${commitMessage}`
    },
  }
}

function getLastTurn(messages: { info: { id: string; role: string; parentID?: string }; parts: any[] }[]) {
  // Find last user message
  let lastUserMsg: typeof messages[0] | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") {
      lastUserMsg = messages[i]
      break
    }
  }
  if (!lastUserMsg) return null
  
  // Get assistant messages in this turn
  const assistantMessages = messages.filter(
    m => m.info.role === "assistant" && (m.info as any).parentID === lastUserMsg!.info.id
  )
  
  // Extract text
  const userPrompt = lastUserMsg.parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("\n")
  
  const assistantResponse = assistantMessages
    .flatMap((m: any) => m.parts.filter((p: any) => p.type === "text"))
    .map((p: any) => p.text)
    .join("\n")
  
  return { userMessageID: lastUserMsg.info.id, userPrompt, assistantResponse }
}
```

---

## Key Points Summary

| Concept | Details |
|---------|---------|
| `session.idle` event | Fires with only `sessionID`; fetch messages separately |
| Get messages | `client.session.messages({ sessionID })` |
| Turn structure | User message + assistant messages with matching `parentID` |
| Identify current turn | Find last user message, filter assistants by `parentID` |
| Multiple prompts per turn | Creates `step-start`/`step-finish` parts within ONE assistant message |
| Turn complete | Assistant message has `time.completed` set |

---

## References

- OpenCode Plugin Docs: `/Volumes/Workspace/opencode/packages/web/src/content/docs/plugins.mdx`
- Plugin Types: `/Volumes/Workspace/opencode/packages/plugin/src/index.ts`
- Message Types: `/Volumes/Workspace/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
- Session Status: `/Volumes/Workspace/opencode/packages/opencode/src/session/status.ts`
