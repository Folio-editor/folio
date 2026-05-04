import { useCallback } from 'react';
import { usePowerSync } from '@powersync/react';
import { useLocalWrite } from './useLocalWrite';
import {
  ONBOARDING_WORK,
  ONBOARDING_PLAN_NOTE,
  ONBOARDING_PLAN_META,
  ONBOARDING_CHARACTERS,
  ONBOARDING_CHARACTER_COMMON_NOTE,
  ONBOARDING_FORESHADOW,
  ONBOARDING_EPISODES,
  ONBOARDING_IDEAS,
  ONBOARDING_WORLD_NOTES,
  ONBOARDING_PLOTS,
} from '../constants/onboardingContent';

/**
 * 신규 가입자가 OnboardingGuideDialog 에서 "샘플 작품 만들기" 를 눌렀을 때 호출되는 시드 훅.
 *
 * 작품 1 + 기획 노트 1 + 세계관 트리(부모×N + 자식×N) + 캐릭터 3(intro + 공통노트 + 개별노트)
 * + 플롯 막 2(각 막당 자식 회차 3) + 복선 2(+ foreshadow_link) + 회차 3 + 아이디어 3 일괄 INSERT.
 *
 * 회차 ↔ 플롯 1막 자식 회차는 plot_episode_link 로 1:1 연결되며,
 * 복선은 ONBOARDING_FORESHADOW[i].links 의 episodeKey/plotKey 를 시드 시 보존된 ID 배열로
 * 해석해 foreshadow_link 행을 만든다.
 *
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

    // 3. 세계관 트리 — 부모 노트 N개 + 각 부모 아래 자식 1개
    for (let i = 0; i < ONBOARDING_WORLD_NOTES.length; i++) {
      const w = ONBOARDING_WORLD_NOTES[i];
      const parentId = await localWrite.createWorldNote(workId, w.name, i * 1000, null, w.content);
      for (let j = 0; j < w.children.length; j++) {
        const child = w.children[j];
        await localWrite.createWorldNote(workId, child.name, j * 1000, parentId, child.content);
      }
    }

    // 4. 캐릭터 + intro 본문 + 공통 노트 + 개별 노트
    for (let i = 0; i < ONBOARDING_CHARACTERS.length; i++) {
      const c = ONBOARDING_CHARACTERS[i];
      const charId = await localWrite.createCharacter(workId, c.name, c.gender, c.age, i * 1000);
      // Plan C 머지 후 ensureCharacterNotes / createCharacterNote 시그니처 앞에 workId 인자가 추가됨.
      // 호출처가 따라가지 못하면 character_id 자리에 workId 또는 title 평문이 들어가
      // (1) NOT NULL 위반 (2) "Invalid UUID string: 관계도" 두 에러로 발현된다.
      await localWrite.ensureCharacterNotes(workId, charId);
      // ensureCharacterNotes 는 ID 를 반환하지 않으므로 인라인 SELECT 로 intro note id 조회
      const r = await db.execute(
        `SELECT id FROM character_note WHERE character_id = ? AND kind = 'intro' LIMIT 1`,
        [charId],
      );
      const introId = (r.rows?._array as { id: string }[] | undefined)?.[0]?.id;
      if (introId) {
        await localWrite.updateCharacterNoteContent(introId, c.introContent);
      }
      // 공통 하위 노트 (모든 캐릭터 공통)
      await localWrite.createCharacterNote(
        workId,
        charId,
        ONBOARDING_CHARACTER_COMMON_NOTE.title,
        1000,
        ONBOARDING_CHARACTER_COMMON_NOTE.content,
      );
      // 개별 하위 노트 (캐릭터별 고유)
      await localWrite.createCharacterNote(
        workId,
        charId,
        c.individualNote.title,
        2000,
        c.individualNote.content,
      );
    }

    // 5. 플롯 — 막(Act) 2개 + 각 막 아래 자식 회차 3개. 자식 ID는 후속 단계의
    //    linkPlotEpisode/foreshadow_link 매핑을 위해 plotChildIds[actIdx][epIdx] 로 보존.
    const plotChildIds: string[][] = [];
    for (let i = 0; i < ONBOARDING_PLOTS.length; i++) {
      const plot = ONBOARDING_PLOTS[i];
      const actId = await localWrite.createPlot(workId, plot.title, i * 1000, null, plot.content);
      const childIds: string[] = [];
      for (let j = 0; j < plot.episodes.length; j++) {
        const ep = plot.episodes[j];
        const childId = await localWrite.createPlot(workId, ep.title, j * 1000, actId, ep.content);
        childIds.push(childId);
      }
      plotChildIds.push(childIds);
    }

    // 6. 복선 — ID 보존 (foreshadow_link 시드에 사용)
    const foreshadowIds: string[] = [];
    for (let i = 0; i < ONBOARDING_FORESHADOW.length; i++) {
      const f = ONBOARDING_FORESHADOW[i];
      const fId = await localWrite.createForeshadow(workId, f.title, f.importance, i * 1000);
      await localWrite.updateForeshadow(fId, { status: f.status, content: f.content });
      foreshadowIds.push(fId);
    }

    // 7. 회차 3개 (TipTap JSON 본문 포함). ID 보존 — 플롯 1막 자식 회차와 1:1 연결.
    const episodeIds: string[] = [];
    for (let i = 0; i < ONBOARDING_EPISODES.length; i++) {
      const e = ONBOARDING_EPISODES[i];
      const epId = await localWrite.createEpisode(workId, e.title, i * 1000, e.content);
      episodeIds.push(epId);
    }

    // 8. 플롯 ↔ 회차 연결 — 1막의 자식 회차(1-1, 1-2, 1-3) ↔ 실제 원고(1화, 2화, 3화) 1:1.
    const firstActChildren = plotChildIds[0] ?? [];
    for (let k = 0; k < episodeIds.length && k < firstActChildren.length; k++) {
      await localWrite.linkPlotEpisode(firstActChildren[k], episodeIds[k]);
    }

    // 9. 복선 링크 — ONBOARDING_FORESHADOW[i].links 정의를 episode/plot ID 로 해석해 INSERT.
    for (let i = 0; i < ONBOARDING_FORESHADOW.length; i++) {
      const f = ONBOARDING_FORESHADOW[i];
      const fId = foreshadowIds[i];
      for (const lk of f.links) {
        const epId = lk.episodeKey !== null ? (episodeIds[lk.episodeKey] ?? null) : null;
        let plId: string | null = null;
        if (lk.plotKey !== null) {
          const [actStr, epStr] = lk.plotKey.split('-');
          const actIdx = Number(actStr);
          const epIdx = Number(epStr);
          plId = plotChildIds[actIdx]?.[epIdx] ?? null;
        }
        if (epId === null && plId === null) continue; // 매핑 실패 방어 — link 없는 INSERT 차단
        await localWrite.createForeshadowLink(fId, lk.linkType, epId, plId, lk.memo);
      }
    }

    // 10. 아이디어 아카이브
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
