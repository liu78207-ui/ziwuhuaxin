const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

const scanFiles = [
  'cloudfunctions/recoverData/index.js',
  'cloudfunctions/syncCheckin/index.js',
  'cloudfunctions/syncHabit/index.js',
  'miniprogram/pages/habits/habits.js',
  'miniprogram/services/checkinService.js',
  'miniprogram/services/habitService.js',
  'miniprogram/services/syncService.js'
]

const forbiddenPatterns = [
  /\bHabit_Id\b/g,
  /\bhabit_Id\b/g,
  /\bhabit_id\b/g,
  /\buser_habit_id\b/g,
  /\bpolicy_version_id\b/g,
  /\bcheckin_date\b/g,
  /\bfreq_type\b/g,
  /\bfreq_rules\b/g,
  /\bplan_start_date\b/g,
  /\bsync_status\b/g,
  /\blockedReason\b/g,
  /\bsyncStatus\b/g,
  /\bisDeleted\b/g
]

function findLine(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

const failures = []

for (const relativePath of scanFiles) {
  const filePath = path.join(root, relativePath)
  if (!fs.existsSync(filePath)) {
    failures.push(`${relativePath}: file is missing`)
    continue
  }

  const content = fs.readFileSync(filePath, 'utf8')
  for (const pattern of forbiddenPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      failures.push(`${relativePath}:${findLine(content, match.index)} forbidden legacy field "${match[0]}"`)
    }
  }
}

if (failures.length > 0) {
  console.error('Field naming check failed:')
  failures.forEach(item => console.error(`- ${item}`))
  process.exit(1)
}

console.log('Field naming check passed.')
console.log('V1 main path fields use lowerCamelCase canonical names.')
