const fs = require('fs');
const path = require('path');

describe('about page nav back alignment', () => {
  const pageDir = path.join(__dirname, '../../../miniprogram/pages/about');

  test('back button uses fixed viewport positioning and menu button style binding', () => {
    const wxml = fs.readFileSync(path.join(pageDir, 'about.wxml'), 'utf8');
    const wxss = fs.readFileSync(path.join(pageDir, 'about.wxss'), 'utf8');
    const js = fs.readFileSync(path.join(pageDir, 'about.js'), 'utf8');

    expect(wxml).toContain('class="nav-back" style="{{navBackStyle}}"');
    expect(wxml).toContain('class="nav-title-wrap" style="{{navTitleStyle}}"');
    expect(wxml).toContain('background-color: rgba(244, 246, 248, {{navBgOpacity}});');
    expect(wxml).toContain('bindscroll="onAboutScroll"');
    expect(wxml.indexOf('class="nav-back"')).toBeLessThan(wxml.indexOf('class="nav-header"'));
    expect(js).toContain('wx.getMenuButtonBoundingClientRect()');
    expect(js).toContain('navBgOpacity: 0');
    expect(js).toContain('onAboutScroll(e)');
    expect(js).toContain('Math.min(scrollTop / maxScroll, 1)');
    expect(js).toContain('navTitleStyle: getNavTitleStyle(menuLayout)');
    expect(js).toContain('return `top: ${layout.top}px; height: ${layout.height}px; width: ${layout.height}px;`;');
    expect(js).toContain('return `top: ${layout.top}px; height: ${layout.height}px; line-height: ${layout.height}px;`;');
    expect(wxss).toMatch(/\.nav-back\s*\{[^}]*position:\s*fixed;/s);
    expect(wxss).toMatch(/\.nav-title-wrap\s*\{[^}]*position:\s*fixed;/s);
    expect(wxss).toMatch(/\.nav-back\s*\{[^}]*top:\s*48px;/s);
    expect(wxss).not.toMatch(/\.nav-back\s*\{[^}]*position:\s*absolute;/s);
    expect(wxss).not.toMatch(/\.nav-back\s*\{[^}]*top:\s*96px;/s);
    expect(wxss).not.toMatch(/\.nav-back\s*\{[^}]*env\(safe-area-inset-top\)/s);
  });
});
