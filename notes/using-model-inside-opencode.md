# Using model inside opencode

Great question! Yes, `session.prompt()` does insert messages into the session history by default. Unfortunately, based on the OpenCode documentation I found, there doesn't appear to be a built-in way to make "ephemeral" LLM calls that don't get added to the session history.

However, here are some potential approaches:

## Workaround Options

Create a Temporary Session (Recommended)

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
