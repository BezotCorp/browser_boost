import type { SiteAdapter } from './site_adapter';

export class ChatGptSite implements SiteAdapter {
  readonly name = 'ChatGPT';

  canRun(): boolean {
    return location.hostname === 'chatgpt.com' || location.hostname === 'chat.openai.com';
  }

  findConversationRoot(): HTMLElement | null {
    return document.querySelector('main') ?? document.body;
  }

  findMessages(): HTMLElement[] {
    const messages = [...document.querySelectorAll<HTMLElement>('[data-message-author-role]')];

    return messages.filter((message) => {
      if (message.dataset.browserBoostPlaceholder === 'true') return false;

      const rect = message.getBoundingClientRect();
      const text = message.innerText.trim();

      return rect.width > 0 && rect.height > 0 && text.length > 0;
    });
  }
}
