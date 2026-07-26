# V1 Cloud Functions Deployment

This document turns the V1 cloud-side release requirement into an explicit
deployment gate.

## Why This Exists

Local cloud function source code does not mean the functions exist in the
current CloudBase environment. Runtime errors such as:

```text
errCode: -501000
FunctionName parameter could not be found
FUNCTION_NOT_FOUND
```

mean the mini program is calling a function that is missing from the bound
cloud environment, or the function was deployed to a different environment.

## Required V1 Functions

These functions are required for the V1 login, profile, sync, and recovery
chain:

- `login`
- `getUserProfile`
- `saveUserProfile`
- `migrateV1Data`
- `recoverData`
- `syncCheckin`
- `syncHabit`

## Compatibility Functions

Deploy these while legacy local-cache and historical sync paths remain in the
codebase:

- `syncLocalData`
- `doCheckin`
- `undoCheckin`
- `saveStrategy`
- `removeStrategy`
- `saveStrategyVersion`
- `getHabits`
- `getTodayTasks`
- `getStatsReport`
- `getCheckinLogsByRange`
- `getUserStrategies`
- `clearTestData`

`clearTestData` is a guarded maintenance function, not an ordinary user-facing
compatibility path. Deploy it only in environments where operators understand
the data cleanup blast radius.

The source of truth for this list is:

```text
cloudfunctions/v1-deploy-manifest.json
```

## Local Preflight

Run this before deploying:

```bash
npm run verify:cloudfunctions
```

The check verifies:

- `project.config.json` points to `cloudfunctions/`
- each V1 function directory exists
- each function has `index.js`
- each function has `package.json`
- each function depends on `wx-server-sdk`

## Manual Deployment

Use WeChat Developer Tools with the same AppID and CloudBase environment used
by the mini program.

1. Open this project in WeChat Developer Tools.
2. Confirm the cloud environment is the intended V1 environment.
3. In the cloud functions panel, upload and deploy each required function.
4. Run `migrateV1Data` with `{ "dryRun": true }`, then run it with `{}` after confirming the counts.
5. Deploy the compatibility functions if legacy paths are still active.
6. Recompile the mini program after deployment.

## Maintenance Function: clearTestData

`clearTestData` can clear user-owned data in the current CloudBase environment.
It is intentionally hard to run:

- Required environment variable: `CLEAR_USER_DATA_ADMIN_TOKEN`.
- Default behavior: `dryRun` is enabled unless `dryRun:false` is passed.
- Required request fields for full destructive cleanup:
  - `scope: "allUsers"`
  - `confirmPhrase: "CLEAR_ALL_USER_DATA"`
  - `adminToken` matching `CLEAR_USER_DATA_ADMIN_TOKEN`
- Required request fields for one-account cleanup:
  - `scope: "targetOpenid"`
  - `targetOpenid`
  - `confirmPhrase: "CLEAR_TARGET_USER_DATA"`
  - `adminToken` matching `CLEAR_USER_DATA_ADMIN_TOKEN`
- It targets V1 user data collections such as `users`, `user_habits`,
  `habit_policy_versions`, `checkin_operations`, `daily_checkin_states`,
  `sync_logs`, `conflict_logs`, `user_settings`, `ai_logs`, and legacy user
  collections.
- It must not delete global built-in catalog rows from `habits`; only rows with
  `_openid` are removable there.
- Missing collections are treated as skipped maintenance details, not as a
  reason to delete unrelated data.

Custom-habit-only cleanup is a narrower maintenance action for release cleanup
of test pollution. It never accepts `scope: "allUsers"` and only targets one
`targetOpenid`:

- Required request fields:
  - `action: "cleanupCustomHabitsForTargetOpenid"`
  - `targetOpenid`
  - `confirmPhrase: "DELETE_TARGET_CUSTOM_HABITS"`
  - `adminToken` matching `CLEAR_USER_DATA_ADMIN_TOKEN`
- It deletes only custom `user_habits` where `source === "custom"` or `habitId`
  starts with `custom_`.
- It also deletes only the matching `userHabitId` records in
  `habit_policy_versions`, `daily_checkin_states`, and `checkin_operations`.
- It must not delete built-in habits, `users`, settings, sync/conflict logs, AI
  logs, or global catalog rows.
- It paginates `user_habits` and chunks related `userHabitId` queries, so one
  run can cover accounts with more than one page of custom records.
- After the cloud dry-run returns `details.user_habits.matched: 0`, clear the
  test device's local cache and recover from cloud. For release cleanup, avoid a
  pre-clear pending sync if the device may still hold unsynced test custom data.

Full dry run example:

```json
{
  "name": "clearTestData",
  "data": {
    "scope": "allUsers",
    "confirmPhrase": "CLEAR_ALL_USER_DATA",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>"
  }
}
```

Full destructive example after reviewing dry run counts:

```json
{
  "name": "clearTestData",
  "data": {
    "scope": "allUsers",
    "confirmPhrase": "CLEAR_ALL_USER_DATA",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>",
    "dryRun": false
  }
}
```

Single-account dry run example:

