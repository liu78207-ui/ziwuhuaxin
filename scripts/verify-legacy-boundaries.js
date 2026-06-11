const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

const cloudFunctionForbiddenNames = ['doCheckin', 'undoCheckin', 'getStatsReport']
const appLegacyForbiddenMethods = [
  'saveMyHabits',
  'saveCheckinLogs',
  'addCheckinLog',
  'removeCheckinLog',
  'syncToCloud'
]

const scanTargets = [
  path.join(root, 'miniprogram', 'pages'),
  path.join(root, 'miniprogram', 'services')
]

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return fullPath.endsWith('.js') ? [fullPath] : []
  })
}

function toRelative(filePath) {
  return path.relative(root, filePath)
}

function findLine(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function collectMatches(filePath, regex, message) {
  const content = fs.readFileSync(filePath, 'utf8')
  const matches = []
  let match
  while ((match = regex.exec(content)) !== null) {
    matches.push(`${toRelative(filePath)}:${findLine(content, match.index)} ${message(match)}`)
  }
  return matches
}

const failures = []
const files = scanTargets.flatMap(walk)

for (const filePath of files) {
  const cloudNames = cloudFunctionForbiddenNames.join('|')
  failures.push(...collectMatches(
    filePath,
    new RegExp(`(?:wx\\.cloud\\.callFunction|cloudService\\.callFunction)\\s*\\(\\s*['"](?:${cloudNames})['"]`, 'g'),
    match => `must not call legacy cloud function via ${match[0]}`
  ))
  failures.push(...collectMatches(
    filePath,
    new RegExp(`name\\s*:\\s*['"](?:${cloudNames})['"]`, 'g'),
    match => `must not reference legacy cloud function ${match[0]}`
  ))
}

const pageFiles = walk(path.join(root, 'miniprogram', 'pages'))
for (const filePath of pageFiles) {
  const legacyMethods = appLegacyForbiddenMethods.join('|')
  failures.push(...collectMatches(
    filePath,
    new RegExp(`getApp\\(\\)\\s*\\.\\s*(?:${legacyMethods})\\s*\\(`, 'g'),
    match => `page must not call app legacy helper ${match[0]}`
  ))
  failures.push(...collectMatches(
    filePath,
    new RegExp(`\\bapp\\s*\\.\\s*(?:${legacyMethods})\\s*\\(`, 'g'),
    match => `page must not call app legacy helper ${match[0]}`
  ))
}

if (failures.length > 0) {
  console.error('Legacy boundary check failed:')
  for (const item of failures) {
    console.error(`- ${item}`)
  }
  process.exit(1)
}

console.log('Legacy boundary check passed.')
console.log(`Forbidden legacy cloud functions: ${cloudFunctionForbiddenNames.join(', ')}`)
console.log(`Forbidden page app helpers: ${appLegacyForbiddenMethods.join(', ')}`)
