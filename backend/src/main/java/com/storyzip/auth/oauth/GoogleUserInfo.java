package com.storyzip.auth.oauth;

/**
 * Google ID Token에서 추출한 사용자 정보.
 *
 * @param sub    Google 사용자 고유 ID (oauth_id로 저장)
 * @param email  이메일
 * @param name   프로필 이름
 * @param picture 프로필 이미지 URL
 */
public record GoogleUserInfo(String sub, String email, String name, String picture) {
}
