# Using model inside opencode

Great question! Yes, `session.prompt()` does insert messages into the session history by default. Unfortunately, based on the OpenCode documentation I found, there doesn't appear to be a built-in way to make "ephemeral" LLM calls that don't get added to the session history.

However, here are some potential approaches:

## Workaround Options

### 1. Create a Temporary Session (Recommended)

Create a short-lived session for one-off tasks like generating commit messages, then delete it:

```typescript
export const CommitNamePlugin: Plugin = async ({ client }) => {
  return {
    "tool.execute.after": async (input, output) => {
      // Create temporary session
      const tempSession = await client.session.create({
        body: { title: "temp-commit-name" }
      })
      
      // Get commit message
      const result = await client.session.prompt({
        path: { id: tempSession.data.id },
        body: {
          parts: [{ 
            type: "text", 
            text: "Generate a git commit message for these changes: ..." 
          }],
        },
      })
      
      const commitMessage = result.data.parts[0].text
      
      // Clean up temporary session
      await client.session.delete({
        path: { id: tempSession.data.id }
      })
      
      return commitMessage
    }
  }
}
```

### 2. Use the Provider API Directly

Since OpenCode likely uses provider APIs under the hood, you could make direct API calls to your LLM provider (Anthropic, OpenAI, etc.) from your plugin:

```typescript
export const CommitNamePlugin: Plugin = async ({ client }) => {
  return {
    "tool.execute.after": async (input, output) => {
      // Direct API call (not through OpenCode)
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 100,
          messages: [{
            role: "user",
            content: "Generate a commit message for: ..."
          }]
        })
      })
      
      const data = await response.json()
      return data.content[0].text
    }
  }
}
```

### 3. Check for Future SDK Updates

You might want to check the OpenCode GitHub issues or ask in their Discord about adding an ephemeral prompt feature. This seems like a reasonable use case that others might need too.

The temporary session approach is probably cleanest if you want to stay within the OpenCode ecosystem, while direct API calls give you complete control but bypass OpenCode's configuration and session management.