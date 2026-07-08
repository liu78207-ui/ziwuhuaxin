const fs = require('fs')
const path = require('path')

describe('runtime environment badge', () => {
  const pages = ['home', 'habits', 'stats', 'profile']

  test.each(pages)('%s page has test environment badge mount point', (pageName) => {
    const wxml = fs.readFileSync(
      path.join(__dirname, `../../../miniprogram/pages/${pageName}/${pageName}.wxml`),
      'utf8'
    )

    expect(wxml).toContain('class="env-badge"')
    expect(wxml).toContain('wx:if="{{showEnvBadge}}"')
    expect(wxml).toContain('{{envBadgeText}}')
  })
})
