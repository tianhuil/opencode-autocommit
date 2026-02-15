import type { Plugin } from "@opencode-ai/plugin"
import { tool, tool as toolSchema } from "@opencode-ai/plugin"
import { z } from "zod"

const ZAutoCommitMode = z.enum(["disabled", "worktree", "enabled"])

const ZAutoCommitSettings = z.object({
  mode: ZAutoCommitMode.default("worktree"),
  commitModel: z.string().optional(),
  maxCommitLength: z.number().min(100).default(10000),
})

type AutoCommitMode = z.infer<typeof ZAutoCommitMode>
type AutoCommitSettings = z.infer<typeof ZAutoCommitSettings>

interface LastTurn {
  userMessageID: string
  userPrompt: string
  assistantResponse: string
}

async function loadSettingsFromFile(directory: string): Promise<Partial<AutoCommitSettings> | null> {
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    const settingsPath = path.join(directory, ".opencode", "auto-commit.settings.yml")
    
    const content = await fs.readFile(settingsPath, "utf-8")
    
    const yaml = await import("yaml")
    const parsed = yaml.parse(content)
    return ZAutoCommitSettings.partial().parse(parsed)
  } catch (error) {
    return null
  }
}

async function generateCommitSummary(
  turn: LastTurn,
  settings: AutoCommitSettings,
  client: any
): Promise<string> {
  const prompt = `Generate a one-line commit message (max 50 characters) for this turn.

User prompt: ${turn.userPrompt}

LLM response: ${turn.assistantResponse}

Return ONLY the commit message, nothing else.`

  if (settings.commitModel) {
    const response = await client.app.generate({
      model: settings.commitModel,
      prompt,
    })
    return response.text?.trim() || "Auto-commit"
  }
  
  const response = await client.app.generate({
    prompt,
  })
  return response.text?.trim() || "Auto-commit"
}

function truncateCommitMessage(
  message: string,
  maxLength: number
): string {
  if (message.length <= maxLength) return message
  
  const ellipsis = "\n..."
  const truncateLength = maxLength - ellipsis.length
  return message.substring(0, truncateLength) + ellipsis
}

function getLastTurn(messages: any[]): LastTurn | null {
  let lastUserMsg: any = null
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") {
      lastUserMsg = messages[i]
      break
    }
  }
  
  if (!lastUserMsg) return null
  
  const assistantMessages = messages.filter(
    (m: any) => m.info.role === "assistant" && m.info.parentID === lastUserMsg.info.id
  )
  
  const userPrompt = lastUserMsg.parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("\n")
  
  const assistantResponse = assistantMessages
    .flatMap((m: any) => m.parts.filter((p: any) => p.type === "text"))
    .map((p: any) => p.text)
    .join("\n")
  
  return {
    userMessageID: lastUserMsg.info.id,
    userPrompt,
    assistantResponse,
  }
}

async function isWorktree($: any, directory: string): Promise<boolean> {
  try {
    const result = await $`git rev-parse --show-toplevel`.quiet()
    const gitRoot = result.stdout.toString().trim()
    return gitRoot !== directory
  } catch {
    return false
  }
}

async function hasChanges($: any): Promise<boolean> {
  try {
    const result = await $`git status --porcelain`.quiet()
    return result.stdout.toString().trim().length > 0
  } catch {
    return false
  }
}

async function makeCommit($: any, message: string, client: any): Promise<boolean> {
  try {
    await $`git add -A`.quiet()
    await $`git commit -m ${message}`.quiet()
    return true
  } catch (error) {
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "error",
        message: "Failed to commit changes",
        extra: { error: error instanceof Error ? error.message : String(error) },
      },
    })
    return false
  }
}

export const AutoCommitPlugin: Plugin = async ({ client, $, directory, worktree }) => {
  const fileSettings = await loadSettingsFromFile(directory)
  const settings: AutoCommitSettings = {
    mode: "worktree",
    maxCommitLength: 10000,
    ...fileSettings,
  }
  
  let lastCommittedTurnID: string | undefined
  
  const getSettingsTool = tool({
    description: "Get current auto-commit plugin settings",
    args: {},
    async execute(_args, _context) {
      return JSON.stringify(settings, null, 2)
    },
  })
  
  const setSettingsTool = tool({
    description: "Set auto-commit plugin settings",
    args: {
      mode: toolSchema.schema.string().optional(),
      commitModel: toolSchema.schema.string().optional(),
      maxCommitLength: toolSchema.schema.number().optional(),
    },
    async execute(args, _context) {
      try {
        const update: Partial<AutoCommitSettings> = {}
        
        if (args.mode !== undefined) {
          update.mode = ZAutoCommitMode.parse(args.mode)
        }
        if (args.commitModel !== undefined) {
          update.commitModel = args.commitModel || undefined
        }
        if (args.maxCommitLength !== undefined) {
          update.maxCommitLength = args.maxCommitLength
        }
        
        Object.assign(settings, update)
        
        return JSON.stringify(settings, null, 2)
      } catch (error) {
        throw new Error(`Failed to update settings: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  })
  
  const resetSettingsTool = tool({
    description: "Reset auto-commit plugin settings to defaults from settings file",
    args: {},
    async execute(_args, _context) {
      try {
        const fileSettings = await loadSettingsFromFile(directory)
        const defaults: AutoCommitSettings = {
          mode: "worktree",
          maxCommitLength: 10000,
          ...fileSettings,
        }
        
        Object.assign(settings, defaults)
        
        return JSON.stringify(settings, null, 2)
      } catch (error) {
        throw new Error(`Failed to reset settings: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  })
  
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      
      if (settings.mode === "disabled") return
      
      const isInWorktree = await isWorktree($, worktree)
      if (settings.mode === "worktree" && !isInWorktree) return
      
      const { sessionID } = event.properties
      
      const response = await client.session.messages({ sessionID })
      const messages = response.data ?? []
      
      const turn = getLastTurn(messages)
      if (!turn || turn.userMessageID === lastCommittedTurnID) return
      
      lastCommittedTurnID = turn.userMessageID
      
      const hasUncommittedChanges = await hasChanges($)
      if (!hasUncommittedChanges) {
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "debug",
            message: "No changes to commit",
          },
        })
        return
      }
      
      try {
        const summary = await generateCommitSummary(turn, settings, client)
        
        const commitMessage = `${summary}

## User Prompt
${turn.userPrompt}

## LLM Response
${turn.assistantResponse}`
        
        const truncatedMessage = truncateCommitMessage(commitMessage, settings.maxCommitLength)
        
        const success = await makeCommit($, truncatedMessage, client)
        
        if (success) {
          await client.app.log({
            body: {
              service: "opencode-autocommit",
              level: "info",
              message: "Committed changes successfully",
              extra: { summary },
            },
          })
        }
      } catch (error) {
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "error",
            message: "Error during auto-commit",
            extra: { error: error instanceof Error ? error.message : String(error) },
          },
        })
      }
    },
    
    tool: {
      getAutoCommitSettings: getSettingsTool,
      setAutoCommitSettings: setSettingsTool,
      resetAutoCommitSettings: resetSettingsTool,
    },
  }
}
