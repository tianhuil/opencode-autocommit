# OpenCode CLI: Check Installed Plugins

**Date**: 2026-02-15
**Topic**: How to determine which plugins are installed in OpenCode via CLI

---

## Executive Summary

- **No dedicated CLI command exists** to list installed plugins in OpenCode
- Plugins are automatically loaded from directories and config files
- Manual inspection of plugin directories and config files is required
- `opencode debug config` shows configuration but does not include a "plugin" section

---

## Detailed Findings

### Plugin Loading Mechanism

OpenCode loads plugins from multiple sources in the following order:

1. **Global config** (`~/.config/opencode/opencode.json`) - Plugins specified via npm packages
2. **Project config** (`opencode.json`) - Plugins specified via npm packages
3. **Global plugin directory** (`~/.config/opencode/plugins/`) - Local plugin files
4. **Project plugin directory** (`.opencode/plugins/`) - Local plugin files

### Plugin Types

1. **npm plugins**: Specified in config files under the `"plugin"` field
2. **Local plugins**: JavaScript/TypeScript files placed in plugin directories

---

## Available CLI Commands

### What Exists

The OpenCode CLI has the following commands (as of v1.2.4):

- `opencode completion` - Generate shell completion script
- `opencode acp` - Start ACP server
- `opencode mcp` - Manage MCP servers (NOT plugins)
- `opencode attach` - Attach to running server
- `opencode run` - Run OpenCode with a message
- `opencode debug` - Debugging tools
- `opencode auth` - Manage credentials
- `opencode agent` - Manage agents
- `opencode upgrade` - Upgrade OpenCode
- `opencode uninstall` - Uninstall OpenCode
- `opencode serve` - Start headless server
- `opencode web` - Start web server
- `opencode models` - List available models
- `opencode stats` - Show usage statistics
- `opencode export` - Export session data
- `opencode import` - Import session data
- `opencode github` - Manage GitHub agent
- `opencode pr` - Fetch and checkout GitHub PR
- `opencode session` - Manage sessions
- `opencode db` - Database tools

### What Does NOT Exist

- ❌ `opencode plugin` - No dedicated plugin command
- ❌ `opencode plugin list` - No plugin listing command
- ❌ `opencode plugins` - No plugins command
- ❌ `opencode plugin show` - No plugin details command

---

## Manual Plugin Detection Methods

### Method 1: Check Project Plugin Directory

```bash
# List local project plugins
ls -la .opencode/plugins/

# Example output:
# -rw-r--r--  1 user  staff  8102 Feb 15 13:02 autocommit.ts
```

### Method 2: Check Global Plugin Directory

```bash
# List global plugins
ls -la ~/.config/opencode/plugins/
```

**Note**: The global plugin directory may not exist if no global plugins are installed.

### Method 3: Check Config File for npm Plugins

```bash
# View config file (may include plugin array)
cat ~/.config/opencode/opencode.json
cat opencode.json
```

Example config with npm plugins:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-helicone-session",
    "opencode-wakatime",
    "@my-org/custom-plugin"
  ]
}
```

### Method 4: Use Debug Config (Limited)

```bash
opencode debug config
```

**Limitation**: This shows configuration including MCP servers and tools, but does not currently display a "plugin" section in the output, even when plugins are loaded from directories.

---

## Database Investigation

Checked the OpenCode database for plugin-related tables:

```bash
opencode db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Resulting tables:
- `control_account`
- `message`
- `part`
- `permission`
- `project`
- `session`
- `session_share`
- `todo`

**Finding**: No dedicated plugin table exists in the database, suggesting plugins are not tracked in the database schema.

---

## Workaround Solutions

### Solution 1: Create a Shell Alias

Add to your shell profile (`.bashrc`, `.zshrc`, etc.):

```bash
# Alias to list all plugins
alias opencode-plugins='echo "=== Project Plugins ===" && ls -la .opencode/plugins/ 2>/dev/null || echo "None" && echo "" && echo "=== Global Plugins ===" && ls -la ~/.config/opencode/plugins/ 2>/dev/null || echo "None" && echo "" && echo "=== Config Plugins ===" && cat ~/.config/opencode/opencode.json 2>/dev/null | grep -A 10 '"plugin"' || echo "None"'
```

### Solution 2: Create a Simple Script

Create `~/.local/bin/opencode-plugins`:

```bash
#!/bin/bash

echo "OpenCode Installed Plugins"
echo "========================"
echo ""

# Project plugins
echo "Project Plugins (.opencode/plugins/):"
if [ -d ".opencode/plugins" ]; then
  ls -1 .opencode/plugins/
else
  echo "  (No project plugins directory)"
fi
echo ""

# Global plugins
echo "Global Plugins (~/.config/opencode/plugins/):"
if [ -d "$HOME/.config/opencode/plugins" ]; then
  ls -1 "$HOME/.config/opencode/plugins/"
else
  echo "  (No global plugins directory)"
fi
echo ""

# Config plugins
echo "Config Plugins (opencode.json):"
if [ -f "opencode.json" ]; then
  echo "  Project config:"
  grep -A 10 '"plugin"' opencode.json | grep -E '^\s*"' | sed 's/^/    /'
fi

if [ -f "$HOME/.config/opencode/opencode.json" ]; then
  echo "  Global config:"
  grep -A 10 '"plugin"' "$HOME/.config/opencode/opencode.json" | grep -E '^\s*"' | sed 's/^/    /'
fi
```

Make executable:
```bash
chmod +x ~/.local/bin/opencode-plugins
```

### Solution 3: Feature Request

Consider filing a feature request to add a `opencode plugin list` command.

Potential command interface:
```bash
opencode plugin list
opencode plugin list --verbose
opencode plugin show <plugin-name>
```

---

## Key Limitations

1. **No native CLI support** - OpenCode does not provide a built-in command to list plugins
2. **Manual inspection required** - Users must manually check directories and config files
3. **MCP vs Plugins confusion** - The `opencode mcp` command manages MCP servers, not plugins (these are different systems)
4. **Config output omission** - `debug config` does not currently display loaded plugins
5. **No plugin metadata** - No centralized tracking of plugin versions, status, or metadata

---

## Comparison with Similar Tools

| Tool | Plugin List Command | Example |
|-------|-------------------|----------|
| **VS Code** | `code --list-extensions` | Lists all installed extensions |
| **Homebrew** | `brew list` | Lists all installed formulae |
| **npm** | `npm list -g --depth=0` | Lists globally installed packages |
| **OpenCode** | ❌ **None** | Must manually check directories |

---

## References

- OpenCode Plugin Documentation: https://opencode.ai/docs/plugins/
- OpenCode CLI Documentation: https://opencode.ai/docs/cli/
- OpenCode Repository: https://github.com/anomalyco/opencode
- Plugin loading sources: `.opencode/plugins/`, `~/.config/opencode/plugins/`, `opencode.json`
