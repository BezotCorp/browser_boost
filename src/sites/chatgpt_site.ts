import type { SiteAdapter } from './site_adapter';

const MESSAGE_SELECTOR = '[data-message-author-role]';

export class ChatGptSite implements SiteAdapter {
  readonly name = 'ChatGPT';

  canRun(): boolean {
    return location.hostname === 'chatgpt.com' || location.hostname === 'chat.openai.com';
  }

  findConversationRoot(): HTMLElement | null {
    return document.querySelector('main') ?? document.body;
  }

  findMessages(): HTMLElement[] {
    return this.filterMessages([...document.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR)]);
  }

  extractMessagesFromMutation(records: MutationRecord[]): HTMLElement[] {
    const messages: HTMLElement[] = [];

    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        if (node.matches(MESSAGE_SELECTOR)) {
          messages.push(node);
          continue;
        }

        messages.push(...node.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR));
      }
    }

    return this.filterMessages(messages);
  }

  private filterMessages(messages: HTMLElement[]): HTMLElement[] {
    const seen = new Set<HTMLElement>();

    return messages.filter((message) => {
      if (seen.has(message)) return false;
      seen.add(message);

      if (message.dataset.browserBoostPlaceholder === 'true') return false;

      const text = message.textContent?.trim() ?? '';
      return text.length > 0;
    });
  }
}
