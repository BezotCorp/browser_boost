import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserBoost } from '../../src/browser_boost';
import type { SiteAdapter } from '../../src/sites/site_adapter';

const LIGHT_MESSAGE_COUNT = 40000;
const HEAVY_MESSAGE_COUNT = 1000;

class FakeChatGptAdapter implements SiteAdapter {
  readonly name = 'Fake ChatGPT';

  canRun(): boolean {
    return true;
  }

  findConversationRoot(): HTMLElement | null {
    return document.querySelector('main');
  }

  findMessages(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[data-message-author-role]')];
  }

  extractMessagesFromMutation(records: MutationRecord[]): HTMLElement[] {
    const messages: HTMLElement[] = [];

    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        if (node.hasAttribute('data-message-author-role')) {
          messages.push(node);
          continue;
        }

        messages.push(...node.querySelectorAll<HTMLElement>('[data-message-author-role]'));
      }
    }

    return messages;
  }
}

const HEAVY_CODE_BLOCK = `
\`\`\`ts
export class BrowserBoostStressExample {
  constructor(
    private readonly id: string,
    private readonly metadata: Record<string, unknown>,
  ) {}

  run(): void {
    const nodes = new Map<string, { id: string; weight: number; links: string[] }>();

    for (let index = 0; index < 250; index++) {
      nodes.set(\`\${this.id}-\${index}\`, {
        id: \`\${this.id}-\${index}\`,
        weight: Math.random(),
        links: Array.from({ length: 12 }, (_, linkIndex) => \`\${this.id}-link-\${linkIndex}\`),
      });
    }

    console.log('BrowserBoost stress run', this.id, nodes.size);
  }
}
\`\`\`
`;

const HEAVY_LOG_BLOCK = `
[INFO] scanning workspace /home/user/Projects/ecosystem/browser_boost
[INFO] loading manifest.json
[INFO] processing DOM nodes
[WARN] long conversation detected
[DEBUG] virtualizer.queue.size=39950
[DEBUG] renderer.batch.size=250
[TRACE] mutation observer notified childList subtree
`.repeat(8);

const HEAVY_TREE_BLOCK = `
browser_boost/
├── src/
│   ├── browser_boost.ts
│   ├── content.ts
│   ├── settings.ts
│   ├── dom/
│   │   ├── message_virtualizer.ts
│   │   └── virtualized_block.ts
│   └── sites/
│       ├── chatgpt_site.ts
│       └── site_adapter.ts
├── tests/
│   └── integration/
│       └── browser-boost-load.test.ts
├── manifest.json
├── package.json
└── README.md
`.repeat(6);

const HEAVY_JSON_BLOCK = JSON.stringify(
  {
    project: 'BrowserBoost',
    vendor: 'BezotCorp',
    mode: 'integration-load-test',
    permissions: [],
    host_permissions: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    metrics: {
      expectedCompaction: 'progressive',
      target: 'no initial UI freeze',
    },
    nested: Array.from({ length: 20 }, (_, index) => ({
      id: `node-${index}`,
      type: index % 2 === 0 ? 'user_message' : 'assistant_message',
      payload: {
        title: `Large payload ${index}`,
        content: `Heavy JSON payload ${index}. `.repeat(20),
      },
    })),
  },
  null,
  2,
);

function createLightMessageContent(index: number): HTMLElement {
  const message = document.createElement('article');
  message.dataset.messageAuthorRole = index % 2 === 0 ? 'user' : 'assistant';
  message.dataset.testTop = String(index * 100);
  message.dataset.testHeight = '80';
  message.textContent = `Message ${index} `.repeat(20);
  return message;
}

function createHeavyMessageContent(index: number): HTMLElement {
  const wrapper = document.createElement('article');
  wrapper.dataset.messageAuthorRole = index % 2 === 0 ? 'user' : 'assistant';
  wrapper.dataset.testTop = String(index * 900);
  wrapper.dataset.testHeight = '800';

  const title = document.createElement('h2');
  title.textContent = `Message ${index} — heavy ChatGPT-like payload`;

  const paragraph = document.createElement('p');
  paragraph.textContent = `Long discussion paragraph ${index}. `.repeat(120);

  const markdown = document.createElement('pre');
  markdown.textContent = [HEAVY_CODE_BLOCK, HEAVY_LOG_BLOCK, HEAVY_TREE_BLOCK, '```json', HEAVY_JSON_BLOCK, '```'].join(
    '\n',
  );

  const list = document.createElement('ul');

  for (let itemIndex = 0; itemIndex < 12; itemIndex++) {
    const item = document.createElement('li');
    item.textContent = `Nested DOM item ${itemIndex} for message ${index}: ${'deep node '.repeat(30)}`;
    list.appendChild(item);
  }

  wrapper.append(title, paragraph, markdown, list);

  return wrapper;
}

function createLargeChatGptLikeDom(messageCount: number, heavy: boolean): void {
  document.body.innerHTML = '<main id="conversation"></main>';

  const conversation = document.querySelector('#conversation');

  if (!conversation) {
    throw new Error('Missing conversation root');
  }

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < messageCount; index++) {
    fragment.appendChild(heavy ? createHeavyMessageContent(index) : createLightMessageContent(index));
  }

  conversation.appendChild(fragment);
}

