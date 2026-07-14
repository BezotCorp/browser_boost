import { BrowserBoost } from '../src/browser_boost';
import { ChatGptSite } from '../src/sites/chatgpt_site';
import '../src/styles.css';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  runAt: 'document_start',
  main() {
    console.log('[BrowserBoost] content script started');
    const app = new BrowserBoost(new ChatGptSite());
    console.log('[BrowserBoost] instance created, calling start()');
    app.start();
    console.log('[BrowserBoost] start() called without throwing');
  },
});
