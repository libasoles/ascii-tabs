// Lighthouse CI: accessibility must score 100. Run once per theme with THEME=light|dark.
const dark = process.env.THEME === 'dark';

module.exports = {
  ci: {
    collect: {
      staticDistDir: '.',
      url: ['http://localhost/index.html'],
      numberOfRuns: 1,
      settings: {
        onlyCategories: ['accessibility'],
        // Blink's PreferredColorScheme enum: 0 = dark, 1 = light
        chromeFlags: `--headless=new --no-sandbox --blink-settings=preferredColorScheme=${dark ? 0 : 1}`,
      },
    },
    assert: {
      assertions: { 'categories:accessibility': ['error', { minScore: 1 }] },
    },
    upload: {
      target: 'filesystem',
      outputDir: `.lighthouseci/${dark ? 'dark' : 'light'}`,
    },
  },
};
