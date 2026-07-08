const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const miniprogramRoot = path.join(root, 'miniprogram')

const allowedDirectCloudFiles = new Set([
  path.join(miniprogramRoot, 'app.js'),
  path.join(miniprogramRoot, 'services', 'cloudService.js')
])

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
const files = walk(miniprogramRoot)

for (const filePath of files) {
  if (!allowedDirectCloudFiles.has(filePath)) {
    failures.push(...collectMatches(
      filePath,
      /\bwx\.cloud\.(?:init|database)\s*\(/g,
      match => `must use app.js/cloudService environment wrapper instead of ${match[0]}`
    ))
  }
}

const pageFiles = walk(path.join(miniprogramRoot, 'pages'))
for (const filePath of pageFiles) {
  failures.push(...collectMatches(
    filePath,
    /\bwx\.cloud\.callFunction\s*\(/g,
    match => `page must call cloudService/service layer instead of ${match[0]}`
  ))
}

if (failures.length > 0) {
  console.error('Cloud environment boundary check failed:')
  for (const item of failures) {
    console.error(`- ${item}`)
  }
  process.exit(1)
}

console.log('Cloud environment boundary check passed.')
