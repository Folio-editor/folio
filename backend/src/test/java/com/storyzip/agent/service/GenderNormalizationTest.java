package com.storyzip.agent.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SuggestionApplier#normalizeGender 정규화 검증.
 *
 * <p>프론트 GENDER_ICON_MAP 키 ('남'/'여'/'기타'/'미설정') 와 1:1 매핑되어야 한다.
 * 어떤 변형 입력도 매핑 실패 시 '미설정' 으로 폴백 — DB 에 매핑 불가 값이 들어가
 * 프론트 '?' 아이콘 띄우는 사고 방지.
 */
class GenderNormalizationTest {

    private String norm(String raw) throws Exception {
        Method m = SuggestionApplier.class.getDeclaredMethod("normalizeGender", String.class);
        m.setAccessible(true);
        return (String) m.invoke(null, raw);
    }

    @Test
    void canonicalValues_passThrough() throws Exception {
        assertEquals("남", norm("남"));
        assertEquals("여", norm("여"));
        assertEquals("기타", norm("기타"));
        assertEquals("미설정", norm("미설정"));
    }

    @Test
    void koreanVariants_normalize() throws Exception {
        assertEquals("남", norm("남성"));
        assertEquals("남", norm("남자"));
        assertEquals("여", norm("여성"));
        assertEquals("여", norm("여자"));
        assertEquals("미설정", norm("미정"));   // 구버전 DB 의 잘못된 값
    }

    @Test
    void englishVariants_normalize() throws Exception {
        assertEquals("남", norm("male"));
        assertEquals("남", norm("Male"));
        assertEquals("남", norm("M"));
        assertEquals("남", norm("man"));
        assertEquals("여", norm("female"));
        assertEquals("여", norm("FEMALE"));
        assertEquals("여", norm("F"));
        assertEquals("여", norm("woman"));
        assertEquals("기타", norm("other"));
        assertEquals("기타", norm("non-binary"));
        assertEquals("미설정", norm("unknown"));
    }

    @Test
    void nullEmptyWhitespace_default() throws Exception {
        assertEquals("미설정", norm(null));
        assertEquals("미설정", norm(""));
        assertEquals("미설정", norm("   "));
    }

    @Test
    void unknownString_default() throws Exception {
        // 매핑 불가 입력은 절대 그대로 통과시키지 않음 — 사용자에게 즉시 보이도록 '미설정'.
        assertEquals("미설정", norm("???"));
        assertEquals("미설정", norm("바이너리"));
        assertEquals("미설정", norm("xyz"));
    }

    @Test
    void surroundingWhitespace_trimmed() throws Exception {
        assertEquals("남", norm("  남  "));
        assertEquals("여", norm("\t여\n"));
        assertEquals("남", norm(" male "));
    }
}
