# Folio CSS 테마 가이드라인

> 색상 토큰 체계, 테마 편집 방법, 새 테마 추가 절차를 다룹니다.
> 코드를 보지 않고도 색을 만져볼 수 있도록 작성된 단일 진입점 문서입니다.

---

## 1. 파일 구조

```
frontend/src/styles/
├── tokens.css      ← 모든 색상 토큰의 단일 진실 소스 (:root + .dark)
├── themes.css      ← 5개 테마 (sepia/forest/ocean/rose/lavender) — 사용자가 만지는 파일
├── editor.css      ← TipTap 데코레이션 스타일 (토큰 참조만)
└── global.css      ← Tailwind import + @theme inline 매핑 + body/scrollbar
```

**진입점**: `global.css` 가 다른 3개를 `@import` 한다. Vite가 자동 번들링.

---

## 2. 토큰 5계층 카탈로그

| 계층 | 목적 | 위치 | 테마 오버라이드 |
|---|---|---|---|
| **A. Surface** | 배경 / 카드 / 사이드바 | tokens.css `:root`+`.dark`, themes.css 모든 테마 | ✅ |
| **B. Brand & Action** | 강조 / 버튼 / 포커스 | 동일 | ✅ |
| **C. Semantic State** | success / warning / info / danger | tokens.css 만 | ⚙️ 선택 |
| **D. Domain** | 캐릭터 성별 / 복선 단계 | tokens.css 만 | ❌ 유니버설 |
| **E. Editor** | 대사 / 독백 / 작가메모 / 형광펜 / 검수 | tokens.css 만 | ❌ 유니버설 |

### A. Surface (10 토큰)

| 토큰 | 의미 | Tailwind 유틸 |
|---|---|---|
| `--background` | 앱 전체 배경 | `bg-background` |
| `--foreground` | 본문 텍스트 | `text-foreground` |
| `--card` / `--card-foreground` | 카드/섹션 배경 | `bg-card` / `text-card-foreground` |
| `--popover` / `--popover-foreground` | 팝오버/드롭다운 | `bg-popover` |
| `--muted` / `--muted-foreground` | 보조/억제 영역 | `bg-muted` / `text-muted-foreground` |
| `--sidebar` / `--sidebar-foreground` | 좌측 사이드바 | `bg-sidebar` |
| `--sidebar-accent` / `--sidebar-accent-foreground` | 사이드바 활성 항목 | `bg-sidebar-accent` |

### B. Brand & Action (10 토큰)

| 토큰 | 의미 | Tailwind 유틸 |
|---|---|---|
| `--primary` / `--primary-foreground` | 주 강조 (Primary Button) | `bg-primary` |
| `--secondary` / `--secondary-foreground` | 보조 강조 | `bg-secondary` |
| `--accent` / `--accent-foreground` | hover/active 강조 | `bg-accent` |
| `--border` / `--sidebar-border` | 구분선 | `border-border` |
| `--input` | input 테두리 | `border-input` |
| `--ring` | 포커스 링 | `ring-ring` |

### C. Semantic State (12 토큰)

각 상태마다 `solid` (본색), `foreground` (solid 위 글자), `soft` (옅은 배경) 3종.

| 상태 | 용도 |
|---|---|
| `--success` / `-foreground` / `-soft` | 완료 · 저장됨 · 동기화됨 |
| `--warning` / `-foreground` / `-soft` | 주의 · 게스트 모드 · 임계 근접 |
| `--info` / `-foreground` / `-soft` | 작성중 · 진행중 · 정보 안내 |
| `--danger` / `-foreground` / `-soft` | 위험 · 오류 · 용량 초과 (= shadcn `destructive`) |

Tailwind 유틸: `bg-success`, `text-success`, `bg-success-soft`, `border-success/30` 등.

### D. Domain (6 토큰, 유니버설)

| 토큰 | 의미 |
|---|---|
| `--character-male` / `-female` / `-other` | 캐릭터 성별 마커 |
| `--foreshadow-plant` / `-resolve` / `-final` | 복선 단계 (심기/회수/최종회수) |

### E. Editor (18 토큰, 유니버설)

`--editor-dialogue`, `--editor-inner-thought`, `--editor-author-note`, `--editor-author-note-bg`, `--editor-name-character`, `--editor-name-place`, `--editor-mark`, `--editor-find-match`, `--editor-find-match-current`, `--editor-review-{critical,warning,info,focused}`, `--editor-review-badge-{critical,warning,info}`, `--editor-scrollbar-thumb`, `--editor-scrollbar-thumb-hover`.

---

## 3. 테마 색 수정 가이드

### 핵심: themes.css 한 파일만 만지면 된다

각 테마(`.theme-sepia`, `.theme-forest` 등)는 **A. Surface** + **B. Brand & Action** 토큰만 오버라이드한다. C/D/E 는 등장하지 않는다.

### oklch(L C H) 빠른 가이드

| 축 | 범위 | 의미 | 권장값 |
|---|---|---|---|
| L (lightness) | 0~1 | 밝기 | Light surface 0.92~0.98 / Dark surface 0.16~0.22 |
| C (chroma) | 0~~ | 채도 (0 = 무채색) | Surface 0.005~0.03 / Brand 0.10~0.20 |
| H (hue) | 0~360 | 색상환 | 0=빨강, 60=노랑, 120=초록, 240=파랑, 280=보라 |

### 편집 예시

세피아 테마의 강조색을 더 진하게 하려면:

```css
/* themes.css */
.theme-sepia {
  --primary: oklch(0.45 0.10 55);      /* 변경 전 */
  --primary: oklch(0.40 0.13 55);      /* 변경 후 — 더 진하고 채도 ↑ */
}
```

