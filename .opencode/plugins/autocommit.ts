import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { tool, tool as toolSchema } from "@opencode-ai/plugin"
import { z } from "zod"
import * as yaml from "yaml"
import Bun from "bun"

const ZAutoCommitMode = z.enum(["disabled", "worktree", "enabled"])

const ZAutoCommitSettings = z.object({
  mode: ZAutoCommitMode.default("worktree"),
  commitModel: z.string().optional(),
  maxCommitLength: z.number().min(100).default(10000),
})

type AutoCommitMode = z.infer<typeof ZAutoCommitMode>
type AutoCommitSettings = z.infer<typeof ZAutoCommitSettings>

type OpencodeClient = PluginInput["client"]
type BunShell = PluginInput["$"]

interface LastTurn {
  userMessageID: string
  userPrompt: string
  assistantResponse: string
}

async function loadSettingsFromFile(directory: string, client: OpencodeClient): Promise<Partial<AutoCommitSettings> | null> {
  try {
    const settingsPath = `${directory}/.opencode/auto-commit.settings.yml`
    
    const file = Bun.file(settingsPath)
    const content = await file.text()
    
    const parsed = yaml.parse(content)
    const settings = ZAutoCommitSettings.partial().parse(parsed)
    
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "info",
        message: "Loaded settings from file",
        extra: { settingsPath, settings },
      },
    })
    
    return settings
  } catch (error) {
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "error",
        message: "Failed to load settings file",
        extra: { error: error instanceof Error ? error.message : String(error) },
      },
    })
    return null
  }
}

async function generateCommitSummary(
  turn: LastTurn,
  settings: AutoCommitSettings,
  client: OpencodeClient
): Promise<string> {
  await client.app.log({
    body: {
      service: "opencode-autocommit",
      level: "info",
      message: "Generating commit summary",
      extra: { commitModel: settings.commitModel },
    },
  })
  
  const prompt = `Generate a one-line commit message (max 50 characters) for this turn.

User prompt: ${turn.userPrompt}

LLM response: ${turn.assistantResponse}

Return ONLY the commit message, nothing else.`

  try {
    const tempSession = await client.session.create({
      body: { title: "temp-commit-summary" }
    })
    
    if (!tempSession.data) {
      throw new Error("Failed to create temporary session")
    }
    
    const result = await client.session.prompt({
      path: { id: tempSession.data.id },
      body: {
        parts: [{ 
          type: "text", 
          text: prompt
        }] as any,
      },
    })

    const textParts = result.data?.parts.filter((p) => p.type === 'text')
    const summary = textParts?.map((p) => p.text).join("\n").trim()

    if (!summary) {
      throw new Error("No text response from commit summary prompt")
    }

    
    await client.session.delete({
      path: { id: tempSession.data.id }
    })
  
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "info",
        message: "Commit summary generated",
        extra: { summary },
      },
    })
    
    return summary
  } catch (error) {
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "error",
        message: "Failed to generate commit summary using temporary session",
        extra: { error: error instanceof Error ? error.message : String(error) },
      },
    })
    return "Auto-commit"
  }
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

async function isWorktree($: BunShell, directory: string): Promise<boolean> {
  try {
    const result = await $`git rev-parse --show-toplevel`.quiet()
    const gitRoot = result.stdout.toString().trim()
    const isWorktree = gitRoot !== directory
    return isWorktree
  } catch (error) {
    return false
  }
}

async function hasChanges($: BunShell): Promise<boolean> {
  try {
    const result = await $`git status --porcelain`.quiet()
    const hasUncommitted = result.stdout.toString().trim().length > 0
    return hasUncommitted
  } catch {
    return false
  }
}

