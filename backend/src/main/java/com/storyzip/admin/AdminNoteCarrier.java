package com.storyzip.admin;

/**
 * 관리자 API 요청 DTO 가 audit 메모를 제공함을 표시하는 마커 인터페이스.
 *
 * <p>{@link AdminAuditAspect} 가 메서드 인자에서 이 인터페이스 구현체를 자동으로 찾아
 * {@code adminNote()} 값을 audit 로그에 기록한다.
 *
 * <p>새 admin API 의 RequestBody DTO 가 audit 메모를 함께 보내려면 이 인터페이스만
 * 구현하면 된다. Aspect 코드 변경 불필요.
 *
 * <p>인터페이스 구현이 어려운 경우(외부 라이브러리 DTO 등) {@link AdminAudited#adminNoteExpression()}
 * 에 SpEL 식을 명시하면 직접 추출할 수 있다.
 */
public interface AdminNoteCarrier {

    /** 운영자 메모. NULL 가능 (입력 안 했을 때). */
    String adminNote();
}
