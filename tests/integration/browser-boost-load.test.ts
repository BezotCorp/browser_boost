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
  message.textContent = `Message ${index} `.repeat(20);
  return message;
}

function createHeavyMessageContent(index: number): HTMLElement {
  const wrapper = document.createElement('article');
  wrapper.dataset.messageAuthorRole = index % 2 === 0 ? 'user' : 'assistant';

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
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    document.body.innerHTML = '';

    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return this.textContent ?? '';
      },
    });

    HTMLElement.prototype.getBoundingClientRect = function () {
      const textLength = (this.textContent ?? '').length;
      const height = Math.max(80, Math.min(2400, Math.ceil(textLength / 18)));

      return {
        x: 0,
        y: 0,
        width: 800,
        height,
        top: 0,
        right: 800,
        bottom: height,
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

    await vi.waitFor(
      () => {
        const placeholders = document.querySelectorAll('.browser-boost-placeholder');
        expect(placeholders.length).toBeGreaterThanOrEqual(1000);
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

    await vi.waitFor(
      () => {
        const placeholders = document.querySelectorAll('.browser-boost-placeholder');
        expect(placeholders.length).toBeGreaterThanOrEqual(500);
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
        const before = document.querySelectorAll('.browser-boost-placeholder').length;
        expect(before).toBeGreaterThan(0);
      },
      {
        timeout: 5000,
        interval: 50,
      },
    );

    const before = document.querySelectorAll('.browser-boost-placeholder').length;
    const firstPlaceholder = document.querySelector<HTMLButtonElement>('.browser-boost-placeholder');

    if (!firstPlaceholder) {
      throw new Error('Missing placeholder');
    }

    firstPlaceholder.click();

    const after = document.querySelectorAll('.browser-boost-placeholder').length;
    expect(after).toBe(before - 1);
  });
});