async function makeCommit($: BunShell, message: string, client: OpencodeClient): Promise<boolean> {
  try {
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "info",
        message: "Staging all changes",
      },
    })
    
    await $`git add -A`.quiet()
    
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "info",
        message: "Creating commit",
        extra: { messageLength: message.length },
      },
    })
  } catch (error) {
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "error",
        message: "Failed to stage changes",
        extra: { error: error instanceof Error ? error.message : String(error) },
      },
    })
    return false
  }
  
  try {
    await $`git commit -m ${message}`.quiet()
    
    await client.app.log({
      body: {
        service: "opencode-autocommit",
        level: "info",
        message: "Commit created successfully",
      },
    })
    
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
  const fileSettings = await loadSettingsFromFile(directory, client)
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
        const fileSettings = await loadSettingsFromFile(directory, client)
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

  const initTool = tool({
    description: "Initialize auto-commit plugin by creating the .opencode/auto-commit.settings.yml file in the current repository",
    args: {
      mode: toolSchema.schema.string().optional(),
      commitModel: toolSchema.schema.string().optional(),
      maxCommitLength: toolSchema.schema.number().optional(),
    },
    async execute(args, _context) {
      try {
        const settingsPath = `${directory}/.opencode/auto-commit.settings.yml`
        
        const newSettings: Partial<AutoCommitSettings> = {
          mode: args.mode ? ZAutoCommitMode.parse(args.mode) : "worktree",
          maxCommitLength: args.maxCommitLength ?? 10000,
        }
        
        if (args.commitModel) {
          newSettings.commitModel = args.commitModel
        }
        
        const yamlContent = yaml.stringify(newSettings)
        await Bun.write(settingsPath, yamlContent)
        
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "info",
            message: "Initialized auto-commit settings file",
            extra: { settingsPath, settings: newSettings },
          },
        })
        
        return JSON.stringify(newSettings, null, 2)
      } catch (error) {
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "error",
            message: "Failed to initialize settings file",
            extra: { error: error instanceof Error ? error.message : String(error) },
          },
        })
        throw new Error(`Failed to initialize: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  })
  
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      
      await client.app.log({
        body: {
          service: "opencode-autocommit",
          level: "info",
          message: "Session idle event received",
          extra: { mode: settings.mode },
        },
      })
      
      if (settings.mode === "disabled") {
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "info",
            message: "Auto-commit disabled",
          },
        })
        return
      }
      
      const isInWorktree = await isWorktree($, worktree)
      
      await client.app.log({
        body: {
          service: "opencode-autocommit",
          level: "info",
          message: "Checked if in worktree",
          extra: { isInWorktree, mode: settings.mode },
        },
      })
      
      if (settings.mode === "worktree" && !isInWorktree) {
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "info",
            message: "Not in worktree, skipping commit",
          },
        })
        return
      }
      
      const { sessionID } = event.properties
      
      await client.app.log({
        body: {
          service: "opencode-autocommit",
          level: "info",
          message: "Fetching session messages",
          extra: { sessionID },
        },
      })
      
      const response = await client.session.messages({ path: { id: sessionID } })
      const messages = response.data ?? []
      
      const turn = getLastTurn(messages)
      
      if (!turn) {
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "info",
            message: "No turn found in messages",
          },
        })
        return
      }
      
      if (turn.userMessageID === lastCommittedTurnID) {
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "info",
            message: "Turn already committed, skipping",
            extra: { userMessageID: turn.userMessageID },
          },
        })
        return
      }
      
      lastCommittedTurnID = turn.userMessageID
      
      await client.app.log({
        body: {
          service: "opencode-autocommit",
          level: "info",
          message: "Processing new turn",
          extra: { userMessageID: turn.userMessageID },
        },
      })
      
      const hasUncommittedChanges = await hasChanges($)
      if (!hasUncommittedChanges) {
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "info",
            message: "No changes to commit",
          },
        })
        return
      }
      
      await client.app.log({
        body: {
          service: "opencode-autocommit",
          level: "info",
          message: "Found uncommitted changes, generating commit summary",
        },
      })
      
      try {
        const summary = await generateCommitSummary(turn, settings, client)
        
        const commitMessage = `${summary}

## User Prompt
${turn.userPrompt}

## LLM Response
${turn.assistantResponse}`
        
        await client.app.log({
          body: {
            service: "opencode-autocommit",
            level: "info",
            message: "Created commit message",
            extra: { summary, messageLength: commitMessage.length },
          },
        })
        
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
      initAutoCommit: initTool,
    },
  }
}
