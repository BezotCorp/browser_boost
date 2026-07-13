import type { SiteAdapter } from './site_adapter';

const MESSAGE_SELECTOR = '[data-message-author-role]';
const TURN_SELECTOR = '[data-testid^="conversation-turn-"]';

export class ChatGptSite implements SiteAdapter {
  readonly name = 'ChatGPT';

  canRun(): boolean {
    return location.hostname === 'chatgpt.com' || location.hostname === 'chat.openai.com';
  }

  findConversationRoot(): HTMLElement | null {
    return document.querySelector('main') ?? document.body;
  }

  findMessages(): HTMLElement[] {
    const raw = [...document.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR)];
    return this.dedup(raw.map((el) => this.toTurn(el)));
  }

  extractMessagesFromMutation(records: MutationRecord[]): HTMLElement[] {
    const messages: HTMLElement[] = [];
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        for (const el of this.collectMatching(node, MESSAGE_SELECTOR)) {
          messages.push(this.toTurn(el));
        }
      }
    }
    return this.dedup(messages);
  }

  extractMessagesFromRemoval(records: MutationRecord[]): HTMLElement[] {
    const messages: HTMLElement[] = [];
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        messages.push(...this.collectMatching(node, TURN_SELECTOR));
      }
    }
    return this.dedup(messages);
  }

  // Factorisé depuis extractMessagesFromMutation/extractMessagesFromRemoval —
  // les deux répétaient "le noeud lui-même matche, ou cherche dans ses
  // descendants".
  private collectMatching(node: HTMLElement, selector: string): HTMLElement[] {
    return node.matches(selector) ? [node] : [...node.querySelectorAll<HTMLElement>(selector)];
  }

  private toTurn(el: HTMLElement): HTMLElement {
    return el.closest<HTMLElement>(TURN_SELECTOR) ?? el;
  }

  private dedup(messages: HTMLElement[]): HTMLElement[] {
    const seen = new Set<HTMLElement>();
    return messages.filter((el) => {
      if (seen.has(el)) return false;
      seen.add(el);
      return true;
    });
  }
}
