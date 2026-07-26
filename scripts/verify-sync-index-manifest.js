const manifest = require('../cloudfunctions/database-indexes.json')

const expected = new Map([
  ['checkin_operations', ['_openid', 'idempotencyKey']],
  ['daily_checkin_states', ['_openid', 'userHabitId', 'date']],
  ['user_habits', ['_openid', 'userHabitId']],
  ['habit_policy_versions', ['_openid', 'policyVersionId']],
  ['habit_sync_operations', ['_openid', 'idempotencyKey']]
])
const failures = []

for (const [collection, fields] of expected) {
  const index = manifest.indexes.find(item => item.collection === collection)
  if (!index) {
    failures.push(`${collection}: missing index`)
    continue
  }
  if (index.unique !== true) failures.push(`${collection}: index must be unique`)
  if (JSON.stringify(index.fields) !== JSON.stringify(fields)) {
    failures.push(`${collection}: expected fields ${fields.join(', ')}`)
  }
}

if (manifest.indexes.length !== expected.size) {
  failures.push(`expected ${expected.size} indexes, got ${manifest.indexes.length}`)
}

if (failures.length) {
  console.error('Sync index manifest check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Sync index manifest check passed.')