describe('BrowserBoost load integration', () => {
  // IO callback exposed so tests can simulate visibility changes (e.g. restore).
  let ioCallback: ((entries: IntersectionObserverEntry[], obs: IntersectionObserver) => void) | null = null;
  let ioOptions: IntersectionObserverInit | undefined;

  // Simule un changement de visibilité pour un élément — utilisé pour tester le restore.
  function triggerIntersection(element: Element, isIntersecting: boolean): void {
    ioCallback?.(
      [
        {
          target: element,
          isIntersecting,
          boundingClientRect: element.getBoundingClientRect(),
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: performance.now(),
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  }

  // Compte les éléments actuellement compactés (content-visibility:hidden).
  function countCompacted(): number {
    return [...document.querySelectorAll<HTMLElement>('[data-message-author-role]')].filter(
      (el) => el.style.contentVisibility === 'hidden',
    ).length;
  }

  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    document.body.innerHTML = '';
    ioCallback = null;
    ioOptions = undefined;

    // IntersectionObserver — jsdom n'en a pas. Le mock calcule l'intersection
    // via getBoundingClientRect (déjà mocké ci-dessous) et fire synchroniquement.
    // Cela permet de vérifier la compaction sans dépendre d'un vrai layout engine.
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class MockIntersectionObserver {
      constructor(
        cb: (entries: IntersectionObserverEntry[], obs: IntersectionObserver) => void,
        options?: IntersectionObserverInit,
      ) {
        ioCallback = cb;
        ioOptions = options;
      }

      observe(element: Element): void {
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight || 800;
        const scrollY = window.scrollY || 0;
        const marginPct = ioOptions?.rootMargin ? parseInt(ioOptions.rootMargin) / 100 : 0;
        const buffer = viewportHeight * marginPct;
        const absTop = rect.top + scrollY;
        const absBottom = absTop + rect.height;
        const isIntersecting = absBottom >= scrollY - buffer && absTop <= scrollY + viewportHeight + buffer;

        ioCallback?.(
          [
            {
              target: element,
              isIntersecting,
              boundingClientRect: rect,
              intersectionRatio: isIntersecting ? 1 : 0,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: performance.now(),
            } as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver,
        );
      }

      unobserve(_element: Element): void {}
      disconnect(): void {}
    };

    // ResizeObserver — no-op : les hauteurs sont fixes via getBoundingClientRect.
    (globalThis as unknown as Record<string, unknown>).ResizeObserver = class MockResizeObserver {
      observe(_element: Element): void {}
      unobserve(_element: Element): void {}
      disconnect(): void {}
    };

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });

    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      value: 0,
    });

    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return this.textContent ?? '';
      },
    });

    HTMLElement.prototype.getBoundingClientRect = function () {
      const testTop = Number(this.dataset.testTop ?? '0');
      const explicitHeight = Number(this.dataset.testHeight ?? '0');
      const textLength = (this.textContent ?? '').length;
      const height = explicitHeight || Math.max(80, Math.min(2400, Math.ceil(textLength / 18)));

      return {
        x: 0,
        y: testTop,
        width: 800,
        height,
        top: testTop,
        right: 800,
        bottom: testTop + height,
        left: 0,
        toJSON() {
          return {};
        },
      };
    };
  });

  it('starts quickly and progressively compacts many ChatGPT-like messages', async () => {
    createLargeChatGptLikeDom(LIGHT_MESSAGE_COUNT, false);

    const app = new BrowserBoost(new FakeChatGptAdapter());

    const start = performance.now();
    app.start();
    const startupDurationMs = performance.now() - start;

    expect(document.querySelector('.browser-boost-toolbar')).not.toBeNull();
    expect(startupDurationMs).toBeLessThan(3000);

    // Les messages hors viewport (testTop > viewportHeight + buffer = 2000px)
    // sont compactés via content-visibility:hidden après le rAF de flushRegistration.
    // Avec testTop = index * 100, les messages 21+ sont hors range → ~39979 compactés.
    await vi.waitFor(
      () => {
        expect(countCompacted()).toBeGreaterThanOrEqual(1000);
      },
      {
        timeout: 5000,
        interval: 100,
      },
    );
  }, 10_000);

  it('starts quickly and progressively compacts very heavy ChatGPT-like messages', async () => {
    createLargeChatGptLikeDom(HEAVY_MESSAGE_COUNT, true);

    const app = new BrowserBoost(new FakeChatGptAdapter());

    const start = performance.now();
    app.start();
    const startupDurationMs = performance.now() - start;

    expect(document.querySelector('.browser-boost-toolbar')).not.toBeNull();
    expect(startupDurationMs).toBeLessThan(3000);

    // Avec testTop = index * 900, les messages 3+ sont hors range → ~997 compactés.
    await vi.waitFor(
      () => {
        expect(countCompacted()).toBeGreaterThanOrEqual(500);
      },
      {
        timeout: 5000,
        interval: 100,
      },
    );
  }, 10_000);

  it('restores a compacted heavy message', async () => {
    createLargeChatGptLikeDom(120, true);

    const app = new BrowserBoost(new FakeChatGptAdapter());
    app.start();

    await vi.waitFor(
      () => {
        expect(countCompacted()).toBeGreaterThan(0);
      },
      {
        timeout: 5000,
        interval: 50,
      },
    );

    const before = countCompacted();
    const target = [...document.querySelectorAll<HTMLElement>('[data-message-author-role]')].find(
      (el) => el.style.contentVisibility === 'hidden',
    );

    if (!target) throw new Error('No compacted message found');

    // Simule l'IO qui signale que l'élément est devenu visible (scroll vers lui).
    triggerIntersection(target, true);

    expect(countCompacted()).toBe(before - 1);
    expect(target.style.contentVisibility).toBe('');
  });
});