```json
{
  "name": "clearTestData",
  "data": {
    "scope": "targetOpenid",
    "targetOpenid": "oCt9o12Rj50RtOaGiKKhwqf7QSMg",
    "confirmPhrase": "CLEAR_TARGET_USER_DATA",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>"
  }
}
```

Single-account destructive example after reviewing dry run counts:

```json
{
  "name": "clearTestData",
  "data": {
    "scope": "targetOpenid",
    "targetOpenid": "oCt9o12Rj50RtOaGiKKhwqf7QSMg",
    "confirmPhrase": "CLEAR_TARGET_USER_DATA",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>",
    "dryRun": false
  }
}
```

Custom-habit-only dry run example:

```json
{
  "name": "clearTestData",
  "data": {
    "action": "cleanupCustomHabitsForTargetOpenid",
    "targetOpenid": "oCt9o12Rj50RtOaGiKKhwqf7QSMg",
    "confirmPhrase": "DELETE_TARGET_CUSTOM_HABITS",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>"
  }
}
```

Custom-habit-only destructive example after reviewing dry run records and
counts:

```json
{
  "name": "clearTestData",
  "data": {
    "action": "cleanupCustomHabitsForTargetOpenid",
    "targetOpenid": "oCt9o12Rj50RtOaGiKKhwqf7QSMg",
    "confirmPhrase": "DELETE_TARGET_CUSTOM_HABITS",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>",
    "dryRun": false
  }
}
```

## Smoke Tests

After deployment, use Developer Tools to test these functions:

```json
{ "name": "login", "data": {} }
{ "name": "getUserProfile", "data": {} }
{ "name": "migrateV1Data", "data": { "dryRun": true } }
{ "name": "recoverData", "data": {} }
{ "name": "syncLocalData", "data": {} }
{ "name": "clearTestData", "data": { "scope": "allUsers", "confirmPhrase": "CLEAR_ALL_USER_DATA", "adminToken": "<token>" } }
{ "name": "clearTestData", "data": { "scope": "targetOpenid", "targetOpenid": "oCt9o12Rj50RtOaGiKKhwqf7QSMg", "confirmPhrase": "CLEAR_TARGET_USER_DATA", "adminToken": "<token>" } }
{ "name": "clearTestData", "data": { "action": "cleanupCustomHabitsForTargetOpenid", "targetOpenid": "oCt9o12Rj50RtOaGiKKhwqf7QSMg", "confirmPhrase": "DELETE_TARGET_CUSTOM_HABITS", "adminToken": "<token>" } }
```

Expected results:

- `login` returns `success: true`, `userId`, and `createdAt`
- `login` must not return `openid`
- `getUserProfile` returns `success: true`
- `migrateV1Data` returns `success: true`; run `{}` once `dryRun` counts look correct
- `recoverData` returns `success: true`
- startup no longer logs `FUNCTION_NOT_FOUND`
- profile login can create or read a `users` document
- `clearTestData` without `dryRun:false` returns counts and does not delete data
- `cleanupCustomHabitsForTargetOpenid` dry-run returns custom habit records and
  related counts without deleting data
- For release cleanup, repeat custom-habit-only dry-run after destructive cleanup
  until `details.user_habits.matched` is `0`, then clear the test device cache
  and restore from cloud

Emergency checkin repair uses the same maintenance function but never deletes or
updates existing documents. Use it only after checking CloudBase backup/export
or another device's local cache:

- `action: "repairTargetUserCheckins"`
- `targetOpenid`
- `confirmPhrase: "REPAIR_TARGET_USER_CHECKINS"`
- `adminToken` matching `CLEAR_USER_DATA_ADMIN_TOKEN`
- `dailyStates`: required array of missing built-in `daily_checkin_states`
- `checkinOperations`: optional array of matching `checkin_operations`
- Default dry-run reports `willInsert`, `skippedExisting`, and rejected records.
- It rejects custom `habitId` / `userHabitId` records and never accepts
  `scope: "allUsers"`.

Emergency repair dry run example:

```json
{
  "name": "clearTestData",
  "data": {
    "action": "repairTargetUserCheckins",
    "targetOpenid": "oCt9o12Rj50RtOaGiKKhwqf7QSMg",
    "confirmPhrase": "REPAIR_TARGET_USER_CHECKINS",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>",
    "dailyStates": [
      {
        "stateId": "state_repair_2026-07-07_uh_17",
        "userHabitId": "<built-in-userHabitId>",
        "habitId": "17",
        "date": "2026-07-07",
        "status": "checked",
        "checkedAt": 1783390000000,
        "lastOperationId": "op_repair_2026-07-07_uh_17"
      }
    ],
    "checkinOperations": [
      {
        "operationId": "op_repair_2026-07-07_uh_17",
        "idempotencyKey": "repair_2026-07-07_uh_17",
        "userHabitId": "<built-in-userHabitId>",
        "habitId": "17",
        "date": "2026-07-07",
        "action": "checkin",
        "source": "repair"
      }
    ]
  }
}
```