핵심은 **L 만 -0.05 / C 만 +0.03 식으로 한 축씩 조정**하는 것. 세 축을 동시에 흔들면 디자인 의도를 잃기 쉽다.

---

## 4. 새 테마 추가 절차

### 1단계: themes.css 에 블록 2개 추가

```css
.theme-mocha {
  /* A. Surface */
  --background: oklch(0.95 0.02 50);
  --foreground: oklch(0.25 0.025 50);
  /* ... 나머지 surface ... */

  /* B. Brand & Action */
  --primary: oklch(0.42 0.12 50);
  --primary-foreground: oklch(0.98 0.005 50);
  /* ... 나머지 brand ... */
}
.theme-mocha.dark {
  /* dark 변형 */
}
```

기존 `.theme-sepia` 블록을 그대로 복사한 뒤 hue 값(50~85)만 조정하는 방식이 가장 안전하다.

### 2단계: config/themes.ts 에 메타 추가

```ts
// frontend/src/shared/config/themes.ts
export const COLOR_THEMES: ColorThemeDef[] = [
  /* ... 기존 6개 ... */
  {
    id: 'mocha',
    label: '모카',
    previewLight: 'oklch(0.95 0.02 50)',  // = .theme-mocha 의 --background
    previewDark: 'oklch(0.18 0.02 50)',   // = .theme-mocha.dark 의 --background
  },
];
```

설정 화면의 테마 선택 그리드에 자동으로 나타난다. ThemeProvider는 추가 변경 불필요.

---

## 5. 시맨틱·도메인·에디터 색을 전 테마에서 바꾸는 법

테마와 무관하게 적용되는 색을 바꾸려면 `tokens.css` 의 `:root` (light) 와 `.dark` (dark) 두 곳을 수정한다.

```css
/* tokens.css :root */
--success: oklch(0.55 0.13 150);   /* 좀 더 청록색으로 */
--success: oklch(0.55 0.15 165);   /* 변경 후 */
```

C/D/E 토큰은 **모든 테마에서 즉시 동시 반영된다**. 테마별 미세 조정이 필요한 경우(C 만 가능) 해당 `.theme-XXX` 블록 안에서 토큰을 재정의하면 된다.

---

## 6. 안티패턴 (하지 말 것)

### ❌ Tailwind 팔레트를 시맨틱 의미로 직접 사용

```tsx
// 나쁨
<span className="text-red-500">오류</span>
<div className="bg-amber-50 border-amber-200">경고</div>

// 좋음
<span className="text-danger">오류</span>
<div className="bg-warning-soft border-warning/30">경고</div>
```

### ❌ hex/oklch 리터럴

```tsx
// 나쁨
<span className="text-[#5B7CFF]">남</span>
<div style={{ backgroundColor: 'oklch(0.6 0.2 290)' }}>...</div>

// 좋음
<span className="text-character-male">남</span>
```

### ❌ dark: 변형 직접 작성 (토큰을 안 쓸 때만 발생)

```tsx
// 나쁨
<div className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400">

// 좋음 — 토큰이 light/dark 자동 처리
<div className="bg-info-soft text-info">
```

### ✅ 예외 — 사용자가 고르는 데코레이션 팔레트

다음 영역은 **사용자가 색을 의도적으로 카테고리에 부여한 시각적 마커**라서 Tailwind 팔레트를 그대로 둔다. 토큰화하지 말 것:

- `frontend/src/shared/features/episode/EpisodeEditScreen.tsx` — 회차 색상 태그 6종
- `frontend/src/shared/features/foreshadow/ForeshadowEditScreen.tsx` — 복선 색상 태그 6종
- `frontend/src/shared/features/workspace/WorkspaceHomeScreen.tsx` — 작품 색상 태그
- `frontend/src/shared/features/idea-archive/ideaConstants.ts` — 아이디어 카테고리(문장/장면/설정/반전/대사) 5색

이 케이스는 "문서 분류 색"이지 "테마 일관 색"이 아니다.

---

## 7. 에디터 색은 왜 테마별로 안 바뀌는가

작가에게 에디터 데코레이션 색은 **학습된 시각언어**다.

- 파랑 = 대사
- 초록 = 독백
- 노랑 = 형광펜
- 빨강 = 검수 심각

테마를 바꿨을 때 이 색이 함께 흔들리면, 본문을 읽는 동안 매번 시각 인지를 다시 해야 한다. 테마는 "주변 환경(벽지)"의 변화여야 하지, "메모지 색깔"까지 바꾸면 안 된다.

전 테마 동시에 바꾸려면 `tokens.css` 의 `--editor-*` 만 수정하면 된다.

---

## 8. 검증 체크리스트

CSS 토큰 변경 후 다음을 확인한다:

1. `pnpm dev` 로 Electron 렌더러 기동.
2. 설정 → 테마에서 6개 테마 × 라이트/다크 = 12조합 순차 전환.
3. 각 조합에서:
   - 사이드바 / 본문 / 우측 패널 면 색이 일관적인가
   - Primary 버튼, 포커스 링이 잘 보이는가 (대비 ≥ 4.5:1)
   - 캐릭터 성별 아이콘 / 복선 마커 색이 모든 테마에서 동일한가
   - 에디터 본문(대사/독백/형광펜/찾기 하이라이트)이 모든 테마에서 동일한가
   - 게스트 배너, 동기화 게이지, 검수 패널이 적절한 시맨틱 색을 쓰는가
4. `document.documentElement.classList` 콘솔 출력 → `light theme-sepia` 같은 정상 클래스 확인.
5. `pnpm lint` 통과.
