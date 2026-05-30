# Habit lifecycle and cache restore fix

## Scope

This fix addresses the coupled habit lifecycle issues around deleting, re-adding, clearing WeChat cache, restoring from cloud data, and keeping Home, Habits, and Stats pages consistent.

## Root Cause

The current report logic already supports soft-deleted habits and historical due days, but the restore path and strategy metadata path had gaps:

1. The Habits page only rebuilt catalog checked state from local `MyHabits`. When WeChat cache was cleared, it could render the catalog before cloud restore finished, so added habits appeared unchecked and the "My" tab stayed empty.
2. The frontend `saveStrategy` cloud call only sent strategy frequency fields. Cloud `user_strategies` therefore lacked `habit_title`, `category`, `icon_url`, `theme_class`, and `target_minutes`, which made cache rebuilds incomplete.
3. Re-adding a soft-deleted strategy cleared `deleted_at` and `deletedAt`, but not `deletedDate` or `deleted_date`. Those stale fields could make restored data still look deleted.
4. `syncLocalData` restored `AllHabitsInfo` without enough strategy fields to reconstruct deleted/re-added historical report segments.

## Fix Strategy

- `miniprogram/pages/habits/habits.js`
  - `loadUserHabitsStatus` is now async and triggers `app.restoreLocalDataFromCloud()` when local `MyHabits` is empty.
  - `saveStrategy` now sends catalog metadata to `saveStrategy`, and clears the local pending save operation after successful direct cloud save.

- `cloudfunctions/saveStrategy/index.js`
  - Persists catalog metadata on create and update.
  - Persists `freq_category`.
  - Clears all deletion markers on re-add: `deleted_at`, `deletedAt`, `deletedDate`, and `deleted_date`.

- `cloudfunctions/syncLocalData/index.js`
  - Restores `target_minutes`, deletion date aliases, strategy frequency fields, plan start date, and strategy versions into both `MyHabits` and `AllHabitsInfo`.

## Verified Scenarios

- Delete a daily habit after an unchecked historical due day: historical report rows and denominator remain available through the existing report tests.
- Delete then re-add: stale deletion fields are cleared in cloud strategy data, and historical strategy boundaries remain available through `AllHabitsInfo` and `strategyVersions`.
- Clear WeChat cache: Home, Habits, and Stats can restore from cloud before rendering empty state.
- Add from the habit library after cache restore: catalog metadata is persisted and restored, so Home, Habits "My", library checked state, and Stats can derive the same habit state.

## Verification Commands

```bash
npm test -- __tests__/unit/pages/habits-real-actions.test.js --runInBand --coverage=false
npm test -- __tests__/integration/cloudfunctions/deletion-policy.test.js --runInBand --coverage=false
npm test -- __tests__/unit/utils/reportCalculator.test.js __tests__/unit/app.test.js __tests__/unit/pages/habits-real-actions.test.js __tests__/unit/pages/home-real.test.js __tests__/unit/pages/stats-real.test.js --runInBand --coverage=false
npm test -- --runInBand
```

Final full verification result:

- Test suites: 33 passed, 33 total
- Tests: 386 passed, 386 total
- Coverage: statements 88.08%, branches 75.38%, functions 97.18%, lines 92.73%

## Notes

The repository already contained broad in-progress changes related to soft deletion, cloud restore, report calculation, and page state. This document records the additional targeted changes made to close the cache restore and re-add metadata gaps without reversing existing work.
