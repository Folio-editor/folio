import {
  BotMessageSquare,
  ClipboardCopy,
  FileStack,
  Lightbulb,
  PanelsTopLeft,
} from 'lucide-react';
import type { RightPanelTab } from '../../../types/workspace';

/** 우측 패널 4개 탭 메타. RightPanels.tsx (탭 행) + RightPanelHeader.tsx (라벨 lookup) 공유. */
export const TABS: { key: RightPanelTab; icon: typeof FileStack; label: string }[] = [
  { key: 'docs', icon: PanelsTopLeft, label: '문서 뷰어' },
  { key: 'idea', icon: Lightbulb, label: '아이디어' },
  { key: 'ai', icon: BotMessageSquare, label: 'AI 도구' },
  { key: 'inbox', icon: ClipboardCopy, label: '작업물' },
];
