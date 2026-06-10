import { BrowserBoost } from './browser_boost';
import { ChatGptSite } from './sites/chatgpt_site';

const app = new BrowserBoost(new ChatGptSite());
app.start();
