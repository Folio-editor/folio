// ============================================================
// 추출 파이프라인 — payload + options → Block[] → 포맷별 결과
// ============================================================
// 어댑터(Electron Main, Web)는 이 모듈만 호출하면 되도록 통합한다.
// 결과 직렬화(파일 쓰기/Blob 다운로드/printToPDF/window.print)는 어댑터 책임.
// ============================================================

import { Document } from 'docx';
import type {
  ExportFormat,
  ExportOptions,
  ExportPayload,
  ExportScope,
  EpisodeSnapshot,
} from '../types/export';
import type { Block } from './tiptap/blocks';
import { buildCoverPage, formatDate } from './templates/coverPage';
import { buildEpisodeBundle } from './templates/episodeBundle';
import {
  buildToc,
  buildEpisodeTocItems,
  type TocSection,
} from './templates/toc';
import { buildSettingsBundle } from './templates/settingsBundle';
import { blocksToTxt } from './formatters/txt';
import { blocksToDocxDocument } from './formatters/docx';
import {
  blocksToPrintHtml,
  type HtmlForPrintOptions,
} from './formatters/htmlForPrint';

export interface RenderInput {
  scope: ExportScope;
  format: ExportFormat;
  options: ExportOptions;
  payload: ExportPayload;
}

export type RenderOutput =
  | { format: 'txt'; text: string }
  | { format: 'docx'; document: Document }
  | { format: 'pdf'; html: string };

export function buildBlocks(input: RenderInput): Block[] {
  const { scope, options, payload } = input;
  const out: Block[] = [];

  if (options.includeCoverPage) {
    out.push(
      ...buildCoverPage({
        title: payload.work.title,
        ...(payload.work.description ? { subtitle: payload.work.description } : {}),
        author: payload.author.name,
        date: formatDate(),
      }),
    );
  }

  // 에피소드 기반 추출
  if (scope.kind === 'work' || scope.kind === 'episodes' || scope.kind === 'episode') {
    const episodes = filterEpisodesForScope(scope, payload.episodes ?? []);

    if (options.includeToc && episodes.length > 1) {
      const tocSections: TocSection[] = [
        { header: '본문', items: buildEpisodeTocItems(episodes) },
      ];
      out.push(...buildToc(tocSections));
    }

    out.push(
      ...buildEpisodeBundle(episodes, {
        includeAuthorNote: options.includeAuthorNote,
      }),
    );
  } else if (scope.kind === 'planSet') {
    if (options.includeToc) {
      const sections: TocSection[] = [];
      const tryAdd = (header: string, count: number) => {
        if (count > 0) sections.push({ header, items: [{ depth: 0, label: '본문 참조' }] });
      };
      // 기획 섹션은 work 의 장르/분위기 메타 또는 planNotes 가 있으면 표시.
      tryAdd(
        '기획',
        ((payload.work?.genres?.length ?? 0) > 0 ? 1 : 0) +
          ((payload.work?.moods?.length ?? 0) > 0 ? 1 : 0) +
          (payload.planNotes?.length ?? 0),
      );
      tryAdd('인물', payload.characters?.length ?? 0);
      tryAdd('플롯', payload.plots?.length ?? 0);
      tryAdd('복선', payload.foreshadows?.length ?? 0);
      tryAdd('세계관', payload.worldNotes?.length ?? 0);
      tryAdd('아이디어', payload.ideaArchives?.length ?? 0);
      if (sections.length > 0) out.push(...buildToc(sections));
    }

    out.push(
      ...buildSettingsBundle(
        {
          // 장르·분위기 표시는 work 직속 컬럼에서 읽으므로 work 도 함께 전달.
          work: payload.work,
          ...(payload.planNotes ? { planNotes: payload.planNotes } : {}),
          ...(payload.characters ? { characters: payload.characters } : {}),
          ...(payload.characterNotes ? { characterNotes: payload.characterNotes } : {}),
          ...(payload.characterCustomFields
            ? { characterCustomFields: payload.characterCustomFields }
            : {}),
          ...(payload.plots ? { plots: payload.plots } : {}),
          ...(payload.plotEpisodeLinks
            ? { plotEpisodeLinks: payload.plotEpisodeLinks }
            : {}),
          ...(payload.worldNotes ? { worldNotes: payload.worldNotes } : {}),
          ...(payload.foreshadows ? { foreshadows: payload.foreshadows } : {}),
          ...(payload.foreshadowLinks
            ? { foreshadowLinks: payload.foreshadowLinks }
            : {}),
          ...(payload.ideaArchives ? { ideaArchives: payload.ideaArchives } : {}),
          ...(payload.episodes ? { episodes: payload.episodes } : {}),
        },
        { includeAuthorNote: options.includeAuthorNote },
      ),
    );
  }

  return out;
}

export function renderToFormat(input: RenderInput): RenderOutput {
  const blocks = buildBlocks(input);

  switch (input.format) {
    case 'txt':
      return { format: 'txt', text: blocksToTxt(blocks) };
    case 'docx':
      return { format: 'docx', document: blocksToDocxDocument(blocks) };
    case 'pdf': {
      const htmlOptions: HtmlForPrintOptions = {
        pageSize: input.options.pageSize,
        fontFamily: input.options.fontFamily,
        documentTitle: input.payload.work.title,
      };
      return { format: 'pdf', html: blocksToPrintHtml(blocks, htmlOptions) };
    }
  }
}

function filterEpisodesForScope(
  scope: ExportScope,
  all: EpisodeSnapshot[],
): EpisodeSnapshot[] {
  switch (scope.kind) {
    case 'work':
      return all;
    case 'episodes': {
      const ids = new Set(scope.episodeIds);
      // 선택된 에피소드 + 그들의 모든 조상 + 후손은 포함하지 않음(사용자가 선택한 회차만)
      return all.filter((ep) => ids.has(ep.id));
    }
    case 'episode': {
      return all.filter((ep) => ep.id === scope.episodeId);
    }
    case 'planSet':
      return [];
  }
}
