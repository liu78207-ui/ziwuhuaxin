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

## Non-Goals

This gate does not change report rules, cache invalidation, state machines, or
AI behavior. `migrateV1Data` only materializes the V1 data model described in
`docs/architecture/migration-plan.md` by reading legacy collections and writing
the target collections idempotently.
