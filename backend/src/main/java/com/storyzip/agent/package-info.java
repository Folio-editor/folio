/**
 * Phase 4 — Agent 서비스.
 *
 * <p>책임:
 * <ul>
 *   <li>controller — 작가용 REST: thread / message / suggestion 조회·승인</li>
 *   <li>service    — AgentReceiptService (영수증 + 잔액 차감), SuggestionService (승인 흐름)</li>
 *   <li>dto        — REST 입출력 + 영수증 페이로드</li>
 * </ul>
 * <p>AI 서버는 token_receipt 발행을 위해 /internal/v1/token-receipts 엔드포인트를 호출한다.
 */
package com.storyzip.agent;
