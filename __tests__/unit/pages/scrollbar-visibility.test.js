const fs = require('fs');
const path = require('path');

describe('page scrollbar visibility', () => {
  const rootDir = path.join(__dirname, '../../..');
  const miniprogramDir = path.join(rootDir, 'miniprogram');

  test('every registered page disables native page scrolling', () => {
    const appConfig = JSON.parse(fs.readFileSync(path.join(miniprogramDir, 'app.json'), 'utf8'));

    appConfig.pages.forEach((pagePath) => {
      const pageConfig = JSON.parse(fs.readFileSync(path.join(miniprogramDir, `${pagePath}.json`), 'utf8'));
      expect(pageConfig.disableScroll).toBe(true);
    });
  });

  test('every scroll-view hides its platform scrollbar', () => {
    const pagesDir = path.join(miniprogramDir, 'pages');
    const pageNames = fs.readdirSync(pagesDir);

    pageNames.forEach((pageName) => {
      const wxmlPath = path.join(pagesDir, pageName, `${pageName}.wxml`);
      if (!fs.existsSync(wxmlPath)) {
        return;
      }

      const wxml = fs.readFileSync(wxmlPath, 'utf8');
      const scrollViews = wxml.match(/<scroll-view\b[^>]*>/g) || [];

      scrollViews.forEach((tag) => {
        expect(tag).toMatch(/\benhanced=("{{true}}"|'{{true}}')/);
        expect(tag).toMatch(/\bshow-scrollbar=("{{false}}"|'{{false}}')/);
      });
    });
  });

  test('global page overflow and scrollbar fallbacks stay hidden', () => {
    const appWxss = fs.readFileSync(path.join(miniprogramDir, 'app.wxss'), 'utf8');

    expect(appWxss).toMatch(/page\s*\{[^}]*overflow:\s*hidden;/s);
    expect(appWxss).toMatch(/scroll-view::\-webkit-scrollbar[\s\S]*display:\s*none;/);
    expect(appWxss).toMatch(/scroll-view[\s\S]*scrollbar-width:\s*none;/);
  });
});
