import type { Editor } from '@tiptap/react';

const registry = new Map<string, Editor>();

export function registerEditor(itemId: string, editor: Editor): void {
  registry.set(itemId, editor);
}

export function unregisterEditor(itemId: string, editor: Editor): void {
  if (registry.get(itemId) === editor) registry.delete(itemId);
}

export function getRegisteredEditor(itemId: string): Editor | null {
  return registry.get(itemId) ?? null;
}
