import { $ } from "bun"

const testDir = `/tmp/test-dir-${Date.now()}`

await $`mkdir -p ${testDir}`

// Check if directory exists using ls
const result = await $`ls -d ${testDir}`.quiet()
console.log("Directory exists?", result.exitCode === 0)

// Cleanup
await $`rm -rf ${testDir}`
