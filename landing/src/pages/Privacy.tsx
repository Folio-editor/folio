import { LegalLayout } from '../components/legal/LegalLayout';

export function Privacy() {
  return (
    <LegalLayout title="개인정보처리방침" effectiveDate="2026년 4월 24일">
      <p>
        폴리오(Folio, 이하 "회사")는 「개인정보 보호법」 및 관련 법령을
        준수하며, 회원의 개인정보를 보호하고 관련 고충을 신속하게 처리하기
        위하여 본 개인정보처리방침을 수립·공개합니다.
      </p>

      <h2>제1조 (수집하는 개인정보 항목 및 수집 방법)</h2>

      <h3>1. 필수 수집 항목</h3>
      <ul>
        <li>
          <strong>회원가입 시</strong>: 이메일, 비밀번호, 닉네임
        </li>
        <li>
          <strong>유료 서비스 이용 시</strong>: 결제 정보 (결제 수단 종류, 결제
          금액, 결제 일시)
        </li>
      </ul>

      <h3>2. 자동 수집 항목</h3>
      <p>서비스 이용 과정에서 다음 정보가 자동으로 수집될 수 있습니다.</p>
      <ul>
        <li>IP 주소, 쿠키, 기기 정보(OS, 브라우저 종류)</li>
        <li>서비스 이용 기록, 접속 로그</li>
        <li>AI 기능 사용 내역 (크레딧 사용 이력)</li>
      </ul>

      <h3>3. 수집 방법</h3>
      <ul>
        <li>홈페이지 및 앱에서의 회원가입 및 서비스 이용 과정</li>
        <li>고객센터를 통한 상담 문의</li>
        <li>결제 및 환불 과정</li>
      </ul>

      <h2>제2조 (개인정보의 수집 및 이용 목적)</h2>

      <h3>1. 회원 관리</h3>
      <ul>
        <li>회원제 서비스 제공, 본인 확인, 회원 식별</li>
        <li>부정 이용 방지, 비인가 사용 방지</li>
      </ul>

      <h3>2. 서비스 제공</h3>
      <ul>
        <li>웹소설 집필 에디터 서비스 제공</li>
        <li>AI 기반 검수·초안 생성·설정 추출 기능 제공</li>
        <li>맞춤형 서비스 제공</li>
      </ul>

      <h3>3. 결제 및 정산</h3>
      <ul>
        <li>유료 서비스 결제 및 환불 처리</li>
        <li>크레딧 관리, 구매 이력 관리</li>
      </ul>

      <h3>4. 고객 지원</h3>
      <ul>
        <li>문의 대응, 불만 처리, 공지사항 전달</li>
      </ul>

      <h3>5. 통계 및 서비스 개선</h3>
      <ul>
        <li>서비스 이용 분석 (개인 식별 불가능한 형태로 처리)</li>
      </ul>

      <h2>제3조 (개인정보의 보유 및 이용기간)</h2>
      <p>
        회사는 회원의 개인정보를 회원가입 시부터 회원 탈퇴 시까지 보유하고
        이용합니다. 단, 관련 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안
        보관합니다.
      </p>
      <table className="legal-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>보존 기간</th>
            <th>법적 근거</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>계약·청약철회 등에 관한 기록</td>
            <td>5년</td>
            <td>전자상거래법</td>
          </tr>
          <tr>
            <td>대금결제 및 재화공급에 관한 기록</td>
            <td>5년</td>
            <td>전자상거래법</td>
          </tr>
          <tr>
            <td>소비자 불만 및 분쟁처리 기록</td>
            <td>3년</td>
            <td>전자상거래법</td>
          </tr>
          <tr>
            <td>서비스 이용 기록, 접속 로그, IP 정보</td>
            <td>3개월</td>
            <td>통신비밀보호법</td>
          </tr>
          <tr>
            <td>부정 이용 기록</td>
            <td>1년</td>
            <td>내부 방침</td>
          </tr>
        </tbody>
      </table>

      <h2>제4조 (개인정보의 제3자 제공)</h2>
      <p>
        회사는 회원의 개인정보를 제1조에서 명시한 목적 범위 내에서만 이용하며,
        회원의 사전 동의 없이 제3자에게 제공하지 않습니다. 단, 다음의 경우는
        예외로 합니다.
      </p>
      <ol>
        <li>회원이 사전에 동의한 경우</li>
        <li>법령의 규정에 의거한 경우</li>
        <li>수사기관의 요청이 있는 경우</li>
      </ol>

      <h2>제5조 (개인정보 처리 위탁)</h2>
      <table className="legal-table">
        <thead>
          <tr>
            <th>수탁 업체</th>
            <th>위탁 업무</th>
            <th>처리 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic, PBC</td>
            <td>AI 검수 및 초안 생성</td>
            <td>원고 텍스트, 설정 정보</td>
          </tr>
          <tr>
            <td>OpenAI</td>
            <td>텍스트 임베딩</td>
            <td>원고 텍스트</td>
          </tr>
          <tr>
            <td>(주)코리아포트원</td>
            <td>결제 처리 대행</td>
            <td>결제 정보</td>
          </tr>
          <tr>
            <td>(주)카카오페이</td>
            <td>결제 수행</td>
            <td>결제 정보, 이름, 연락처</td>
          </tr>
          <tr>
            <td>Amazon Web Services</td>
            <td>서버 인프라 운영</td>
            <td>서비스 이용 데이터 전반</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>
          수탁업체는 회사의 운영 방침에 따라 변경될 수 있으며, 변경 시 본
          처리방침을 통해 사전 공지합니다.
        </li>
      </ul>

      <h3>AI 서비스 제공자에 대한 특별 고지</h3>
      <ol>
        <li>
          Anthropic(Claude)은 API로 전송된 데이터를 모델 학습에 사용하지 않으며,
          처리 후 해당 서버에서 삭제됩니다.
        </li>
        <li>OpenAI는 Embedding API 데이터를 모델 학습에 사용하지 않습니다.</li>
        <li>
          회사는 회원의 창작물을 보호하기 위해 AI 서비스 제공자의 데이터 처리
          정책을 지속적으로 검토합니다.
        </li>
      </ol>

      <h2>제6조 (개인정보의 파기 절차 및 방법)</h2>
      <ol>
        <li>
          회사는 개인정보 보유기간이 경과하거나 처리 목적이 달성된 경우 지체
          없이 해당 개인정보를 파기합니다.
        </li>
        <li>
          파기 방법:
          <ul>
            <li>전자적 파일: 복구할 수 없는 방법으로 영구 삭제</li>
            <li>종이 문서: 분쇄 또는 소각</li>
          </ul>
        </li>
      </ol>

      <h2>제7조 (회원의 권리·의무 및 행사 방법)</h2>
      <p>회원은 언제든지 다음의 권리를 행사할 수 있습니다.</p>
      <ol>
        <li>개인정보 열람 요청</li>
        <li>개인정보 정정·삭제 요청</li>
        <li>개인정보 처리 정지 요청</li>
        <li>회원 탈퇴 (개인정보 삭제)</li>
      </ol>
      <p>
        위 권리 행사는 서비스 내 설정 페이지 또는 고객센터 이메일(
        <a href="mailto:2square.f203@gmail.com">2square.f203@gmail.com</a>)을
        통해 요청할 수 있으며, 회사는 지체 없이 조치합니다.
      </p>

      <h2>제8조 (개인정보의 안전성 확보 조치)</h2>
      <p>
        회사는 회원의 개인정보 보호를 위해 다음과 같은 조치를 취하고 있습니다.
      </p>
      <ol>
        <li>
          <strong>기술적 조치</strong>
          <ul>
            <li>개인정보 암호화 저장 및 전송 (HTTPS, 비밀번호 해시)</li>
            <li>접근 권한 관리 및 접근 기록 보관</li>
            <li>해킹 방지를 위한 보안 프로그램 설치</li>
          </ul>
        </li>
        <li>
          <strong>관리적 조치</strong>
          <ul>
            <li>개인정보 처리 담당자 최소화 및 교육</li>
            <li>내부 관리 계획 수립 및 시행</li>
          </ul>
        </li>
      </ol>

      <h2>제9조 (쿠키의 운영 및 거부)</h2>
      <ol>
        <li>
          회사는 개인 맞춤 서비스를 제공하기 위해 쿠키를 사용할 수 있습니다.
        </li>
        <li>
          회원은 브라우저 설정을 통해 쿠키 수집을 거부할 수 있으나, 일부 서비스
          이용에 제한이 있을 수 있습니다.
        </li>
      </ol>

      <h2>제10조 (개인정보 보호책임자)</h2>
      <p>
        회원은 개인정보 관련 문의, 불만 처리, 피해구제 등을 아래 담당자에게
        요청할 수 있습니다.
      </p>
      <ul>
        <li>
          <strong>개인정보 보호책임자</strong>: 권혁준
        </li>
        <li>
          <strong>이메일</strong>:{' '}
          <a href="mailto:2square.f203@gmail.com">2square.f203@gmail.com</a>
        </li>
        <li>
          <strong>전화</strong>:{' '}
          <a href="tel:070-8064-7879">070-8064-7879</a>
        </li>
      </ul>

      <p>기타 개인정보 침해 관련 상담은 다음 기관에 문의하실 수 있습니다.</p>
      <ul>
        <li>
          개인정보침해신고센터 (
          <a
            href="https://privacy.kisa.or.kr"
            target="_blank"
            rel="noopener noreferrer"
          >
            privacy.kisa.or.kr
          </a>{' '}
          / 국번없이 118)
        </li>
        <li>
          대검찰청 사이버수사과 (
          <a
            href="https://spo.go.kr"
            target="_blank"
            rel="noopener noreferrer"
          >
            spo.go.kr
          </a>{' '}
          / 국번없이 1301)
        </li>
        <li>
          경찰청 사이버수사국 (
          <a
            href="https://ecrm.cyber.go.kr"
            target="_blank"
            rel="noopener noreferrer"
          >
            ecrm.cyber.go.kr
          </a>{' '}
          / 국번없이 182)
        </li>
      </ul>

      <h2>제11조 (개인정보처리방침의 변경)</h2>
      <p>
        본 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경
        내용이 있는 경우 시행 7일 전부터 공지합니다.
      </p>

      <hr className="legal-divider" />

      <p className="legal-effective-foot">
        <strong>시행일: 2026년 4월 24일</strong>
      </p>
    </LegalLayout>
  );
}
