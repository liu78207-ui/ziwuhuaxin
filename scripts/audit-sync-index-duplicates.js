const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const manifest = require(path.join(root, 'cloudfunctions/database-indexes.json'))
const snapshotPath = process.argv[2]

if (!snapshotPath) {
  console.error('Usage: node scripts/audit-sync-index-duplicates.js <cloud-export.json>')
  console.error('The JSON object must map collection names to exported document arrays.')
  process.exit(1)
}

const absoluteSnapshotPath = path.resolve(process.cwd(), snapshotPath)
const snapshot = JSON.parse(fs.readFileSync(absoluteSnapshotPath, 'utf8'))
const audit = []

for (const index of manifest.indexes) {
  const records = Array.isArray(snapshot[index.collection]) ? snapshot[index.collection] : []
  const groups = new Map()
  for (const record of records) {
    const values = index.fields.map(field => record[field])
    if (values.some(value => value === undefined || value === null || value === '')) continue
    const key = JSON.stringify(values)
    const ids = groups.get(key) || []
    ids.push(record._id || '(missing _id)')
    groups.set(key, ids)
  }
  const duplicates = [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ values: JSON.parse(key), documentIds: ids }))
  audit.push({
    collection: index.collection,
    index: index.name,
    fields: index.fields,
    scanned: records.length,
    duplicates
  })
}

console.log(JSON.stringify({
  dryRun: true,
  source: absoluteSnapshotPath,
  audit
}, null, 2))

if (audit.some(result => result.duplicates.length > 0)) {
  process.exitCode = 2
}
