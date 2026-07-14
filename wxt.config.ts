import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'BrowserBoost',
    description: 'Optimize heavy web applications locally. First target: long ChatGPT conversations.',
    host_permissions: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    browser_specific_settings: {
      gecko: {
        id: 'browserboost@bezotcorp.com',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
