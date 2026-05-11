/**
 * 첫 프롬프트를 streaming 화면으로 전달하는 임시 채널.
 * store 에 두기보단 module-level mutable 로 한 번만 쓰고 휘발 (페이지 nav 시 자동 리셋).
 *
 * 생산자: AiTabContent.handleReview / CreateInputScreen.handleSubmit
 * 소비자: CreateStreamingScreen 의 첫 useEffect — threadId 변경 시 1회 take.
 */
let pendingFirstPrompt: { threadId: string; prompt: string } | null = null;

export function setPendingFirstPrompt(threadId: string, prompt: string): void {
  pendingFirstPrompt = { threadId, prompt };
}

export function takePendingFirstPrompt(threadId: string): string | null {
  if (pendingFirstPrompt && pendingFirstPrompt.threadId === threadId) {
    const p = pendingFirstPrompt.prompt;
    pendingFirstPrompt = null;
    return p;
  }
  return null;
}