When existing states were overwritten to `canceled` or another non-checked
status, use the narrower built-in habit/date repair action. It resolves
`userHabitId` from `user_habits`, updates existing built-in daily states back to
`checked`, adds missing daily states, and writes repair operation records for
audit. It rejects custom habit IDs.

```json
{
  "name": "clearTestData",
  "data": {
    "action": "repairTargetBuiltinCheckinsByHabitDates",
    "targetOpenid": "oCt9o12Rj50RtOaGiKKhwqf7QSMg",
    "confirmPhrase": "REPAIR_TARGET_BUILTIN_CHECKINS",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>",
    "habitIds": ["12", "3", "17", "18", "21", "2"],
    "dates": ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]
  }
}
```

For evidence-based repair that includes custom habits, use
`repairTargetCheckinsFromManifest`. Every entry must contain the exact
`userHabitId`, `habitId`, business date, `status: "checked"`,
`evidenceSource`, and `evidenceRef`. The function validates ownership,
lifecycle, and the single policy version effective on that date. It defaults to
dry-run, skips existing checked states, and reports non-checked states as
conflicts unless the individual entry sets `overwriteExisting: true`.

```json
{
  "name": "clearTestData",
  "data": {
    "action": "repairTargetCheckinsFromManifest",
    "targetOpenid": "<target-openid>",
    "batchId": "repair-2026-07-confirmed",
    "confirmPhrase": "REPAIR_TARGET_CHECKINS_FROM_MANIFEST",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>",
    "entries": [
      {
        "userHabitId": "<exact-userHabitId>",
        "habitId": "<built-in-or-custom-habitId>",
        "date": "2026-07-22",
        "status": "checked",
        "evidenceSource": "screenshot",
        "evidenceRef": "shot-03",
        "overwriteExisting": false
      }
    ]
  }
}
```

Production execution additionally requires `dryRun:false`,
`allowProdMaintenance:true`, `backupConfirmed:true`, and
`prodConfirmPhrase:"ALLOW_PROD_MAINTENANCE_AFTER_BACKUP"`. Unknown `checkedAt`
must be omitted rather than fabricated.

When a confirmed manifest identifies cloud `checked` states that should be
uncompleted, use `cancelTargetCheckinsFromManifest`. This action never deletes
history. It requires each target state to currently be `checked`, writes an
`action:"undo"` repair operation first, then changes the daily final state to
`canceled`. Its deterministic idempotency key is
`repair_canceled_{userHabitId}_{date}`. Missing or non-checked states are
reported as conflicts; an already canceled target is skipped idempotently.

```json
{
  "name": "clearTestData",
  "data": {
    "action": "cancelTargetCheckinsFromManifest",
    "targetOpenid": "<target-openid>",
    "batchId": "cancel-repair-2026-07-confirmed",
    "confirmPhrase": "CANCEL_TARGET_CHECKINS_FROM_MANIFEST",
    "adminToken": "<CLEAR_USER_DATA_ADMIN_TOKEN>",
    "entries": [
      {
        "userHabitId": "<exact-userHabitId>",
        "habitId": "<built-in-or-custom-habitId>",
        "date": "2026-07-05",
        "status": "canceled",
        "evidenceSource": "spreadsheet",
        "evidenceRef": "7月打卡数据.xlsx:Sheet1!F2"
      }
    ]
  }
}
```

Use the same production guard fields as check-in repair. A successful
post-execution dry-run must report `willCancel:0`, every entry under
`skippedCanceled`, and no conflicts or rejected entries.

## Non-Goals

This gate does not change report rules, cache invalidation, state machines, or
AI behavior. `migrateV1Data` only materializes the V1 data model described in
`docs/architecture/migration-plan.md` by reading legacy collections and writing
the target collections idempotently.

## V1 Cloud Sync Release Order

This order is mandatory for the cloud-sync-only release:

1. Back up production data and record the backup identifier.
2. Run the index duplicate audit in dry-run mode. If duplicates are found, export the list and stop; the audit must never delete data.
3. Create and verify the unique indexes declared in `cloudfunctions/database-indexes.json`.
4. Deploy `syncCheckin`, `syncHabit`, `recoverData`, and the guarded maintenance/audit function.
5. Run preview multi-device smoke tests.
6. Release to a small production cohort and inspect `sync_logs` and `conflict_logs`.
7. Expand to full release only after all gates remain green.

The smoke suite must cover offline check-in recovery, repeated check-in/cancel,
opposite operations on two devices, policy update, deletion, clear-cache
recovery, and verification that no reminder entry exists.

Required unique indexes:

- `checkin_operations`: `_openid, idempotencyKey`
- `daily_checkin_states`: `_openid, userHabitId, date`
- `user_habits`: `_openid, userHabitId`
- `habit_policy_versions`: `_openid, policyVersionId`
- `habit_sync_operations`: `_openid, idempotencyKey`

After exporting the five target collections as one JSON object keyed by
collection name, run:

```bash
npm run audit:sync-index-duplicates -- /absolute/path/to/cloud-export.json
npm run verify:sync-indexes
```

The audit prints only a dry-run report and exits with status `2` when duplicate
groups exist. It never writes to CloudBase or changes the export.
