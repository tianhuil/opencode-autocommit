# opencode-autocommit design doc
I am building an opencode plugin called opencode-autocommit.  When enabled:

## General functionality
- Every time a user enters a prompt the message ensures that there are no changes (git status shows no files).  If there are changes, it rejects the prompt and asks the user to commit all changes.
- Every time and the AI finishes, the plugin intercepts the signal and commits all changes on the branch.

### worktrees
This needs to work with worktrees.  If the user is on a worktree, all changes apply to the worktree, not the main branch.


### Commit message!
The commit message takes the following format.  It is 3 sections separated by two newlines

```md
{summary}

## User Prompt
{user_prompt}

## LLM Response
{full LLM response}
```

The summary is a one line summary (10 words max) of this interaction (user prompt + llm response).

The user prompt is the verbatim user prompt

The LLM Response is the response of the LLM (verbatim)

## Settings
Here are the settings.  The type will be defined and validated by zod.

### `mode`:
- `'disabled'`: plugin is disabled
- `'worktree'`: plugin is enabled only on worktrees but not on the primary branch; this is the default value
- `'enable'`: plugin is enabled only on worktrees and the primary branch

### `commitModel`
This is the name of the model for opencode to use to generate a commit message.  If it is `undefined`, we should use whatever the current model is.

## Config File
If there is a `.opencode/auto-commit.config.yml` file, which contains the yml representation of the settings schema.  It will be read for validation and the values are used as initial settings (but values can be changed with slash commands and tools below).

## Slash commands
There is a slash command `/autocommit` which can be used to fetch the mode or set it.  It calls the tools listed below

## Tools
There is a tool `getSettings` and `setSettings`.
