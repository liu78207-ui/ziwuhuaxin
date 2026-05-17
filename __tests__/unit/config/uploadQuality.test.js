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
});
