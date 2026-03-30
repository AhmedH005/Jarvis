import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist-verify')
const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')

rmSync(distDir, { recursive: true, force: true })

try {
  run(process.execPath, [tscBin, '-p', path.join(root, 'tsconfig.verify.json')])
  rewriteAliasImports(distDir)

  const testDir = path.join(distDir, 'tests')
  const testFiles = existsSync(testDir)
    ? collectFiles(testDir).filter((file) => file.endsWith('.test.js')).sort()
    : []

  if (testFiles.length === 0) {
    throw new Error('No compiled verification tests were found in dist-verify/tests.')
  }

  run(process.execPath, ['--test', ...testFiles])
} finally {
  rmSync(distDir, { recursive: true, force: true })
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function collectFiles(directory) {
  const entries = readdirSync(directory).sort()
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...collectFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }

  return files
}

function rewriteAliasImports(directory) {
  for (const file of collectFiles(directory)) {
    if (!file.endsWith('.js')) continue

    const source = readFileSync(file, 'utf8')
    const updated = source
      .replace(/require\(["']@\/([^"']+)["']\)/g, (_, specifier) => {
        return `require("${relativeSpecifier(file, specifier)}")`
      })
      .replace(/import\(["']@\/([^"']+)["']\)/g, (_, specifier) => {
        return `import("${relativeSpecifier(file, specifier)}")`
      })

    if (updated !== source) {
      writeFileSync(file, updated)
    }
  }
}

function relativeSpecifier(fromFile, aliasedSpecifier) {
  const target = path.join(distDir, 'src', aliasedSpecifier)
  let relative = path.relative(path.dirname(fromFile), target).replace(/\\/g, '/')
  if (!relative.startsWith('.')) relative = `./${relative}`
  return relative
}
