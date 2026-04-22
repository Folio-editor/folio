import { useEffect, useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { useWriterId } from './useWriterId';

interface DictionarySourceRow {
  name: string;
  content?: string | null;
}

const EMPTY_SQL = "SELECT '' AS name WHERE 0";
const TOKEN_PATTERN = /[0-9A-Za-z가-힣][0-9A-Za-z가-힣._'-]*/g;
const MAX_DICTIONARY_WORDS = 2400;
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const STOP_WORDS = new Set([
  '그리고',
  '그러나',
  '하지만',
  '그런데',
  '세계관',
  '등장인물',
  '설정',
  '문서',
  '내용',
  '이름',
  '인물',
  '사람',
  '장소',
  '조직',
  '지역',
  '관계',
  '이야기',
  '설명',
  '기록',
  '정리',
  '기본',
  '사용',
  '정도',
  '경우',
  '현재',
  '이후',
  '당시',
  '대한',
  '있는',
  '없는',
  '통해',
  '위해',
]);

const COMMON_SUFFIXES = [
  '에',
  '에서',
  '에게',
  '한테',
  '께',
  '께서',
  '의',
  '도',
  '만',
  '뿐',
  '뿐만',
  '처럼',
  '같이',
  '마다',
  '부터',
  '까지',
  '조차',
  '마저',
  '라도',
  '이나',
  '나',
  '보다',
  '로',
  '으로',
  '로는',
  '으로는',
  '로도',
  '으로도',
  '로만',
  '으로만',
] as const;

const COPULA_SUFFIXES = [
  '아',
  '야',
  '이다',
  '입니다',
  '이었다',
  '였습니다',
  '이었습니다',
  '였다',
  '이었다',
  '이야',
  '야말로',
  '이며',
  '이면',
  '이라',
  '이라고',
  '이라고는',
  '이라고도',
  '이라고만',
  '이라고서',
  '라는',
  '라는건',
  '라는게',
  '라는건데',
  '라는데',
  '라는게',
  '라는걸',
  '인',
  '인데',
  '인데도',
  '인데다',
  '인지는',
  '인채로',
  '일',
  '일까',
  '일지',
  '일수록',
  '이라서',
  '이라도',
  '이라면',
  '이란',
  '이란건',
  '이란게',
  '이란다',
] as const;

const VERB_LIKE_SUFFIXES = [
  '처럼',
  '같다',
  '같은',
  '같았다',
  '같아서',
  '같으면',
  '스럽다',
  '스럽고',
  '스러운',
  '스러워',
  '스러웠다',
  '답다',
  '답고',
  '다운',
  '다워',
  '다웠다',
  '하다',
  '하고',
  '하며',
  '하면',
  '해서',
  '했다',
  '했던',
  '했었다',
  '하겠다',
  '하겠지',
  '해도',
  '해선',
  '해야',
  '하게',
  '한',
  '할',
  '함',
] as const;

const CHAINED_SUFFIXES = [
  '는',
  '은',
  '도',
  '만',
  '까지',
  '부터',
  '처럼',
  '같이',
  '라도',
  '라서',
  '라면',
  '라고',
  '라는',
  '인데',
  '인데도',
  '였다',
  '이었다',
  '이야',
  '야',
] as const;

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';

  const value = node as { text?: string; content?: unknown[] };
  if (typeof value.text === 'string') return value.text;
  if (Array.isArray(value.content)) return value.content.map(collectText).join(' ');

  return '';
}

function extractPlainText(raw: string | null | undefined): string {
  if (!raw) return '';

  try {
    return collectText(JSON.parse(raw)).trim();
  } catch {
    return raw.trim();
  }
}

function tokenize(raw: string): string[] {
  return raw.match(TOKEN_PATTERN) ?? [];
}

function shouldKeepToken(word: string): boolean {
  if (!word) return false;
  if (/^\d+$/.test(word)) return false;
  if (STOP_WORDS.has(word)) return false;

  const hasKorean = /[가-힣]/.test(word);
  const hasLatin = /[A-Za-z]/.test(word);

  if (hasKorean && word.length < 2) return false;
  if (hasLatin && !hasKorean && word.length < 3) return false;

  return true;
}

function hasFinalConsonant(word: string): boolean | null {
  const lastChar = word[word.length - 1];
  if (!lastChar) return null;

  const code = lastChar.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return null;

  return ((code - HANGUL_BASE) % 28) !== 0;
}

function buildPrimaryVariants(word: string): string[] {
  const variants = new Set<string>([word]);

  if (!/[가-힣]/.test(word) || word.length < 2) {
    return Array.from(variants);
  }

  const hasBatchim = hasFinalConsonant(word);
  if (hasBatchim === true) {
    variants.add(`${word}이`);
    variants.add(`${word}은`);
    variants.add(`${word}을`);
    variants.add(`${word}과`);
    variants.add(`${word}으로`);
    variants.add(`${word}이야`);
  } else if (hasBatchim === false) {
    variants.add(`${word}가`);
    variants.add(`${word}는`);
    variants.add(`${word}를`);
    variants.add(`${word}와`);
    variants.add(`${word}로`);
    variants.add(`${word}야`);
  }

  variants.add(`${word}에`);
  variants.add(`${word}에서`);
  variants.add(`${word}에게`);
  variants.add(`${word}의`);
  variants.add(`${word}도`);
  variants.add(`${word}만`);
  variants.add(`${word}처럼`);
  variants.add(`${word}까지`);
  variants.add(`${word}이다`);
  variants.add(`${word}였다`);
  variants.add(`${word}이었다`);

  return Array.from(variants);
}

function buildSecondaryVariants(word: string): string[] {
  const variants = new Set<string>();

  if (!/[가-힣]/.test(word) || word.length < 2) {
    return [];
  }

  const hasBatchim = hasFinalConsonant(word);
  if (hasBatchim === true) {
    variants.add(`${word}으론`);
    variants.add(`${word}이란`);
    variants.add(`${word}이랑`);
  } else if (hasBatchim === false) {
    variants.add(`${word}란`);
    variants.add(`${word}랑`);
  }

  for (const suffix of COMMON_SUFFIXES) {
    variants.add(`${word}${suffix}`);
  }

  for (const suffix of COPULA_SUFFIXES) {
    variants.add(`${word}${suffix}`);
  }

  for (const suffix of VERB_LIKE_SUFFIXES) {
    variants.add(`${word}${suffix}`);
  }

  const firstPass = Array.from(variants);
  for (const base of firstPass) {
    if (base.length > word.length + 8) continue;
    for (const suffix of CHAINED_SUFFIXES) {
      variants.add(`${base}${suffix}`);
    }
  }

  return Array.from(variants);
}

function buildDictionaryWords(sources: DictionarySourceRow[]): string[] {
  const guaranteedWords = new Set<string>();
  const candidateCounts = new Map<string, number>();

  for (const source of sources) {
    for (const token of tokenize(source.name ?? '')) {
      const word = token.trim();
      if (!shouldKeepToken(word)) continue;
      guaranteedWords.add(word);
    }

    for (const token of tokenize(extractPlainText(source.content))) {
      const word = token.trim();
      if (!shouldKeepToken(word)) continue;
      candidateCounts.set(word, (candidateCounts.get(word) ?? 0) + 1);
    }
  }

  const words = new Set<string>(guaranteedWords);
  for (const [word, count] of candidateCounts) {
    if (count >= 2) {
      words.add(word);
    }
  }

  const primaryWords = new Set<string>();
  const secondaryWords = new Set<string>();

  for (const word of words) {
    for (const variant of buildPrimaryVariants(word)) {
      primaryWords.add(variant);
    }
    for (const variant of buildSecondaryVariants(word)) {
      if (!primaryWords.has(variant)) {
        secondaryWords.add(variant);
      }
    }
  }

  const orderedPrimary = Array.from(primaryWords).sort((a, b) => a.localeCompare(b, 'ko'));
  if (orderedPrimary.length >= MAX_DICTIONARY_WORDS) {
    return orderedPrimary.slice(0, MAX_DICTIONARY_WORDS);
  }

  const orderedSecondary = Array.from(secondaryWords).sort((a, b) => a.localeCompare(b, 'ko'));
  return [...orderedPrimary, ...orderedSecondary].slice(0, MAX_DICTIONARY_WORDS);
}

export function useSpellCheckerDictionarySync(workId: string | null) {
  const writerId = useWriterId();

  const { data: worldNotes = [] } = useQuery<DictionarySourceRow>(
    workId && writerId
      ? `SELECT name, content
         FROM world_note
         WHERE work_id = ? AND writer_id = ?`
      : EMPTY_SQL,
    workId && writerId ? [workId, writerId] : [],
  );

  const { data: characters = [] } = useQuery<DictionarySourceRow>(
    workId && writerId
      ? `SELECT name
         FROM character
         WHERE work_id = ? AND writer_id = ?`
      : EMPTY_SQL,
    workId && writerId ? [workId, writerId] : [],
  );

  const dictionaryWords = useMemo(
    () => buildDictionaryWords([...worldNotes, ...characters]),
    [characters, worldNotes],
  );

  useEffect(() => {
    if (window.folio.platform !== 'electron') return;

    void window.folio.spellcheck.syncDictionaryWords(dictionaryWords);
  }, [dictionaryWords]);
}
