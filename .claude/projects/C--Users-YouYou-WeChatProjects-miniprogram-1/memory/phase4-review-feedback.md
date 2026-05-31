---
name: phase4-review-feedback
description: Phase 4 验收反馈模式 — 每次提交后需要用 git diff 严格查看，不能用裸 git diff
metadata:
  type: feedback
---

每次 code review 反馈后，检查项必须包含 git diff 的范围而不是裸 git diff。

**Why:** 上次 review 中，我用 `node --check` 和 `npm test` 验证了修复，但 reviewer 指出"严格查看 `git diff 4d171a83^..4d171a83`，未使用裸 `git diff` 作为依据"——说明 reviewer 是按 commit 范围 diff 验证的，而非工作区状态。

**How to apply:** 当 reviewer 给出反馈后，在修复前先用 `git diff <commit>^..<commit>` 确认变更范围是否符合预期，再开始修改代码。