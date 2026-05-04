package com.storyzip.ai.client.dto;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Plan C 옵션 1 — 운영자가 로그에서 평문 원고를 볼 수 없어야 한다.
 * record 기본 toString 이 모든 필드를 그대로 찍어버리는 함정을 차단한다.
 */
class AiRequestToStringMaskingTest {

    private static final String SECRET_STORYLINE = "주인공이 이번 화에서 흑막의 정체를 밝혀낸다";
    private static final String SECRET_USER_PROMPT = "이 화는 충격적인 반전으로 끝나야 한다";
    private static final String SECRET_BODY = "저는 정말로 살인범입니다. — 본문 1만자 평문";
    private static final String SECRET_NAME = "김흑막";
    private static final String SECRET_DESC = "주인공의 친한 친구로 위장한 살인자";

    @Nested
    @DisplayName("DraftRequest.toString")
    class DraftRequestToString {

        @Test
        @DisplayName("storyline / userPrompt / context 평문은 노출되지 않는다")
        void plaintextNotExposed() {
            DraftRequest req = new DraftRequest(
                    "work-1", "writer-1", "ep-1",
                    SECRET_STORYLINE, 5, "claude-opus-4-7",
                    SECRET_USER_PROMPT, payloadFixture()
            );

            String repr = req.toString();

            assertThat(repr).doesNotContain(SECRET_STORYLINE);
            assertThat(repr).doesNotContain(SECRET_USER_PROMPT);
            assertThat(repr).doesNotContain(SECRET_NAME);
            assertThat(repr).doesNotContain(SECRET_DESC);
        }

        @Test
        @DisplayName("운영 메타데이터(workId/writerId/episodeId/모델/길이)는 디버깅용으로 남는다")
        void operationalMetadataPreserved() {
            DraftRequest req = new DraftRequest(
                    "work-1", "writer-1", "ep-1",
                    SECRET_STORYLINE, 5, "claude-opus-4-7",
                    SECRET_USER_PROMPT, payloadFixture()
            );

            String repr = req.toString();

            assertThat(repr).contains("work-1");
            assertThat(repr).contains("writer-1");
            assertThat(repr).contains("ep-1");
            assertThat(repr).contains("currentEpisodeNum=5");
            assertThat(repr).contains("claude-opus-4-7");
            assertThat(repr).contains("storylineLen=" + SECRET_STORYLINE.length());
            assertThat(repr).contains("userPromptLen=" + SECRET_USER_PROMPT.length());
            assertThat(repr).contains("<redacted>");
        }

        @Test
        @DisplayName("null 컨텍스트도 안전하게 처리된다")
        void nullContextDoesNotCrash() {
            DraftRequest req = new DraftRequest(
                    "w", "wr", "e", null, 0, "m", null, null
            );
            String repr = req.toString();
            assertThat(repr).contains("storylineLen=0");
            assertThat(repr).contains("userPromptLen=0");
            assertThat(repr).contains("context=null");
        }
    }

    @Nested
    @DisplayName("ReviewRequest.toString")
    class ReviewRequestToString {

        @Test
        @DisplayName("본문(content) / 컨텍스트 평문은 노출되지 않는다")
        void plaintextNotExposed() {
            ReviewRequest req = new ReviewRequest(
                    "work-1", "writer-1", "ep-1",
                    SECRET_BODY, 5, payloadFixture()
            );

            String repr = req.toString();

            assertThat(repr).doesNotContain(SECRET_BODY);
            assertThat(repr).doesNotContain(SECRET_NAME);
            assertThat(repr).doesNotContain(SECRET_DESC);
        }

        @Test
        @DisplayName("운영 메타데이터는 디버깅용으로 남는다")
        void operationalMetadataPreserved() {
            ReviewRequest req = new ReviewRequest(
                    "work-1", "writer-1", "ep-1",
                    SECRET_BODY, 5, payloadFixture()
            );

            String repr = req.toString();

            assertThat(repr).contains("work-1");
            assertThat(repr).contains("ep-1");
            assertThat(repr).contains("episodeNumber=5");
            assertThat(repr).contains("contentLen=" + SECRET_BODY.length());
            assertThat(repr).contains("<redacted>");
        }
    }

    @Nested
    @DisplayName("AiContextPayload.toString — 본체 + 중첩 record")
    class PayloadToString {

