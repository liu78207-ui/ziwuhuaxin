const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const cloudfunctionsRoot = path.join(root, 'cloudfunctions')
const manifestPath = path.join(cloudfunctionsRoot, 'v1-deploy-manifest.json')
const projectConfigPath = path.join(root, 'project.config.json')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function fail(message) {
  failures.push(message)
}

const failures = []

if (!fs.existsSync(projectConfigPath)) {
  fail('project.config.json is missing')
} else {
  const projectConfig = readJson(projectConfigPath)
  if (projectConfig.cloudfunctionRoot !== 'cloudfunctions/') {
    fail(`project.config.json cloudfunctionRoot must be "cloudfunctions/", got "${projectConfig.cloudfunctionRoot}"`)
  }
}

if (!fs.existsSync(manifestPath)) {
  fail('cloudfunctions/v1-deploy-manifest.json is missing')
}

const manifest = fs.existsSync(manifestPath)
  ? readJson(manifestPath)
  : { required: [], compatibility: [] }

const functionNames = [
  ...new Set([...(manifest.required || []), ...(manifest.compatibility || [])])
]

for (const name of functionNames) {
  const dir = path.join(cloudfunctionsRoot, name)
  const indexPath = path.join(dir, 'index.js')
  const packagePath = path.join(dir, 'package.json')

  if (!fs.existsSync(dir)) {
    fail(`cloud function directory missing: ${name}`)
    continue
  }

  if (!fs.existsSync(indexPath)) {
    fail(`${name}: index.js is missing`)
  }

  if (!fs.existsSync(packagePath)) {
    fail(`${name}: package.json is missing`)
    continue
  }

  const packageJson = readJson(packagePath)
  if (packageJson.name !== name) {
    fail(`${name}: package.json name must be "${name}", got "${packageJson.name}"`)
  }
  if (packageJson.main && packageJson.main !== 'index.js') {
    fail(`${name}: package.json main must be "index.js", got "${packageJson.main}"`)
  }
  if (!packageJson.dependencies || !packageJson.dependencies['wx-server-sdk']) {
    fail(`${name}: package.json must depend on wx-server-sdk`)
  }
}

if (failures.length > 0) {
  console.error('V1 cloud function deployment check failed:')
  for (const item of failures) {
    console.error(`- ${item}`)
  }
  process.exit(1)
}

console.log('V1 cloud function deployment check passed.')
console.log(`Required functions: ${(manifest.required || []).join(', ')}`)
console.log(`Compatibility functions: ${(manifest.compatibility || []).join(', ')}`)
