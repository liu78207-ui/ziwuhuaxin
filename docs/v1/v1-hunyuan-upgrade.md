# V1 Hunyuan Upgrade

This note records the CloudBase Hunyuan upgrade state for V1.

## Official Upgrade Target

CloudBase Mini Program Growth Plan calls must stop using the deprecated
`hunyuan-exp` provider. New calls should use:

- provider: `hunyuan-v3`
- model: `hy3-preview`
- OpenAI-compatible base URL suffix: `/v1/ai/hunyuan-v3`

Official guide: https://docs.cloudbase.net/ai/ai-inspire-plan-upgrade

## Current Repository Status

As of this upgrade, the V1 codebase has no active Hunyuan AI call site:

- no `hunyuan-exp`
- no `hunyuan-v3`
- no `hy3-preview`
- no `wx.cloud.extend.AI`
- no OpenAI-compatible CloudBase AI base URL

Therefore no runtime AI provider string was changed in application code.

## Local Mini Program Upgrade

The WeChat base library in project config is raised to `3.15.1` so that a
future Mini Program `wx.cloud.extend.AI` integration follows the current
CloudBase AI guide baseline instead of the old `2.29.2` simulator runtime.

Files:

- `project.config.json`
- `project.private.config.json`

## Future AI Rule

If V1 or a later phase adds Hunyuan AI, the call must stay outside the core
check-in, habit, sync, recovery, and report paths. AI failures must degrade
without blocking the core loop.

Allowed examples:

```js
await ai.streamText({
  provider: 'hunyuan-v3',
  model: 'hy3-preview',
  messages
})
```

```js
const baseURL = `https://${envId}.api.tcloudbasegateway.com/v1/ai/hunyuan-v3`
const model = 'hy3-preview'
```

Do not introduce `hunyuan-exp` again.
