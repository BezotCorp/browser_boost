export interface SiteAdapter {
  readonly name: string;

  canRun(): boolean;
  findConversationRoot(): HTMLElement | null;
  findMessages(): HTMLElement[];
  extractMessagesFromMutation(records: MutationRecord[]): HTMLElement[];
}
