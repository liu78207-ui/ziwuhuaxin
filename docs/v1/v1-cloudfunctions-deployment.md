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

## Smoke Tests

After deployment, use Developer Tools to test these functions:

```json
{ "name": "login", "data": {} }
{ "name": "getUserProfile", "data": {} }
{ "name": "migrateV1Data", "data": { "dryRun": true } }
{ "name": "recoverData", "data": {} }
{ "name": "syncLocalData", "data": {} }
```

Expected results:

- `login` returns `success: true`, `userId`, and `createdAt`
- `login` must not return `openid`
- `getUserProfile` returns `success: true`
- `migrateV1Data` returns `success: true`; run `{}` once `dryRun` counts look correct
- `recoverData` returns `success: true`
- startup no longer logs `FUNCTION_NOT_FOUND`
- profile login can create or read a `users` document

## Non-Goals

This gate does not change report rules, cache invalidation, state machines, or
AI behavior. `migrateV1Data` only materializes the V1 data model described in
`docs/architecture/migration-plan.md` by reading legacy collections and writing
the target collections idempotently.