        @Test
        @DisplayName("최상위 toString에서 모든 본문성 평문이 사라진다")
        void rootPayloadHidesAllPlaintext() {
            AiContextPayload payload = payloadFixture();
            String repr = payload.toString();

            assertThat(repr).doesNotContain(SECRET_NAME);
            assertThat(repr).doesNotContain(SECRET_DESC);
            assertThat(repr).contains("characters=1");
            assertThat(repr).contains("worldNotes=1");
            assertThat(repr).contains("foreshadows=1");
            assertThat(repr).contains("plots=1");
            assertThat(repr).contains("recentEpisodes=1");
        }

        @Test
        @DisplayName("중첩 record를 개별로 toString해도 평문은 새지 않는다")
        void nestedRecordsAlsoMasked() {
            AiContextPayload.WorkMeta meta = new AiContextPayload.WorkMeta(
                    "비밀 작품 제목", "비밀 작가명", SECRET_DESC, "ongoing"
            );
            AiContextPayload.Character ch = new AiContextPayload.Character(
                    "char-1", SECRET_NAME, "남", "30",
                    List.of(new AiContextPayload.CharacterNote("personality", "성격노트", SECRET_DESC)),
                    List.of(new AiContextPayload.CharacterCustomField("직업", "암살자"))
            );
            AiContextPayload.WorldNote wn = new AiContextPayload.WorldNote("비밀 설정", SECRET_DESC);
            AiContextPayload.Foreshadow fs = new AiContextPayload.Foreshadow(
                    "비밀 떡밥", "planted", "high", SECRET_DESC
            );
            AiContextPayload.Plot pl = new AiContextPayload.Plot("비밀 플롯", SECRET_DESC);
            AiContextPayload.RecentEpisode re = new AiContextPayload.RecentEpisode(
                    7, "비밀 회차 제목", SECRET_BODY
            );

            assertThat(meta.toString())
                    .doesNotContain("비밀 작품 제목").doesNotContain("비밀 작가명").doesNotContain(SECRET_DESC)
                    .contains("status=ongoing");
            assertThat(ch.toString())
                    .doesNotContain(SECRET_NAME).doesNotContain(SECRET_DESC).doesNotContain("암살자")
                    .contains("char-1").contains("notes=1").contains("customFields=1");
            assertThat(wn.toString()).doesNotContain("비밀 설정").doesNotContain(SECRET_DESC);
            assertThat(fs.toString())
                    .doesNotContain("비밀 떡밥").doesNotContain(SECRET_DESC)
                    .contains("status=planted").contains("importance=high");
            assertThat(pl.toString()).doesNotContain("비밀 플롯").doesNotContain(SECRET_DESC);
            assertThat(re.toString())
                    .doesNotContain("비밀 회차 제목").doesNotContain(SECRET_BODY)
                    .contains("sortOrder=7");
        }

        @Test
        @DisplayName("null 컬렉션도 안전하게 처리된다")
        void nullCollectionsDoNotCrash() {
            AiContextPayload empty = new AiContextPayload(null, null, null, null, null, null);
            String repr = empty.toString();
            assertThat(repr)
                    .contains("characters=0")
                    .contains("worldNotes=0")
                    .contains("foreshadows=0")
                    .contains("plots=0")
                    .contains("recentEpisodes=0")
                    .contains("workMeta=null");
        }
    }

    private static AiContextPayload payloadFixture() {
        return new AiContextPayload(
                new AiContextPayload.WorkMeta("작품제목", "작가", SECRET_DESC, "ongoing"),
                List.of(new AiContextPayload.Character(
                        "c1", SECRET_NAME, "남", "30",
                        List.of(new AiContextPayload.CharacterNote("personality", "노트", SECRET_DESC)),
                        List.of(new AiContextPayload.CharacterCustomField("직업", "암살자"))
                )),
                List.of(new AiContextPayload.WorldNote("설정", SECRET_DESC)),
                List.of(new AiContextPayload.Foreshadow("떡밥", "planted", "high", SECRET_DESC)),
                List.of(new AiContextPayload.Plot("플롯", SECRET_DESC)),
                List.of(new AiContextPayload.RecentEpisode(1, "회차", SECRET_BODY))
        );
    }
}
