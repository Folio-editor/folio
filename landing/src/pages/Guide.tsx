import { useEffect, useState } from 'react';
import { TopNav } from '../components/landing/TopNav';
import { FinFooter } from '../components/landing/FinFooter';
import { GuideBookmarkNav } from '../components/landing/GuideBookmarkNav';

import '../styles/landing.css';
import '../styles/guide.css';

const TOC_ITEMS = [
  { num: '01', label: 'Folio 시작 방법' },
  { num: '02', label: '작품의 구조' },
  { num: '03', label: '기획' },
  { num: '04', label: '세계관' },
  { num: '05', label: '등장인물' },
  { num: '06', label: '플롯' },
  { num: '07', label: '회차 · 원고' },
  { num: '08', label: '복선' },
  { num: '09', label: '단축키 & 마크다운' },
  { num: '10', label: '다음 단계' },
];

export function Guide() {
  const [helpTab, setHelpTab] = useState<'shortcut' | 'markdown'>('shortcut');

  useEffect(() => {
    const prev = document.title;
    document.title = '가이드 · Folio';
    window.scrollTo(0, 0);
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="folio-landing">
      <TopNav />

      <main className="guide-main">
        <div className="guide-container">
          {/* ── Hero ─────────────────────────────────────────────── */}
          <header className="guide-hero">
            <div className="guide-hero-rule" />
            <div className="guide-eyebrow">Chapter 0 · Welcome</div>
            <h1 className="guide-h1">시작하기</h1>
            <p className="guide-lede">
              Folio는 연재 작가의 긴 호흡을 위해 만들어진 작업실입니다.
              <br />이 가이드는 첫 화면부터 다음 화 초안까지의 길을 함께 따라
              걸어드립니다.
            </p>
          </header>

          {/* ── TOC ──────────────────────────────────────────────── */}
          <nav className="guide-toc" aria-label="목차">
            {TOC_ITEMS.map((item) => (
              <a key={item.num} href={`#sec-${item.num}`} className="guide-toc-item">
                <span className="guide-toc-num">{item.num}</span>
                <span className="guide-toc-label">{item.label}</span>
              </a>
            ))}
          </nav>

          {/* ── 01. Folio 시작 방법 ───────────────────────────────── */}
          <section id="sec-01" className="guide-section">
            <div className="guide-chapter-mark">01</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">Folio 시작 방법</h2>

            <p>
              Folio는 두 갈래로 시작할 수 있습니다. 어느 길로 들어와도 같은
              작업실에 도착합니다.
            </p>

            <div className="guide-start-cards">
              <article className="guide-start-card">
                <div className="guide-start-card-num">갈래 A</div>
                <h4>예시와 함께 시작</h4>
                <p className="guide-start-card-desc">
                  가공의 단편 「초롱지붕 아래」가 미리 채워져 있습니다. 인물,
                  세계관, 1화 원고가 모두 들어 있어 도구를 빠르게 둘러보기에
                  좋습니다.
                </p>
                <div className="guide-start-preview">
                  <div className="guide-start-preview-title">초롱지붕 아래</div>
                  단편 · 1화 분량 · 인물 3 · 세계관 4
                  <div className="guide-start-preview-meta">
                    예시 작품 · 자유롭게 수정 · 삭제 가능
                  </div>
                </div>
                <ul className="guide-start-bullets">
                  <li>도구를 먼저 둘러보고 싶을 때</li>
                  <li>설정·플롯이 어떻게 연결되는지 보고 싶을 때</li>
                </ul>
              </article>

              <article className="guide-start-card">
                <div className="guide-start-card-num">갈래 B</div>
                <h4>처음부터 시작</h4>
                <p className="guide-start-card-desc">
                  빈 작품을 만들고 제목 한 줄에서 출발합니다. 인물도 세계관도
                  쌓이는 대로 채우면 됩니다.
                </p>
                <div className="guide-start-preview-blank">
                  <span className="guide-start-preview-plus">＋</span>
                  새 작품
                </div>
                <ul className="guide-start-bullets">
                  <li>이미 머릿속에 작품이 있을 때</li>
                  <li>나만의 구조로 비워두고 싶을 때</li>
                </ul>
              </article>
            </div>

            <p>
              어느 쪽이든 상단의 <strong>＋ 새 작품</strong> 버튼으로 언제든 또
              다른 작품을 만들 수 있습니다.
            </p>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 02. 작품의 구조 ──────────────────────────────────── */}
          <section id="sec-02" className="guide-section">
            <div className="guide-chapter-mark">02</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">작품의 구조</h2>

            <p>
              모든 작품은 네 개의 탭으로 나뉩니다. 좌측 사이드바에서 탭을 옮겨
              다니며 같은 작품의 다른 결을 들여다봅니다.
            </p>

            <div className="guide-tabs-grid">
              <div className="guide-tab-cell">
                <div className="guide-tab-num">i.</div>
                <div className="guide-tab-name">기획</div>
                <div className="guide-tab-desc">작품의 한 줄, 톤, 분기점</div>
              </div>
              <div className="guide-tab-cell">
                <div className="guide-tab-num">ii.</div>
                <div className="guide-tab-name">세계관</div>
                <div className="guide-tab-desc">장소·문화·규칙·아이템</div>
              </div>
              <div className="guide-tab-cell">
                <div className="guide-tab-num">iii.</div>
                <div className="guide-tab-name">등장인물</div>
                <div className="guide-tab-desc">인물 카드와 관계도</div>
              </div>
              <div className="guide-tab-cell">
                <div className="guide-tab-num">iv.</div>
                <div className="guide-tab-name">플롯</div>
                <div className="guide-tab-desc">막·회차·원고의 흐름</div>
              </div>
            </div>

            <p className="guide-pull-quote">
              네 개의 탭은 네 개의 책상이 아닙니다. <br />
              하나의 책상 위에 놓인 네 권의 노트입니다.
            </p>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 03. 기획 ─────────────────────────────────────────── */}
          <section id="sec-03" className="guide-section">
            <div className="guide-chapter-mark">03</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">기획</h2>

            <h3 className="guide-h3">기획의 한 장</h3>
            <p>
              <strong>기획</strong> 탭에는 작품의 가장 짧은 요약 — 한 줄
              로그라인, 분위기, 핵심 갈등 — 을 적습니다. 다른 모든 페이지는
              여기에서 출발합니다.
            </p>

            <h3 className="guide-h3">말할 때 확인할 3가지</h3>
            <ol>
              <li>
                <strong>한 줄 로그라인</strong> — 누구에게 한 문장으로 설명할
                수 있는가.
              </li>
              <li>
                <strong>분위기</strong> — 독자가 첫 1분 안에 느꼈으면 하는
                온도.
              </li>
              <li>
                <strong>핵심 갈등</strong> — 끝까지 끌고 갈 단 하나의 질문.
              </li>
            </ol>
            <p>
              기획은 짧을수록 좋습니다. 길어진다 싶으면 세계관이나 플롯 탭이
              그 내용을 받기 시작했다는 신호입니다.
            </p>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 04. 세계관 ───────────────────────────────────────── */}
          <section id="sec-04" className="guide-section">
            <div className="guide-chapter-mark">04</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">세계관</h2>

            <h3 className="guide-h3">기본 문서로 시작</h3>
            <p>
              세계관 탭에는 <strong>장소</strong>, <strong>문화</strong>,{' '}
              <strong>규칙</strong>, <strong>아이템</strong> 등 다섯 종류의
              기본 문서가 미리 준비되어 있습니다. 비워두어도 좋고, 필요한 것만
              먼저 채워도 좋습니다.
            </p>

            <h3 className="guide-h3">부모-자식 구조</h3>
            <p>
              하나의 세계관 문서 안에 하위 문서를 넣을 수 있습니다. 예를
              들어 <code>왕국</code> 아래에 <code>왕성</code>,{' '}
              <code>변방 마을</code>을 묶는 식입니다. 너무 깊게 들어가지
              않도록, 두 단계 정도가 가장 보기 좋습니다.
            </p>

            <h3 className="guide-h3">드래그로 정리</h3>
            <p>
              사이드바의 문서는 마우스로 잡아서 위아래로 옮길 수 있습니다.
              부모 문서로 끌어 넣으면 자식이 되고, 빈 공간으로 끌어내면 다시
              평평해집니다.
            </p>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 05. 등장인물 ─────────────────────────────────────── */}
          <section id="sec-05" className="guide-section">
            <div className="guide-chapter-mark">05</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">등장인물</h2>

            <h3 className="guide-h3">주인공 1명부터</h3>
            <p>
              인물은 한 명부터 시작해도 충분합니다. 처음에는 이름과 한 줄
              설명만 남기고, 회차를 쓰면서 필요해지는 정보를 덧붙입니다.
            </p>

            <h3 className="guide-h3">상세 편집</h3>
            <p>
              인물 카드를 열면 외형, 말투, 동기, 인간관계 등의 항목이
              펼쳐집니다. 모든 칸을 채울 필요는 없습니다. 비어 있는 칸은
              아직 결정되지 않은 여백입니다.
            </p>

            <h3 className="guide-h3">세계관 태그 연결</h3>
            <p>
              인물 카드에서 세계관 문서를 태그로 연결할 수 있습니다.{' '}
              <code>왕성</code>이라는 장소 태그를 붙이면, 나중에 그 인물이
              어디에서 살고 있었는지 한 번에 찾을 수 있습니다.
            </p>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 06. 플롯 ─────────────────────────────────────────── */}
          <section id="sec-06" className="guide-section">
            <div className="guide-chapter-mark">06</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">플롯</h2>

            <h3 className="guide-h3">막 단위 구성</h3>
            <p>
              연재의 큰 호흡은 <strong>막</strong> 단위로 나눕니다. 1막에서
              어디까지 가고 싶은지, 2막의 전환점은 무엇인지 — 굵은 선만
              잡아두는 곳입니다.
            </p>

            <h3 className="guide-h3">회차 → 원고 연결</h3>
            <p>
              각 막 아래에 <strong>회차</strong>를 두고, 회차 안에서 실제{' '}
              <strong>원고</strong>를 씁니다. 플롯 탭에서 회차를 눌러 그대로
              집필 화면으로 들어갈 수 있습니다.
            </p>

            <h3 className="guide-h3">드래그로 순서 변경</h3>
            <p>
              막과 회차의 순서는 마우스로 바꿀 수 있습니다. 4화로 쓰던 장면을
              5화 뒤로 미루어도, 안에 있는 원고는 그대로 따라갑니다.
            </p>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 07. 회차 · 원고 ──────────────────────────────────── */}
          <section id="sec-07" className="guide-section">
            <div className="guide-chapter-mark">07</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">회차 · 원고</h2>

            <h3 className="guide-h3">새 원고</h3>
            <p>
              플롯 탭에서 회차를 클릭하거나, 사이드바의{' '}
              <strong>＋ 새 원고</strong>로 빈 회차를 시작합니다. 첫 줄에
              제목을 적으면 자동으로 회차 이름이 됩니다.
            </p>

            <h3 className="guide-h3">AI 도구</h3>
            <p>
              에디터 우측의 <strong>AI 패널</strong>에서 설정 충돌 검수,
              다음 화 초안 생성, 문장 다듬기 등을 호출합니다. 모든 호출은
              크레딧을 사용하며, 결과는 항상 작가가 채택할 때만 원고에
              반영됩니다.
            </p>

            <h3 className="guide-h3">자주 쓰는 단축키</h3>
            <p>아래 두 가지만 알아두어도 집필이 한결 가벼워집니다.</p>

            <div className="guide-shortcut-group">
              <div className="guide-shortcut-row">
                <span className="guide-shortcut-label">저장</span>
                <span className="guide-keys">
                  <span className="guide-key">Ctrl</span>
                  <span className="guide-key-plus">+</span>
                  <span className="guide-key">S</span>
                </span>
              </div>
              <div className="guide-shortcut-row">
                <span className="guide-shortcut-label">전체 도움말 열기</span>
                <span className="guide-keys">
                  <span className="guide-key">F1</span>
                </span>
              </div>
            </div>

            <h3 className="guide-h3">저장 상태 확인</h3>
            <p>
              상단 헤더의 작은 문구가 현재 저장 상태를 알려줍니다.{' '}
              <em>저장됨 · 방금 전</em>이면 안심해도 좋습니다. 오프라인이면{' '}
              <em>로컬 저장됨</em>으로 표시되고, 다시 온라인이 되는 순간
              자동으로 클라우드로 올라갑니다.
            </p>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 08. 복선 ─────────────────────────────────────────── */}
          <section id="sec-08" className="guide-section">
            <div className="guide-chapter-mark">08</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">복선</h2>

            <h3 className="guide-h3">카드 한 장씩</h3>
            <p>
              복선은 한 가지를 한 장의 카드에 적습니다. 너무 자세히 적기보다,
              <em>"무엇을 회수해야 한다"</em>는 약속을 짧게 남깁니다.
            </p>

            <h3 className="guide-h3">상태 단계</h3>
            <p>각 복선 카드는 세 단계 중 하나의 상태를 가집니다.</p>
            <div className="guide-stages">
              <span className="guide-stage-chip active">심기</span>
              <span className="guide-stage-arrow">→</span>
              <span className="guide-stage-chip">전개</span>
              <span className="guide-stage-arrow">→</span>
              <span className="guide-stage-chip">회수</span>
            </div>
            <p>
              <strong>심기</strong>에서 <strong>회수</strong>까지의 거리가
              너무 길어지면, 보드 상단에 알림이 뜹니다. 독자보다 먼저
              알아채는 것이 목표입니다.
            </p>

            <h3 className="guide-h3">회차 · 플롯과 연결</h3>
            <p>
              복선 카드는 특정 회차나 플롯 단계에 연결할 수 있습니다.
              연결해두면, 그 회차를 열 때 <em>"이 복선이 여기에서 회수될
              예정입니다"</em>가 옆에 같이 떠 있습니다.
            </p>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 09. 단축키 & 마크다운 ───────────────────────────── */}
          <section id="sec-09" className="guide-section">
            <div className="guide-chapter-mark">09</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">단축키 &amp; 마크다운</h2>

            <p>두 가지 입력 방식이 같은 결과로 모입니다.</p>

            <div className="guide-help-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={helpTab === 'shortcut'}
                className={`guide-help-tab ${helpTab === 'shortcut' ? 'active' : ''}`}
                onClick={() => setHelpTab('shortcut')}
              >
                단축키
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={helpTab === 'markdown'}
                className={`guide-help-tab ${helpTab === 'markdown' ? 'active' : ''}`}
                onClick={() => setHelpTab('markdown')}
              >
                마크다운
              </button>
            </div>

            {/* Shortcut panel */}
            <div
              className={`guide-help-panel ${helpTab === 'shortcut' ? 'active' : ''}`}
              role="tabpanel"
            >
              <div className="guide-shortcut-group">
                <div className="guide-shortcut-title">파일</div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">저장</span>
                  <span className="guide-keys">
                    <span className="guide-key">Ctrl</span>
                    <span className="guide-key-plus">+</span>
                    <span className="guide-key">S</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">새 원고</span>
                  <span className="guide-keys">
                    <span className="guide-key">Ctrl</span>
                    <span className="guide-key-plus">+</span>
                    <span className="guide-key">N</span>
                  </span>
                </div>
              </div>

              <div className="guide-shortcut-group">
                <div className="guide-shortcut-title">서식</div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">볼드</span>
                  <span className="guide-keys">
                    <span className="guide-key">Ctrl</span>
                    <span className="guide-key-plus">+</span>
                    <span className="guide-key">B</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">기울임</span>
                  <span className="guide-keys">
                    <span className="guide-key">Ctrl</span>
                    <span className="guide-key-plus">+</span>
                    <span className="guide-key">I</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">밑줄</span>
                  <span className="guide-keys">
                    <span className="guide-key">Ctrl</span>
                    <span className="guide-key-plus">+</span>
                    <span className="guide-key">U</span>
                  </span>
                </div>
              </div>

              <div className="guide-shortcut-group">
                <div className="guide-shortcut-title">이동 · 도구</div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">검색</span>
                  <span className="guide-keys">
                    <span className="guide-key">Ctrl</span>
                    <span className="guide-key-plus">+</span>
                    <span className="guide-key">F</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">AI 패널 토글</span>
                  <span className="guide-keys">
                    <span className="guide-key">Ctrl</span>
                    <span className="guide-key-plus">+</span>
                    <span className="guide-key">K</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">전체 도움말</span>
                  <span className="guide-keys">
                    <span className="guide-key">F1</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Markdown panel */}
            <div
              className={`guide-help-panel ${helpTab === 'markdown' ? 'active' : ''}`}
              role="tabpanel"
            >
              <p className="guide-markdown-hint">
                줄 첫머리에 입력하면 자동으로 서식으로 바뀝니다.
              </p>

              <div className="guide-shortcut-group">
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">제목 1</span>
                  <span className="guide-keys">
                    <span className="guide-key guide-key-syntax"># 제목</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">제목 2</span>
                  <span className="guide-keys">
                    <span className="guide-key guide-key-syntax">## 제목</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">목록</span>
                  <span className="guide-keys">
                    <span className="guide-key guide-key-syntax">- 항목</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">번호 목록</span>
                  <span className="guide-keys">
                    <span className="guide-key guide-key-syntax">1. 항목</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">인용</span>
                  <span className="guide-keys">
                    <span className="guide-key guide-key-syntax">&gt; 인용</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">볼드</span>
                  <span className="guide-keys">
                    <span className="guide-key guide-key-syntax">**굵게**</span>
                  </span>
                </div>
                <div className="guide-shortcut-row">
                  <span className="guide-shortcut-label">기울임</span>
                  <span className="guide-keys">
                    <span className="guide-key guide-key-syntax">*기울임*</span>
                  </span>
                </div>
              </div>
            </div>

            <aside className="guide-callout">
              <div className="guide-callout-key">
                <span className="guide-key">F1</span>
              </div>
              <div className="guide-callout-body">
                <div className="guide-callout-desc">
                  에디터 어디에서나 <strong>F1</strong>을 누르면 도움말이
                  화면 위로 떠오릅니다.
                  <span className="guide-callout-sub">
                    드래그 · 리사이즈로 옆에 두고 작업해도 좋습니다.
                  </span>
                </div>
              </div>
            </aside>
          </section>

          <div className="guide-divider">
            <span>· · ·</span>
          </div>

          {/* ── 10. 다음 단계 ────────────────────────────────────── */}
          <section id="sec-10" className="guide-section">
            <div className="guide-chapter-mark">10</div>
            <div className="guide-chapter-rule" />
            <h2 className="guide-h2">다음 단계</h2>

            <p>
              가이드를 한 번 훑어보셨다면, 이제 책상에 앉으실 차례입니다.
              아래 세 가지 중 하나로 시작해보세요.
            </p>

            <ol className="guide-next-list">
              <li className="guide-next-item">
                <span className="guide-next-num">i.</span>
                <div className="guide-next-body">
                  <div className="guide-next-title">예시 작품 열기</div>
                  <div className="guide-next-desc">
                    「초롱지붕 아래」를 열어 인물·세계관·플롯이 어떻게
                    엮여 있는지 살펴봅니다.
                  </div>
                </div>
              </li>
              <li className="guide-next-item">
                <span className="guide-next-num">ii.</span>
                <div className="guide-next-body">
                  <div className="guide-next-title">새 작품 만들기</div>
                  <div className="guide-next-desc">
                    빈 작품을 만들어 한 줄 로그라인부터 적습니다. 채워가는
                    재미가 시작되는 곳입니다.
                  </div>
                </div>
              </li>
              <li className="guide-next-item">
                <span className="guide-next-num">iii.</span>
                <div className="guide-next-body">
                  <div className="guide-next-title">기존 원고 임포트</div>
                  <div className="guide-next-desc">
                    이미 써둔 원고가 있다면 가져옵니다. 인물·설정이
                    자동으로 추출되어 카드 위에 놓입니다.
                  </div>
                </div>
              </li>
            </ol>
          </section>

        </div>
      </main>

      <FinFooter />
      <GuideBookmarkNav />
    </div>
  );
}
