import { useCallback } from 'react';
import { usePowerSync } from '@powersync/react';
import { useLocalWrite } from './useLocalWrite';
import {
  ONBOARDING_WORK,
  ONBOARDING_PLAN_NOTE,
  ONBOARDING_PLAN_META,
  ONBOARDING_CHARACTERS,
  ONBOARDING_FORESHADOW,
  ONBOARDING_EPISODES,
  ONBOARDING_IDEAS,
} from '../constants/onboardingContent';

/**
 * 신규 가입자가 OnboardingGuideDialog 에서 "샘플 작품 만들기" 를 눌렀을 때 호출되는 시드 훅.
 *
 * 작품 1 + 기획 노트 1 + 세계관 5(템플릿) + 캐릭터 2 + 복선 1 + 회차 3 + 아이디어 3 일괄 INSERT.
 * PowerSync 가 모든 INSERT 를 자동으로 서버로 동기화한다.
 *
 * 호출 결과는 새 작품의 workId — 호출처에서 setSelectedWorkId 로 자동 진입에 사용.
 */
export function useOnboardingSeed() {
  const localWrite = useLocalWrite();
  const db = usePowerSync();

  const seed = useCallback(async (): Promise<string> => {
    // 1. 작품 + 메타
    const workId = await localWrite.createWork(ONBOARDING_WORK.title);
    await localWrite.updateWork(workId, {
      author_name: ONBOARDING_WORK.authorName,
      description: ONBOARDING_WORK.description,
    });

    // 2. 기획 메타 (장르/분위기 태그 — 작품 홈에 노출) + 기획 노트 1개
    const planId = await localWrite.ensurePlan(workId);
    await localWrite.updatePlan(planId, {
      genres: JSON.stringify(ONBOARDING_PLAN_META.genres),
      moods: JSON.stringify(ONBOARDING_PLAN_META.moods),
    });
    await localWrite.createPlanNote(
      workId,
      ONBOARDING_PLAN_NOTE.title,
      0,
      ONBOARDING_PLAN_NOTE.content,
    );

    // 3. 세계관 5 템플릿 (시대/공간/세력/규칙/연표)
    await localWrite.ensureWorldNoteTemplates(workId);

    // 4. 캐릭터 2명 + intro note 본문 채우기
    for (let i = 0; i < ONBOARDING_CHARACTERS.length; i++) {
      const c = ONBOARDING_CHARACTERS[i];
      const charId = await localWrite.createCharacter(workId, c.name, c.gender, c.age, i * 1000);
      await localWrite.ensureCharacterNotes(charId);
      // ensureCharacterNotes 는 ID 를 반환하지 않으므로 인라인 SELECT 로 intro note id 조회
      const r = await db.execute(
        `SELECT id FROM character_note WHERE character_id = ? AND kind = 'intro' LIMIT 1`,
        [charId],
      );
      const introId = (r.rows?._array as { id: string }[] | undefined)?.[0]?.id;
      if (introId) {
        await localWrite.updateCharacterNoteContent(introId, c.introContent);
      }
    }

    // 5. 복선 — createForeshadow 는 status/content 없이 INSERT 후 updateForeshadow 로 보강
    for (let i = 0; i < ONBOARDING_FORESHADOW.length; i++) {
      const f = ONBOARDING_FORESHADOW[i];
      const fId = await localWrite.createForeshadow(workId, f.title, f.importance, i * 1000);
      await localWrite.updateForeshadow(fId, { status: f.status, content: f.content });
    }

    // 6. 회차 3개 (TipTap JSON 본문 포함)
    for (let i = 0; i < ONBOARDING_EPISODES.length; i++) {
      const e = ONBOARDING_EPISODES[i];
      await localWrite.createEpisode(workId, e.title, i * 1000, e.content);
    }

    // 7. 아이디어 아카이브
    for (let i = 0; i < ONBOARDING_IDEAS.length; i++) {
      const idea = ONBOARDING_IDEAS[i];
      await localWrite.createIdea(workId, idea.content, idea.tag, i * 1000);
    }

    return workId;
    // localWrite/db 는 매 렌더에서 새 객체이지만 내부 함수 안정성 보장되어 useCallback deps 생략
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { seed };
}
