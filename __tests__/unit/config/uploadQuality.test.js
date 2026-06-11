const fs = require('fs');
const path = require('path');

const miniprogramRoot = path.join(__dirname, '../../../miniprogram');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(miniprogramRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(miniprogramRoot, relativePath), 'utf8');
}

describe('wechat upload quality config', () => {
  test('enables required component lazy loading for package checks', () => {
    const appConfig = readJson('app.json');

    expect(appConfig.lazyCodeLoading).toBe('requiredComponents');
  });

  test('page component declarations are used in matching WXML files', () => {
    const appConfig = readJson('app.json');

    appConfig.pages.forEach(pagePath => {
      const pageConfigPath = `${pagePath}.json`;
      const pageWxmlPath = `${pagePath}.wxml`;
      const pageConfig = readJson(pageConfigPath);
      const pageWxml = readText(pageWxmlPath);
      const usingComponents = pageConfig.usingComponents || {};

      Object.keys(usingComponents).forEach(componentName => {
        expect(pageWxml).toMatch(new RegExp(`<${componentName}(\\s|>|/)`));
      });
    });
  });

  test('does not use deprecated system info APIs in miniprogram javascript', () => {
    function walk(dir) {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return walk(fullPath);
        }
        return fullPath.endsWith('.js') ? [fullPath] : [];
      });
    }

    const offenders = walk(miniprogramRoot).filter(file => {
      const content = fs.readFileSync(file, 'utf8');
      return content.includes('wx.getSystemInfoSync') || content.includes('wx.getSystemInfo(');
    });

    expect(offenders).toEqual([]);
  });
});
