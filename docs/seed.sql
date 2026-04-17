-- Auto-generated fixture seed for local storyzip DB
-- Generated from ai/tests/fixtures/dummy-work-{1,2,3}
BEGIN;

INSERT INTO writer (id, email, nickname, role)
VALUES ('fa20f003-1140-40a5-969d-66b74f659dcc', 'fixture-seed@folio.local', 'fixture-seed-writer', 'USER')
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nickname = EXCLUDED.nickname,
    role = EXCLUDED.role;

-- dummy-work-1
INSERT INTO work (id, writer_id, title, author_name, description, status, sort_order)
VALUES ('430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', '세기말의 천재 개발자가 되었다', 'Fixture Writer', '??: 1990년대 후반 (인터넷 태동기, 개발 환경 초창기)
??: 현대 판타지, 성장, 직장, 테크, 회귀물 감성
?: 현실적, 건조함, 빠른 전개, 성취감 중심, 점진적 긴장 고조
??? ??: 1인칭 시점, 짧고 직관적인 문장 위주. 불필요한 감정 묘사 최소화, 결과와 행동 중심 서술. 문제 해결 → 즉각적인 성과 → 주변 반응 구조 반복. 초반은 도파민 중심, 중반 이후 AI 의존과 불안 요소 점진적으로 강화.', 'draft', 1)
ON CONFLICT (id) DO UPDATE SET
    writer_id = EXCLUDED.writer_id,
    title = EXCLUDED.title,
    author_name = EXCLUDED.author_name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('93876bff-73c2-47eb-92d0-30b50bfb6fba', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '아무도 모르는 창', 'draft', 'TypeError: ''NoneType'' object is not iterable

야근은 선택이 아니라 상태였다.

형광등은 이미 한 번 깜빡였고, 사무실에는 키보드 소리만 남아 있었다. 나는 모니터를 보고 있었고, 모니터도 나를 보고 있었다.

검은 화면 위에 흰 글자.

result = process_data(data)

그리고 그 아래.

"하..."

손으로 얼굴을 쓸어내렸다.

세 번째였다.

같은 에러, 같은 위치, 같은 이유로 죽는 코드. 그런데도 왜 죽는지 모르겠다.

문서는 이미 세 번 봤다. 공식 문서, 예제 코드, 다른 사람이 짠 코드까지.

다 봤는데 모르겠다.

"현우야."

고개를 들자 팀장 박성진이 서 있었다.

"그거 아직도 안 되냐?"

"...네, 조금만 더 보면-"

"문서 제대로 봤어?"

봤다니까.

"네, 보고 있습니다."

그는 잠깐 화면을 보더니 말했다.

"그거 iterator 개념 이해 못 해서 그래. 다시 봐."

그리고 아무 일도 없다는 듯 돌아갔다.

나는 다시 화면을 봤다.

커서는 여전히 깜빡이고 있었다.

그때였다.

화면 오른쪽 위에, 분명히 없던 창이 하나 떠 있었다.

[ Suggestion Available ]

나는 눈을 깜빡였다.

사라지지 않았다.

"...뭐야."

마우스를 움직였다. 커서를 그 위에 올리고, 클릭.

Possible issue: - data가 None일 가능성 있음

Suggestion: if data is None: return []

손이 멈췄다.

이건... 내가 방금까지 찾던 문제였다.

"...아니."

나는 주변을 둘러봤다. 아무도 반응하지 않았다. 다들 자기 모니터만 보고 있었다.

다시 화면. 그 창은 그대로였다.

조심스럽게 코드를 수정했다.

if data is None: return []

실행.

에러 없음.

...됐다.

몇 초 동안 아무 생각도 들지 않았다.

그리고 다시 그 창을 바라봤다.

"너 뭐냐?"

Input accepted. Ask your question.

심장이 조금 빨라졌다.

나는 키보드를 천천히 두드렸다.

이 에러 왜 난 거야?

0.3초.

Cause: process_data 함수에서 None을 iterable로 처리하려 했기 때문

머리가 멈췄다.

이건...

검색보다 빠르다. 문서보다 정확하다.

그리고 무엇보다, 지금 이 시대에 존재할 수 있는 프로그램이 아니었다.

나는 고개를 들었다. 옆자리의 이지훈이 책을 펼쳐놓고 있었다. 두꺼운 기술서. 한 줄씩, 손으로 짚어가며 읽고 있었다.

나는 다시 화면을 봤다.

그리고 조용히 중얼거렸다.

"...나만 보이는 거냐."

이번에는 대답이 있었다.

Yes.

나는 웃었다.

"...미쳤네."

Ready for next input.

키보드 위에 손을 올렸다.

그리고 처음으로, 문서 대신 이 ''창''을 믿어보기로 했다.

나는 화면을 계속 보고 있었다. 손은 키보드 위에 올라가 있었지만, 움직이지 않았다.

이상했다. 너무 이상했다.

코드를 한 번 더 실행해봤다. 정상. 다시 실행. 정상.

나는 일부러 코드를 다시 망가뜨렸다.

result = process_data(None)

실행. 에러.

그 순간-

Possible issue detected.

나는 숨을 멈췄다.

이번에는 자동이었다. 내가 클릭하지도 않았는데, 그 창이 먼저 반응했다.

Suggestion: if data is None: return []

"...와."

나는 천천히 고개를 들었다. 사무실. 아무도 나를 보고 있지 않았다. 다들 자기 일에 집중하고 있었다.

다시 화면.

"...진짜 나만 보이네."

손을 들어 화면을 가렸다. 그래도 보였다. 손을 치웠다. 그대로였다.

"...이거 환각 아니냐."

눈을 세게 감았다. 다시 떴다. 그 창은 그대로였다.

나는 키보드를 두드렸다.

너 뭐냐

잠깐.

Undefined question.

"...뭐래."

나는 다시 입력했다.

너 프로그램이야?

Yes.

"...어디서 실행되는 건데."

Unknown.

"...뭐야 그게."

나는 웃었다. 이건 대화가 된다. 단순한 툴이 아니다.

나는 자세를 고쳐 앉았다. 그리고 진지하게 입력했다.

이거 인터넷 연결 필요해?

No.

"...뭐?"

순간 등골이 서늘해졌다. 인터넷도 없이 돌아간다고?

그럼 이건 뭐지?

나는 고개를 저었다.

"아니지..."

생각하지 말자. 지금 중요한 건 그게 아니다.

나는 다시 화면을 봤다.

"...그럼 이거 해보자."

나는 일부러 문제를 하나 더 만들었다.

numbers = [1, 2, 3] print(numbers[5])

실행. 에러.

그 순간-

Error detected. IndexError: list index out of range

그리고 바로 이어졌다.

Fix: Check list length before access

나는 웃었다.

"...이거 진짜네."

이건 단순히 "답을 주는 것"이 아니다. 문제가 생기면 먼저 반응한다.

나는 키보드를 두드렸다.

이거 어디까지 할 수 있어?

잠깐. 이번에는 조금 늦었다. 0.7초.

Depends on your input.

"...애매하게 말하네."

나는 몸을 앞으로 기울였다.

"...그럼 이건?"

나는 회사에서 가장 오래 걸리는 작업을 떠올렸다. 데이터 정리. 지저분한 로그를 파싱하고, 조건 걸고, 필터링하고, 결과 뽑는 작업. 사람들이 하루 종일 붙잡고 있는 일.

나는 입력했다.

이 로그 정리 코드 짜줘

그리고 코드 일부를 붙여넣었다.

잠깐. 이번에는 1초 정도 걸렸다.

def parse_log(data): result = [] for line in data: if "ERROR" in line: result.append(line) return result

손이 멈췄다.

"...이거."

나는 바로 실행해봤다. 돌아간다. 정확하다.

나는 천천히 숨을 내쉬었다.

"...이거 하나면..."

머릿속이 빠르게 돌아가기 시작했다.

이건 단순히 빠른 게 아니다. 이건 일을 없애는 수준이다.

나는 주변을 봤다. 사람들은 여전히 문서를 보고 있었다. 책을 넘기고 있었다. 한 줄씩 읽고 있었다.

그리고 나는 이미 끝냈다.

"...이거 들키면 안 되겠는데."

입 밖으로 나온 말이었다.

나는 화면을 다시 봤다.

"...너 이름 뭐냐."

잠깐.

Not assigned.

"...그럼 내가 정해도 되냐."

Yes.

나는 잠깐 고민했다.

"...AI."

잠깐.

Accepted.

나는 웃었다.

"...대충이네."

그날 이후, 나는 문서를 덜 보기 시작했다. 대신, 질문을 하기 시작했다. 작은 문제. 큰 문제. 이해 안 되는 개념. 전부 물어봤다. 그리고 전부 답을 얻었다.

속도는 점점 빨라졌다. 생각하는 시간보다, 입력하는 시간이 더 길어졌다.

그리고 어느 순간, 나는 깨달았다. 문제를 푸는 사람이 아니라, 정답을 입력하는 사람이 되어가고 있었다.

"현우야."

고개를 들었다. 팀장이 나를 보고 있었다.

"요즘 왜 이렇게 빠르냐."

"...그냥요."

"그냥은 무슨."

그는 눈을 가늘게 떴다.

"...뭔가 있다."

나는 웃었다.

"...없습니다."

하지만 그 순간, 나는 처음으로 생각했다.

이걸 계속 써도 되는 걸까. 아니면 숨겨야 하는 걸까.

그리고 그때였다. 화면에, 새로운 문장이 떠올랐다.

You are improving.

나는 멈췄다.

"...뭐?"

But dependency is increasing.

심장이 조금 내려앉았다.

"...그건 또 뭐야."

Do you want to continue?

나는 한참 동안 아무 말도 하지 않았다.

그리고 천천히 키보드를 눌렀다.

...응

잠깐.

Acknowledged.

커서가 깜빡였다.

그날 이후, 나는 확신하게 됐다.

이건 도구가 아니다. 이건 선택이다.', 820, 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('117d35ea-331c-4cb1-8626-a7e6afeaf638', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '속도가 다르다', 'draft', '며칠이 지났다.

변한 건 하나뿐이었다.

속도.

나는 더 이상 고민하지 않았다.

막히면 물어봤다.

이게 맞냐

Yes.

왜 틀렸냐

Because condition is incorrect.

어떻게 고치냐

Use this structure.

끝이었다.

문서를 펼칠 필요도 없었고, 책을 뒤질 필요도 없었다.

처음엔 이상했다.

"이렇게 해도 되나?"

그 생각이 계속 들었다.

하지만 결과는 항상 맞았다.

그리고 그게 문제였다. 너무 쉽다. 너무 빠르다. 너무 차이가 난다.

"현우야."

이지훈이 나를 불렀다.

"어."

"야 솔직히 말해봐."

"...뭐."

"너 뭐 쓰냐."

"...뭐를."

"툴."

나는 잠깐 멈췄다.

"...없는데."

"말이 되냐."

그가 웃었다.

"야, 우리 다 같은 거 쓰거든?"

그는 손으로 책을 툭 쳤다.

"이거. 문서 보고, 검색하고, 삽질하고. 그게 다야."

그는 몸을 기울였다.

"근데 너는 아니잖아."

나는 아무 말도 하지 않았다.

"5분 컷?"

그는 고개를 저었다.

"그건 사람이 하는 속도가 아니다."

나는 웃었다.

"...운 좋았네."

"개소리 하지 마."

그의 목소리가 낮아졌다.

"...너 숨기는 거 있지."

나는 화면을 봤다.

그 창은 여전히 떠 있었다.

Ready.

"...없다니까."

그날 이후, 이지훈은 나를 자주 쳐다봤다. 노골적이었다. 코드를 짤 때. 문제를 받을 때. 심지어 멍 때릴 때도.

"야."

"...왜."

"너 아까 뭐 보고 있었냐."

"...아무것도."

"거짓말하지 마."

나는 웃었다.

"...진짜야."

하지만 나는 알고 있었다. 시간 문제라는 걸.

그날 오후. 문제가 하나 더 떨어졌다. 이번에는 더 컸다. 데이터 처리. 로그 정리. 시간 제한 있음.

팀 전체가 붙었다.

"이거 오늘 안에 안 되면 끝이다."

팀장이 말했다.

사무실 공기가 바뀌었다. 다들 진지해졌다. 책이 펼쳐졌다. 문서가 켜졌다. 검색창이 열렸다.

나는 화면을 봤다.

그리고 입력했다.

이거 전체 구조 다시 짜줘

잠깐. 이번에는 조금 오래 걸렸다. 1초. 2초.

High complexity detected.

나는 숨을 멈췄다.

Rebuilding structure.

그리고 코드가 쏟아졌다. 줄 단위가 아니었다. 구조였다. 함수. 로직. 흐름. 전부.

"...미친."

나는 그대로 손을 움직였다. 복사. 수정. 붙여넣기. 돌린다. 성공.

10분. 그게 전부였다.

"야."

누군가 말했다.

"...끝났냐?"

나는 고개를 들었다.

"...네."

정적.

"뭐?"

이지훈이 자리에서 일어났다.

"지금 장난하냐?"

"...아닌데."

그가 모니터를 봤다. 코드를 읽었다.

"...야."

목소리가 바뀌었다.

"이거 네가 짠 거 맞냐."

"...응."

"이거 혼자?"

나는 대답하지 않았다.

그는 나를 쳐다봤다. 오래. 깊게.

"...너 뭐다."

나는 웃었다.

"...사람인데."

그날 이후, 사무실 공기가 달라졌다. 사람들이 나를 본다. 그건 시선이 아니라 관찰이었다.

그리고 나는 알았다. 이건 오래 못 간다.

그날 밤. 나는 혼자 남았다. 모니터를 켰다. 그 창이 떠 있었다.

"...야."

나는 말했다.

"...이거 들키면 어떻게 되냐."

잠깐.

Irrelevant.

"...뭐?"

Focus on efficiency.

나는 웃었다.

"...너 진짜 인간 아니네."

그리고 처음으로, 나는 느꼈다.

이건 도움이다.

하지만 동시에 위험하다.

그리고 그 순간, 나는 이미 선택하고 있었다.

더 빨라지기로.', 380, 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('0d2ed4c2-b3e4-4c43-8a9f-362d05e7fcb1', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '들킨다', 'draft', '며칠 사이였다.

아무도 말하지 않았지만, 분위기는 분명히 바뀌었다.

사무실은 여전히 조용했지만 그 조용함의 결이 달라졌다. 예전에는 각자 일에 집중하는 침묵이었다면 지금은 서로를 의식하는 침묵이었다. 특히, 나를.

이지훈은 더 이상 숨기지 않았다. 그는 노골적으로 나를 봤다. 코드를 칠 때도, 멍하니 화면을 볼 때도, 심지어 화장실 갔다 돌아올 때도. 시선이 따라왔다.

"야."

결국 먼저 입을 연 건 그쪽이었다.

나는 모니터에서 눈을 떼지 않은 채 대답했다.

"...왜."

"너 요즘 이상하다."

"...뭐가."

"속도."

나는 웃었다.

"...그 얘기 또냐."

"또지."

그는 의자를 끌고 내 옆으로 왔다.

"야, 솔직히 말해봐."

"...뭘."

"툴 쓰냐."

나는 키보드를 두드리다 멈췄다.

"...아니."

"말이 되냐."

그는 모니터를 가리켰다.

"이거 다 사람이 짠 거냐?"

"...응."

"거짓말 하지 마."

나는 고개를 돌렸다.

"그럼 네가 짜봐."

잠깐 정적. 이지훈의 눈이 좁아졌다.

"...장난하냐?"

"아니."

"이거 구조 다시 짜는 데 하루 걸린다."

"그럼 하루 써."

나는 다시 화면을 봤다. 더 이상 말할 필요 없다는 태도였다.

이지훈은 아무 말도 하지 않았다. 하지만 자리를 떠나지도 않았다. 그냥 서 있었다.

그리고 봤다. 내 손을. 내 화면을. 내 표정을.

나는 느꼈다. 이건 단순한 의심이 아니다. 확인이다. 증거를 찾고 있다.

"...야."

"...왜."

"너 아까 멍 때리다가 갑자기 치던데."

나는 웃었다.

"...생각했지."

"생각을 그렇게 빨리 하냐?"

"...가끔은."

"개소리."

그의 목소리가 낮아졌다.

"...너 뭐 숨기고 있다."

나는 아무 말도 하지 않았다.

대신 화면을 봤다.

그 창은 그대로 떠 있었다.

Ready.

조용하게. 아무 일도 없다는 듯이.

나는 천천히 입력했다.

지금 상황 어떻게 보냐

잠깐. 0.4초.

You are being observed.

나는 웃었다. 속으로만. 당연하지. 누가 봐도 이상하니까.

나는 다시 입력했다.

대응 방법

이번에는 조금 더 빨랐다.

Minimize abnormal behavior.

"...하."

나는 헛웃음을 흘렸다. 이미 늦은 것 같은데.

그 순간-

"현우야."

팀장이 불렀다.

나는 고개를 들었다.

"...네."

"잠깐 와봐."

톤이 평소랑 달랐다.

나는 자리에서 일어났다. 뒤에서 시선이 느껴졌다. 이지훈이었다.

회의실 문이 닫혔다. 안에는 팀장 하나였다.

"앉아."

나는 앉았다.

팀장은 잠깐 나를 보더니 입을 열었다.

"요즘 잘한다."

"...감사합니다."

"근데."

그는 말을 끊었다.

"...너 원래 그렇게 잘했냐?"

나는 웃었다.

"...아니요."

"그럼 갑자기 왜 그렇게 되냐."

나는 대답하지 않았다. 대신 시선을 피하지도 않았다.

팀장은 한참 동안 나를 봤다.

"...현우야."

"...네."

"이 업계 좁다."

나는 가만히 있었다.

"한 번 이상한 소문 돌면 끝이다."

"...네."

"툴 쓰는 거, 상관없다."

나는 고개를 들었다.

"다 쓴다."

그는 말했다.

"근데 티 나면 안 된다."

침묵.

"...무슨 말인지 알지?"

나는 잠깐 멈췄다. 그리고-

"...네."

"적당히 해."

그는 의자에 등을 기댔다.

"지금 너 너무 튄다."

나는 아무 말도 하지 않았다.

회의실에서 나왔다. 문이 닫혔다. 밖. 사무실. 사람들. 그리고 시선.

다시 내 자리로 돌아왔다. 앉았다. 모니터를 켰다.

그 창이 떠 있었다.

You are unstable.

나는 웃었다.

"...너까지 왜 이래."

Response required.

나는 한숨을 쉬었다.

그리고 물었다.

어디까지 해야 자연스럽냐

잠깐.

Simulate average developer speed.

"...와."

나는 고개를 뒤로 젖혔다.

이건 속도를 늦추라는 말이다.

나는 손을 보았다. 지금까지 너무 빨랐다. 너무 쉽게 풀었다. 그래서 이상해졌다.

나는 키보드를 내려놨다.

그리고 일부러 문서를 열었다. 스크롤을 내렸다. 아무 의미도 없는 코드 설명. 이미 다 아는 내용. 그걸 읽는 척했다.

옆에서 시선이 느껴졌다. 이지훈이다.

나는 일부러 한 줄 읽고 멈췄다. 다시 읽고. 또 멈췄다. 시간을 끌었다.

그리고 5분 후. 코드를 고쳤다. 천천히. 일부러.

"...됐네."

작게 중얼거렸다.

이지훈이 고개를 들었다.

"...그거 방금 본 거냐."

나는 어깨를 으쓱했다.

"...응."

그는 나를 한참 봤다.

그리고 고개를 끄덕였다.

"...그래."

그제야 시선이 사라졌다.

나는 화면을 봤다.

그리고 아주 작게 말했다.

"...이렇게 해야 되는 거냐."

잠깐.

Correct.

나는 웃었다.

"...하."

이건 이제 게임이다.

속도를 숨겨야 한다. 능력을 감춰야 한다.

그리고 그 순간, 나는 깨달았다.

이건 단순한 도구가 아니다. 이건 판을 바꾼다.

그리고 그 판에서 나는 이미, 혼자 다른 게임을 하고 있었다.

키보드 위에 손을 올렸다. 이번에는 조금 천천히.

하지만 속으로는 알고 있었다.

언제든지 다시 빨라질 수 있다는 걸.

그리고 그게 문제라는 것도.', 574, 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('db439cd9-f2e9-4691-aac4-44fb747e46b0', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '차원이 다르다', 'draft', '월요일 아침이었다.

출근하자마자 공기가 이상했다. 조용한데 묘하게 무거웠다.

사람들은 평소처럼 인사를 했지만, 시선이 따라붙었다. 특히 내 자리.

나는 아무렇지 않은 척 의자에 앉았다. 컴퓨터를 켰다.

부팅 소리가 들리는 동안 옆자리에서 말이 걸려왔다.

"야."

이지훈이었다.

"...왜."

"오늘 회의 있는 거 알지?"

"...알지."

"대형 건이다."

나는 고개를 끄덕였다. 이미 알고 있었다. 금요일 밤에 팀장이 말했었다.

"이번 거 따내면 우리 팀 산다."

그 정도였다.

회의실. 사람들이 하나둘 모였다. 팀장, 기획자, 다른 팀 개발자까지.

그리고 처음 보는 얼굴 하나. 정장. 말끔한 인상. 눈이 날카로웠다.

"외부에서 오신 분이다."

팀장이 말했다.

"이번 프로젝트 같이 볼 거다."

남자가 고개를 숙였다.

"최도윤입니다."

목소리가 낮았다. 짧고 정확했다.

나는 그를 잠깐 봤다. 그리고 바로 느꼈다.

저 사람, 다르다.

회의가 시작됐다.

기획자가 설명했다.

"로그 처리 시스템 전면 개선입니다. 현재 구조로는 트래픽 감당이 안 됩니다. 속도 문제, 메모리 문제, 유지보수 문제 다 있습니다."

슬라이드가 넘어갔다. 코드 구조. 데이터 흐름. 문제점.

복잡했다. 일반적으로라면 이거 하나 잡고 일주일은 붙어야 한다.

"의견 있으면 말해봐라."

팀장이 말했다.

정적. 아무도 쉽게 입을 열지 않았다.

그때였다.

"이 구조로는 안 됩니다."

최도윤이었다.

모든 시선이 그에게 향했다.

"애초에 데이터 흐름이 잘못 설계돼 있습니다."

그는 화면을 가리켰다.

"여기서 병목이 생깁니다. 그리고 이 반복 구조-"

그는 손가락으로 짚었다.

"불필요합니다."

정확했다. 너무 정확했다.

사람들이 조용해졌다.

"그럼 어떻게 해야 되죠?"

기획자가 물었다.

그는 잠깐 멈췄다. 그리고 말했다.

"전체 구조를 갈아엎어야 합니다."

회의실이 조용해졌다. 팀장이 인상을 찌푸렸다.

"시간 없다."

최도윤은 고개를 끄덕였다.

"알고 있습니다."

그리고 말을 이었다.

"그래서 더더욱, 지금 바꿔야 합니다."

그 순간 나는 화면을 봤다. 그리고 입력했다.

이 구조 어떻게 바꾸냐

잠깐.

High complexity detected. Rewriting architecture.

나는 숨을 멈췄다.

코드가 아니라 구조가 떴다. 데이터 흐름. 함수 분리. 처리 방식. 전부.

"...하."

나는 웃었다. 그리고 손을 들었다.

"...말해도 됩니까?"

회의실이 조용해졌다. 팀장이 나를 봤다.

"...말해."

나는 자리에서 일어나지 않았다. 그냥 앉은 채로 말했다.

"지금 구조 유지하면서 최적화하는 게 아니라-"

잠깐 멈췄다.

"데이터 흐름을 반대로 가져가야 합니다."

정적.

"여기서 필터링 먼저 하고-"

나는 화면을 가리켰다.

"그 다음에 처리해야 병목이 줄어듭니다."

사람들이 나를 봤다.

"...그리고 이 반복 구조-"

나는 손가락으로 짚었다.

"없애야 합니다."

최도윤의 눈이 움직였다.

"...대신 이 구조로 가면-"

나는 말을 이어갔다. AI가 보여준 그대로. 정확하게. 빠짐없이.

"...이렇게 하면 됩니다."

침묵. 완전히 조용해졌다.

팀장이 입을 열지 않았다. 기획자도 말이 없었다.

그리고 최도윤이 나를 봤다. 처음으로 표정이 바뀌었다.

"...그거."

그가 말했다.

"생각하고 말한 겁니까?"

나는 웃었다.

"...네."

짧은 거짓말이었다.

그는 한참 나를 보더니 고개를 끄덕였다.

"...가능합니다."

그 한마디였다.

회의실 분위기가 바뀌었다.

"그럼 그걸로 가자."

팀장이 말했다.

"현우, 네가 맡아."

"...네."

회의가 끝났다. 자리로 돌아왔다.

사람들이 나를 봤다. 이번에는 노골적이었다.

"야..."

이지훈이었다.

"...너 방금 뭐냐."

나는 웃었다.

"...아이디어지."

"아이디어?"

그는 헛웃음을 쳤다.

"그걸 그 자리에서?"

나는 어깨를 으쓱했다.

"...운 좋았네."

그는 아무 말도 하지 않았다. 하지만 표정이 굳어 있었다.

그날. 나는 혼자서 구조를 짰다. 정확히는 입력했다.

이거 코드로 만들어줘

그리고 완성됐다. 속도는 말이 안 됐다.

저녁. 팀장이 다가왔다.

"야."

"...네."

"잘했다."

"...감사합니다."

그는 잠깐 나를 보더니 말했다.

"...근데."

나는 고개를 들었다.

"너 요즘 좀 무섭다."

나는 웃었다.

"...왜요."

"사람 같지가 않다."

그 말에 나는 잠깐 멈췄다. 그리고 웃었다.

"...기분 탓입니다."

팀장이 떠났다.

나는 화면을 봤다. 그 창이 떠 있었다.

Performance increased.

"...그러게."

나는 중얼거렸다.

그리고 다시 문장이 떴다.

Dependency increasing.

손이 멈췄다.

"...또 그거냐."

Warning.

나는 웃었다.

"...됐어."

그리고 엔터를 눌렀다.

나는 알고 있었다. 이게 정상적인 방식이 아니라는 걸.

하지만 상관없었다.

결과가 나오니까. 속도가 나오니까. 사람들이 인정하니까.

그리고 그 순간, 나는 이미 한 발 더 들어가 있었다.

돌아갈 생각은 없었다.', 534, 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('179dc652-e74d-41f8-bcd7-39b30c3b72cd', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '값이 매겨진다', 'draft', '다음 날이었다.

출근하자마자 분위기가 달랐다.

사람들이 먼저 말을 걸었다.

"현우야, 어제 거 진짜 네가 한 거 맞냐?"

"...응."

"와 씨... 말이 안 되네."

"야 그거 구조 좀 나중에 설명 좀 해줘라."

나는 대충 고개만 끄덕였다. 설명할 생각은 없었다. 설명할 수 있는 것도 아니었다.

자리로 가 앉았다. 컴퓨터를 켰다. 그 창이 바로 떠 있었다.

Ready.

나는 아무 말도 하지 않았다.

어제 회의 이후로 머릿속이 계속 시끄러웠다. 잘했다. 인정받았다. 그건 좋았다.

문제는 너무 잘했다. 그게 이상했다.

"현우야."

팀장이 불렀다.

"...네."

"잠깐 와봐."

회의실이었다.

문을 열고 들어가자, 어제 봤던 사람이 있었다. 최도윤. 그는 이미 앉아 있었다. 나를 보고 있었다.

나는 문을 닫고 들어갔다.

"앉아."

팀장이 말했다. 나는 앉았다.

잠깐 정적. 그리고-

"어제 구조."

최도윤이 먼저 입을 열었다.

"...네."

"누가 생각한 겁니까?"

짧았다. 직설적이었다.

나는 잠깐 멈췄다. 그리고-

"...제가요."

그는 아무 말도 하지 않았다. 그냥 나를 봤다. 몇 초. 꽤 길었다.

"...혼자서요?"

"...네."

다시 침묵.

그리고-

"이거."

그가 서류 하나를 밀었다.

"외부 프로젝트입니다."

나는 서류를 봤다. 대기업 로고였다. 규모가 달랐다.

"지금 저희 쪽에서 같이 보고 있는데."

그가 말을 이었다.

"시간이 없습니다. 그리고 인력이 없습니다."

나는 아무 말도 하지 않았다.

"...그래서?"

팀장이 물었다.

최도윤은 시선을 나에게서 떼지 않은 채 말했다.

"이 사람 투입하면 됩니다."

회의실이 조용해졌다.

팀장이 나를 봤다.

"...현우 혼자?"

"네."

"...말이 되냐."

"됩니다."

짧았다. 확신이 있었다.

나는 서류를 넘겼다. 문제 설명. 데이터 처리. 로그 분석. 실시간 대응.

규모가 컸다. 보통이면 팀 단위로 들어가야 한다.

나는 고개를 들었다.

"...언제까지요."

"3일."

나는 웃었다.

"...빡센데요."

"그래서 묻는 겁니다."

그가 말했다.

"할 수 있습니까?"

나는 잠깐 생각했다. 그리고 화면을 떠올렸다. 그 창.

나는 답을 이미 알고 있었다.

"...됩니다."

팀장이 한숨을 쉬었다.

"...야. 너 진짜 괜찮냐?"

"...네."

"무리하지 마라."

나는 고개를 끄덕였다. 하지만 이미 결정은 끝났다.

회의실에서 나왔다. 자리로 돌아왔다. 앉았다. 컴퓨터를 켰다.

그 창이 떠 있었다.

나는 바로 입력했다.

이거 3일 안에 가능하냐

잠깐. 0.5초.

Possible.

나는 웃었다.

"...그렇지."

그리고 이어서 입력했다.

최적 방법

이번에는 조금 더 걸렸다. 1초. 2초.

Processing.

나는 화면을 뚫어지게 봤다.

그리고 코드가 아니라, 전략이 떴다. 단계별 접근. 데이터 구조 변경. 병렬 처리. 전체 흐름.

나는 숨을 천천히 내쉬었다.

"...끝났네."

그날부터였다.

나는 말 그대로 달렸다. 회사에서. 집에서. 심지어 지하철에서도.

노트북을 열었다. 입력했다. 확인했다. 수정했다. 다시 입력했다.

시간 감각이 사라졌다. 사람들이 퇴근해도 나는 남았다. 불이 꺼진 사무실에서 혼자 모니터를 보고 있었다. 그 창과.

"...야."

나는 중얼거렸다.

"...이거 진짜 되는 거 맞지."

잠깐.

Yes.

나는 웃었다.

"...그래."

이틀째. 코드는 거의 완성됐다. 속도가 말이 안 됐다. 내가 짠 게 아니라 그대로 옮긴 수준이었다.

셋째 날. 마무리. 테스트. 정상.

나는 의자에 몸을 기대었다.

"...끝."

손이 떨렸다.

이건 내 실력이 아니다. 나는 알고 있었다.

하지만 결과는 결과였다.

그날 오후. 결과를 넘겼다.

그리고 다음 날. 전화가 왔다. 팀장이었다.

"야."

"...네."

"미쳤다."

"...네?"

"통과다."

나는 잠깐 멈췄다.

"...진짜요?"

"야 이거 바로 적용 들어간다."

그의 목소리가 올라갔다.

"그리고-"

잠깐 멈췄다.

"...보너스 나온다."

나는 웃었다.

"...얼마요."

"천."

나는 말이 없었다.

"...천?"

"어. 천."

나는 웃었다.

"...와."

전화가 끊겼다.

나는 그대로 의자에 앉아 있었다. 가만히. 손을 봤다.

그리고 화면을 봤다. 그 창이 떠 있었다.

Performance achieved.

나는 웃었다.

"...그러게."

그리고 다시 문장이 떴다.

Response delay detected.

손이 멈췄다.

"...뭐?"

나는 바로 입력했다.

무슨 말이야

잠깐. 이번에는 느렸다. 1초. 2초. 3초.

그리고-

Working.

나는 눈을 좁혔다.

"...야."

처음이었다. 이렇게 느린 건.

나는 화면을 계속 봤다.

그리고 아무 일도 없었다는 듯, 다시 커서가 깜빡였다.

나는 한참 동안 아무 말도 하지 않았다.

그리고 조용히 중얼거렸다.

"...기분 탓이겠지."

하지만 어딘가 이상했다.

분명히 아주 조금, 느려졌다.

그리고 그 순간, 나는 몰랐다.

이게 시작이라는 걸.', 546, 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('4ef60749-4e63-4f45-866a-feb21070d841', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', '강현우', NULL, '남', '24세', '', 'INTP', '건조하고 감정 표현이 적으며, 문제 해결에 집요하다. 점점 결과 중심적이고 효율만을 추구하는 방향으로 변해간다.', '평범한 개발자 지망생이었으나, 어느 날부터 자신에게만 보이는 AI 인터페이스를 통해 압도적인 성과를 내기 시작한다. 회사 내에서 빠르게 인정받지만, 동시에 주변의 의심과 AI 의존성이라는 위험에 직면한다.', 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('48f5d27f-5750-4b6e-b696-5a06271c8254', '4ef60749-4e63-4f45-866a-feb21070d841', '직업', '개발자 지망생', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('45bc6c78-2dfe-4acb-9963-9e11804b7453', '4ef60749-4e63-4f45-866a-feb21070d841', '특이사항', 'AI 인터페이스를 시각적으로 인식 가능', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('7ce0dbfd-95e4-4163-8772-2671cc6088e9', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', '박성진', NULL, '남', '40대 초반', '', 'ISTJ', '현실적이고 보수적이며, 검증된 방식과 규칙을 중시한다. 실력은 인정하지만 이상한 부분에는 민감하게 반응한다.', '강현우의 팀장으로, 문서 기반 개발과 정석적인 접근을 강조하는 인물이다. 현우의 급격한 성장을 인정하면서도, 동시에 그 이면을 경계하기 시작한다.', 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('2a776f2b-24c6-4214-86c5-7a7cc3bebed6', '7ce0dbfd-95e4-4163-8772-2671cc6088e9', '직업', '개발팀장', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('3d94b2a1-c41d-467a-8e5a-b7b582061e9a', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', '이지훈', NULL, '남', '27세', '', 'ENTJ', '경쟁심이 강하고 직설적이며, 실력에 자부심이 있다. 의심이 생기면 끝까지 파고드는 성향이다.', '주인공과 같은 팀의 개발자로, 기존에는 실력자로 인정받던 인물이다. 그러나 현우의 비정상적인 속도에 의문을 품고 점점 집요하게 추적하기 시작한다.', 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('da3a09ae-b9a9-4b85-b960-06305d9b76da', '3d94b2a1-c41d-467a-8e5a-b7b582061e9a', '직업', '개발자', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('1016ad69-4973-4245-8d49-590599ac2cc7', '3d94b2a1-c41d-467a-8e5a-b7b582061e9a', '관계', '주인공과 경쟁 구도', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('223762b6-423c-4f34-ba9f-f4fc812895b5', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', '최도윤', NULL, '남', '30대 초반', '정장 차림, 단정하고 날카로운 인상', 'INTJ', '이성적이고 판단이 빠르며, 불필요한 말을 하지 않는다. 실력을 기준으로 사람을 평가한다.', '외부 프로젝트 담당자로 등장한 개발자로, 뛰어난 분석력과 통찰력을 지닌 인물이다. 강현우의 능력을 빠르게 알아보고 중요한 프로젝트에 투입시키며, 향후 중요한 역할을 할 가능성이 높은 인물이다.', 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('ef4973b1-c4bc-41ad-a26c-2b1780c7164d', '223762b6-423c-4f34-ba9f-f4fc812895b5', '직업', '외부 프로젝트 담당 개발자', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('b4edf657-6316-462b-a7ef-974765d6b01b', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', 'AI 인터페이스', NULL, '기타', '불명', '화면에 텍스트 형태로 표시되는 UI', '', '감정이 없고, 효율과 결과 중심의 판단을 한다. 점점 단순 응답을 넘어 평가와 방향 제시를 하기 시작한다.', '강현우에게만 보이는 정체불명의 인터페이스로, 질문에 대한 정답과 해결 방법을 제공한다. 점점 단순한 도구를 넘어 의사결정에 영향을 주는 존재로 변화하고 있다.', 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('b3c2095d-ed37-4488-8891-c25d63477f9b', 'b4edf657-6316-462b-a7ef-974765d6b01b', '특이사항', '인터넷 연결 없이 작동', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('ee0d0c9e-4809-4712-bdbc-25380dd24bcd', 'b4edf657-6316-462b-a7ef-974765d6b01b', '기능', '코드 생성, 문제 분석, 구조 설계', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('7bae140f-2236-4796-8326-1fa9fcf08c0f', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, 'AI 인터페이스', '강현우에게만 보이는 정체불명의 인터페이스로, 질문에 대한 즉각적인 답변과 코드, 구조 설계를 제공한다. 단순한 응답을 넘어 점점 사용자의 사고방식과 행동을 평가하고 방향을 제시하기 시작하며, 인터넷 연결 없이 작동하는 비정상적인 특징을 가진다.', 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('22ee9331-f79f-4215-b2a8-0bd959a6b933', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '1990년대 개발 환경', '인터넷이 제한적으로 보급된 시기로, 개발자들은 주로 공식 문서, 책, 예제 코드를 기반으로 문제를 해결한다. 검색 환경이 제한적이며, 정보 접근 속도가 느려 문제 해결에 많은 시간이 소요된다.', 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('cc46188c-28f5-46a3-b55a-43509788888e', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '회사 개발 문화', '문서 기반 학습과 정석적인 접근을 중시하는 환경으로, 효율보다는 안정성과 검증된 방법을 우선시한다. 빠른 해결보다 과정과 이해를 중요하게 여기며, 비정상적으로 빠른 결과는 의심의 대상이 된다.', 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('ad6b4b46-cfea-4501-8b84-2eb0e371cff4', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '데이터 처리 시스템 프로젝트', '로그 처리 및 데이터 분석을 위한 시스템 개선 프로젝트로, 기존 구조의 비효율성과 병목 현상을 해결하는 것이 목표다. 복잡한 구조와 높은 난이도로 인해 일반적으로 팀 단위로 진행되는 작업이다.', 6)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('b46b6f7e-8680-4aff-9af9-4779e4eab1a8', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '개발자 성장 구조', '일반적인 개발자는 문제를 분석하고 문서를 참고하며 시행착오를 통해 실력을 쌓는다. 그러나 강현우는 AI 인터페이스를 통해 이 과정을 생략하고 결과 중심으로 성장하며, 이는 기존 개발 방식과 충돌을 일으킨다.', 7)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('d0fdc606-caf6-46bf-8e61-f38313ed7167', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, 'AI 의존성', '강현우가 문제 해결 과정에서 AI 인터페이스에 점점 더 의존하게 되는 현상으로, 스스로 사고하는 과정이 줄어들고 판단 능력이 약화될 가능성을 내포한다. 동시에 성과는 급격히 상승하는 양면성을 가진다.', 8)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('226b6d7a-4dcf-4eb0-b3c5-8bc1f725c46d', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', '7bae140f-2236-4796-8326-1fa9fcf08c0f', 'AI 인터페이스 - 작동 방식', '사용자의 입력(질문, 코드, 문제 상황)을 기반으로 분석을 수행하고 최적의 해결책을 제시한다. 초반에는 단순한 오류 수정과 개념 설명에 집중하지만, 점점 복잡한 시스템 설계와 전략 제안까지 가능해진다.', 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('6635969f-b51d-4bbc-9d9f-a4cce1f80c75', '430f37bf-b548-44f2-a4f5-19a28f7ec304', 'fa20f003-1140-40a5-969d-66b74f659dcc', '7bae140f-2236-4796-8326-1fa9fcf08c0f', 'AI 인터페이스 - 이상 현상', '일반적인 프로그램과 달리 응답 속도가 비정상적으로 빠르며, 특정 시점부터는 응답 지연이나 경고 메시지, 사용자 평가 등의 행동을 보인다. 이는 단순한 도구를 넘어선 존재일 가능성을 암시한다.', 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- dummy-work-2
INSERT INTO work (id, writer_id, title, author_name, description, status, sort_order)
VALUES ('3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '잊고싶은 모든 것을 기억해드립니다', 'Fixture Writer', '??: 근미래 (2031년, 기억 추출·이식 기술이 상용화되어 ''기억 보관사''가 국가 자격 직업으로 제도화된 시대)
??: 현대판타지, 감성드라마, 힐링, 직업물
?: 잔잔함, 묵직함, 절제된 슬픔, 쓸쓸함, 건조한 따뜻함, 여백이 많은 서정
??? ??: 1인칭에 가까운 3인칭 제한 시점. 주인공 서리운의 시야와 감각만 따라가며, 다른 인물의 내면은 외적 묘사로만 추론하게 한다. 설명보다 행동과 침묵으로 보여주는 방식. 짧은 문장과 긴 문장을 교차해 호흡을 만들고, 단락 사이에 ***로 장면을 끊어 여백을 둔다. 감정을 직접 진술하지 않고 사물·동작·반복되는 일상으로 드러낸다(보리차 한 잔, 티슈 한 장, 김밥집의 같은 자리 등). 주인공의 과거는 직접 언급하지 않고 행동의 부재(운전을 안 함, 가족 사진 없음)와 작은 습관으로만 암시한다. 의뢰인 한 명마다 다른 결의 슬픔을 다루되 보편적 감정 — 죄책감, 미련, 사랑, 사과 — 을 건드린다. 톤은 절대 가볍거나 사이다스럽지 않으며, 무겁되 짓누르지 않는 균형을 지킨다.', 'draft', 2)
ON CONFLICT (id) DO UPDATE SET
    writer_id = EXCLUDED.writer_id,
    title = EXCLUDED.title,
    author_name = EXCLUDED.author_name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('5d1e0c91-3792-475c-a6a2-2acc29cb260d', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '흔들리지 않는 사람', 'draft', '부고는 새벽  5시 12분에 도착했다.

서리운은 그 시간에 깨어 있었다. 정확히 말하면 잠든 적이 없었다. 어제 받은 의뢰인의 기억이 자정쯤 한 차례 떠올랐고, 그 뒤로는 눈을 감아도 누군가의 결혼식 장면이 머릿속에서 계속 재생되었다. 신부 입장곡이 흐르고, 식장 뒷줄에 앉은 누군가가 울고 있는 장면. 그건 의뢰인의 기억이었다. 의뢰인이 짝사랑하던 사람의 결혼식이었고, 의뢰인은 그 자리에 끝까지 앉아 있었다고 했다. 그 기억을 지우고 싶다고 했다.

리운은 어제 그 기억을 받았다. 받았으니까 이제 그건 리운의 것이기도 했다.

휴대폰 진동이 협탁 위에서 울렸다. 리운은 손을 뻗어 화면을 확인했다. 회사에서 보낸 단체 메시지였다.

> [공지] 보관사 한지섭 선생님께서 오늘 새벽 자택에서 별세하셨습니다. 장례 일정은 추후 공지하겠습니다. 모든 의뢰는 정상 진행됩니다.

리운은 화면을 한참 들여다보았다. 메시지의 마지막 문장이 가장 오래 눈에 걸렸다. *모든 의뢰는 정상 진행됩니다.* 회사는 늘 그랬다. 보관사 한 명이 무너져도 다음 의뢰인은 예약된 시간에 도착하니까. 기억은 사람의 죽음을 기다려주지 않으니까.

한지섭. 리운보다 두 해 먼저 자격증을 땄던 사람이었다. 작년 가을부터 휴직 상태였다. 마지막으로 본 건 그 직전, 회사 복도에서였다. 한지섭은 리운을 보더니 잠깐 멈췄다가, 어색하게 웃으며 말했다.

"리운 씨는 어떻게 버텨요?"

리운은 그때 아무 대답도 하지 못했다. 어떻게 버티냐는 질문에 그가 줄 수 있는 대답이 없었기 때문이었다. 정확히는, 줄 수 있는 대답이 너무 잔인했기 때문이었다. 그래서 리운은 그냥 고개만 살짝 숙이고 지나갔다.

그게 마지막이었다.

리운은 휴대폰을 내려놓고 천장을 올려다봤다. 새벽 5시의 천장은 회색이었다. 창문 너머에서 첫차의 소리가 멀리 들려왔다. 곧 출근 시간이었다.

---

오피스텔에서 회사까지는 지하철로 40분이었다. 리운은 늘 같은 칸, 같은 자리에 앉았다. 7호선 다섯 번째 칸, 문에서 가장 먼 끝자리. 이유는 단순했다. 사람들의 손이 가장 적게 닿는 자리이기 때문이었다.

기억 보관사들 사이에는 미신 같은 게 있었다. 의뢰가 아닌데도 사람의 강한 감정이 손을 통해 흘러들어올 때가 있다는 것. 과학적으로 증명된 적은 없지만 보관사들은 다 알고 있었다. 만원 지하철에서 누군가의 손목이 닿았는데, 그 순간 알 수 없는 슬픔이 훅 들어올 때가 있다는 것을. 리운은 그래서 사람이 적은 칸을 골랐다. 그리고 사람이 적은 칸에서도 가장 구석을 골랐다.

그날 아침엔 칸이 비어 있었다. 평일 새벽 6시의 7호선은 늘 그랬다. 리운은 자리에 앉아 가방을 무릎 위에 올렸다. 검은색 가죽 가방. 안에는 노트북 한 대와 USB 케이스, 그리고 의뢰 동의서 양식 몇 장이 들어 있었다.

리운은 가방 바깥쪽 주머니에서 작은 통을 꺼냈다. 알약 통이었다. 안정제. 의사가 처방해준 것이지만 리운은 거의 먹지 않았다. 그래도 가지고 다녔다. 가지고 있다는 사실 자체가 위안이 되었다. 언제든 끊을 수 있다는 환상.

리운은 통을 다시 주머니에 넣고, 창밖을 봤다. 지하라서 보이는 건 아무것도 없었다. 자기 얼굴만 흐릿하게 비쳤다. 서른 살. 거울 속의 남자는 서른 살치고는 어딘가 더 늙어 보였다. 눈 밑이 어둡고, 입가의 선이 깊었다. 웃지 않는 사람의 얼굴이었다.

리운은 그 얼굴을 잠깐 들여다보다가, 시선을 거뒀다.

---

회사 이름은 길었다. 정식 명칭은 ''한국기억보존관리원''이고, 사람들은 그냥 ''관리원''이라고 불렀다. 4층짜리 건물의 3층 전체가 보관사 사무실이었다. 보관사는 전국에 서른두 명. 이 건물에는 그중 일곱 명이 있었다. 한지섭이 죽었으니까 이제 여섯 명이었다.

리운이 사무실에 도착했을 때, 복도는 평소보다 조용했다. 보통은 의뢰 전 상담을 위해 일찍 출근한 보관사들이 두세 명 보였는데, 오늘은 아무도 없었다. 다들 한지섭의 부고를 받았을 거고, 다들 출근을 미뤘을 것이다.

리운만 평소 시간에 왔다.

엘리베이터에서 내리자 안내 데스크의 김 주임이 리운을 보고 잠깐 멈칫했다. 김 주임은 입을 열었다가, 다시 닫았다. 한지섭의 일을 어떻게 꺼내야 할지 모르는 표정이었다. 리운은 그 표정을 알아보고 가볍게 고개만 숙였다.

"안녕하세요."

"...안녕하세요, 선생님."

김 주임은 평소처럼 따뜻한 차 한 잔을 종이컵에 따라 리운에게 건넸다. 5년 동안 매일 아침 똑같이 해오는 일이었다. 리운은 매번 정중하게 받았다. 받고는 사무실에 들어가자마자 책상 위에 올려두고 거의 마시지 않았다. 김 주임도 그걸 알았다. 알면서도 매일 차를 따랐다. 그 작은 의식이 리운에게 무슨 의미인지 김 주임 자신도 정확히는 몰랐지만, 멈출 수가 없었다.

오늘은 종이컵을 건네면서 김 주임이 한 마디를 덧붙였다.

"...따뜻할 때 드세요."

평소에는 안 하던 말이었다. 리운은 잠깐 그녀를 봤다. 김 주임의 눈가가 살짝 붉어져 있었다. 한지섭을 위해 운 사람의 눈이었다.

"네."

리운은 짧게 답하고 사무실로 들어갔다.

문을 닫고, 코트를 벽에 걸고, 책상 위에 종이컵을 내려놓았다. 그리고 잠깐 종이컵을 들여다봤다. 김이 천천히 올라오고 있었다. 평소 같았으면 그대로 식히게 두었을 것이다. 오늘은 한 모금을 마셨다. 보리차였다. 김 주임은 매번 보리차를 가져다줬다. 5년 동안 한 번도 다른 차를 가져온 적이 없었다.

리운은 종이컵을 책상 한쪽에 놓고, 의뢰 파일을 열었다.

> 의뢰인 #20310410-A
33세 / 여성
의뢰 종류: 영구 보관
사전 분류: 연애 관계 / 5년

5년. 짧지 않은 시간이었다. 보통 연애 의뢰는 일시 보관이 많았다. 시간이 지나면 의뢰인이 다시 찾으러 오는 경우가 많아서. 그런데 이 의뢰는 처음부터 영구였다. 돌려받을 생각이 없는 사람이라는 뜻이었다.

리운은 파일을 덮었다.

오전 10시까지는 2시간이 남아 있었다. 리운은 그 시간 동안 한지섭에 대해 생각하지 않으려고 노력했다.

---

의뢰인은 오전 9시 55분에 도착했다.

리운은 사무실 문을 열고 그녀를 맞이했다. 첫인상은 단정함이었다. 검은색 원피스. 머리는 어깨에 닿을락 말락 한 길이로 차분하게 정돈되어 있었다. 화장은 거의 하지 않은 것 같았고, 입술만 옅은 색으로 발라져 있었다.

그런데 신발이 운동화였다.

리운은 그 디테일을 알아챘지만, 아무 말도 하지 않았다. 사람들에게는 각자의 이유가 있고, 보관사는 그 이유를 묻지 않는 직업이었다.

"안녕하세요. 서리운입니다. 들어오시죠."

그녀는 가볍게 목례를 하고 사무실로 들어왔다. 리운이 가리킨 의자에 앉을 때, 그녀의 손이 살짝 떨리는 게 보였다. 리운은 그것도 못 본 척했다. 결심한 사람일수록 손이 떨린다는 것을 그는 알고 있었다.

리운은 책상 맞은편에 앉아 노트북을 열었다. 화면을 그녀 쪽으로 살짝 돌려서 의뢰서를 보여주며 말했다.

"먼저 절차를 안내드릴게요. 오늘은 본 이식이 아니라 사전 상담이 우선이에요. 이식은 다음 방문 때 진행됩니다. 다만 사전 상담에서도 일부 기억을 미리 검토할 수 있고, 의뢰인분이 원하시면 오늘 바로 진행도 가능합니다. 어떻게 하시겠어요?"

"오늘 바로 하고 싶어요."

대답이 빨랐다. 리운은 한 박자 쉬었다가 고개를 끄덕였다.

"알겠습니다. 그럼 먼저 의뢰 내용을 한 번 더 확인할게요. 영구 보관 신청하셨고, 분류는 연애 관계, 기간은 5년. 맞으신가요?"

"네."

"보관하실 기억의 범위를 정해주셔야 해요. 예를 들면, 헤어진 시점부터의 기억만 보관하실 수도 있고, 특정한 사건 전후만 보관하실 수도 있습니다. 가장 일반적인 건 나쁜 기억만 골라서 보관하는 방식인데..."

"전부요."

리운은 키보드 위에 올려둔 손을 멈췄다. 그녀를 봤다. 그녀는 리운의 눈을 정면으로 마주 보고 있었다.

"전부 가져가주세요. 좋았던 기억까지요."

리운은 잠깐 침묵했다. 그리고 직업적인 톤으로, 가능한 한 부드럽게 말했다.

"좋은 기억은 보통 남겨두시는 편이 회복에 도움이 됩니다. 사랑했던 사람을 완전히 지우는 건 자기 일부를 도려내는 일이에요. 다시 한 번 생각해보시는 게..."

"생각 많이 했어요."

그녀가 리운의 말을 끊었다. 부드럽지만 단호한 말투였다.

"오래 생각했어요. 정말 오래요."

리운은 입을 다물었다. 그녀는 잠깐 시선을 내렸다가, 다시 들었다.

"나쁜 기억만 지우면, 그 사람이 너무 좋은 사람으로 남을 것 같아요. 그건 거짓말이잖아요. 그 사람은 좋은 사람이기도 했고, 나쁜 사람이기도 했어요. 한쪽만 지우는 건 그 사람에 대한 모독 같아요."

그녀의 목소리는 떨리지 않았다. 떨린 건 손뿐이었다. 손은 무릎 위에서 작게 흔들리고 있었다.

"그러니까 다 가져가주세요. 그 사람을 통째로요."

리운은 그녀를 봤다.

그리고 처음으로, 아주 짧게, 흔들렸다.

겉으로는 드러나지 않았다. 표정은 그대로였고, 손도 멈추지 않았다. 리운은 키보드 위에서 다시 손가락을 움직였고, 화면에 메모를 남겼다. *영구 보관, 전체 범위, 의뢰인 의지 강함, 추가 설득 불필요.* 아주 평범한 메모였다. 누가 봐도 이상할 게 없는 메모였다.

하지만 메모를 치는 동안, 리운은 자기 손가락이 평소보다 아주 미세하게 더 무겁다는 걸 느꼈다. 왜인지는 생각하지 않았다. 생각하지 않는 것이 그가 3년 동안 익혀온 가장 중요한 기술이었다.

리운은 노트북에서 시선을 떼지 않은 채로 말했다.

"...알겠습니다. 진행하겠습니다."

---

이식은 사무실 안쪽의 작은 방에서 진행됐다. 의자 두 개, 그 사이에 놓인 작은 기계, 그리고 양쪽 의자에 앉은 사람의 관자놀이에 부착하는 두 쌍의 패드. 그게 전부였다. 사람들은 기억 이식이라고 하면 거대한 장비를 상상했지만, 실제로는 노트북 정도 크기의 기계 한 대면 충분했다. 어려운 건 장비가 아니라, 그 끝에 앉은 사람이었다.

리운은 그녀에게 패드 부착하는 법을 알려줬다. 그녀는 능숙하지 못한 손으로, 그러나 침착하게 패드를 이마에 붙였다. 리운도 자기 쪽 패드를 붙였다.

"이식이 시작되면 약간의 어지러움이 있을 수 있어요. 의뢰인분이 의식하지 않으셔도 기억은 자동으로 추출됩니다. 지정해주신 범위 내의 모든 기억이 제 쪽으로 옮겨와요. 시간은 대략 20분 정도. 끝나면 의뢰인분께서는 그 기억에 해당하는 부분만 비어 있는 상태가 됩니다. 그 사람을 만난 적이 있다는 사실 자체를 기억하지 못하실 거예요."

그녀는 고개를 끄덕였다. 그리고 잠깐 망설이다가 물었다.

"마지막으로 한 가지만 여쭤봐도 될까요?"

"네."

"보관사님은... 받으신 기억을 다 보세요?"

리운은 잠시 그녀를 봤다.

"필요한 만큼만 봅니다. 보관 상태를 확인하기 위해서요. 그 이상은 보지 않습니다."

거짓말이었다. 정확히는 절반만 진실이었다. 보관 상태 확인을 위해 한 번은 훑어봐야 했고, 그 한 번에 사실상 모든 기억이 리운의 것이 되었다. 보관사들 사이에서 모두가 알고 있는 비밀이었다. 의뢰인에게 굳이 말하지 않을 뿐이었다. 알면 더 두려워하니까.

그녀는 잠깐 가만히 있다가, 옅게 웃었다. 그날 그녀가 보여준 첫 번째 미소였다.

"그럼 부탁이 하나 있어요."

"말씀하세요."

"잘 보관해주세요. 그 사람을요."

리운은 그 말에 어떻게 대답해야 할지 몰랐다. 보관사로서 들은 말 중에서 가장 이상한 부탁이었다. 보통 의뢰인들은 "잘 지워주세요"라고 하지, "잘 보관해주세요"라고 하지 않았다. 그녀는 자기가 맡기는 것이 단순한 기억이 아니라 한 사람이라는 걸, 그리고 그 사람이 이제 리운의 안에서 살게 된다는 걸 아는 것 같았다.

리운은 짧게 대답했다.

"잘 보관하겠습니다."

그리고 기계의 스위치를 눌렀다.

---

이식이 끝났을 때, 그녀는 잠깐 멍한 얼굴로 앉아 있었다. 보통 의뢰인들이 이식 직후에 보이는 반응이었다. 자신의 일부가 사라졌다는 걸 머리로는 모르지만, 몸이 먼저 아는 거였다. 그녀는 이마에 손을 가져다 댔다가, 천천히 떼었다.

"...끝났나요?"

"네. 끝났습니다."

그녀는 자리에서 일어났다. 휘청이지 않았다. 이상할 정도로 단단해 보였다. 사람을 통째로 떠나보낸 사람치고는.

리운이 사무실 문까지 그녀를 배웅했다. 문 앞에서 그녀는 잠깐 멈췄다. 무언가를 기억하려는 사람처럼, 잠깐. 하지만 곧 고개를 한 번 가볍게 흔들고는 리운에게 인사했다.

"감사했습니다."

"안녕히 가세요."

그녀가 떠나고 난 뒤, 리운은 사무실 문을 닫았다. 등을 문에 잠깐 기댔다가, 다시 책상으로 돌아와 앉았다.

받은 기억을 들여다보는 절차가 남아 있었다. 24시간 안에 한 번은 훑어보고 보관 상태를 확인해야 했다. 다른 보관사들은 받자마자 확인했다. 빨리 끝내야 마음이 편하니까. 리운은 늘 가장 늦게 미뤘다. 24시간이 지나기 직전까지. 받은 기억과 마주하는 것이 매번 두려웠기 때문이었다. 두려움을 인정한 적은 없었지만.

오늘도 리운은 미뤘다.

대신 책상 서랍을 열었다. 안에는 빈 USB 케이스 하나가 있었다. 의뢰인이 가져온 USB는 이식 후 보관 절차에 따라 회사 보관실로 옮겨지지만, 케이스만은 보관사가 따로 보관했다. 의뢰의 흔적을 남기지 않기 위한 작은 의식이었다. 리운은 그 케이스에 의뢰 번호를 적은 라벨을 붙였다.

> 20310410-A

그리고 케이스를 서랍 안쪽에 넣었다. 그 안에는 이미 비슷한 케이스들이 가지런히 정리되어 있었다. 3년치였다. 정확히 몇 개인지 리운은 세지 않았다. 세는 순간 그게 무게가 될 것 같아서.

서랍을 닫고, 리운은 잠깐 책상 위의 종이컵을 들여다봤다. 보리차는 이미 식어 있었다. 김 주임이 따뜻할 때 마시라고 했던 그 차였다.

리운은 종이컵을 들어 한 모금을 마셨다. 차갑고 밋밋한 맛이었다. 그래도 마셨다. 끝까지 마셨다. 다 마시고 종이컵을 책상 모서리에 가지런히 놓았다.

그게 리운이 오늘 한지섭에게 할 수 있는 유일한 인사였다.

---

퇴근 시간이 되었을 때, 도하가 사무실 문을 두드렸다.

"형, 퇴근해요?"

임도하였다. 리운보다 한 해 후배인 동료 보관사. 평소엔 늘 활기차게 사무실 문을 벌컥 여는 사람이었는데, 오늘은 두드리고 들어왔다. 한지섭의 일 때문이었다.

리운은 가방을 챙기며 답했다.

"네."

"...혹시 한잔 안 할래요? 오늘은."

도하의 얼굴에는 평소의 장난기가 없었다. 리운은 그를 잠깐 봤다. 도하는 한지섭과 가까웠던 사람 중 하나였다. 오늘 가장 무거운 사람 중 하나일 것이다.

리운은 평소처럼 거절하려다가, 멈췄다. 거절하려고 입을 열었는데 말이 나오지 않았다. 잠깐의 침묵이 흘렀다. 도하도 거절을 예상한 것 같았다. 미리 어색하게 웃을 준비를 하고 있었다.

"...오늘은 일찍 들어가야 할 것 같아요."

리운이 결국 그렇게 말했다. 거절이긴 했지만, 평소의 "괜찮습니다"보다는 한 마디 길었다. 도하도 그 차이를 알아챘는지 잠깐 멈칫했다가, 가볍게 고개를 끄덕였다.

"네. 그래요. 들어가서 푹 쉬세요, 형."

도하가 문을 닫고 나간 뒤, 리운은 가방을 어깨에 메고 한참 사무실에 서 있었다. 왜 그 말이 나오지 않았는지 자신도 알 수 없었다. 그냥 오늘은 평소처럼 말이 나오지 않았다.

리운은 사무실 불을 끄고 나왔다.

---

지하철역까지 걷는 길에, 리운은 평소보다 천천히 걸었다. 4월의 저녁 공기는 아직 쌀쌀했다. 거리에는 퇴근하는 사람들이 가득했고, 그들 중 누구도 오늘 보관사 한 명이 죽었다는 사실을 모를 것이었다. 알 필요도 없었다. 그게 보관사라는 직업이었다.

리운은 횡단보도 앞에 멈춰 섰다. 신호가 빨간색이었다.

그 자리에 서서 그는 잠깐, 아주 잠깐, 오늘 의뢰인이 했던 말을 떠올렸다.

*그 사람을 통째로요.*

리운은 그 말을 다시 한 번 속으로 되뇌었다. 아주 익숙한 문장이었다. 어디서 들은 것 같은데 어디서 들었는지는 떠오르지 않았다. 떠오르려고 하면 무언가가 그것을 막았다. 리운은 떠올리지 않기로 했다. 떠올리지 않는 것에 그는 익숙했다.

신호가 파란색으로 바뀌었다. 리운은 다시 걷기 시작했다.

오피스텔에 도착했을 때 시간은 8시 40분이었다. 리운은 평소처럼 편의점에서 도시락을 사 들고 8층으로 올라갔다. 현관문을 열고, 신발을 벗고, 가방을 책상 위에 올려놓고, 도시락을 책상에 두고, 코트를 옷장에 걸었다. 늘 같은 순서였다.

리운은 책상 앞에 앉아 도시락 뚜껑을 열었다. 그리고 잠깐 멈췄다.

먹기 전에 그는 침대 머리맡 서랍을 열었다. 작은 사진 한 장이 들어 있었다. 여동생의 사진이었다. 여동생이 자기 휴대폰으로 찍어서 보냈던 셀카. 7년 전 어느 봄날, 여동생은 그 사진을 보내며 짧은 메시지를 함께 보냈었다. *오빠 나 머리 잘랐어 어때.* 리운은 그때 *그냥 그래*라고 답장했다. 평소의 무뚝뚝한 말투였다. 여동생은 이모티콘 하나를 보내고 대화를 끝냈다.

리운은 사진을 잠깐 들여다봤다. 그리고 다시 서랍에 넣었다.

서랍을 닫고, 도시락을 먹었다. 평소처럼 빠르게, 맛을 거의 느끼지 않으면서.

식사가 끝난 후 리운은 빈 도시락 통을 정리하고, 양치를 하고, 옷을 갈아입고, 침대에 누웠다. 시간은 9시 반. 평소보다 한 시간 일찍이었다.

천장을 올려다봤다. 회색 천장이었다. 새벽에 봤던 것과 같은 천장.

리운은 눈을 감았다.

오늘도 그는 흔들리지 않은 사람이었다. 적어도 누가 봤다면 그렇게 말했을 것이다. 동료가 죽은 날, 평소처럼 출근해서 평소처럼 의뢰를 받고 평소처럼 퇴근한 사람. 동료들이 "리운 씨는 어떻게 버텨요?"라고 묻는 그 사람.

다만 오늘은 평소보다 한 시간 일찍 누웠고, 김 주임의 보리차를 다 마셨고, 도하에게 평소보다 한 마디 더 길게 답했다. 아무도 모르는 미세한 차이들이었다.

리운 자신도 그 차이의 의미를 알지 못했다.

그는 곧 잠들었다.

오늘은 꿈을 꾸지 않았다.', 2080, 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('e203db0f-395e-4614-b193-f5a0f05f997d', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '보관 상태 확인', 'draft', '다음 날 아침, 리운은 평소보다 10분 일찍 출근했다.

이유를 묻는다면 답하지 못했을 것이다. 알람은 평소처럼 울렸고, 평소처럼 일어났고, 평소처럼 씻고 옷을 입었다. 다만 어제 침대에 한 시간 일찍 누운 탓인지 잠이 평소보다 깊었고, 그래서 아침의 동작20분 정도 빨라졌을 뿐이었다. 리운은 그렇게 자기 자신에게 설명했다.

7호선 다섯 번째 칸, 끝자리는 비어 있었다. 리운은 늘 앉던 자리에 앉아 가방을 무릎 위에 올렸다. 가방 안쪽 주머니에서 알약 통의 무게가 느껴졌다. 어제도 먹지 않았다. 오늘도 먹지 않을 것이다. 리운에게 안정제는 약이 아니라 부적이었다.

지하철이 출발했다. 창밖은 여전히 어두웠다.

리운은 가방에서 작은 수첩 하나를 꺼냈다. 검은색 가죽 수첩이었다. 안에는 의뢰 번호와 간단한 메모가 적혀 있었다. 회사에는 정식 의뢰 기록이 있지만, 리운은 자기만의 수첩을 따로 가지고 있었다. 받은 기억의 보관 상태를 본인이 직접 점검하기 위해서였다. 첫 페이지부터 마지막 페이지까지 빼곡했다. 3년치였다.

오늘의 점검 대상은 어제의 의뢰인이었다. *20310410-A*. 리운은 펜으로 그 줄에 작은 동그라미를 쳤다. 점검 예정이라는 표시였다.

가슴 안쪽에서 익숙한 압박이 천천히 올라왔다. 받은 기억을 들여다보기 직전에 늘 오는 감각이었다. 두려움이라고 부를 수도 있었지만, 리운은 그 단어를 자기 자신에게 허락하지 않았다. 두려움은 흔들리는 사람의 단어였다.

그는 수첩을 덮고 다시 가방에 넣었다.

---

회사 1층 로비에 들어섰을 때, 분위기가 어딘가 평소와 달랐다.

평소엔 출근 시간이 되면 직원들이 한두 명씩 엘리베이터 앞에 모여 있는데, 오늘은 사람들이 로비 한쪽에 작게 모여 서 있었다. 김 주임을 중심으로. 김 주임이 무언가를 설명하고 있었고, 사람들은 조용히 듣고 있었다. 한지섭의 장례 일정 같았다.

리운이 로비에 들어서자 사람들의 시선이 한 번씩 그를 향했다. 잠깐의 침묵이 지나갔고, 김 주임이 다시 말을 이어갔다. 리운은 시선을 마주치지 않은 채 그들을 지나쳐 엘리베이터로 향했다.

엘리베이터 버튼을 눌렀을 때, 뒤에서 발소리가 들렸다.

"형."

도하였다. 도하가 따라온 것이었다. 리운은 돌아봤다. 도하의 얼굴은 어제보다 더 피곤해 보였다. 눈 밑이 어두웠고, 머리도 평소처럼 정돈되어 있지 않았다.

"같이 올라가요."

리운은 가볍게 고개를 끄덕였다. 엘리베이터 문이 열렸고, 두 사람이 함께 탔다. 3층 버튼을 누른 건 도하였다. 리운은 옆에 서서 닫히는 문을 봤다.

엘리베이터가 천천히 올라가는 동안 도하가 입을 열었다.

"한 선생님 장례, 모레예요. 발인은 그 다음 날 새벽이고요."

"네."

"형도 가실 거죠?"

리운은 잠깐 말이 없었다. 가야 했다. 가지 않을 이유는 없었다. 그런데 이상하게 *간다*는 말이 입에서 나오지 않았다. 결국 그는 짧게 답했다.

"...네. 갈게요."

도하는 더 묻지 않았다. 엘리베이터가 3층에 멈췄고, 두 사람은 내렸다.

복도를 걸어가는 동안 도하가 한 번 더 입을 열었다. 이번엔 리운을 보지 않고, 정면을 보면서.

"어제 한 선생님 부고 받고 나서, 저 한참 동안 못 자겠더라고요. 자려고 누웠는데 자꾸 작년 가을이 떠올라요. 한 선생님이 휴직하기 직전에 저랑 점심 먹은 적이 있거든요. 그때 한 선생님이 저한테 그러셨어요. 도하 씨는 잘 우네요, 라고. 그 말이 칭찬인지 걱정인지 모르겠어서 그냥 웃었는데, 지금 생각해보면 칭찬이었던 것 같아요."

리운은 듣고만 있었다.

"우는 사람이 오래 가더라고요. 한 선생님이 그렇게 말씀하셨어요. 안 우는 사람이 더 위험하다고."

도하가 거기서 말을 멈췄다. 두 사람은 리운의 사무실 앞에 도착해 있었다. 도하는 잠깐 망설이다가, 리운을 봤다.

"형은 우세요?"

리운은 도하를 마주 봤다. 도하의 얼굴엔 진심이 담겨 있었다. 어떤 비난도, 어떤 의심도 없었다. 그냥 묻고 있을 뿐이었다.

리운은 잠깐 침묵했다. 그리고 답했다.

"...드물게요."

거짓말이었다. 리운은 7년 동안 한 번도 운 적이 없었다. 정확히 말하면 사고 직후 며칠 동안은 울었지만, 그 며칠이 지난 후로는 한 방울도 흘리지 않았다. 울음이 사라진 건 아니었다. 울 권리가 없다고 스스로 결정한 것이었다. 가족 셋을 죽인 사람이 울어서는 안 된다고.

도하는 리운의 답에 가볍게 고개를 끄덕였다. 거짓말인지 알아챘는지는 알 수 없었다. 알아챘다면 더 묻지 않는 것이 도하의 배려였을 것이다.

"그래도 형, 가끔은 울어도 돼요."

도하는 그렇게 말하고 자기 사무실 쪽으로 걸어갔다. 리운은 그의 뒷모습을 잠깐 보고, 사무실 문을 열었다.

---

사무실 안은 어제 그가 떠난 그대로였다. 책상 모서리에 가지런히 놓인 빈 종이컵, 닫혀 있는 노트북, 서랍 안쪽에 방금 추가된 USB 케이스 한 개.

리운은 코트를 벽에 걸고, 책상 앞에 앉았다. 어제의 종이컵을 들어 휴지통에 버렸다. 그리고 잠시 책상을 응시했다.

오늘 첫 의뢰는 오후 2시였다. 오전 시간은 비어 있었다. 이건 리운이 일부러 비운 시간이었다. 보관 상태 확인을 위한 시간. 어제 받은 기억을 들여다보는 작업은 사무실 문을 잠그고 혼자서 해야 했다.

리운은 자리에서 일어나 사무실 문으로 가서 잠금 장치를 걸었다. 안쪽에서. 그리고 창문 블라인드도 내렸다. 햇빛이 들어오면 집중이 흐트러졌다. 받은 기억을 들여다보는 일은 명상에 가까웠고, 명상에는 어둠이 필요했다.

그는 다시 책상 앞에 앉았다. 의자를 뒤로 살짝 밀어 등받이에 기댔다. 두 손을 무릎 위에 올리고, 천천히 숨을 내쉬었다. 한 번. 두 번. 세 번.

그리고 눈을 감았다.

---

기억은 처음에 색깔로 왔다.

받은 기억을 들여다보는 일은 리운에게 매번 다른 감각으로 시작됐다. 어떤 의뢰인의 기억은 소리부터 왔다. 어떤 의뢰인의 기억은 냄새부터. 어제 받은 기억은 색깔이었다. 따뜻한 노란색과, 그 옆에 함께 있는 더 어두운 갈색.

리운은 그 색깔을 따라갔다.

색깔은 곧 형태가 되었다. 형태는 풍경이 되었다. 어느 카페였다. 작은 카페. 창가 자리. 노란 백열등이 천장에 매달려 있었고, 갈색 나무 테이블이 두 사람 사이에 있었다. 한 사람은 그녀였다. 어제의 의뢰인. 5년쯤 더 어린 모습이었다. 머리가 더 길었고, 표정이 더 부드러웠다. 그녀의 맞은편에는 한 남자가 앉아 있었다.

남자의 얼굴이 천천히 또렷해졌다.

서른 살쯤. 마른 체형. 안경을 쓰지 않았다. 웃을 때 한쪽 입꼬리만 살짝 올라가는 사람이었다. 그 미소는 어딘가 어색하고, 어딘가 따뜻했다. 그가 그녀에게 무언가를 말하고 있었고, 그녀는 듣고 있었다. 카페 안에는 잔잔한 음악이 흘렀다. 그녀가 손에 쥐고 있는 머그컵에서 김이 올라왔다.

이게 첫 만남이었다. 5년 전, 어느 봄.

리운은 그 장면을 잠깐 들여다봤다. 그리고 다음으로 넘어갔다. 보관 상태 확인은 모든 장면을 자세히 보는 게 아니라, 기억의 뼈대가 제대로 자리 잡았는지를 확인하는 일이었다. 시작, 중간 몇 군데, 그리고 끝. 그렇게 훑었다.

기억은 자연스럽게 흘렀다. 두 사람이 손을 잡고 걷는 어느 거리. 두 사람이 함께 앉아 있는 영화관. 두 사람이 다투는 장면. 화해하는 장면. 다시 다투는 장면. 함께 떠난 짧은 여행. 바다가 보였고, 그녀가 웃고 있었고, 남자가 그녀의 어깨에 손을 올렸다.

리운은 이 모든 장면을 그녀의 시점에서 봤다. 그게 기억 보관사의 일이었다. 의뢰인이 살아온 그 사람의 인생을 의뢰인의 눈으로 다시 사는 것. 5년치 연애를 이십 분에 압축해서. 마치 누군가의 일기를 빠르게 넘겨 읽는 것과 비슷했다. 다만 종이에 적힌 글자가 아니라 살아있는 감각으로.

그리고 마지막 장면이 왔다.

---

리운은 거기서 흠칫했다.

그가 예상한 마지막 장면은 두 사람이 헤어지는 장면이었다. 어느 카페에서, 혹은 어느 거리에서, 그녀가 울고 있고 남자는 미안하다고 말하는 그런 장면. 보관사로서 이런 마지막 장면을 수십 번 봤었다. 뻔한 슬픔이었다. 익숙한 슬픔이었다.

그런데 마지막 장면은 헤어지는 장면이 아니었다.

그것은 병원이었다.

병실 안. 작은 1인실. 창가에 침대가 있었고, 침대에는 그 남자가 누워 있었다. 그녀가 알던 그 남자. 카페에서 한쪽 입꼬리로 웃던 그 남자. 다만 이번엔 웃지 않았다. 웃을 수 없는 상태였다. 그의 얼굴은 야위어 있었고, 팔에는 링거 줄이 연결되어 있었고, 호흡기가 입을 덮고 있었다. 의식은 없는 것 같았다.

그녀가 침대 옆 의자에 앉아 있었다. 그녀는 남자의 손을 잡고 있었다. 손을 잡고, 아무 말도 하지 않고, 그저 앉아 있었다.

리운은 그 장면 안에서 그녀가 느끼는 감정을 그대로 받았다. 보관사가 받은 기억은 단순한 영상이 아니었다. 의뢰인이 그 순간 느꼈던 감각과 감정이 통째로 보관사의 몸에 들어왔다. 그래서 리운은 지금, 그녀가 그 병실에서 느꼈던 것을 자기 가슴 안쪽에서 그대로 느끼고 있었다.

그건 슬픔이 아니었다.

정확히 말하면 슬픔만은 아니었다. 그 안에는 더 많은 것이 섞여 있었다. 미안함. 무력함. 분노. 그리고 가장 깊은 곳에는, 이상하게도 안도감 같은 것이 있었다. 이제 곧 끝난다는 안도감. 그 안도감 자체에 대한 죄책감. 죄책감 위에 다시 사랑. 사랑 위에 다시 분노.

리운의 가슴이 미세하게 뛰었다.

그는 이런 종류의 복합 감정을 잘 알고 있었다. 자기 자신의 가슴 안쪽에서 7년 동안 살아온 감정이었기 때문이었다. 사랑하는 사람을 잃는 일은 결코 단순한 슬픔이 아니었다. 사랑하는 사람을 잃은 사람만이 알 수 있는 감정의 층이 있었다. 그녀는 그 층에 있었다.

장면은 계속됐다.

밤이 깊어졌다. 병실의 불이 어둑해졌다. 간호사가 한 번 들어왔다가 나갔다. 그녀는 여전히 남자의 손을 잡고 앉아 있었다. 그러다 어느 순간, 침대 위 모니터의 소리가 변했다. 일정하던 신호가 길게 늘어졌다.

그녀는 자리에서 일어서지 않았다. 소리를 지르지도 않았다. 간호사를 부르지도 않았다. 그저 남자의 손을 더 꼭 잡았을 뿐이었다. 그리고 그녀는 남자에게 말했다. 아주 조용히, 거의 속삭이는 목소리로.

"...잘 가."

장면은 거기서 끊어졌다. 그녀의 기억이 거기서 멈춰 있는 것이 아니라, 그녀가 그 후의 장면을 의도적으로 봉인했기 때문이었다. 장례식, 발인, 49재. 그녀는 그 모든 것을 의식적으로 흐릿하게 만들어두고 있었다. 보관사인 리운에게 넘기기 전에, 그녀 스스로 정리해둔 것이었다. 가장 아픈 것은 가장 또렷하게, 가장 슬픈 것은 흐릿하게.

리운은 천천히 눈을 떴다.

---

사무실은 여전히 어두웠다. 블라인드 사이로 가는 햇빛이 한 줄 들어와 책상 위에 떨어져 있었다. 시간이 얼마나 지났는지 알 수 없었다. 보관 상태 확인을 시작할 때 시계를 보지 않았다.

리운은 손을 들어 자기 얼굴을 만졌다. 마른 얼굴이었다. 우는 사람의 얼굴이 아니었다. 리운은 그 사실을 확인하고 손을 내렸다.

그런데 그의 가슴 안쪽에서는 무언가가 천천히 움직이고 있었다.

그녀가 병실에서 느꼈던 그 복합 감정이 아직 그의 안에 남아 있었다. 보관사 일을 하다 보면 받은 기억의 감정이 일시적으로 자기 감정처럼 느껴지는 일이 자주 있었다. 베테랑 보관사들은 그것을 "잔여감"이라고 불렀다. 시간이 지나면 자연스럽게 가라앉았다. 빠르면 몇 시간, 길면 며칠.

그런데 오늘의 잔여감은 평소와 달랐다.

평소엔 받은 감정이 그의 가슴 안쪽 어느 한 곳에 머물다 가라앉았는데, 오늘은 그렇지 않았다. 오늘의 감정은 그의 가슴 안쪽에서 *움직였다*. 어디론가 흘러가고 있었다. 그리고 그 흘러가는 방향이, 리운의 가장 깊은 곳에 봉인해둔 어떤 감정과 같은 방향이었다.

리운은 자리에서 일어났다.

그는 그 감정의 방향을 따라가고 싶지 않았다. 따라가면 안 되는 방향이었다. 그쪽 끝에는 그가 7년 동안 들여다보지 않은 무언가가 있었고, 오늘 한 번의 잔여감 때문에 그것을 들여다볼 수는 없었다.

리운은 블라인드를 살짝 올려 햇빛을 들였다. 햇빛이 사무실 안으로 길게 들어왔다. 그는 그 빛 아래에 잠깐 서 있었다. 빛의 따뜻함이 가슴 안쪽의 움직임을 약하게나마 흩어놓았다.

그리고 그는 책상으로 돌아가 수첩을 열었다. *20310410-A*가 적힌 줄에 작은 표시를 추가했다. 점검 완료라는 표시. 그리고 그 옆에 한 줄을 적었다.

> 보관 상태 양호. 잔여감 보통.

거짓말이었다. 잔여감은 보통이 아니었다. 그러나 리운은 그렇게 적었다. 자기 자신에게도 거짓말을 하는 것이 그가 3년 동안 익혀온 또 하나의 기술이었다.

수첩을 덮고 시계를 봤다. 오전 11시 40분. 점심시간까지는 20분이 남아 있었다.

리운은 사무실 문의 잠금을 풀었다.

---

점심은 평소처럼 회사 근처 김밥집에서 혼자 먹었다. 김밥 한 줄과 어묵 국물 한 그릇. 늘 같은 메뉴였다. 김밥집 사장님은 리운이 들어오면 메뉴를 묻지 않았다. 3년 동안 한 번도 다른 걸 시킨 적이 없었으니까.

리운은 창가 자리에 앉았다. 점심시간이라 가게는 사람들로 가득했다. 다들 누군가와 함께였다. 직장 동료끼리, 친구끼리, 연인끼리. 리운만 혼자였다.

그는 김밥을 천천히 씹으면서 창밖을 봤다. 4월의 거리에는 햇빛이 가득했다. 사람들은 저마다의 점심시간을 보내고 있었고, 그 누구도 자기 옆을 스쳐 지나간 한 남자의 가슴 안쪽에서 어떤 일이 일어나고 있는지 알지 못했다.

리운은 그게 다행이라고 생각했다.

그때 휴대폰이 울렸다. 회사 메시지였다. 리운은 화면을 확인했다.

> [공지] 본원에 신입 보관사 한 분이 발령 예정입니다. 정식 업무 시작은 다음 달부터이며, 이번 주 중 인사 자리를 마련하겠습니다. — 정선재

리운은 메시지를 한 번 더 읽었다. 신입 보관사. 한지섭이 죽은 지 이틀 만이었다. 회사는 빨랐다. 죽은 사람의 자리는 빨리 채워야 했다. 의뢰는 기다려주지 않으니까.

리운은 휴대폰을 내려놓고 김밥의 마지막 조각을 입에 넣었다. 신입이 누구인지, 어떤 사람인지는 알 수 없었다. 알고 싶지도 않았다. 새로운 사람이 온다는 것은 새로운 관계가 생길 수 있다는 뜻이었고, 새로운 관계는 리운이 가장 피해온 것이었다.

그래도, 한 가지는 생각했다.

*저 사람이 잘 버티면 좋겠다.*

리운은 그렇게 생각하고, 곧 그 생각을 지웠다. 자기가 누군가의 안위를 빌어주기에는 자격이 부족하다고 느꼈기 때문이었다. 가족 셋을 죽인 사람이, 누군가의 안전을 빌어줄 자격이 있을 리 없었다.

리운은 자리에서 일어나 계산을 했다. 사장님이 평소처럼 한 마디를 덧붙였다.

"또 와요."

"네."

리운은 짧게 답하고 김밥집을 나섰다. 거리에는 여전히 햇빛이 가득했다. 리운은 그 햇빛 속으로 한 발 내디뎠고, 회사 쪽으로 천천히 걸었다.

오후 2시에 다음 의뢰인이 도착할 예정이었다. 리운은 그 시간까지 어제의 잔여감을 가라앉혀야 했다. 그래야 다음 의뢰인의 기억을 깨끗하게 받을 수 있었다.

그는 발걸음을 평소보다 조금 빠르게 했다. 빠르게 걸으면 가슴 안쪽의 움직임이 다른 곳으로 새어나갈 것 같았다. 하지만 그렇지 않았다. 가슴 안쪽의 무언가는 빠른 발걸음에도 가라앉지 않았다. 오히려 걸을수록 더 또렷해졌다.

리운은 한 번, 횡단보도 앞에서 잠깐 멈췄다.

그리고 어제 그 자리에서 떠올렸던 문장을 다시 한 번 떠올렸다.

*그 사람을 통째로요.*

어제는 그 문장이 어디서 들은 것 같다는 느낌만 있었다. 오늘은 한 발 더 가까이 와 있었다. 어디서 들은 게 아니라, 그가 누군가에게 *해본 적이 있는 말 같은 느낌*이었다. 정확히 누구에게, 언제 했는지는 떠오르지 않았지만.

신호가 파란색으로 바뀌었다. 리운은 다시 걷기 시작했다.

오후의 첫 의뢰인이 그를 기다리고 있었다.', 1889, 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('14248a28-30bd-4d16-abb9-a3f863fe4555', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '길을 잃은 사람', 'draft', '오후 두 시의 의뢰인은 마흔 살의 남자였다.

리운은 사무실 문을 열고 그를 맞이했다. 회색 정장 차림에 손목엔 무난한 시계를 차고 있었다. 회사원의 얼굴이었다. 다만 눈가에 깊은 그늘이 있었고, 사무실에 들어서자마자 그가 한 일은 의자에 앉기 전에 잠깐 한숨을 쉬는 것이었다. 그 한숨은 의식한 것이 아니라 몸에 배인 것이었다. 사람이 너무 오래 무거운 것을 들고 다니면 한숨이 그렇게 변했다.

"안녕하세요. 서리운입니다."

"안녕하세요."

남자는 의자에 앉았다. 그리고 가방을 무릎 위에 올려놓았다가, 다시 옆에 내려놓았다. 어디에 두어야 할지 모르는 사람의 동작이었다.

리운은 노트북을 열며 평소처럼 절차를 안내하려 했다. 그런데 그가 입을 열기 전에 남자가 먼저 말했다.

"저는... 사실 오늘 의뢰를 하러 온 게 아닙니다."

리운은 손을 멈췄다. 노트북 화면에 의뢰서가 떠 있었다. *20310411-B. 40세 남성. 일시 보관 신청. 사전 분류: 직장 관련 / 1년.* 의뢰서대로라면 남자는 직장에서 있었던 1년치 사건을 일시 보관하러 온 사람이었다. 그런데 본인이 그게 아니라고 했다.

리운은 의자에 등을 기대고 남자를 봤다. 직업적으로 차분한 표정을 유지했다.

"말씀해주세요."

남자는 잠깐 말이 없었다. 손가락으로 자기 손목의 시계를 만지작거렸다. 그러다 입을 열었다.

"의뢰서는 회사에서 작성한 거예요. 회사 차원에서 정해진 절차라고 해서요. 제가 다니는 회사에서 작년에 큰 사고가 있었습니다. 산업 재해. 동료 한 명이 죽었어요. 그 사고를 옆에서 본 직원들에게 회사에서 보관사 의뢰를 권유했습니다. 트라우마 관리 차원에서요. 비용은 회사가 부담하고요."

리운은 고개를 가볍게 끄덕였다. 산업 재해 후 회사 차원의 보관사 의뢰는 드문 일이 아니었다. 정확히 말하면 점점 늘어나고 있는 사례였다. 보관사 제도가 시작된 이후 기업들은 직원들의 트라우마 관리를 위해 보관사를 활용하기 시작했고, 그것이 일종의 "산재 후 패키지" 같은 것으로 자리 잡고 있었다. 리운은 이런 의뢰를 좋아하지 않았다. 직원의 의지가 아니라 회사의 결정으로 오는 의뢰는 본질적으로 강요에 가까웠기 때문이었다.

"그래서요?"

"저는 의뢰를 하고 싶지 않아요."

남자가 그렇게 말했다. 정확히 말하면 *못한다*에 가까운 말투였다.

"그 동료를... 잊고 싶지 않아요. 그 사람이 사고를 당하던 순간을 본 건 저였고, 그 순간에 제가 해줄 수 있었던 게 있었는지 없었는지 저는 아직 모릅니다. 모르는 채로 잊으면 안 될 것 같아요. 잊으면 그 사람한테 죄를 짓는 것 같아서요."

리운은 그의 말을 들었다. 그리고 이상하게도, 가슴 안쪽에서 어제의 잔여감이 한 번 더 흔들렸다. 잠재워둔 줄 알았는데 아니었다. 그것은 가라앉은 게 아니라 그저 잠시 숨어 있었을 뿐이었다.

남자의 말은 리운 자신이 7년 동안 자기 자신에게 해온 말이었다. *잊으면 안 된다. 잊으면 그들에게 죄를 짓는 것이다.*

리운은 잠깐 침묵했다. 그리고 직업적인 톤으로 말했다.

"의뢰는 본인 의지가 가장 중요합니다. 회사에서 권유했더라도 본인이 원하지 않으면 진행하지 않습니다. 거절할 권리가 있어요."

"그런데 회사에서는 자꾸 권유합니다. 제가 거절했더니 인사팀에서 한 번 더 만나자고 하고, 산업안전팀에서 또 한 번 만나자고 하고, 동료들도 다들 받았다고 저만 안 받으면 이상하게 본다고 하고..."

남자는 거기서 잠깐 말을 멈췄다. 손을 무릎 위에 올렸다가, 다시 시계를 만졌다.

"...그래서 일단 예약은 잡았어요. 와서 만나뵙기는 해야 할 것 같아서요. 그런데 막상 여기 앉아 있으니까 못 하겠어요."

리운은 그를 봤다. 남자는 리운을 마주 보지 않고 책상 한 구석을 보고 있었다. 도망갈 곳을 찾는 사람의 시선이었다.

리운은 자기 노트북을 닫았다. 그 작은 동작 하나가 남자에게 안도감을 준 것 같았다. 남자의 어깨가 조금 내려갔다.

"오늘은 진행하지 않겠습니다."

리운이 말했다.

"의뢰서는 미진행으로 처리하고, 회사 쪽에는 본인의 의지에 따라 보류하기로 했다고 기록하겠습니다. 이건 제가 보관사로서 결정할 수 있는 부분이에요. 회사가 의뢰인분께 다시 압박을 가할 경우, 저희 관리원에서 공식적으로 거절 의사를 전달해드릴 수 있습니다. 원하시면 그 절차도 안내해드리겠습니다."

남자는 잠깐 말이 없었다. 그러다 천천히, 거의 작게 떨리는 목소리로 말했다.

"...감사합니다."

"아닙니다."

리운은 자리에서 일어나려다, 잠깐 멈췄다. 평소 같으면 여기서 의뢰인을 배웅했을 것이다. 그게 그의 절차였다. 그런데 오늘은 한 마디가 더 나왔다. 본인도 의도하지 않은 말이었다.

"...잊지 않으셔도 됩니다."

남자가 리운을 봤다. 리운은 그의 시선을 마주 봤다. 그는 직업적인 톤을 유지하려 했지만, 자기 목소리에 평소와 다른 무언가가 섞여 있는 것을 느꼈다.

"잊지 않는 것도 한 가지 선택이에요. 모두가 잊는 쪽을 선택하지는 않아요. 잊지 않고 살아가는 사람도 있습니다. 그건 약하거나 미련한 게 아니에요. 그냥 다른 종류의 살아남는 방식이에요."

남자는 리운의 말을 들으면서 천천히 눈을 깜박였다. 그 눈에 무언가가 잠깐 차올랐다가, 그가 손등으로 빠르게 닦았다.

"...네. 감사합니다."

남자는 가방을 들고 일어났다. 사무실 문 앞에서 그는 한 번 더 리운을 돌아봤다. 무슨 말을 하려는 것 같았는데, 결국 하지 않았다. 그저 짧게 고개를 숙이고 사무실을 나섰다.

문이 닫혔다.

리운은 문을 닫고 잠깐 그 자리에 서 있었다. 자기가 방금 한 말이 아직 사무실 안에 떠 있는 것 같았다. *잊지 않는 것도 한 가지 선택이에요.* 그건 그가 보관사로서 의뢰인에게 해서는 안 되는 종류의 말이었다. 보관사는 잊는 것을 돕는 직업이었고, 잊지 않는 것을 권유하는 것은 직업 윤리에 어긋나는 일이었다. 다른 사람이 들었다면 분명 지적받았을 것이다.

그런데 리운은 그 말이 자기 입에서 나온 것이 후회되지 않았다.

---

오후 3시 반, 리운은 사무실 책상 앞에 앉아 의뢰서를 마무리하고 있었다. 오늘의 의뢰는 미진행으로 처리. 사유는 본인 의사. 회사에서 추가 압박이 있을 경우 관리원 공식 대응 가능. 그렇게 적었다.

그때 사무실 문이 살짝 두드려졌다. 리운이 고개를 들었다.

"네."

문이 열리고 김 주임이 들어왔다. 손에 무언가를 들고 있었다. 종이봉투였다.

"선생님, 손님이 오셨어요."

"손님이요?"

"네. 어... 어제 오셨던 의뢰인분이세요. 잠깐만 뵙고 싶다고 하셔서요."

리운은 잠깐 멈췄다. 어제의 의뢰인. 검은 원피스의 여자. 그녀가 다시 왔다.

이건 이상한 일이었다. 영구 보관 의뢰를 한 의뢰인은 절차상 다시 관리원을 방문할 일이 거의 없었다. 보관 절차가 끝났고, 자기가 맡긴 기억에 대해 의뢰인은 더 이상 알 수 없는 상태가 되었으니까. 다시 찾아온다는 건 무언가 후속 절차가 필요하다는 뜻이거나, 아니면...

"들어오시라고 해주세요."

김 주임이 고개를 끄덕이고 나갔다. 잠시 후 그녀가 사무실로 들어왔다.

어제와는 다른 옷차림이었다. 검은 원피스가 아니라 베이지색 카디건과 청바지였다. 신발은 어제와 같은 운동화. 머리는 같은 길이로 정돈되어 있었다. 어제보다 표정이 부드러웠다. 정확히 말하면, *어제의 일을 기억하지 못하는 사람의 표정이었다*.

리운은 자리에서 일어나 의자를 가리켰다.

"앉으시죠."

그녀는 가볍게 목례를 하고 의자에 앉았다. 어제와 같은 의자였다. 어제 그 자리에서 그녀는 한 사람을 통째로 떠나보냈는데, 오늘 그녀는 그 사실 자체를 기억하지 못한 채 같은 자리에 앉아 있었다.

리운은 책상 맞은편에 앉았다. 그리고 직업적인 톤으로 물었다.

"무슨 일로 오셨나요?"

그녀는 잠깐 망설이다가 말했다.

"사실은... 잘 모르겠어요."

"네?"

"오늘 아침에 일어났는데, 이 건물 주소가 제 휴대폰 메모에 적혀 있었어요. 어제 날짜로요. 그런데 저는 어제 여기 온 기억이 없어요. 메모를 보고 처음에는 제가 잘못 적어둔 줄 알았는데, 메모 옆에 *오전 10시 / 서리운 보관사*라고도 적혀 있었거든요."

리운은 그녀의 말을 듣고 있었다.

"그래서 검색해봤더니 여기가 기억보존관리원이라는 곳이고, 서리운이라는 분이 보관사로 등록되어 있더라고요. 그래서... 혹시 제가 어제 여기 왔던 게 맞는지 확인하러 왔어요."

리운은 잠깐 말을 고르다가, 답했다.

"네. 어제 오셨습니다."

"...그럼 제가 의뢰를 하러 왔던 거예요?"

"네."

"무슨 의뢰였는지 여쭤봐도 될까요?"

이 질문에 리운은 한 박자 멈췄다. 보관사의 직업 규정상 의뢰인의 의뢰 내용은 비밀이었다. 의뢰인 본인에게도 마찬가지였다. 영구 보관 의뢰의 경우, 의뢰인이 그 기억을 잊는 것이 의뢰의 핵심이기 때문에, 의뢰인 본인에게 의뢰 내용을 알려주는 것은 그 의뢰의 효과를 무효로 만드는 일이었다. 알려주면 의뢰인이 다시 그 기억을 *추측해서* 만들어낼 수 있었기 때문이었다. 추측된 기억은 진짜 기억보다 더 잔인할 수 있었다.

그래서 리운의 직업적 답은 정해져 있었다. *죄송합니다, 의뢰 내용은 의뢰인분께도 말씀드릴 수 없습니다.* 그렇게 말하면 됐다. 그게 절차였다.

"...연애 관련 의뢰였습니다."

리운은 그렇게 말했다. 절차를 어긴 답이었다. 정확한 내용은 말하지 않았지만, 카테고리를 알려준 것만으로도 보관사 직업 규정을 어긴 것이었다. 오늘 두 번째 위반이었다.

그녀는 잠깐 그 답을 들여다봤다. 마치 그 단어 안에서 무언가를 찾으려는 것처럼.

"...연애요."

"네."

"제가 누구를... 사랑했었어요?"

리운은 그녀를 봤다.

이 질문에 답할 수는 없었다. 이름을 알려줄 수도, 그 사람이 어떤 사람이었는지 알려줄 수도, 그 사람이 지금 어디 있는지 알려줄 수도 없었다. 그 모든 것이 직업 규정에 어긋났고, 그녀를 위한 일도 아니었다. 그녀는 그 사람을 잊기로 *스스로 선택한* 사람이었다. 어제의 그녀가 오늘의 그녀를 위해 한 결정이었다. 리운이 그 결정을 뒤집을 권리는 없었다.

리운은 답하지 않았다. 대신 그녀를 가만히 봤다.

그녀도 리운의 침묵을 읽었다. 그녀는 잠깐 시선을 내렸다가, 다시 들었다. 그 시선에는 슬픔도 분노도 없었다. 그저 약간의 피로함과, 약간의 체념과, 그 아래 어딘가의 호기심이 섞여 있었다.

"...말씀해주실 수 없는 거죠."

"네. 죄송합니다."

"아니에요. 알겠습니다."

그녀는 가방을 무릎 위에 올렸다. 그리고 잠깐 가만히 앉아 있었다. 자리에서 일어나기 전에, 그녀가 한 번 더 입을 열었다.

"한 가지만 더 여쭤봐도 될까요."

"네."

"제가 어제 여기서... 행복해 보였나요? 아니면 슬퍼 보였나요?"

리운은 그 질문에 한참 답하지 못했다.

어제의 그녀는 슬퍼 보였다. 손이 떨렸고, 검은 원피스를 입고 운동화를 신었고, 자기가 사랑한 사람을 통째로 떠나보내러 온 사람이었다. 그녀는 분명 슬펐다. 슬픔의 가장 깊은 곳에 있던 사람이었다.

그런데 그 슬픔의 옆에는 다른 무언가가 있었다. 단단함. 결심한 사람의 단단함. 그녀는 슬펐지만 무너지지 않았고, 떨렸지만 흔들리지 않았다. 어제 그녀가 사무실을 떠날 때, 리운은 그녀가 *살아있는 사람*이라고 생각했었다. 이미 죽은 사람을 한 번 더 떠나보내고도 살아남기로 결정한 사람이라고.

리운은 답을 골랐다. 직업 규정을 한 번 더 어기는 답이었다. 오늘 세 번째 위반이었다.

"...강해 보이셨어요."

그녀는 그 말을 들었다. 그리고 처음으로, 옅게 웃었다.

"강해 보였다고요."

"네."

"...다행이네요."

그녀는 자리에서 일어났다. 가방을 어깨에 메고, 사무실 문 쪽으로 걸어갔다. 문 앞에서 그녀가 한 번 더 멈췄다. 그리고 돌아서서 리운을 봤다.

"감사합니다."

"안녕히 가세요."

그녀는 사무실을 나섰다. 문이 닫혔다.

리운은 그 자리에 잠깐 서 있었다. 그녀가 떠난 자리는 어제와 같은 자리였다. 그런데 어제와 오늘 사이에 한 사람의 인생이 통째로 사라졌다. 그 사라짐을 아는 사람은 이제 이 세상에 리운 한 사람뿐이었다.

리운은 책상으로 돌아가 앉았다. 의자에 기대고, 천장을 올려다봤다. 사무실 천장은 흰색이었다. 형광등이 그 흰색 위에 작은 그림자를 드리우고 있었다.

리운은 천장을 보면서, 어제 그녀가 한 부탁을 떠올렸다.

*잘 보관해주세요. 그 사람을요.*

리운은 그 부탁을 받았다. 그리고 그 부탁을 지킬 사람은 자기뿐이었다. 그녀는 더 이상 그 사람을 기억하지 못했고, 세상의 누구도 그녀의 기억 속 그 사람을 알지 못했다. 그 사람은 이제 리운의 안에서만 살아있었다. 카페에서 한쪽 입꼬리로 웃던 그 남자, 병실에서 야위어가던 그 남자, 그녀가 마지막으로 *잘 가*라고 말해주었던 그 남자.

리운은 자기 가슴 안쪽에 손을 잠깐 가져다 댔다. 그 안에 한 사람이 살고 있었다. 그가 알지 못하는 사람이었지만, 이제 그의 일부였다.

---

오후 5시 반, 김 주임이 사무실 문을 두드렸다.

"선생님, 잠깐 뵐 수 있을까요?"

리운은 고개를 들었다. 김 주임은 손에 종이봉투를 들고 있었다. 아침에 들고 있던 그 종이봉투. 리운은 그제야 그 봉투의 정체가 궁금해졌다.

"네. 들어오세요."

김 주임이 사무실에 들어와 문을 닫았다. 그리고 종이봉투를 책상 위에 올려놓았다.

"이거... 한 선생님이 작년 가을에 저한테 맡기신 거예요."

리운은 봉투를 봤다. 평범한 갈색 종이봉투였다.

"한 선생님이 휴직하시기 전에 저한테 주시면서 그러셨어요. *나한테 무슨 일이 생기면, 이걸 리운 씨한테 전해주세요.* 그래서 제가 보관하고 있었어요. 어제 부고를 받고도 바로 드리기엔 너무 갑작스러울 것 같아서... 오늘 드려야 할 것 같아서요."

리운은 종이봉투를 잠깐 들여다봤다. 가슴 안쪽이 다시 한 번 움직였다. 어제의 잔여감과는 다른 종류의 움직임이었다.

"...뭐가 들어 있나요?"

"저는 안 봤어요. 한 선생님이 봉투째로 주셨고, 저한테는 열어보지 말라고 하셨거든요."

김 주임은 잠깐 말을 멈췄다가, 덧붙였다.

"한 선생님은 선생님을 많이 걱정하셨어요. 한 번도 직접 말씀하신 적은 없었지만, 저는 알았어요. 휴직하시기 전에 저한테 그러시더라고요. *김 주임님, 리운 씨 잘 챙겨주세요. 그 사람은 자기 자신을 챙길 줄 모르는 사람이에요.* 그게 한 선생님이 저한테 하신 마지막 말씀이었어요."

리운은 종이봉투에서 시선을 떼지 못했다.

김 주임은 더 말하지 않았다. 그녀는 가볍게 목례를 하고 사무실을 나섰다. 문이 조용히 닫혔다.

리운은 한참 동안 봉투를 보지 않고 그 옆을 봤다. 봉투를 직접 보면 안 될 것 같았다. 보면 안에 든 것을 열어봐야 할 것 같았고, 열어보면 무언가 그가 감당할 수 없는 것이 나올 것 같았다.

그러나 결국 그는 손을 뻗었다.

봉투의 입구를 천천히 열었다.

---

봉투 안에는 종이 한 장이 들어 있었다.

손글씨로 쓰인 짧은 편지였다. 한지섭의 글씨였다. 리운은 한 번도 한지섭의 글씨를 본 적이 없었지만, 그것이 한지섭의 글씨라는 것을 직감으로 알았다.

> *리운 씨에게.*
>
> *이걸 읽고 있다면 내가 떠난 후일 거예요. 미안해요. 마지막 인사를 못해서.*
>
> *복도에서 마주쳤던 그날, 내가 어떻게 버티냐고 물었던 거 기억하세요? 사실 그날 나는 답을 듣고 싶었던 게 아니에요. 그 질문은 리운 씨를 향한 게 아니라 나 자신을 향한 거였어요. 그 답을 알고 있는 사람이 리운 씨라고 생각해서 물어본 거예요.*
>
> *근데 리운 씨는 답을 안 했죠. 그때 나는 알았어요. 리운 씨도 사실 답을 모르고 있다는 걸. 답을 모르면서 버티고 있다는 걸. 그게 가장 무서운 종류의 버티기라는 걸.*
>
> *리운 씨. 흔들리지 않는 사람은 없어요. 흔들리지 않는 것처럼 보이는 사람이 있을 뿐이에요. 나도 한때는 흔들리지 않는 사람이었어요. 그게 얼마나 사람을 갉아먹는 일인지, 안에서 들여다본 사람만이 알아요.*
>
> *부탁이 하나 있어요.*
>
> *언젠가 리운 씨가 더 이상 버틸 수 없는 날이 올 거예요. 그날이 오면, 도망치지 마세요. 누군가에게 가세요. 누구든 좋아요. 옆에 있는 사람한테 그냥 말하세요. 못 버티겠다고. 그 한 마디만 하면 돼요. 그 한 마디가 사람을 살려요.*
>
> *나는 그 한 마디를 못 했어요. 그래서 이렇게 됐어요.*
>
> *리운 씨는 나처럼 되지 마세요.*
>
> *—한지섭.*

리운은 편지를 다 읽고도 한참 동안 그것을 손에 들고 있었다.

사무실은 조용했다. 창밖에서 4월의 늦은 오후 햇빛이 비스듬히 들어오고 있었다. 그 햇빛이 책상 위의 종이 한 장을 비추고 있었고, 그 종이 위에 한지섭이 마지막으로 남긴 글자들이 있었다.

리운은 천천히 편지를 접었다. 그리고 다시 봉투에 넣었다.

서랍을 열고, 봉투를 가장 안쪽에 넣었다. 어제 의뢰인의 빈 USB 케이스 옆에. 그리고 서랍을 닫았다.

그는 한참 책상 앞에 앉아 있었다.

가슴 안쪽에서 무언가가 천천히 무너지고 있었다. 그것은 어제부터 시작된 잔여감의 움직임과 같은 방향이었다. 다만 오늘은 더 빨랐고, 더 컸다. 리운은 그것을 막으려 했지만 막을 수 없었다. 막는 것이 불가능한 종류의 움직임이었다.

그는 자기 손을 봤다. 손은 떨리지 않았다. 표정도 바뀌지 않았다. 누가 봤어도 그는 여전히 흔들리지 않는 사람이었을 것이다.

다만 그는 그 자리에 한참 동안 앉아 있었다. 시계가 여섯 시를 가리킬 때까지. 그리고 여섯 시 반을. 일곱 시를.

평소 같았으면 6시 정각에 퇴근했을 것이다. 오늘은 그러지 못했다. 일어설 힘이 나지 않았다.

7시 반쯤, 사무실 문이 두드려졌다. 리운은 답하지 않았다. 그러자 문이 살짝 열리고, 도하의 얼굴이 들어왔다.

"형, 아직 안 갔어요?"

리운은 도하를 봤다. 도하의 얼굴에는 걱정이 떠 있었다. 평소엔 보지 못했던 얼굴이었다.

"...네."

"...괜찮아요?"

리운은 답하지 못했다. *괜찮다*는 말이 입에서 나오지 않았다. 평소엔 자동으로 나오던 말이었는데, 오늘은 그 두 글자가 어딘가에 막혀 있었다.

도하는 리운의 침묵을 잠깐 들여다봤다. 그리고 사무실 안으로 한 발 들어왔다.

"형, 한잔할래요?"

리운은 도하를 봤다.

7년 동안 그는 누구의 술자리 제안도 받아들인 적이 없었다. 그것은 그의 규칙이었다. 술자리는 사람을 무너지게 했고, 무너지면 안 되는 사람이 그였다. 그래서 그는 항상 거절했고, 거절은 자동이었다.

오늘도 자동으로 거절이 나올 줄 알았다. 그런데 입에서 나온 말은 거절이 아니었다.

"...네."

도하의 얼굴에 잠깐 놀란 표정이 떠올랐다. 3년 동안 한 번도 받아들여진 적이 없는 제안이 오늘 처음 받아들여진 것이었다. 도하는 그 놀람을 빠르게 감추고, 가볍게 고개를 끄덕였다.

"그래요. 가요. 제가 아는 데 있어요. 조용한 데."

리운은 자리에서 일어났다. 가방을 챙기고, 코트를 입었다. 손이 떨리지는 않았다. 다만 가슴 안쪽에서, 무언가가 7년 만에 처음으로, 아주 작은 틈으로 새어나오고 있었다.

서랍 안에는 한지섭의 편지가 있었다. 어제 의뢰인의 빈 USB 케이스 옆에. 두 사람의 무게가 그 안에서 함께 잠들고 있었다.

리운은 사무실 불을 끄고 도하와 함께 나섰다.', 2272, 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('c2245123-247d-4eb5-adf2-e83b181b7f5b', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '첫 잔', 'draft', '도하가 안다는 가게는 회사에서 두 정거장 떨어진 골목 안쪽에 있었다.

간판도 작고, 입구도 좁아서 모르는 사람은 그냥 지나칠 만한 곳이었다. 도하가 앞장서서 미닫이문을 열었다. 안은 생각보다 좁았다. 카운터석 다섯 자리, 작은 테이블 두 개. 손님은 카운터석에 한 명뿐이었다. 등을 돌리고 혼자 술을 마시는 중년 남자.

나이 든 사장이 카운터 안쪽에서 도하를 보고 가볍게 고개를 끄덕였다. 도하는 익숙한 사람의 동작으로 안쪽 테이블을 가리켰다.

"여기 앉아요, 형."

리운은 도하가 가리킨 자리에 앉았다. 의자가 작고 낮았다. 가게 안에는 옅은 조명과 잔잔한 라디오 소리가 흐르고 있었다. 라디오에선 오래된 가요가 흘러나오고 있었는데, 가사가 또렷하게 들리지 않을 만큼 볼륨이 작았다.

도하가 카운터 쪽에 대고 짧게 말했다.

"사장님, 따끈한 정종 한 병이랑요. 안주는 알아서 부탁드릴게요."

사장이 말없이 고개를 끄덕였다. 도하는 자리로 돌아와 리운 맞은편에 앉았다. 코트를 벗어 옆 의자에 걸쳤다.

"여기 사장님이 한지섭 선생님이랑 친했어요. 한 선생님이 자주 오시던 곳이거든요. 저도 한 선생님이 데려와서 알게 됐어요."

리운은 가게 안을 한 번 둘러봤다. 한지섭이 자주 앉았을 자리가 어디였을지 잠깐 생각했다. 아마 카운터석이었을 것이다. 사장과 짧게 말을 나누면서 술잔을 기울이는, 그런 자리. 한지섭은 그런 사람이었다.

"오늘 데려와서 죄송해요. 어제 부고 받은 곳에 데려오는 게 좀 그런가 싶었는데..."

"아니에요."

리운은 짧게 답했다. 도하는 잠깐 리운을 봤다가, 가볍게 고개를 끄덕였다.

---

정종이 나왔다. 작은 도쿠리에 따끈하게 데워진 술이 담겨 있었고, 잔도 두 개. 도하가 먼저 잔을 들어 리운의 잔에 술을 따랐다. 리운도 도하의 잔에 술을 따랐다. 익숙하지 않은 동작이었다. 7년 동안 누군가의 잔에 술을 따라본 적이 없었다.

도하가 잔을 살짝 들었다.

"한 선생님께."

리운도 잔을 들었다.

"...한 선생님께."

두 사람은 잔을 가볍게 부딪쳤다. 도하는 한 번에 잔을 비웠다. 리운은 한 모금만 마셨다. 따끈한 술이 목을 타고 내려갔다. 익숙하지 않은 감각이었다. 7년 만의 술이었으니까.

리운은 잔을 내려놓고 잠깐 가만히 있었다. 도하가 그 침묵을 읽고 자기 잔에 술을 한 번 더 따랐다.

"형 술 잘 못 드세요?"

"...오랜만이에요."

"얼마만이에요?"

리운은 한 박자 멈췄다. *7년 만이에요*라고 답하면 7년이라는 숫자가 도하의 머릿속에 박힐 것이고, 도하는 그 숫자를 기억할 것이다. 도하 같은 사람은 그런 숫자를 잊지 않았다. 그래서 리운은 다른 답을 골랐다.

"오래됐어요."

"그렇구나."

도하는 더 묻지 않았다. 두 번째 잔을 비우고, 안주가 나오기를 기다렸다.

잠시 후 사장이 작은 접시 두 개를 가져왔다. 두부조림과 간단한 나물. 사장은 접시를 내려놓으면서 도하에게 짧게 한 마디 했다.

"오랜만이네."

"네. 사장님, 한 선생님 소식 들으셨죠."

사장은 잠깐 도하를 봤다. 그리고 가볍게 고개를 끄덕였다.

"그저께 들었어. 삼우제 때 한 잔 올려야지."

"네."

사장은 더 말하지 않고 카운터 쪽으로 돌아갔다. 그게 그가 한지섭을 위해 할 수 있는 인사였다. 보관사도 아닌 이 작은 가게의 사장이 한지섭의 죽음을 알고 있었고, 슬퍼했고, 자기 방식으로 그를 떠나보내고 있었다. 리운은 그게 이상하게 위로가 되었다. 한지섭이 누군가의 일상 속에 살아있었다는 사실이.

---

도하가 두부조림을 한 점 집어 입에 넣었다. 천천히 씹으면서, 천장을 잠깐 올려다봤다.

"형, 저 솔직히 말할게요."

리운은 도하를 봤다.

"한 선생님이 휴직하신 게 작년 가을이잖아요. 그때부터 저 사실 무서웠어요. 한 선생님이 저보다 한참 선배니까, 한 선생님이 무너지시면 그 다음은 누구겠어요. 저 같은 사람이죠. 저 같이 자주 우는 사람."

도하는 거기서 잠깐 술잔을 들었다. 한 모금 마시고, 다시 내려놓았다.

"근데 더 무서웠던 건 형이었어요. 형이 무너지면, 그건 저 같은 사람이 아니라 다른 종류의 무너짐일 것 같았거든요. 형 같은 사람이 무너지면 회복이 안 될 것 같았어요. 한 선생님이랑 비슷한 종류의 무너짐이 될 것 같아서요."

리운은 답하지 않았다. 잔을 들어 한 모금 더 마셨다. 두 모금째였다.

"저 형이 안 무너졌으면 좋겠어요."

도하의 목소리에는 평소의 장난기가 없었다. 진심이었다. 리운은 도하의 진심을 받았다. 받았지만 답할 수가 없었다. *나는 이미 무너진 사람이에요*라고는 말할 수 없었다. 그건 너무 잔인한 진실이었고, 도하가 받기에는 너무 무거운 말이었다.

그 대신 리운은 다른 말을 골랐다.

"...저는 안 무너져요."

"왜요?"

"무너질 자격이 없어서요."

도하는 잠깐 리운을 봤다. 그 한 마디가 무슨 뜻인지 도하는 정확히 이해하지 못했지만, 그 말에 담긴 무게는 알아챘다. 그는 더 묻지 않았다. 대신 술잔을 들어 자기 입에 가져갔다.

침묵이 잠깐 흘렀다. 라디오에선 새 노래가 흘러나오고 있었다. 여전히 가사는 또렷하지 않았다. 두 사람은 한동안 그 잔잔한 음악 속에서 술을 마셨다.

리운은 세 모금째에 잔을 비웠다. 도하는 빈 잔에 술을 따라줬다. 리운은 그 술을 잠깐 들여다봤다. 작은 잔 안에서 흰 김이 옅게 올라오고 있었다.

"...도하 씨."

"네?"

"한 선생님은... 마지막에 어땠어요."

도하가 잠깐 멈췄다. 술잔을 입에 가져가던 손이 잠깐 공중에 멈췄다가, 천천히 내려갔다.

"마지막이라면, 휴직하시기 전이요?"

"네."

도하는 잠깐 생각을 정리하는 것 같았다. 그리고 천천히 입을 열었다.

"휴직하시기 직전 두어 달은... 사실 좀 이상하셨어요. 평소엔 농담도 잘하시고 사람들이랑 잘 어울리시던 분이었거든요. 근데 그 두 달 동안은 사람들이랑 거리를 두시더라고요. 점심도 혼자 드시고, 퇴근도 혼자 하시고. 저랑도 거의 말을 안 하셨어요."

도하는 거기서 잠깐 술잔을 봤다.

"근데 어느 날, 휴직하시기 일주일쯤 전에 저랑 단 둘이 점심을 드시러 가자고 하셨어요. 회사 근처 식당에서. 그때 저한테 말씀하셨어요. *도하 씨는 잘 우네요. 그게 도하 씨를 살릴 거예요.* 라고요."

리운은 그 말을 들었다. 어제 도하가 복도에서 했던 말과 같은 이야기였다. 다만 어제는 짧게 들었고, 오늘은 좀 더 긴 맥락이었다.

"그리고 한 선생님이 그러셨어요. *나는 한참 동안 안 울었어요. 그게 잘못이었던 것 같아요.* 그 말 듣고 저 진짜 가슴이 철렁했거든요. 그땐 무슨 말씀이신지 정확히는 몰랐는데, 지금은 알 것 같아요."

도하는 거기서 잔을 들어 한 모금 마셨다.

"안 우는 사람은요, 형. 안에서 죽고 있어요. 죽고 있는데 본인은 그걸 모르거나, 알면서도 멈출 수가 없거나. 한 선생님은 후자였던 것 같아요."

리운은 자기 잔을 봤다.

도하의 말이 리운의 가슴 안쪽 어딘가를 정확히 찔렀다. 그는 자기가 안에서 죽고 있다는 것을 알고 있었다. 7년 동안 알고 있었다. 알면서도 멈출 수가 없었다. 멈추는 방법을 잊었기 때문이었다. 멈추려면 먼저 자기 자신을 용서해야 했고, 리운에게 그건 가장 불가능한 일이었다.

리운은 잔을 들어 한 모금 더 마셨다. 네 모금째였다. 가슴 안쪽이 따뜻해지고 있었다. 술 때문인지, 도하의 말 때문인지는 알 수 없었다.

---

두 사람은 그 후로 한 시간쯤 더 머물렀다. 도하는 두 병째를 시켰고, 리운은 두 병째에는 손을 대지 않았다. 한 잔만 더 마시면 자기가 무언가를 말해버릴 것 같았다. 7년 동안 누구에게도 하지 않은 말을. 리운은 그게 두려웠다.

도하는 술이 들어갈수록 말이 많아졌다. 한지섭의 일화들. 입사 첫날 한 선생님이 자기한테 했던 농담. 첫 의뢰를 받고 사무실에서 운 날, 한 선생님이 와서 휴지를 내밀어준 일. 작년 봄에 셋이서 (리운은 아니고 다른 동료와 셋이서) 벚꽃놀이를 가기로 했었는데 결국 못 갔던 일. 작은 일들이었다. 다 작은 일들이었지만, 도하의 입을 통해 나오니까 한지섭이라는 사람의 윤곽이 조금씩 채워졌다.

리운은 한지섭에 대해 자기가 아는 것이 거의 없다는 것을 그제야 깨달았다. 한지섭과 같은 회사에서 3년을 일했는데도, 그가 어떤 사람이었는지를 거의 몰랐다. 그가 어떤 농담을 했는지, 어떤 안주를 좋아했는지, 어떤 음악을 들었는지. 리운은 그 모든 것을 알 기회가 있었지만 모두 거절했었다. 거절이 자기 생존이라고 믿었기 때문이었다.

지금 리운은 그 거절이 한지섭을 외롭게 만든 한 가지 이유였을지도 모른다고 생각했다. 한지섭은 리운에게 친구가 되고 싶었던 사람이었다. 리운은 그것을 알고도 받지 않았다. 알고도 받지 못했다.

*리운 씨는 어떻게 버텨요?*

그날 한지섭이 그렇게 물었던 것은, 정말로 답을 듣고 싶어서가 아니었다. 답을 들으려면 두 사람 사이에 무언가가 먼저 있어야 했고, 한지섭은 그 무언가가 없다는 것을 알면서도 한 번 더 시도해본 것이었다. 마지막 시도였다. 리운이 그날 짧게 답해줬다면, 단 한 마디라도 답해줬다면, 한지섭의 마지막은 조금 달랐을지도 몰랐다.

리운은 그 생각을 했고, 그 생각을 했다는 사실에 가슴이 다시 한 번 미세하게 무너졌다.

도하는 그 무너짐을 보지 못했다. 리운의 표정은 그대로였으니까.

---

가게를 나선 것은 밤 10시쯤이었다.

골목은 어두웠고, 가게 간판의 작은 불빛만이 발 밑을 비췄다. 4월의 밤공기는 낮보다 더 쌀쌀했다. 도하는 술기운에 얼굴이 살짝 붉어져 있었지만 발걸음은 멀쩡했다.

"형, 집까지 잘 가세요. 택시 잡아드릴까요?"

"아니에요. 지하철 탈 거예요."

"진짜 괜찮아요?"

"네."

도하는 잠깐 리운을 봤다. 그러더니 갑자기 손을 뻗어 리운의 어깨를 한 번 가볍게 잡았다.

"형."

"네."

"오늘 와줘서 고마워요."

리운은 도하의 손이 자기 어깨에 닿아 있는 것을 잠깐 느꼈다. 손은 따뜻했다. 그리고 그 손을 통해 무언가가 흘러들어왔다. 보관사들 사이의 미신 같은 그것. 강한 감정이 손을 통해 흘러들어올 때가 있다는 것. 도하의 손에서 흘러들어온 것은 슬픔도 아니고 걱정도 아니었다. 그것은 그냥 따뜻함이었다. 누군가가 누군가를 진심으로 걱정할 때 생기는 그 종류의 따뜻함.

리운은 자기 가슴 안쪽에서 그 따뜻함이 자리를 잡는 것을 느꼈다. 받지 말아야 할 감정이었지만, 막을 수 없었다. 막고 싶지도 않았다.

"...저도요."

리운은 그렇게 답했다. 도하는 옅게 웃었다.

"내일 봐요, 형."

"네. 내일 봐요."

도하는 손을 떼고 반대편으로 걸어갔다. 리운은 그의 뒷모습이 골목을 빠져나갈 때까지 잠깐 그 자리에 서 있었다. 그러고 나서 천천히 지하철역 쪽으로 걸었다.

---

지하철 안은 한산했다. 리운은 늘 앉던 칸의 늘 앉던 자리에 앉았다. 가방을 무릎 위에 올리고, 창밖을 봤다. 지하의 어둠이 창에 비쳤다. 자기 얼굴이 흐릿하게 보였다.

오늘의 얼굴은 어제와 달라 보였다. 어디가 다른지는 정확히 말할 수 없었다. 다만 어제의 얼굴이 더 굳어 있었다면, 오늘의 얼굴은 살짝 풀려 있었다. 술 때문일지도 몰랐다. 아니면 다른 무언가일지도.

리운은 가방에서 수첩을 꺼냈다. 검은 가죽 수첩. 오늘 점검 완료한 *20310410-A*가 적혀 있었다. 그 옆에 적었던 *보관 상태 양호. 잔여감 보통.* 이라는 거짓말도.

리운은 펜을 꺼내 그 줄에 작은 수정을 했다. *잔여감 보통* 옆에 작은 글씨로 한 단어를 추가했다.

> *깊음.*

그 단어를 적고, 수첩을 잠깐 들여다봤다. 자기 자신에게 거짓말을 한 부분을, 7년 만에 처음으로 정정한 것이었다. 작은 정정이었지만, 리운에게는 큰 의미였다. 자기에게 솔직해지는 일을 그는 7년 동안 한 번도 한 적이 없었다.

리운은 수첩을 덮고 가방에 다시 넣었다.

---

오피스텔에 도착한 건 11시 반이었다. 평소보다 2시간 늦은 귀가였다. 리운은 현관문을 열고 신발을 벗고, 가방을 책상 위에 올려놓았다. 평소와 같은 동작들이었지만, 오늘은 어딘가 한 박자씩 느렸다.

그는 옷을 갈아입지 않은 채로 한참 책상 앞에 앉아 있었다. 술기운이 천천히 가라앉는 것을 느끼면서. 가슴 안쪽의 따뜻함이 조금씩 식어가는 것을 느끼면서. 식는 것이 아쉬웠다. 그래서 그는 그 따뜻함이 완전히 사라지기 전에, 침대 머리맡 서랍을 열었다.

여동생의 사진을 꺼냈다.

오늘은 평소보다 오래 들여다봤다. 평소엔 한두 번 보고 다시 넣었는데, 오늘은 1분, 2분, 그 이상을 들여다봤다. 사진 속의 여동생은 웃고 있었다. 머리를 짧게 자른 직후의 사진이었다. 짧은 단발머리. 여동생은 자기 머리가 마음에 든다는 표정으로 카메라를 보고 있었다.

*오빠 나 머리 잘랐어 어때.*

그날 여동생이 보낸 메시지였다. 리운은 그 메시지에 *그냥 그래*라고 답장했었다. 평소의 무뚝뚝한 말투. 여동생은 이모티콘 하나를 보내고 대화를 끝냈다.

리운은 7년 동안 그 답장을 후회해왔다. 다른 답장을 했어야 했다. *예쁘다*거나, *잘 어울려*라거나, *언제 자른 거야*라거나. 무엇이든 좋았다. 무뚝뚝하지만 않았다면. 여동생이 보낸 마지막 메시지에 그가 더 다정하게 답했더라면.

오늘 리운은 그 후회를 다시 한 번 했다. 다만 오늘의 후회는 평소와 약간 달랐다. 평소엔 후회가 가슴 안쪽 어딘가에 단단히 박혀 있었다면, 오늘은 그 박혀 있던 것이 살짝 움직였다. 어디로 움직이는지는 알 수 없었다. 다만 움직였다는 사실만은 분명했다.

리운은 사진을 다시 서랍에 넣고, 옷을 갈아입고, 침대에 누웠다. 시간은 자정이 넘어 있었다.

오늘 밤은 잠이 빨리 올 것 같았다. 술 때문일지도 모르고, 도하 때문일지도 모르고, 한지섭의 편지 때문일지도 몰랐다. 어쩌면 셋 다일지도 몰랐다.

리운은 눈을 감았다.

---

다음 날 아침, 리운은 평소보다 10분 늦게 깼다.

알람을 듣고도 일어나지 못한 것이 7년 만이었다. 정확히 말하면 7년 동안은 알람이 울리기 전에 깨어 있었기 때문에 *늦게 깼다*는 표현 자체가 어색했다. 오늘 처음으로 알람 소리에 깨어났고, 알람이 울리고도 10분을 더 누워 있었다.

그는 천장을 보면서 오늘이 무슨 요일인지를 잠깐 생각했다. 금요일이었다. 금요일은 보통 의뢰가 두 건 잡히는 날이었다. 오전에 한 건, 오후에 한 건.

리운은 천천히 일어났다. 어제의 술기운은 거의 남아 있지 않았다. 다만 가슴 안쪽 어딘가에 도하가 두고 간 따뜻함의 흔적이 아직 남아 있었다. 그것은 사라지지 않은 채 자기 자리에 있었다.

리운은 평소처럼 씻고, 옷을 입고, 가방을 챙겼다. 오늘은 보리차를 한 잔 마시고 나가고 싶다고 잠깐 생각했다. 김 주임의 보리차가 아니라, 자기가 직접 끓인 보리차를. 그러나 집에는 차가 없었다. 7년 동안 자기 손으로 차를 끓인 적이 없었으니까.

리운은 그 사실을 알아채고, 잠깐 그 자리에 서 있었다. 그리고 메모지에 짧게 한 줄을 적었다.

> *보리차 사기.*

작은 일이었다. 너무 작은 일이라 누가 봤다면 이게 무슨 의미가 있냐고 물었을 것이다. 다만 리운에게 그 한 줄은 7년 만의 작은 결심이었다. 자기가 자기를 위해 무언가를 사겠다는 결심.

리운은 메모지를 책상 위에 두고 집을 나섰다.

---

회사에 도착한 시간은 평소보다 15분 늦은 시각이었다. 1층 로비에서 김 주임이 리운을 보고 살짝 놀란 표정을 지었다. 평소 시간보다 늦은 리운을 본 것이 5년 만에 처음이었다.

"선생님, 늦으셨네요."

"...네. 잠을 좀 늦게 잤어요."

"보리차 드릴까요?"

"네. 부탁드릴게요."

김 주임은 종이컵에 보리차를 따라 건넸다. 리운은 받아들고 평소처럼 가볍게 목례를 했다. 그러고 나서, 처음으로 한 마디를 덧붙였다.

"...오늘도 따뜻하네요."

김 주임은 잠깐 멈췄다. 5년 동안 매일 따라준 차였다. 그동안 리운은 한 번도 그 차에 대해 한 마디도 한 적이 없었다. 받기만 하고 마시지도 않았다. 오늘 처음으로 그 차에 대해 말했다.

"...네. 매일 그 시간에 따뜻하게 우려놔요."

"감사해요."

리운은 짧게 그렇게 말하고 엘리베이터 쪽으로 걸어갔다. 김 주임은 그의 뒷모습을 잠깐 봤다. 그녀의 눈가가 살짝 흐려졌지만, 그건 슬픔의 흐림이 아니었다.

그것은 5년 동안 차를 따라준 사람이 처음으로 받은 보답이었다.

---

리운이 사무실에 들어가서 노트북을 열었을 때, 오늘의 첫 의뢰서가 화면에 떴다.

> 의뢰인 #20310412-C
67세 / 남성
의뢰 종류: 영구 보관
사전 분류: 가족 관계 / 30년

리운은 그 의뢰서를 잠깐 들여다봤다.

서른 해. 가족. 영구 보관.

이런 의뢰는 무거운 의뢰였다. 가족과 관련된 30년치 기억을 영구 보관하겠다는 것은, 가족 안에서 일어난 무언가를 평생 잊고 싶다는 뜻이었다. 그리고 67세라는 나이는 그 무언가를 30년 넘게 안고 살아온 사람이라는 뜻이었다.

리운은 의뢰서를 한 번 더 읽었다. 그리고 자리에서 일어나 사무실 한쪽에 있는 작은 거울로 향했다. 그 거울은 의뢰인을 만나기 전에 자기 표정을 점검하기 위해 둔 것이었다. 거울 속의 리운은 평소와 비슷했다. 다만 어제의 얼굴보다 한 톤 풀려 있었다.

리운은 거울을 보면서 자기 표정을 다시 단단하게 만들었다. 의뢰인 앞에서는 흔들리지 않는 사람이어야 했다. 그게 그의 직업이었다. 어제 도하와 마신 술 한 잔도, 한지섭의 편지도, 검은 원피스 여자의 부탁도, 다 잠깐 옆으로 밀어두었다. 의뢰인 앞에서는 *서리운 보관사*만 있어야 했다.

거울 속의 리운이 천천히 평소의 얼굴로 돌아갔다.

리운은 사무실 문 앞으로 가서 손잡이에 손을 올렸다.

오전 10시 정각이었다.', 2111, 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('2c53afd4-aaef-4c84-a298-b5ee2389fac5', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '흔들리지 않는 사람', 'draft', '부고는 새벽  5시 12분에 도착했다.

서리운은 그 시간에 깨어 있었다. 정확히 말하면 잠든 적이 없었다. 어제 받은 의뢰인의 기억이 자정쯤 한 차례 떠올랐고, 그 뒤로는 눈을 감아도 누군가의 결혼식 장면이 머릿속에서 계속 재생되었다. 신부 입장곡이 흐르고, 식장 뒷줄에 앉은 누군가가 울고 있는 장면. 그건 의뢰인의 기억이었다. 의뢰인이 짝사랑하던 사람의 결혼식이었고, 의뢰인은 그 자리에 끝까지 앉아 있었다고 했다. 그 기억을 지우고 싶다고 했다.

리운은 어제 그 기억을 받았다. 받았으니까 이제 그건 리운의 것이기도 했다.

휴대폰 진동이 협탁 위에서 울렸다. 리운은 손을 뻗어 화면을 확인했다. 회사에서 보낸 단체 메시지였다.

> [공지] 보관사 한지섭 선생님께서 오늘 새벽 자택에서 별세하셨습니다. 장례 일정은 추후 공지하겠습니다. 모든 의뢰는 정상 진행됩니다.

리운은 화면을 한참 들여다보았다. 메시지의 마지막 문장이 가장 오래 눈에 걸렸다. *모든 의뢰는 정상 진행됩니다.* 회사는 늘 그랬다. 보관사 한 명이 무너져도 다음 의뢰인은 예약된 시간에 도착하니까. 기억은 사람의 죽음을 기다려주지 않으니까.

한지섭. 리운보다 두 해 먼저 자격증을 땄던 사람이었다. 작년 가을부터 휴직 상태였다. 마지막으로 본 건 그 직전, 회사 복도에서였다. 한지섭은 리운을 보더니 잠깐 멈췄다가, 어색하게 웃으며 말했다.

"리운 씨는 어떻게 버텨요?"

리운은 그때 아무 대답도 하지 못했다. 어떻게 버티냐는 질문에 그가 줄 수 있는 대답이 없었기 때문이었다. 정확히는, 줄 수 있는 대답이 너무 잔인했기 때문이었다. 그래서 리운은 그냥 고개만 살짝 숙이고 지나갔다.

그게 마지막이었다.

리운은 휴대폰을 내려놓고 천장을 올려다봤다. 새벽 5시의 천장은 회색이었다. 창문 너머에서 첫차의 소리가 멀리 들려왔다. 곧 출근 시간이었다.

---

오피스텔에서 회사까지는 지하철로 40분이었다. 리운은 늘 같은 칸, 같은 자리에 앉았다. 7호선 다섯 번째 칸, 문에서 가장 먼 끝자리. 이유는 단순했다. 사람들의 손이 가장 적게 닿는 자리이기 때문이었다.

기억 보관사들 사이에는 미신 같은 게 있었다. 의뢰가 아닌데도 사람의 강한 감정이 손을 통해 흘러들어올 때가 있다는 것. 과학적으로 증명된 적은 없지만 보관사들은 다 알고 있었다. 만원 지하철에서 누군가의 손목이 닿았는데, 그 순간 알 수 없는 슬픔이 훅 들어올 때가 있다는 것을. 리운은 그래서 사람이 적은 칸을 골랐다. 그리고 사람이 적은 칸에서도 가장 구석을 골랐다.

그날 아침엔 칸이 비어 있었다. 평일 새벽 6시의 7호선은 늘 그랬다. 리운은 자리에 앉아 가방을 무릎 위에 올렸다. 검은색 가죽 가방. 안에는 노트북 한 대와 USB 케이스, 그리고 의뢰 동의서 양식 몇 장이 들어 있었다.

리운은 가방 바깥쪽 주머니에서 작은 통을 꺼냈다. 알약 통이었다. 안정제. 의사가 처방해준 것이지만 리운은 거의 먹지 않았다. 그래도 가지고 다녔다. 가지고 있다는 사실 자체가 위안이 되었다. 언제든 끊을 수 있다는 환상.

리운은 통을 다시 주머니에 넣고, 창밖을 봤다. 지하라서 보이는 건 아무것도 없었다. 자기 얼굴만 흐릿하게 비쳤다. 서른 살. 거울 속의 남자는 서른 살치고는 어딘가 더 늙어 보였다. 눈 밑이 어둡고, 입가의 선이 깊었다. 웃지 않는 사람의 얼굴이었다.

리운은 그 얼굴을 잠깐 들여다보다가, 시선을 거뒀다.

---

회사 이름은 길었다. 정식 명칭은 ''한국기억보존관리원''이고, 사람들은 그냥 ''관리원''이라고 불렀다. 4층짜리 건물의 3층 전체가 보관사 사무실이었다. 보관사는 전국에 서른두 명. 이 건물에는 그중 일곱 명이 있었다. 한지섭이 죽었으니까 이제 여섯 명이었다.

리운이 사무실에 도착했을 때, 복도는 평소보다 조용했다. 보통은 의뢰 전 상담을 위해 일찍 출근한 보관사들이 두세 명 보였는데, 오늘은 아무도 없었다. 다들 한지섭의 부고를 받았을 거고, 다들 출근을 미뤘을 것이다.

리운만 평소 시간에 왔다.

엘리베이터에서 내리자 안내 데스크의 김 주임이 리운을 보고 잠깐 멈칫했다. 김 주임은 입을 열었다가, 다시 닫았다. 한지섭의 일을 어떻게 꺼내야 할지 모르는 표정이었다. 리운은 그 표정을 알아보고 가볍게 고개만 숙였다.

"안녕하세요."

"...안녕하세요, 선생님."

김 주임은 평소처럼 따뜻한 차 한 잔을 종이컵에 따라 리운에게 건넸다. 5년 동안 매일 아침 똑같이 해오는 일이었다. 리운은 매번 정중하게 받았다. 받고는 사무실에 들어가자마자 책상 위에 올려두고 거의 마시지 않았다. 김 주임도 그걸 알았다. 알면서도 매일 차를 따랐다. 그 작은 의식이 리운에게 무슨 의미인지 김 주임 자신도 정확히는 몰랐지만, 멈출 수가 없었다.

오늘은 종이컵을 건네면서 김 주임이 한 마디를 덧붙였다.

"...따뜻할 때 드세요."

평소에는 안 하던 말이었다. 리운은 잠깐 그녀를 봤다. 김 주임의 눈가가 살짝 붉어져 있었다. 한지섭을 위해 운 사람의 눈이었다.

"네."

리운은 짧게 답하고 사무실로 들어갔다.

문을 닫고, 코트를 벽에 걸고, 책상 위에 종이컵을 내려놓았다. 그리고 잠깐 종이컵을 들여다봤다. 김이 천천히 올라오고 있었다. 평소 같았으면 그대로 식히게 두었을 것이다. 오늘은 한 모금을 마셨다. 보리차였다. 김 주임은 매번 보리차를 가져다줬다. 5년 동안 한 번도 다른 차를 가져온 적이 없었다.

리운은 종이컵을 책상 한쪽에 놓고, 의뢰 파일을 열었다.

> 의뢰인 #20310410-A
33세 / 여성
의뢰 종류: 영구 보관
사전 분류: 연애 관계 / 5년

5년. 짧지 않은 시간이었다. 보통 연애 의뢰는 일시 보관이 많았다. 시간이 지나면 의뢰인이 다시 찾으러 오는 경우가 많아서. 그런데 이 의뢰는 처음부터 영구였다. 돌려받을 생각이 없는 사람이라는 뜻이었다.

리운은 파일을 덮었다.

오전 10시까지는 2시간이 남아 있었다. 리운은 그 시간 동안 한지섭에 대해 생각하지 않으려고 노력했다.

---

의뢰인은 오전 9시 55분에 도착했다.

리운은 사무실 문을 열고 그녀를 맞이했다. 첫인상은 단정함이었다. 검은색 원피스. 머리는 어깨에 닿을락 말락 한 길이로 차분하게 정돈되어 있었다. 화장은 거의 하지 않은 것 같았고, 입술만 옅은 색으로 발라져 있었다.

그런데 신발이 운동화였다.

리운은 그 디테일을 알아챘지만, 아무 말도 하지 않았다. 사람들에게는 각자의 이유가 있고, 보관사는 그 이유를 묻지 않는 직업이었다.

"안녕하세요. 서리운입니다. 들어오시죠."

그녀는 가볍게 목례를 하고 사무실로 들어왔다. 리운이 가리킨 의자에 앉을 때, 그녀의 손이 살짝 떨리는 게 보였다. 리운은 그것도 못 본 척했다. 결심한 사람일수록 손이 떨린다는 것을 그는 알고 있었다.

리운은 책상 맞은편에 앉아 노트북을 열었다. 화면을 그녀 쪽으로 살짝 돌려서 의뢰서를 보여주며 말했다.

"먼저 절차를 안내드릴게요. 오늘은 본 이식이 아니라 사전 상담이 우선이에요. 이식은 다음 방문 때 진행됩니다. 다만 사전 상담에서도 일부 기억을 미리 검토할 수 있고, 의뢰인분이 원하시면 오늘 바로 진행도 가능합니다. 어떻게 하시겠어요?"

"오늘 바로 하고 싶어요."

대답이 빨랐다. 리운은 한 박자 쉬었다가 고개를 끄덕였다.

"알겠습니다. 그럼 먼저 의뢰 내용을 한 번 더 확인할게요. 영구 보관 신청하셨고, 분류는 연애 관계, 기간은 5년. 맞으신가요?"

"네."

"보관하실 기억의 범위를 정해주셔야 해요. 예를 들면, 헤어진 시점부터의 기억만 보관하실 수도 있고, 특정한 사건 전후만 보관하실 수도 있습니다. 가장 일반적인 건 나쁜 기억만 골라서 보관하는 방식인데..."

"전부요."

리운은 키보드 위에 올려둔 손을 멈췄다. 그녀를 봤다. 그녀는 리운의 눈을 정면으로 마주 보고 있었다.

"전부 가져가주세요. 좋았던 기억까지요."

리운은 잠깐 침묵했다. 그리고 직업적인 톤으로, 가능한 한 부드럽게 말했다.

"좋은 기억은 보통 남겨두시는 편이 회복에 도움이 됩니다. 사랑했던 사람을 완전히 지우는 건 자기 일부를 도려내는 일이에요. 다시 한 번 생각해보시는 게..."

"생각 많이 했어요."

그녀가 리운의 말을 끊었다. 부드럽지만 단호한 말투였다.

"오래 생각했어요. 정말 오래요."

리운은 입을 다물었다. 그녀는 잠깐 시선을 내렸다가, 다시 들었다.

"나쁜 기억만 지우면, 그 사람이 너무 좋은 사람으로 남을 것 같아요. 그건 거짓말이잖아요. 그 사람은 좋은 사람이기도 했고, 나쁜 사람이기도 했어요. 한쪽만 지우는 건 그 사람에 대한 모독 같아요."

그녀의 목소리는 떨리지 않았다. 떨린 건 손뿐이었다. 손은 무릎 위에서 작게 흔들리고 있었다.

"그러니까 다 가져가주세요. 그 사람을 통째로요."

리운은 그녀를 봤다.

그리고 처음으로, 아주 짧게, 흔들렸다.

겉으로는 드러나지 않았다. 표정은 그대로였고, 손도 멈추지 않았다. 리운은 키보드 위에서 다시 손가락을 움직였고, 화면에 메모를 남겼다. *영구 보관, 전체 범위, 의뢰인 의지 강함, 추가 설득 불필요.* 아주 평범한 메모였다. 누가 봐도 이상할 게 없는 메모였다.

하지만 메모를 치는 동안, 리운은 자기 손가락이 평소보다 아주 미세하게 더 무겁다는 걸 느꼈다. 왜인지는 생각하지 않았다. 생각하지 않는 것이 그가 3년 동안 익혀온 가장 중요한 기술이었다.

리운은 노트북에서 시선을 떼지 않은 채로 말했다.

"...알겠습니다. 진행하겠습니다."

---

이식은 사무실 안쪽의 작은 방에서 진행됐다. 의자 두 개, 그 사이에 놓인 작은 기계, 그리고 양쪽 의자에 앉은 사람의 관자놀이에 부착하는 두 쌍의 패드. 그게 전부였다. 사람들은 기억 이식이라고 하면 거대한 장비를 상상했지만, 실제로는 노트북 정도 크기의 기계 한 대면 충분했다. 어려운 건 장비가 아니라, 그 끝에 앉은 사람이었다.

리운은 그녀에게 패드 부착하는 법을 알려줬다. 그녀는 능숙하지 못한 손으로, 그러나 침착하게 패드를 이마에 붙였다. 리운도 자기 쪽 패드를 붙였다.

"이식이 시작되면 약간의 어지러움이 있을 수 있어요. 의뢰인분이 의식하지 않으셔도 기억은 자동으로 추출됩니다. 지정해주신 범위 내의 모든 기억이 제 쪽으로 옮겨와요. 시간은 대략 20분 정도. 끝나면 의뢰인분께서는 그 기억에 해당하는 부분만 비어 있는 상태가 됩니다. 그 사람을 만난 적이 있다는 사실 자체를 기억하지 못하실 거예요."

그녀는 고개를 끄덕였다. 그리고 잠깐 망설이다가 물었다.

"마지막으로 한 가지만 여쭤봐도 될까요?"

"네."

"보관사님은... 받으신 기억을 다 보세요?"

리운은 잠시 그녀를 봤다.

"필요한 만큼만 봅니다. 보관 상태를 확인하기 위해서요. 그 이상은 보지 않습니다."

거짓말이었다. 정확히는 절반만 진실이었다. 보관 상태 확인을 위해 한 번은 훑어봐야 했고, 그 한 번에 사실상 모든 기억이 리운의 것이 되었다. 보관사들 사이에서 모두가 알고 있는 비밀이었다. 의뢰인에게 굳이 말하지 않을 뿐이었다. 알면 더 두려워하니까.

그녀는 잠깐 가만히 있다가, 옅게 웃었다. 그날 그녀가 보여준 첫 번째 미소였다.

"그럼 부탁이 하나 있어요."

"말씀하세요."

"잘 보관해주세요. 그 사람을요."

리운은 그 말에 어떻게 대답해야 할지 몰랐다. 보관사로서 들은 말 중에서 가장 이상한 부탁이었다. 보통 의뢰인들은 "잘 지워주세요"라고 하지, "잘 보관해주세요"라고 하지 않았다. 그녀는 자기가 맡기는 것이 단순한 기억이 아니라 한 사람이라는 걸, 그리고 그 사람이 이제 리운의 안에서 살게 된다는 걸 아는 것 같았다.

리운은 짧게 대답했다.

"잘 보관하겠습니다."

그리고 기계의 스위치를 눌렀다.

---

이식이 끝났을 때, 그녀는 잠깐 멍한 얼굴로 앉아 있었다. 보통 의뢰인들이 이식 직후에 보이는 반응이었다. 자신의 일부가 사라졌다는 걸 머리로는 모르지만, 몸이 먼저 아는 거였다. 그녀는 이마에 손을 가져다 댔다가, 천천히 떼었다.

"...끝났나요?"

"네. 끝났습니다."

그녀는 자리에서 일어났다. 휘청이지 않았다. 이상할 정도로 단단해 보였다. 사람을 통째로 떠나보낸 사람치고는.

리운이 사무실 문까지 그녀를 배웅했다. 문 앞에서 그녀는 잠깐 멈췄다. 무언가를 기억하려는 사람처럼, 잠깐. 하지만 곧 고개를 한 번 가볍게 흔들고는 리운에게 인사했다.

"감사했습니다."

"안녕히 가세요."

그녀가 떠나고 난 뒤, 리운은 사무실 문을 닫았다. 등을 문에 잠깐 기댔다가, 다시 책상으로 돌아와 앉았다.

받은 기억을 들여다보는 절차가 남아 있었다. 24시간 안에 한 번은 훑어보고 보관 상태를 확인해야 했다. 다른 보관사들은 받자마자 확인했다. 빨리 끝내야 마음이 편하니까. 리운은 늘 가장 늦게 미뤘다. 24시간이 지나기 직전까지. 받은 기억과 마주하는 것이 매번 두려웠기 때문이었다. 두려움을 인정한 적은 없었지만.

오늘도 리운은 미뤘다.

대신 책상 서랍을 열었다. 안에는 빈 USB 케이스 하나가 있었다. 의뢰인이 가져온 USB는 이식 후 보관 절차에 따라 회사 보관실로 옮겨지지만, 케이스만은 보관사가 따로 보관했다. 의뢰의 흔적을 남기지 않기 위한 작은 의식이었다. 리운은 그 케이스에 의뢰 번호를 적은 라벨을 붙였다.

> 20310410-A

그리고 케이스를 서랍 안쪽에 넣었다. 그 안에는 이미 비슷한 케이스들이 가지런히 정리되어 있었다. 3년치였다. 정확히 몇 개인지 리운은 세지 않았다. 세는 순간 그게 무게가 될 것 같아서.

서랍을 닫고, 리운은 잠깐 책상 위의 종이컵을 들여다봤다. 보리차는 이미 식어 있었다. 김 주임이 따뜻할 때 마시라고 했던 그 차였다.

리운은 종이컵을 들어 한 모금을 마셨다. 차갑고 밋밋한 맛이었다. 그래도 마셨다. 끝까지 마셨다. 다 마시고 종이컵을 책상 모서리에 가지런히 놓았다.

그게 리운이 오늘 한지섭에게 할 수 있는 유일한 인사였다.

---

퇴근 시간이 되었을 때, 도하가 사무실 문을 두드렸다.

"형, 퇴근해요?"

임도하였다. 리운보다 한 해 후배인 동료 보관사. 평소엔 늘 활기차게 사무실 문을 벌컥 여는 사람이었는데, 오늘은 두드리고 들어왔다. 한지섭의 일 때문이었다.

리운은 가방을 챙기며 답했다.

"네."

"...혹시 한잔 안 할래요? 오늘은."

도하의 얼굴에는 평소의 장난기가 없었다. 리운은 그를 잠깐 봤다. 도하는 한지섭과 가까웠던 사람 중 하나였다. 오늘 가장 무거운 사람 중 하나일 것이다.

리운은 평소처럼 거절하려다가, 멈췄다. 거절하려고 입을 열었는데 말이 나오지 않았다. 잠깐의 침묵이 흘렀다. 도하도 거절을 예상한 것 같았다. 미리 어색하게 웃을 준비를 하고 있었다.

"...오늘은 일찍 들어가야 할 것 같아요."

리운이 결국 그렇게 말했다. 거절이긴 했지만, 평소의 "괜찮습니다"보다는 한 마디 길었다. 도하도 그 차이를 알아챘는지 잠깐 멈칫했다가, 가볍게 고개를 끄덕였다.

"네. 그래요. 들어가서 푹 쉬세요, 형."

도하가 문을 닫고 나간 뒤, 리운은 가방을 어깨에 메고 한참 사무실에 서 있었다. 왜 그 말이 나오지 않았는지 자신도 알 수 없었다. 그냥 오늘은 평소처럼 말이 나오지 않았다.

리운은 사무실 불을 끄고 나왔다.

---

지하철역까지 걷는 길에, 리운은 평소보다 천천히 걸었다. 4월의 저녁 공기는 아직 쌀쌀했다. 거리에는 퇴근하는 사람들이 가득했고, 그들 중 누구도 오늘 보관사 한 명이 죽었다는 사실을 모를 것이었다. 알 필요도 없었다. 그게 보관사라는 직업이었다.

리운은 횡단보도 앞에 멈춰 섰다. 신호가 빨간색이었다.

그 자리에 서서 그는 잠깐, 아주 잠깐, 오늘 의뢰인이 했던 말을 떠올렸다.

*그 사람을 통째로요.*

리운은 그 말을 다시 한 번 속으로 되뇌었다. 아주 익숙한 문장이었다. 어디서 들은 것 같은데 어디서 들었는지는 떠오르지 않았다. 떠오르려고 하면 무언가가 그것을 막았다. 리운은 떠올리지 않기로 했다. 떠올리지 않는 것에 그는 익숙했다.

신호가 파란색으로 바뀌었다. 리운은 다시 걷기 시작했다.

오피스텔에 도착했을 때 시간은 8시 40분이었다. 리운은 평소처럼 편의점에서 도시락을 사 들고 8층으로 올라갔다. 현관문을 열고, 신발을 벗고, 가방을 책상 위에 올려놓고, 도시락을 책상에 두고, 코트를 옷장에 걸었다. 늘 같은 순서였다.

리운은 책상 앞에 앉아 도시락 뚜껑을 열었다. 그리고 잠깐 멈췄다.

먹기 전에 그는 침대 머리맡 서랍을 열었다. 작은 사진 한 장이 들어 있었다. 여동생의 사진이었다. 여동생이 자기 휴대폰으로 찍어서 보냈던 셀카. 7년 전 어느 봄날, 여동생은 그 사진을 보내며 짧은 메시지를 함께 보냈었다. *오빠 나 머리 잘랐어 어때.* 리운은 그때 *그냥 그래*라고 답장했다. 평소의 무뚝뚝한 말투였다. 여동생은 이모티콘 하나를 보내고 대화를 끝냈다.

리운은 사진을 잠깐 들여다봤다. 그리고 다시 서랍에 넣었다.

서랍을 닫고, 도시락을 먹었다. 평소처럼 빠르게, 맛을 거의 느끼지 않으면서.

식사가 끝난 후 리운은 빈 도시락 통을 정리하고, 양치를 하고, 옷을 갈아입고, 침대에 누웠다. 시간은 9시 반. 평소보다 한 시간 일찍이었다.

천장을 올려다봤다. 회색 천장이었다. 새벽에 봤던 것과 같은 천장.

리운은 눈을 감았다.

오늘도 그는 흔들리지 않은 사람이었다. 적어도 누가 봤다면 그렇게 말했을 것이다. 동료가 죽은 날, 평소처럼 출근해서 평소처럼 의뢰를 받고 평소처럼 퇴근한 사람. 동료들이 "리운 씨는 어떻게 버텨요?"라고 묻는 그 사람.

다만 오늘은 평소보다 한 시간 일찍 누웠고, 김 주임의 보리차를 다 마셨고, 도하에게 평소보다 한 마디 더 길게 답했다. 아무도 모르는 미세한 차이들이었다.

리운 자신도 그 차이의 의미를 알지 못했다.

그는 곧 잠들었다.

오늘은 꿈을 꾸지 않았다.', 2080, 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('d41761fa-c0cb-4d07-bde0-23b4d351d216', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '보관 상태 확인', 'draft', '다음 날 아침, 리운은 평소보다 10분 일찍 출근했다.

이유를 묻는다면 답하지 못했을 것이다. 알람은 평소처럼 울렸고, 평소처럼 일어났고, 평소처럼 씻고 옷을 입었다. 다만 어제 침대에 한 시간 일찍 누운 탓인지 잠이 평소보다 깊었고, 그래서 아침의 동작20분 정도 빨라졌을 뿐이었다. 리운은 그렇게 자기 자신에게 설명했다.

7호선 다섯 번째 칸, 끝자리는 비어 있었다. 리운은 늘 앉던 자리에 앉아 가방을 무릎 위에 올렸다. 가방 안쪽 주머니에서 알약 통의 무게가 느껴졌다. 어제도 먹지 않았다. 오늘도 먹지 않을 것이다. 리운에게 안정제는 약이 아니라 부적이었다.

지하철이 출발했다. 창밖은 여전히 어두웠다.

리운은 가방에서 작은 수첩 하나를 꺼냈다. 검은색 가죽 수첩이었다. 안에는 의뢰 번호와 간단한 메모가 적혀 있었다. 회사에는 정식 의뢰 기록이 있지만, 리운은 자기만의 수첩을 따로 가지고 있었다. 받은 기억의 보관 상태를 본인이 직접 점검하기 위해서였다. 첫 페이지부터 마지막 페이지까지 빼곡했다. 3년치였다.

오늘의 점검 대상은 어제의 의뢰인이었다. *20310410-A*. 리운은 펜으로 그 줄에 작은 동그라미를 쳤다. 점검 예정이라는 표시였다.

가슴 안쪽에서 익숙한 압박이 천천히 올라왔다. 받은 기억을 들여다보기 직전에 늘 오는 감각이었다. 두려움이라고 부를 수도 있었지만, 리운은 그 단어를 자기 자신에게 허락하지 않았다. 두려움은 흔들리는 사람의 단어였다.

그는 수첩을 덮고 다시 가방에 넣었다.

---

회사 1층 로비에 들어섰을 때, 분위기가 어딘가 평소와 달랐다.

평소엔 출근 시간이 되면 직원들이 한두 명씩 엘리베이터 앞에 모여 있는데, 오늘은 사람들이 로비 한쪽에 작게 모여 서 있었다. 김 주임을 중심으로. 김 주임이 무언가를 설명하고 있었고, 사람들은 조용히 듣고 있었다. 한지섭의 장례 일정 같았다.

리운이 로비에 들어서자 사람들의 시선이 한 번씩 그를 향했다. 잠깐의 침묵이 지나갔고, 김 주임이 다시 말을 이어갔다. 리운은 시선을 마주치지 않은 채 그들을 지나쳐 엘리베이터로 향했다.

엘리베이터 버튼을 눌렀을 때, 뒤에서 발소리가 들렸다.

"형."

도하였다. 도하가 따라온 것이었다. 리운은 돌아봤다. 도하의 얼굴은 어제보다 더 피곤해 보였다. 눈 밑이 어두웠고, 머리도 평소처럼 정돈되어 있지 않았다.

"같이 올라가요."

리운은 가볍게 고개를 끄덕였다. 엘리베이터 문이 열렸고, 두 사람이 함께 탔다. 3층 버튼을 누른 건 도하였다. 리운은 옆에 서서 닫히는 문을 봤다.

엘리베이터가 천천히 올라가는 동안 도하가 입을 열었다.

"한 선생님 장례, 모레예요. 발인은 그 다음 날 새벽이고요."

"네."

"형도 가실 거죠?"

리운은 잠깐 말이 없었다. 가야 했다. 가지 않을 이유는 없었다. 그런데 이상하게 *간다*는 말이 입에서 나오지 않았다. 결국 그는 짧게 답했다.

"...네. 갈게요."

도하는 더 묻지 않았다. 엘리베이터가 3층에 멈췄고, 두 사람은 내렸다.

복도를 걸어가는 동안 도하가 한 번 더 입을 열었다. 이번엔 리운을 보지 않고, 정면을 보면서.

"어제 한 선생님 부고 받고 나서, 저 한참 동안 못 자겠더라고요. 자려고 누웠는데 자꾸 작년 가을이 떠올라요. 한 선생님이 휴직하기 직전에 저랑 점심 먹은 적이 있거든요. 그때 한 선생님이 저한테 그러셨어요. 도하 씨는 잘 우네요, 라고. 그 말이 칭찬인지 걱정인지 모르겠어서 그냥 웃었는데, 지금 생각해보면 칭찬이었던 것 같아요."

리운은 듣고만 있었다.

"우는 사람이 오래 가더라고요. 한 선생님이 그렇게 말씀하셨어요. 안 우는 사람이 더 위험하다고."

도하가 거기서 말을 멈췄다. 두 사람은 리운의 사무실 앞에 도착해 있었다. 도하는 잠깐 망설이다가, 리운을 봤다.

"형은 우세요?"

리운은 도하를 마주 봤다. 도하의 얼굴엔 진심이 담겨 있었다. 어떤 비난도, 어떤 의심도 없었다. 그냥 묻고 있을 뿐이었다.

리운은 잠깐 침묵했다. 그리고 답했다.

"...드물게요."

거짓말이었다. 리운은 7년 동안 한 번도 운 적이 없었다. 정확히 말하면 사고 직후 며칠 동안은 울었지만, 그 며칠이 지난 후로는 한 방울도 흘리지 않았다. 울음이 사라진 건 아니었다. 울 권리가 없다고 스스로 결정한 것이었다. 가족 셋을 죽인 사람이 울어서는 안 된다고.

도하는 리운의 답에 가볍게 고개를 끄덕였다. 거짓말인지 알아챘는지는 알 수 없었다. 알아챘다면 더 묻지 않는 것이 도하의 배려였을 것이다.

"그래도 형, 가끔은 울어도 돼요."

도하는 그렇게 말하고 자기 사무실 쪽으로 걸어갔다. 리운은 그의 뒷모습을 잠깐 보고, 사무실 문을 열었다.

---

사무실 안은 어제 그가 떠난 그대로였다. 책상 모서리에 가지런히 놓인 빈 종이컵, 닫혀 있는 노트북, 서랍 안쪽에 방금 추가된 USB 케이스 한 개.

리운은 코트를 벽에 걸고, 책상 앞에 앉았다. 어제의 종이컵을 들어 휴지통에 버렸다. 그리고 잠시 책상을 응시했다.

오늘 첫 의뢰는 오후 2시였다. 오전 시간은 비어 있었다. 이건 리운이 일부러 비운 시간이었다. 보관 상태 확인을 위한 시간. 어제 받은 기억을 들여다보는 작업은 사무실 문을 잠그고 혼자서 해야 했다.

리운은 자리에서 일어나 사무실 문으로 가서 잠금 장치를 걸었다. 안쪽에서. 그리고 창문 블라인드도 내렸다. 햇빛이 들어오면 집중이 흐트러졌다. 받은 기억을 들여다보는 일은 명상에 가까웠고, 명상에는 어둠이 필요했다.

그는 다시 책상 앞에 앉았다. 의자를 뒤로 살짝 밀어 등받이에 기댔다. 두 손을 무릎 위에 올리고, 천천히 숨을 내쉬었다. 한 번. 두 번. 세 번.

그리고 눈을 감았다.

---

기억은 처음에 색깔로 왔다.

받은 기억을 들여다보는 일은 리운에게 매번 다른 감각으로 시작됐다. 어떤 의뢰인의 기억은 소리부터 왔다. 어떤 의뢰인의 기억은 냄새부터. 어제 받은 기억은 색깔이었다. 따뜻한 노란색과, 그 옆에 함께 있는 더 어두운 갈색.

리운은 그 색깔을 따라갔다.

색깔은 곧 형태가 되었다. 형태는 풍경이 되었다. 어느 카페였다. 작은 카페. 창가 자리. 노란 백열등이 천장에 매달려 있었고, 갈색 나무 테이블이 두 사람 사이에 있었다. 한 사람은 그녀였다. 어제의 의뢰인. 5년쯤 더 어린 모습이었다. 머리가 더 길었고, 표정이 더 부드러웠다. 그녀의 맞은편에는 한 남자가 앉아 있었다.

남자의 얼굴이 천천히 또렷해졌다.

서른 살쯤. 마른 체형. 안경을 쓰지 않았다. 웃을 때 한쪽 입꼬리만 살짝 올라가는 사람이었다. 그 미소는 어딘가 어색하고, 어딘가 따뜻했다. 그가 그녀에게 무언가를 말하고 있었고, 그녀는 듣고 있었다. 카페 안에는 잔잔한 음악이 흘렀다. 그녀가 손에 쥐고 있는 머그컵에서 김이 올라왔다.

이게 첫 만남이었다. 5년 전, 어느 봄.

리운은 그 장면을 잠깐 들여다봤다. 그리고 다음으로 넘어갔다. 보관 상태 확인은 모든 장면을 자세히 보는 게 아니라, 기억의 뼈대가 제대로 자리 잡았는지를 확인하는 일이었다. 시작, 중간 몇 군데, 그리고 끝. 그렇게 훑었다.

기억은 자연스럽게 흘렀다. 두 사람이 손을 잡고 걷는 어느 거리. 두 사람이 함께 앉아 있는 영화관. 두 사람이 다투는 장면. 화해하는 장면. 다시 다투는 장면. 함께 떠난 짧은 여행. 바다가 보였고, 그녀가 웃고 있었고, 남자가 그녀의 어깨에 손을 올렸다.

리운은 이 모든 장면을 그녀의 시점에서 봤다. 그게 기억 보관사의 일이었다. 의뢰인이 살아온 그 사람의 인생을 의뢰인의 눈으로 다시 사는 것. 5년치 연애를 이십 분에 압축해서. 마치 누군가의 일기를 빠르게 넘겨 읽는 것과 비슷했다. 다만 종이에 적힌 글자가 아니라 살아있는 감각으로.

그리고 마지막 장면이 왔다.

---

리운은 거기서 흠칫했다.

그가 예상한 마지막 장면은 두 사람이 헤어지는 장면이었다. 어느 카페에서, 혹은 어느 거리에서, 그녀가 울고 있고 남자는 미안하다고 말하는 그런 장면. 보관사로서 이런 마지막 장면을 수십 번 봤었다. 뻔한 슬픔이었다. 익숙한 슬픔이었다.

그런데 마지막 장면은 헤어지는 장면이 아니었다.

그것은 병원이었다.

병실 안. 작은 1인실. 창가에 침대가 있었고, 침대에는 그 남자가 누워 있었다. 그녀가 알던 그 남자. 카페에서 한쪽 입꼬리로 웃던 그 남자. 다만 이번엔 웃지 않았다. 웃을 수 없는 상태였다. 그의 얼굴은 야위어 있었고, 팔에는 링거 줄이 연결되어 있었고, 호흡기가 입을 덮고 있었다. 의식은 없는 것 같았다.

그녀가 침대 옆 의자에 앉아 있었다. 그녀는 남자의 손을 잡고 있었다. 손을 잡고, 아무 말도 하지 않고, 그저 앉아 있었다.

리운은 그 장면 안에서 그녀가 느끼는 감정을 그대로 받았다. 보관사가 받은 기억은 단순한 영상이 아니었다. 의뢰인이 그 순간 느꼈던 감각과 감정이 통째로 보관사의 몸에 들어왔다. 그래서 리운은 지금, 그녀가 그 병실에서 느꼈던 것을 자기 가슴 안쪽에서 그대로 느끼고 있었다.

그건 슬픔이 아니었다.

정확히 말하면 슬픔만은 아니었다. 그 안에는 더 많은 것이 섞여 있었다. 미안함. 무력함. 분노. 그리고 가장 깊은 곳에는, 이상하게도 안도감 같은 것이 있었다. 이제 곧 끝난다는 안도감. 그 안도감 자체에 대한 죄책감. 죄책감 위에 다시 사랑. 사랑 위에 다시 분노.

리운의 가슴이 미세하게 뛰었다.

그는 이런 종류의 복합 감정을 잘 알고 있었다. 자기 자신의 가슴 안쪽에서 7년 동안 살아온 감정이었기 때문이었다. 사랑하는 사람을 잃는 일은 결코 단순한 슬픔이 아니었다. 사랑하는 사람을 잃은 사람만이 알 수 있는 감정의 층이 있었다. 그녀는 그 층에 있었다.

장면은 계속됐다.

밤이 깊어졌다. 병실의 불이 어둑해졌다. 간호사가 한 번 들어왔다가 나갔다. 그녀는 여전히 남자의 손을 잡고 앉아 있었다. 그러다 어느 순간, 침대 위 모니터의 소리가 변했다. 일정하던 신호가 길게 늘어졌다.

그녀는 자리에서 일어서지 않았다. 소리를 지르지도 않았다. 간호사를 부르지도 않았다. 그저 남자의 손을 더 꼭 잡았을 뿐이었다. 그리고 그녀는 남자에게 말했다. 아주 조용히, 거의 속삭이는 목소리로.

"...잘 가."

장면은 거기서 끊어졌다. 그녀의 기억이 거기서 멈춰 있는 것이 아니라, 그녀가 그 후의 장면을 의도적으로 봉인했기 때문이었다. 장례식, 발인, 49재. 그녀는 그 모든 것을 의식적으로 흐릿하게 만들어두고 있었다. 보관사인 리운에게 넘기기 전에, 그녀 스스로 정리해둔 것이었다. 가장 아픈 것은 가장 또렷하게, 가장 슬픈 것은 흐릿하게.

리운은 천천히 눈을 떴다.

---

사무실은 여전히 어두웠다. 블라인드 사이로 가는 햇빛이 한 줄 들어와 책상 위에 떨어져 있었다. 시간이 얼마나 지났는지 알 수 없었다. 보관 상태 확인을 시작할 때 시계를 보지 않았다.

리운은 손을 들어 자기 얼굴을 만졌다. 마른 얼굴이었다. 우는 사람의 얼굴이 아니었다. 리운은 그 사실을 확인하고 손을 내렸다.

그런데 그의 가슴 안쪽에서는 무언가가 천천히 움직이고 있었다.

그녀가 병실에서 느꼈던 그 복합 감정이 아직 그의 안에 남아 있었다. 보관사 일을 하다 보면 받은 기억의 감정이 일시적으로 자기 감정처럼 느껴지는 일이 자주 있었다. 베테랑 보관사들은 그것을 "잔여감"이라고 불렀다. 시간이 지나면 자연스럽게 가라앉았다. 빠르면 몇 시간, 길면 며칠.

그런데 오늘의 잔여감은 평소와 달랐다.

평소엔 받은 감정이 그의 가슴 안쪽 어느 한 곳에 머물다 가라앉았는데, 오늘은 그렇지 않았다. 오늘의 감정은 그의 가슴 안쪽에서 *움직였다*. 어디론가 흘러가고 있었다. 그리고 그 흘러가는 방향이, 리운의 가장 깊은 곳에 봉인해둔 어떤 감정과 같은 방향이었다.

리운은 자리에서 일어났다.

그는 그 감정의 방향을 따라가고 싶지 않았다. 따라가면 안 되는 방향이었다. 그쪽 끝에는 그가 7년 동안 들여다보지 않은 무언가가 있었고, 오늘 한 번의 잔여감 때문에 그것을 들여다볼 수는 없었다.

리운은 블라인드를 살짝 올려 햇빛을 들였다. 햇빛이 사무실 안으로 길게 들어왔다. 그는 그 빛 아래에 잠깐 서 있었다. 빛의 따뜻함이 가슴 안쪽의 움직임을 약하게나마 흩어놓았다.

그리고 그는 책상으로 돌아가 수첩을 열었다. *20310410-A*가 적힌 줄에 작은 표시를 추가했다. 점검 완료라는 표시. 그리고 그 옆에 한 줄을 적었다.

> 보관 상태 양호. 잔여감 보통.

거짓말이었다. 잔여감은 보통이 아니었다. 그러나 리운은 그렇게 적었다. 자기 자신에게도 거짓말을 하는 것이 그가 3년 동안 익혀온 또 하나의 기술이었다.

수첩을 덮고 시계를 봤다. 오전 11시 40분. 점심시간까지는 20분이 남아 있었다.

리운은 사무실 문의 잠금을 풀었다.

---

점심은 평소처럼 회사 근처 김밥집에서 혼자 먹었다. 김밥 한 줄과 어묵 국물 한 그릇. 늘 같은 메뉴였다. 김밥집 사장님은 리운이 들어오면 메뉴를 묻지 않았다. 3년 동안 한 번도 다른 걸 시킨 적이 없었으니까.

리운은 창가 자리에 앉았다. 점심시간이라 가게는 사람들로 가득했다. 다들 누군가와 함께였다. 직장 동료끼리, 친구끼리, 연인끼리. 리운만 혼자였다.

그는 김밥을 천천히 씹으면서 창밖을 봤다. 4월의 거리에는 햇빛이 가득했다. 사람들은 저마다의 점심시간을 보내고 있었고, 그 누구도 자기 옆을 스쳐 지나간 한 남자의 가슴 안쪽에서 어떤 일이 일어나고 있는지 알지 못했다.

리운은 그게 다행이라고 생각했다.

그때 휴대폰이 울렸다. 회사 메시지였다. 리운은 화면을 확인했다.

> [공지] 본원에 신입 보관사 한 분이 발령 예정입니다. 정식 업무 시작은 다음 달부터이며, 이번 주 중 인사 자리를 마련하겠습니다. — 정선재

리운은 메시지를 한 번 더 읽었다. 신입 보관사. 한지섭이 죽은 지 이틀 만이었다. 회사는 빨랐다. 죽은 사람의 자리는 빨리 채워야 했다. 의뢰는 기다려주지 않으니까.

리운은 휴대폰을 내려놓고 김밥의 마지막 조각을 입에 넣었다. 신입이 누구인지, 어떤 사람인지는 알 수 없었다. 알고 싶지도 않았다. 새로운 사람이 온다는 것은 새로운 관계가 생길 수 있다는 뜻이었고, 새로운 관계는 리운이 가장 피해온 것이었다.

그래도, 한 가지는 생각했다.

*저 사람이 잘 버티면 좋겠다.*

리운은 그렇게 생각하고, 곧 그 생각을 지웠다. 자기가 누군가의 안위를 빌어주기에는 자격이 부족하다고 느꼈기 때문이었다. 가족 셋을 죽인 사람이, 누군가의 안전을 빌어줄 자격이 있을 리 없었다.

리운은 자리에서 일어나 계산을 했다. 사장님이 평소처럼 한 마디를 덧붙였다.

"또 와요."

"네."

리운은 짧게 답하고 김밥집을 나섰다. 거리에는 여전히 햇빛이 가득했다. 리운은 그 햇빛 속으로 한 발 내디뎠고, 회사 쪽으로 천천히 걸었다.

오후 2시에 다음 의뢰인이 도착할 예정이었다. 리운은 그 시간까지 어제의 잔여감을 가라앉혀야 했다. 그래야 다음 의뢰인의 기억을 깨끗하게 받을 수 있었다.

그는 발걸음을 평소보다 조금 빠르게 했다. 빠르게 걸으면 가슴 안쪽의 움직임이 다른 곳으로 새어나갈 것 같았다. 하지만 그렇지 않았다. 가슴 안쪽의 무언가는 빠른 발걸음에도 가라앉지 않았다. 오히려 걸을수록 더 또렷해졌다.

리운은 한 번, 횡단보도 앞에서 잠깐 멈췄다.

그리고 어제 그 자리에서 떠올렸던 문장을 다시 한 번 떠올렸다.

*그 사람을 통째로요.*

어제는 그 문장이 어디서 들은 것 같다는 느낌만 있었다. 오늘은 한 발 더 가까이 와 있었다. 어디서 들은 게 아니라, 그가 누군가에게 *해본 적이 있는 말 같은 느낌*이었다. 정확히 누구에게, 언제 했는지는 떠오르지 않았지만.

신호가 파란색으로 바뀌었다. 리운은 다시 걷기 시작했다.

오후의 첫 의뢰인이 그를 기다리고 있었다.', 1889, 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('324db8b7-9385-4888-8753-737ee1093bcc', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '길을 잃은 사람', 'draft', '오후 두 시의 의뢰인은 마흔 살의 남자였다.

리운은 사무실 문을 열고 그를 맞이했다. 회색 정장 차림에 손목엔 무난한 시계를 차고 있었다. 회사원의 얼굴이었다. 다만 눈가에 깊은 그늘이 있었고, 사무실에 들어서자마자 그가 한 일은 의자에 앉기 전에 잠깐 한숨을 쉬는 것이었다. 그 한숨은 의식한 것이 아니라 몸에 배인 것이었다. 사람이 너무 오래 무거운 것을 들고 다니면 한숨이 그렇게 변했다.

"안녕하세요. 서리운입니다."

"안녕하세요."

남자는 의자에 앉았다. 그리고 가방을 무릎 위에 올려놓았다가, 다시 옆에 내려놓았다. 어디에 두어야 할지 모르는 사람의 동작이었다.

리운은 노트북을 열며 평소처럼 절차를 안내하려 했다. 그런데 그가 입을 열기 전에 남자가 먼저 말했다.

"저는... 사실 오늘 의뢰를 하러 온 게 아닙니다."

리운은 손을 멈췄다. 노트북 화면에 의뢰서가 떠 있었다. *20310411-B. 40세 남성. 일시 보관 신청. 사전 분류: 직장 관련 / 1년.* 의뢰서대로라면 남자는 직장에서 있었던 1년치 사건을 일시 보관하러 온 사람이었다. 그런데 본인이 그게 아니라고 했다.

리운은 의자에 등을 기대고 남자를 봤다. 직업적으로 차분한 표정을 유지했다.

"말씀해주세요."

남자는 잠깐 말이 없었다. 손가락으로 자기 손목의 시계를 만지작거렸다. 그러다 입을 열었다.

"의뢰서는 회사에서 작성한 거예요. 회사 차원에서 정해진 절차라고 해서요. 제가 다니는 회사에서 작년에 큰 사고가 있었습니다. 산업 재해. 동료 한 명이 죽었어요. 그 사고를 옆에서 본 직원들에게 회사에서 보관사 의뢰를 권유했습니다. 트라우마 관리 차원에서요. 비용은 회사가 부담하고요."

리운은 고개를 가볍게 끄덕였다. 산업 재해 후 회사 차원의 보관사 의뢰는 드문 일이 아니었다. 정확히 말하면 점점 늘어나고 있는 사례였다. 보관사 제도가 시작된 이후 기업들은 직원들의 트라우마 관리를 위해 보관사를 활용하기 시작했고, 그것이 일종의 "산재 후 패키지" 같은 것으로 자리 잡고 있었다. 리운은 이런 의뢰를 좋아하지 않았다. 직원의 의지가 아니라 회사의 결정으로 오는 의뢰는 본질적으로 강요에 가까웠기 때문이었다.

"그래서요?"

"저는 의뢰를 하고 싶지 않아요."

남자가 그렇게 말했다. 정확히 말하면 *못한다*에 가까운 말투였다.

"그 동료를... 잊고 싶지 않아요. 그 사람이 사고를 당하던 순간을 본 건 저였고, 그 순간에 제가 해줄 수 있었던 게 있었는지 없었는지 저는 아직 모릅니다. 모르는 채로 잊으면 안 될 것 같아요. 잊으면 그 사람한테 죄를 짓는 것 같아서요."

리운은 그의 말을 들었다. 그리고 이상하게도, 가슴 안쪽에서 어제의 잔여감이 한 번 더 흔들렸다. 잠재워둔 줄 알았는데 아니었다. 그것은 가라앉은 게 아니라 그저 잠시 숨어 있었을 뿐이었다.

남자의 말은 리운 자신이 7년 동안 자기 자신에게 해온 말이었다. *잊으면 안 된다. 잊으면 그들에게 죄를 짓는 것이다.*

리운은 잠깐 침묵했다. 그리고 직업적인 톤으로 말했다.

"의뢰는 본인 의지가 가장 중요합니다. 회사에서 권유했더라도 본인이 원하지 않으면 진행하지 않습니다. 거절할 권리가 있어요."

"그런데 회사에서는 자꾸 권유합니다. 제가 거절했더니 인사팀에서 한 번 더 만나자고 하고, 산업안전팀에서 또 한 번 만나자고 하고, 동료들도 다들 받았다고 저만 안 받으면 이상하게 본다고 하고..."

남자는 거기서 잠깐 말을 멈췄다. 손을 무릎 위에 올렸다가, 다시 시계를 만졌다.

"...그래서 일단 예약은 잡았어요. 와서 만나뵙기는 해야 할 것 같아서요. 그런데 막상 여기 앉아 있으니까 못 하겠어요."

리운은 그를 봤다. 남자는 리운을 마주 보지 않고 책상 한 구석을 보고 있었다. 도망갈 곳을 찾는 사람의 시선이었다.

리운은 자기 노트북을 닫았다. 그 작은 동작 하나가 남자에게 안도감을 준 것 같았다. 남자의 어깨가 조금 내려갔다.

"오늘은 진행하지 않겠습니다."

리운이 말했다.

"의뢰서는 미진행으로 처리하고, 회사 쪽에는 본인의 의지에 따라 보류하기로 했다고 기록하겠습니다. 이건 제가 보관사로서 결정할 수 있는 부분이에요. 회사가 의뢰인분께 다시 압박을 가할 경우, 저희 관리원에서 공식적으로 거절 의사를 전달해드릴 수 있습니다. 원하시면 그 절차도 안내해드리겠습니다."

남자는 잠깐 말이 없었다. 그러다 천천히, 거의 작게 떨리는 목소리로 말했다.

"...감사합니다."

"아닙니다."

리운은 자리에서 일어나려다, 잠깐 멈췄다. 평소 같으면 여기서 의뢰인을 배웅했을 것이다. 그게 그의 절차였다. 그런데 오늘은 한 마디가 더 나왔다. 본인도 의도하지 않은 말이었다.

"...잊지 않으셔도 됩니다."

남자가 리운을 봤다. 리운은 그의 시선을 마주 봤다. 그는 직업적인 톤을 유지하려 했지만, 자기 목소리에 평소와 다른 무언가가 섞여 있는 것을 느꼈다.

"잊지 않는 것도 한 가지 선택이에요. 모두가 잊는 쪽을 선택하지는 않아요. 잊지 않고 살아가는 사람도 있습니다. 그건 약하거나 미련한 게 아니에요. 그냥 다른 종류의 살아남는 방식이에요."

남자는 리운의 말을 들으면서 천천히 눈을 깜박였다. 그 눈에 무언가가 잠깐 차올랐다가, 그가 손등으로 빠르게 닦았다.

"...네. 감사합니다."

남자는 가방을 들고 일어났다. 사무실 문 앞에서 그는 한 번 더 리운을 돌아봤다. 무슨 말을 하려는 것 같았는데, 결국 하지 않았다. 그저 짧게 고개를 숙이고 사무실을 나섰다.

문이 닫혔다.

리운은 문을 닫고 잠깐 그 자리에 서 있었다. 자기가 방금 한 말이 아직 사무실 안에 떠 있는 것 같았다. *잊지 않는 것도 한 가지 선택이에요.* 그건 그가 보관사로서 의뢰인에게 해서는 안 되는 종류의 말이었다. 보관사는 잊는 것을 돕는 직업이었고, 잊지 않는 것을 권유하는 것은 직업 윤리에 어긋나는 일이었다. 다른 사람이 들었다면 분명 지적받았을 것이다.

그런데 리운은 그 말이 자기 입에서 나온 것이 후회되지 않았다.

---

오후 3시 반, 리운은 사무실 책상 앞에 앉아 의뢰서를 마무리하고 있었다. 오늘의 의뢰는 미진행으로 처리. 사유는 본인 의사. 회사에서 추가 압박이 있을 경우 관리원 공식 대응 가능. 그렇게 적었다.

그때 사무실 문이 살짝 두드려졌다. 리운이 고개를 들었다.

"네."

문이 열리고 김 주임이 들어왔다. 손에 무언가를 들고 있었다. 종이봉투였다.

"선생님, 손님이 오셨어요."

"손님이요?"

"네. 어... 어제 오셨던 의뢰인분이세요. 잠깐만 뵙고 싶다고 하셔서요."

리운은 잠깐 멈췄다. 어제의 의뢰인. 검은 원피스의 여자. 그녀가 다시 왔다.

이건 이상한 일이었다. 영구 보관 의뢰를 한 의뢰인은 절차상 다시 관리원을 방문할 일이 거의 없었다. 보관 절차가 끝났고, 자기가 맡긴 기억에 대해 의뢰인은 더 이상 알 수 없는 상태가 되었으니까. 다시 찾아온다는 건 무언가 후속 절차가 필요하다는 뜻이거나, 아니면...

"들어오시라고 해주세요."

김 주임이 고개를 끄덕이고 나갔다. 잠시 후 그녀가 사무실로 들어왔다.

어제와는 다른 옷차림이었다. 검은 원피스가 아니라 베이지색 카디건과 청바지였다. 신발은 어제와 같은 운동화. 머리는 같은 길이로 정돈되어 있었다. 어제보다 표정이 부드러웠다. 정확히 말하면, *어제의 일을 기억하지 못하는 사람의 표정이었다*.

리운은 자리에서 일어나 의자를 가리켰다.

"앉으시죠."

그녀는 가볍게 목례를 하고 의자에 앉았다. 어제와 같은 의자였다. 어제 그 자리에서 그녀는 한 사람을 통째로 떠나보냈는데, 오늘 그녀는 그 사실 자체를 기억하지 못한 채 같은 자리에 앉아 있었다.

리운은 책상 맞은편에 앉았다. 그리고 직업적인 톤으로 물었다.

"무슨 일로 오셨나요?"

그녀는 잠깐 망설이다가 말했다.

"사실은... 잘 모르겠어요."

"네?"

"오늘 아침에 일어났는데, 이 건물 주소가 제 휴대폰 메모에 적혀 있었어요. 어제 날짜로요. 그런데 저는 어제 여기 온 기억이 없어요. 메모를 보고 처음에는 제가 잘못 적어둔 줄 알았는데, 메모 옆에 *오전 10시 / 서리운 보관사*라고도 적혀 있었거든요."

리운은 그녀의 말을 듣고 있었다.

"그래서 검색해봤더니 여기가 기억보존관리원이라는 곳이고, 서리운이라는 분이 보관사로 등록되어 있더라고요. 그래서... 혹시 제가 어제 여기 왔던 게 맞는지 확인하러 왔어요."

리운은 잠깐 말을 고르다가, 답했다.

"네. 어제 오셨습니다."

"...그럼 제가 의뢰를 하러 왔던 거예요?"

"네."

"무슨 의뢰였는지 여쭤봐도 될까요?"

이 질문에 리운은 한 박자 멈췄다. 보관사의 직업 규정상 의뢰인의 의뢰 내용은 비밀이었다. 의뢰인 본인에게도 마찬가지였다. 영구 보관 의뢰의 경우, 의뢰인이 그 기억을 잊는 것이 의뢰의 핵심이기 때문에, 의뢰인 본인에게 의뢰 내용을 알려주는 것은 그 의뢰의 효과를 무효로 만드는 일이었다. 알려주면 의뢰인이 다시 그 기억을 *추측해서* 만들어낼 수 있었기 때문이었다. 추측된 기억은 진짜 기억보다 더 잔인할 수 있었다.

그래서 리운의 직업적 답은 정해져 있었다. *죄송합니다, 의뢰 내용은 의뢰인분께도 말씀드릴 수 없습니다.* 그렇게 말하면 됐다. 그게 절차였다.

"...연애 관련 의뢰였습니다."

리운은 그렇게 말했다. 절차를 어긴 답이었다. 정확한 내용은 말하지 않았지만, 카테고리를 알려준 것만으로도 보관사 직업 규정을 어긴 것이었다. 오늘 두 번째 위반이었다.

그녀는 잠깐 그 답을 들여다봤다. 마치 그 단어 안에서 무언가를 찾으려는 것처럼.

"...연애요."

"네."

"제가 누구를... 사랑했었어요?"

리운은 그녀를 봤다.

이 질문에 답할 수는 없었다. 이름을 알려줄 수도, 그 사람이 어떤 사람이었는지 알려줄 수도, 그 사람이 지금 어디 있는지 알려줄 수도 없었다. 그 모든 것이 직업 규정에 어긋났고, 그녀를 위한 일도 아니었다. 그녀는 그 사람을 잊기로 *스스로 선택한* 사람이었다. 어제의 그녀가 오늘의 그녀를 위해 한 결정이었다. 리운이 그 결정을 뒤집을 권리는 없었다.

리운은 답하지 않았다. 대신 그녀를 가만히 봤다.

그녀도 리운의 침묵을 읽었다. 그녀는 잠깐 시선을 내렸다가, 다시 들었다. 그 시선에는 슬픔도 분노도 없었다. 그저 약간의 피로함과, 약간의 체념과, 그 아래 어딘가의 호기심이 섞여 있었다.

"...말씀해주실 수 없는 거죠."

"네. 죄송합니다."

"아니에요. 알겠습니다."

그녀는 가방을 무릎 위에 올렸다. 그리고 잠깐 가만히 앉아 있었다. 자리에서 일어나기 전에, 그녀가 한 번 더 입을 열었다.

"한 가지만 더 여쭤봐도 될까요."

"네."

"제가 어제 여기서... 행복해 보였나요? 아니면 슬퍼 보였나요?"

리운은 그 질문에 한참 답하지 못했다.

어제의 그녀는 슬퍼 보였다. 손이 떨렸고, 검은 원피스를 입고 운동화를 신었고, 자기가 사랑한 사람을 통째로 떠나보내러 온 사람이었다. 그녀는 분명 슬펐다. 슬픔의 가장 깊은 곳에 있던 사람이었다.

그런데 그 슬픔의 옆에는 다른 무언가가 있었다. 단단함. 결심한 사람의 단단함. 그녀는 슬펐지만 무너지지 않았고, 떨렸지만 흔들리지 않았다. 어제 그녀가 사무실을 떠날 때, 리운은 그녀가 *살아있는 사람*이라고 생각했었다. 이미 죽은 사람을 한 번 더 떠나보내고도 살아남기로 결정한 사람이라고.

리운은 답을 골랐다. 직업 규정을 한 번 더 어기는 답이었다. 오늘 세 번째 위반이었다.

"...강해 보이셨어요."

그녀는 그 말을 들었다. 그리고 처음으로, 옅게 웃었다.

"강해 보였다고요."

"네."

"...다행이네요."

그녀는 자리에서 일어났다. 가방을 어깨에 메고, 사무실 문 쪽으로 걸어갔다. 문 앞에서 그녀가 한 번 더 멈췄다. 그리고 돌아서서 리운을 봤다.

"감사합니다."

"안녕히 가세요."

그녀는 사무실을 나섰다. 문이 닫혔다.

리운은 그 자리에 잠깐 서 있었다. 그녀가 떠난 자리는 어제와 같은 자리였다. 그런데 어제와 오늘 사이에 한 사람의 인생이 통째로 사라졌다. 그 사라짐을 아는 사람은 이제 이 세상에 리운 한 사람뿐이었다.

리운은 책상으로 돌아가 앉았다. 의자에 기대고, 천장을 올려다봤다. 사무실 천장은 흰색이었다. 형광등이 그 흰색 위에 작은 그림자를 드리우고 있었다.

리운은 천장을 보면서, 어제 그녀가 한 부탁을 떠올렸다.

*잘 보관해주세요. 그 사람을요.*

리운은 그 부탁을 받았다. 그리고 그 부탁을 지킬 사람은 자기뿐이었다. 그녀는 더 이상 그 사람을 기억하지 못했고, 세상의 누구도 그녀의 기억 속 그 사람을 알지 못했다. 그 사람은 이제 리운의 안에서만 살아있었다. 카페에서 한쪽 입꼬리로 웃던 그 남자, 병실에서 야위어가던 그 남자, 그녀가 마지막으로 *잘 가*라고 말해주었던 그 남자.

리운은 자기 가슴 안쪽에 손을 잠깐 가져다 댔다. 그 안에 한 사람이 살고 있었다. 그가 알지 못하는 사람이었지만, 이제 그의 일부였다.

---

오후 5시 반, 김 주임이 사무실 문을 두드렸다.

"선생님, 잠깐 뵐 수 있을까요?"

리운은 고개를 들었다. 김 주임은 손에 종이봉투를 들고 있었다. 아침에 들고 있던 그 종이봉투. 리운은 그제야 그 봉투의 정체가 궁금해졌다.

"네. 들어오세요."

김 주임이 사무실에 들어와 문을 닫았다. 그리고 종이봉투를 책상 위에 올려놓았다.

"이거... 한 선생님이 작년 가을에 저한테 맡기신 거예요."

리운은 봉투를 봤다. 평범한 갈색 종이봉투였다.

"한 선생님이 휴직하시기 전에 저한테 주시면서 그러셨어요. *나한테 무슨 일이 생기면, 이걸 리운 씨한테 전해주세요.* 그래서 제가 보관하고 있었어요. 어제 부고를 받고도 바로 드리기엔 너무 갑작스러울 것 같아서... 오늘 드려야 할 것 같아서요."

리운은 종이봉투를 잠깐 들여다봤다. 가슴 안쪽이 다시 한 번 움직였다. 어제의 잔여감과는 다른 종류의 움직임이었다.

"...뭐가 들어 있나요?"

"저는 안 봤어요. 한 선생님이 봉투째로 주셨고, 저한테는 열어보지 말라고 하셨거든요."

김 주임은 잠깐 말을 멈췄다가, 덧붙였다.

"한 선생님은 선생님을 많이 걱정하셨어요. 한 번도 직접 말씀하신 적은 없었지만, 저는 알았어요. 휴직하시기 전에 저한테 그러시더라고요. *김 주임님, 리운 씨 잘 챙겨주세요. 그 사람은 자기 자신을 챙길 줄 모르는 사람이에요.* 그게 한 선생님이 저한테 하신 마지막 말씀이었어요."

리운은 종이봉투에서 시선을 떼지 못했다.

김 주임은 더 말하지 않았다. 그녀는 가볍게 목례를 하고 사무실을 나섰다. 문이 조용히 닫혔다.

리운은 한참 동안 봉투를 보지 않고 그 옆을 봤다. 봉투를 직접 보면 안 될 것 같았다. 보면 안에 든 것을 열어봐야 할 것 같았고, 열어보면 무언가 그가 감당할 수 없는 것이 나올 것 같았다.

그러나 결국 그는 손을 뻗었다.

봉투의 입구를 천천히 열었다.

---

봉투 안에는 종이 한 장이 들어 있었다.

손글씨로 쓰인 짧은 편지였다. 한지섭의 글씨였다. 리운은 한 번도 한지섭의 글씨를 본 적이 없었지만, 그것이 한지섭의 글씨라는 것을 직감으로 알았다.

> *리운 씨에게.*
>
> *이걸 읽고 있다면 내가 떠난 후일 거예요. 미안해요. 마지막 인사를 못해서.*
>
> *복도에서 마주쳤던 그날, 내가 어떻게 버티냐고 물었던 거 기억하세요? 사실 그날 나는 답을 듣고 싶었던 게 아니에요. 그 질문은 리운 씨를 향한 게 아니라 나 자신을 향한 거였어요. 그 답을 알고 있는 사람이 리운 씨라고 생각해서 물어본 거예요.*
>
> *근데 리운 씨는 답을 안 했죠. 그때 나는 알았어요. 리운 씨도 사실 답을 모르고 있다는 걸. 답을 모르면서 버티고 있다는 걸. 그게 가장 무서운 종류의 버티기라는 걸.*
>
> *리운 씨. 흔들리지 않는 사람은 없어요. 흔들리지 않는 것처럼 보이는 사람이 있을 뿐이에요. 나도 한때는 흔들리지 않는 사람이었어요. 그게 얼마나 사람을 갉아먹는 일인지, 안에서 들여다본 사람만이 알아요.*
>
> *부탁이 하나 있어요.*
>
> *언젠가 리운 씨가 더 이상 버틸 수 없는 날이 올 거예요. 그날이 오면, 도망치지 마세요. 누군가에게 가세요. 누구든 좋아요. 옆에 있는 사람한테 그냥 말하세요. 못 버티겠다고. 그 한 마디만 하면 돼요. 그 한 마디가 사람을 살려요.*
>
> *나는 그 한 마디를 못 했어요. 그래서 이렇게 됐어요.*
>
> *리운 씨는 나처럼 되지 마세요.*
>
> *—한지섭.*

리운은 편지를 다 읽고도 한참 동안 그것을 손에 들고 있었다.

사무실은 조용했다. 창밖에서 4월의 늦은 오후 햇빛이 비스듬히 들어오고 있었다. 그 햇빛이 책상 위의 종이 한 장을 비추고 있었고, 그 종이 위에 한지섭이 마지막으로 남긴 글자들이 있었다.

리운은 천천히 편지를 접었다. 그리고 다시 봉투에 넣었다.

서랍을 열고, 봉투를 가장 안쪽에 넣었다. 어제 의뢰인의 빈 USB 케이스 옆에. 그리고 서랍을 닫았다.

그는 한참 책상 앞에 앉아 있었다.

가슴 안쪽에서 무언가가 천천히 무너지고 있었다. 그것은 어제부터 시작된 잔여감의 움직임과 같은 방향이었다. 다만 오늘은 더 빨랐고, 더 컸다. 리운은 그것을 막으려 했지만 막을 수 없었다. 막는 것이 불가능한 종류의 움직임이었다.

그는 자기 손을 봤다. 손은 떨리지 않았다. 표정도 바뀌지 않았다. 누가 봤어도 그는 여전히 흔들리지 않는 사람이었을 것이다.

다만 그는 그 자리에 한참 동안 앉아 있었다. 시계가 여섯 시를 가리킬 때까지. 그리고 여섯 시 반을. 일곱 시를.

평소 같았으면 6시 정각에 퇴근했을 것이다. 오늘은 그러지 못했다. 일어설 힘이 나지 않았다.

7시 반쯤, 사무실 문이 두드려졌다. 리운은 답하지 않았다. 그러자 문이 살짝 열리고, 도하의 얼굴이 들어왔다.

"형, 아직 안 갔어요?"

리운은 도하를 봤다. 도하의 얼굴에는 걱정이 떠 있었다. 평소엔 보지 못했던 얼굴이었다.

"...네."

"...괜찮아요?"

리운은 답하지 못했다. *괜찮다*는 말이 입에서 나오지 않았다. 평소엔 자동으로 나오던 말이었는데, 오늘은 그 두 글자가 어딘가에 막혀 있었다.

도하는 리운의 침묵을 잠깐 들여다봤다. 그리고 사무실 안으로 한 발 들어왔다.

"형, 한잔할래요?"

리운은 도하를 봤다.

7년 동안 그는 누구의 술자리 제안도 받아들인 적이 없었다. 그것은 그의 규칙이었다. 술자리는 사람을 무너지게 했고, 무너지면 안 되는 사람이 그였다. 그래서 그는 항상 거절했고, 거절은 자동이었다.

오늘도 자동으로 거절이 나올 줄 알았다. 그런데 입에서 나온 말은 거절이 아니었다.

"...네."

도하의 얼굴에 잠깐 놀란 표정이 떠올랐다. 3년 동안 한 번도 받아들여진 적이 없는 제안이 오늘 처음 받아들여진 것이었다. 도하는 그 놀람을 빠르게 감추고, 가볍게 고개를 끄덕였다.

"그래요. 가요. 제가 아는 데 있어요. 조용한 데."

리운은 자리에서 일어났다. 가방을 챙기고, 코트를 입었다. 손이 떨리지는 않았다. 다만 가슴 안쪽에서, 무언가가 7년 만에 처음으로, 아주 작은 틈으로 새어나오고 있었다.

서랍 안에는 한지섭의 편지가 있었다. 어제 의뢰인의 빈 USB 케이스 옆에. 두 사람의 무게가 그 안에서 함께 잠들고 있었다.

리운은 사무실 불을 끄고 도하와 함께 나섰다.', 2272, 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('c9e982c7-db54-48d6-ae09-23f53d46fba8', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '첫 잔', 'draft', '도하가 안다는 가게는 회사에서 두 정거장 떨어진 골목 안쪽에 있었다.

간판도 작고, 입구도 좁아서 모르는 사람은 그냥 지나칠 만한 곳이었다. 도하가 앞장서서 미닫이문을 열었다. 안은 생각보다 좁았다. 카운터석 다섯 자리, 작은 테이블 두 개. 손님은 카운터석에 한 명뿐이었다. 등을 돌리고 혼자 술을 마시는 중년 남자.

나이 든 사장이 카운터 안쪽에서 도하를 보고 가볍게 고개를 끄덕였다. 도하는 익숙한 사람의 동작으로 안쪽 테이블을 가리켰다.

"여기 앉아요, 형."

리운은 도하가 가리킨 자리에 앉았다. 의자가 작고 낮았다. 가게 안에는 옅은 조명과 잔잔한 라디오 소리가 흐르고 있었다. 라디오에선 오래된 가요가 흘러나오고 있었는데, 가사가 또렷하게 들리지 않을 만큼 볼륨이 작았다.

도하가 카운터 쪽에 대고 짧게 말했다.

"사장님, 따끈한 정종 한 병이랑요. 안주는 알아서 부탁드릴게요."

사장이 말없이 고개를 끄덕였다. 도하는 자리로 돌아와 리운 맞은편에 앉았다. 코트를 벗어 옆 의자에 걸쳤다.

"여기 사장님이 한지섭 선생님이랑 친했어요. 한 선생님이 자주 오시던 곳이거든요. 저도 한 선생님이 데려와서 알게 됐어요."

리운은 가게 안을 한 번 둘러봤다. 한지섭이 자주 앉았을 자리가 어디였을지 잠깐 생각했다. 아마 카운터석이었을 것이다. 사장과 짧게 말을 나누면서 술잔을 기울이는, 그런 자리. 한지섭은 그런 사람이었다.

"오늘 데려와서 죄송해요. 어제 부고 받은 곳에 데려오는 게 좀 그런가 싶었는데..."

"아니에요."

리운은 짧게 답했다. 도하는 잠깐 리운을 봤다가, 가볍게 고개를 끄덕였다.

---

정종이 나왔다. 작은 도쿠리에 따끈하게 데워진 술이 담겨 있었고, 잔도 두 개. 도하가 먼저 잔을 들어 리운의 잔에 술을 따랐다. 리운도 도하의 잔에 술을 따랐다. 익숙하지 않은 동작이었다. 7년 동안 누군가의 잔에 술을 따라본 적이 없었다.

도하가 잔을 살짝 들었다.

"한 선생님께."

리운도 잔을 들었다.

"...한 선생님께."

두 사람은 잔을 가볍게 부딪쳤다. 도하는 한 번에 잔을 비웠다. 리운은 한 모금만 마셨다. 따끈한 술이 목을 타고 내려갔다. 익숙하지 않은 감각이었다. 7년 만의 술이었으니까.

리운은 잔을 내려놓고 잠깐 가만히 있었다. 도하가 그 침묵을 읽고 자기 잔에 술을 한 번 더 따랐다.

"형 술 잘 못 드세요?"

"...오랜만이에요."

"얼마만이에요?"

리운은 한 박자 멈췄다. *7년 만이에요*라고 답하면 7년이라는 숫자가 도하의 머릿속에 박힐 것이고, 도하는 그 숫자를 기억할 것이다. 도하 같은 사람은 그런 숫자를 잊지 않았다. 그래서 리운은 다른 답을 골랐다.

"오래됐어요."

"그렇구나."

도하는 더 묻지 않았다. 두 번째 잔을 비우고, 안주가 나오기를 기다렸다.

잠시 후 사장이 작은 접시 두 개를 가져왔다. 두부조림과 간단한 나물. 사장은 접시를 내려놓으면서 도하에게 짧게 한 마디 했다.

"오랜만이네."

"네. 사장님, 한 선생님 소식 들으셨죠."

사장은 잠깐 도하를 봤다. 그리고 가볍게 고개를 끄덕였다.

"그저께 들었어. 삼우제 때 한 잔 올려야지."

"네."

사장은 더 말하지 않고 카운터 쪽으로 돌아갔다. 그게 그가 한지섭을 위해 할 수 있는 인사였다. 보관사도 아닌 이 작은 가게의 사장이 한지섭의 죽음을 알고 있었고, 슬퍼했고, 자기 방식으로 그를 떠나보내고 있었다. 리운은 그게 이상하게 위로가 되었다. 한지섭이 누군가의 일상 속에 살아있었다는 사실이.

---

도하가 두부조림을 한 점 집어 입에 넣었다. 천천히 씹으면서, 천장을 잠깐 올려다봤다.

"형, 저 솔직히 말할게요."

리운은 도하를 봤다.

"한 선생님이 휴직하신 게 작년 가을이잖아요. 그때부터 저 사실 무서웠어요. 한 선생님이 저보다 한참 선배니까, 한 선생님이 무너지시면 그 다음은 누구겠어요. 저 같은 사람이죠. 저 같이 자주 우는 사람."

도하는 거기서 잠깐 술잔을 들었다. 한 모금 마시고, 다시 내려놓았다.

"근데 더 무서웠던 건 형이었어요. 형이 무너지면, 그건 저 같은 사람이 아니라 다른 종류의 무너짐일 것 같았거든요. 형 같은 사람이 무너지면 회복이 안 될 것 같았어요. 한 선생님이랑 비슷한 종류의 무너짐이 될 것 같아서요."

리운은 답하지 않았다. 잔을 들어 한 모금 더 마셨다. 두 모금째였다.

"저 형이 안 무너졌으면 좋겠어요."

도하의 목소리에는 평소의 장난기가 없었다. 진심이었다. 리운은 도하의 진심을 받았다. 받았지만 답할 수가 없었다. *나는 이미 무너진 사람이에요*라고는 말할 수 없었다. 그건 너무 잔인한 진실이었고, 도하가 받기에는 너무 무거운 말이었다.

그 대신 리운은 다른 말을 골랐다.

"...저는 안 무너져요."

"왜요?"

"무너질 자격이 없어서요."

도하는 잠깐 리운을 봤다. 그 한 마디가 무슨 뜻인지 도하는 정확히 이해하지 못했지만, 그 말에 담긴 무게는 알아챘다. 그는 더 묻지 않았다. 대신 술잔을 들어 자기 입에 가져갔다.

침묵이 잠깐 흘렀다. 라디오에선 새 노래가 흘러나오고 있었다. 여전히 가사는 또렷하지 않았다. 두 사람은 한동안 그 잔잔한 음악 속에서 술을 마셨다.

리운은 세 모금째에 잔을 비웠다. 도하는 빈 잔에 술을 따라줬다. 리운은 그 술을 잠깐 들여다봤다. 작은 잔 안에서 흰 김이 옅게 올라오고 있었다.

"...도하 씨."

"네?"

"한 선생님은... 마지막에 어땠어요."

도하가 잠깐 멈췄다. 술잔을 입에 가져가던 손이 잠깐 공중에 멈췄다가, 천천히 내려갔다.

"마지막이라면, 휴직하시기 전이요?"

"네."

도하는 잠깐 생각을 정리하는 것 같았다. 그리고 천천히 입을 열었다.

"휴직하시기 직전 두어 달은... 사실 좀 이상하셨어요. 평소엔 농담도 잘하시고 사람들이랑 잘 어울리시던 분이었거든요. 근데 그 두 달 동안은 사람들이랑 거리를 두시더라고요. 점심도 혼자 드시고, 퇴근도 혼자 하시고. 저랑도 거의 말을 안 하셨어요."

도하는 거기서 잠깐 술잔을 봤다.

"근데 어느 날, 휴직하시기 일주일쯤 전에 저랑 단 둘이 점심을 드시러 가자고 하셨어요. 회사 근처 식당에서. 그때 저한테 말씀하셨어요. *도하 씨는 잘 우네요. 그게 도하 씨를 살릴 거예요.* 라고요."

리운은 그 말을 들었다. 어제 도하가 복도에서 했던 말과 같은 이야기였다. 다만 어제는 짧게 들었고, 오늘은 좀 더 긴 맥락이었다.

"그리고 한 선생님이 그러셨어요. *나는 한참 동안 안 울었어요. 그게 잘못이었던 것 같아요.* 그 말 듣고 저 진짜 가슴이 철렁했거든요. 그땐 무슨 말씀이신지 정확히는 몰랐는데, 지금은 알 것 같아요."

도하는 거기서 잔을 들어 한 모금 마셨다.

"안 우는 사람은요, 형. 안에서 죽고 있어요. 죽고 있는데 본인은 그걸 모르거나, 알면서도 멈출 수가 없거나. 한 선생님은 후자였던 것 같아요."

리운은 자기 잔을 봤다.

도하의 말이 리운의 가슴 안쪽 어딘가를 정확히 찔렀다. 그는 자기가 안에서 죽고 있다는 것을 알고 있었다. 7년 동안 알고 있었다. 알면서도 멈출 수가 없었다. 멈추는 방법을 잊었기 때문이었다. 멈추려면 먼저 자기 자신을 용서해야 했고, 리운에게 그건 가장 불가능한 일이었다.

리운은 잔을 들어 한 모금 더 마셨다. 네 모금째였다. 가슴 안쪽이 따뜻해지고 있었다. 술 때문인지, 도하의 말 때문인지는 알 수 없었다.

---

두 사람은 그 후로 한 시간쯤 더 머물렀다. 도하는 두 병째를 시켰고, 리운은 두 병째에는 손을 대지 않았다. 한 잔만 더 마시면 자기가 무언가를 말해버릴 것 같았다. 7년 동안 누구에게도 하지 않은 말을. 리운은 그게 두려웠다.

도하는 술이 들어갈수록 말이 많아졌다. 한지섭의 일화들. 입사 첫날 한 선생님이 자기한테 했던 농담. 첫 의뢰를 받고 사무실에서 운 날, 한 선생님이 와서 휴지를 내밀어준 일. 작년 봄에 셋이서 (리운은 아니고 다른 동료와 셋이서) 벚꽃놀이를 가기로 했었는데 결국 못 갔던 일. 작은 일들이었다. 다 작은 일들이었지만, 도하의 입을 통해 나오니까 한지섭이라는 사람의 윤곽이 조금씩 채워졌다.

리운은 한지섭에 대해 자기가 아는 것이 거의 없다는 것을 그제야 깨달았다. 한지섭과 같은 회사에서 3년을 일했는데도, 그가 어떤 사람이었는지를 거의 몰랐다. 그가 어떤 농담을 했는지, 어떤 안주를 좋아했는지, 어떤 음악을 들었는지. 리운은 그 모든 것을 알 기회가 있었지만 모두 거절했었다. 거절이 자기 생존이라고 믿었기 때문이었다.

지금 리운은 그 거절이 한지섭을 외롭게 만든 한 가지 이유였을지도 모른다고 생각했다. 한지섭은 리운에게 친구가 되고 싶었던 사람이었다. 리운은 그것을 알고도 받지 않았다. 알고도 받지 못했다.

*리운 씨는 어떻게 버텨요?*

그날 한지섭이 그렇게 물었던 것은, 정말로 답을 듣고 싶어서가 아니었다. 답을 들으려면 두 사람 사이에 무언가가 먼저 있어야 했고, 한지섭은 그 무언가가 없다는 것을 알면서도 한 번 더 시도해본 것이었다. 마지막 시도였다. 리운이 그날 짧게 답해줬다면, 단 한 마디라도 답해줬다면, 한지섭의 마지막은 조금 달랐을지도 몰랐다.

리운은 그 생각을 했고, 그 생각을 했다는 사실에 가슴이 다시 한 번 미세하게 무너졌다.

도하는 그 무너짐을 보지 못했다. 리운의 표정은 그대로였으니까.

---

가게를 나선 것은 밤 10시쯤이었다.

골목은 어두웠고, 가게 간판의 작은 불빛만이 발 밑을 비췄다. 4월의 밤공기는 낮보다 더 쌀쌀했다. 도하는 술기운에 얼굴이 살짝 붉어져 있었지만 발걸음은 멀쩡했다.

"형, 집까지 잘 가세요. 택시 잡아드릴까요?"

"아니에요. 지하철 탈 거예요."

"진짜 괜찮아요?"

"네."

도하는 잠깐 리운을 봤다. 그러더니 갑자기 손을 뻗어 리운의 어깨를 한 번 가볍게 잡았다.

"형."

"네."

"오늘 와줘서 고마워요."

리운은 도하의 손이 자기 어깨에 닿아 있는 것을 잠깐 느꼈다. 손은 따뜻했다. 그리고 그 손을 통해 무언가가 흘러들어왔다. 보관사들 사이의 미신 같은 그것. 강한 감정이 손을 통해 흘러들어올 때가 있다는 것. 도하의 손에서 흘러들어온 것은 슬픔도 아니고 걱정도 아니었다. 그것은 그냥 따뜻함이었다. 누군가가 누군가를 진심으로 걱정할 때 생기는 그 종류의 따뜻함.

리운은 자기 가슴 안쪽에서 그 따뜻함이 자리를 잡는 것을 느꼈다. 받지 말아야 할 감정이었지만, 막을 수 없었다. 막고 싶지도 않았다.

"...저도요."

리운은 그렇게 답했다. 도하는 옅게 웃었다.

"내일 봐요, 형."

"네. 내일 봐요."

도하는 손을 떼고 반대편으로 걸어갔다. 리운은 그의 뒷모습이 골목을 빠져나갈 때까지 잠깐 그 자리에 서 있었다. 그러고 나서 천천히 지하철역 쪽으로 걸었다.

---

지하철 안은 한산했다. 리운은 늘 앉던 칸의 늘 앉던 자리에 앉았다. 가방을 무릎 위에 올리고, 창밖을 봤다. 지하의 어둠이 창에 비쳤다. 자기 얼굴이 흐릿하게 보였다.

오늘의 얼굴은 어제와 달라 보였다. 어디가 다른지는 정확히 말할 수 없었다. 다만 어제의 얼굴이 더 굳어 있었다면, 오늘의 얼굴은 살짝 풀려 있었다. 술 때문일지도 몰랐다. 아니면 다른 무언가일지도.

리운은 가방에서 수첩을 꺼냈다. 검은 가죽 수첩. 오늘 점검 완료한 *20310410-A*가 적혀 있었다. 그 옆에 적었던 *보관 상태 양호. 잔여감 보통.* 이라는 거짓말도.

리운은 펜을 꺼내 그 줄에 작은 수정을 했다. *잔여감 보통* 옆에 작은 글씨로 한 단어를 추가했다.

> *깊음.*

그 단어를 적고, 수첩을 잠깐 들여다봤다. 자기 자신에게 거짓말을 한 부분을, 7년 만에 처음으로 정정한 것이었다. 작은 정정이었지만, 리운에게는 큰 의미였다. 자기에게 솔직해지는 일을 그는 7년 동안 한 번도 한 적이 없었다.

리운은 수첩을 덮고 가방에 다시 넣었다.

---

오피스텔에 도착한 건 11시 반이었다. 평소보다 2시간 늦은 귀가였다. 리운은 현관문을 열고 신발을 벗고, 가방을 책상 위에 올려놓았다. 평소와 같은 동작들이었지만, 오늘은 어딘가 한 박자씩 느렸다.

그는 옷을 갈아입지 않은 채로 한참 책상 앞에 앉아 있었다. 술기운이 천천히 가라앉는 것을 느끼면서. 가슴 안쪽의 따뜻함이 조금씩 식어가는 것을 느끼면서. 식는 것이 아쉬웠다. 그래서 그는 그 따뜻함이 완전히 사라지기 전에, 침대 머리맡 서랍을 열었다.

여동생의 사진을 꺼냈다.

오늘은 평소보다 오래 들여다봤다. 평소엔 한두 번 보고 다시 넣었는데, 오늘은 1분, 2분, 그 이상을 들여다봤다. 사진 속의 여동생은 웃고 있었다. 머리를 짧게 자른 직후의 사진이었다. 짧은 단발머리. 여동생은 자기 머리가 마음에 든다는 표정으로 카메라를 보고 있었다.

*오빠 나 머리 잘랐어 어때.*

그날 여동생이 보낸 메시지였다. 리운은 그 메시지에 *그냥 그래*라고 답장했었다. 평소의 무뚝뚝한 말투. 여동생은 이모티콘 하나를 보내고 대화를 끝냈다.

리운은 7년 동안 그 답장을 후회해왔다. 다른 답장을 했어야 했다. *예쁘다*거나, *잘 어울려*라거나, *언제 자른 거야*라거나. 무엇이든 좋았다. 무뚝뚝하지만 않았다면. 여동생이 보낸 마지막 메시지에 그가 더 다정하게 답했더라면.

오늘 리운은 그 후회를 다시 한 번 했다. 다만 오늘의 후회는 평소와 약간 달랐다. 평소엔 후회가 가슴 안쪽 어딘가에 단단히 박혀 있었다면, 오늘은 그 박혀 있던 것이 살짝 움직였다. 어디로 움직이는지는 알 수 없었다. 다만 움직였다는 사실만은 분명했다.

리운은 사진을 다시 서랍에 넣고, 옷을 갈아입고, 침대에 누웠다. 시간은 자정이 넘어 있었다.

오늘 밤은 잠이 빨리 올 것 같았다. 술 때문일지도 모르고, 도하 때문일지도 모르고, 한지섭의 편지 때문일지도 몰랐다. 어쩌면 셋 다일지도 몰랐다.

리운은 눈을 감았다.

---

다음 날 아침, 리운은 평소보다 10분 늦게 깼다.

알람을 듣고도 일어나지 못한 것이 7년 만이었다. 정확히 말하면 7년 동안은 알람이 울리기 전에 깨어 있었기 때문에 *늦게 깼다*는 표현 자체가 어색했다. 오늘 처음으로 알람 소리에 깨어났고, 알람이 울리고도 10분을 더 누워 있었다.

그는 천장을 보면서 오늘이 무슨 요일인지를 잠깐 생각했다. 금요일이었다. 금요일은 보통 의뢰가 두 건 잡히는 날이었다. 오전에 한 건, 오후에 한 건.

리운은 천천히 일어났다. 어제의 술기운은 거의 남아 있지 않았다. 다만 가슴 안쪽 어딘가에 도하가 두고 간 따뜻함의 흔적이 아직 남아 있었다. 그것은 사라지지 않은 채 자기 자리에 있었다.

리운은 평소처럼 씻고, 옷을 입고, 가방을 챙겼다. 오늘은 보리차를 한 잔 마시고 나가고 싶다고 잠깐 생각했다. 김 주임의 보리차가 아니라, 자기가 직접 끓인 보리차를. 그러나 집에는 차가 없었다. 7년 동안 자기 손으로 차를 끓인 적이 없었으니까.

리운은 그 사실을 알아채고, 잠깐 그 자리에 서 있었다. 그리고 메모지에 짧게 한 줄을 적었다.

> *보리차 사기.*

작은 일이었다. 너무 작은 일이라 누가 봤다면 이게 무슨 의미가 있냐고 물었을 것이다. 다만 리운에게 그 한 줄은 7년 만의 작은 결심이었다. 자기가 자기를 위해 무언가를 사겠다는 결심.

리운은 메모지를 책상 위에 두고 집을 나섰다.

---

회사에 도착한 시간은 평소보다 15분 늦은 시각이었다. 1층 로비에서 김 주임이 리운을 보고 살짝 놀란 표정을 지었다. 평소 시간보다 늦은 리운을 본 것이 5년 만에 처음이었다.

"선생님, 늦으셨네요."

"...네. 잠을 좀 늦게 잤어요."

"보리차 드릴까요?"

"네. 부탁드릴게요."

김 주임은 종이컵에 보리차를 따라 건넸다. 리운은 받아들고 평소처럼 가볍게 목례를 했다. 그러고 나서, 처음으로 한 마디를 덧붙였다.

"...오늘도 따뜻하네요."

김 주임은 잠깐 멈췄다. 5년 동안 매일 따라준 차였다. 그동안 리운은 한 번도 그 차에 대해 한 마디도 한 적이 없었다. 받기만 하고 마시지도 않았다. 오늘 처음으로 그 차에 대해 말했다.

"...네. 매일 그 시간에 따뜻하게 우려놔요."

"감사해요."

리운은 짧게 그렇게 말하고 엘리베이터 쪽으로 걸어갔다. 김 주임은 그의 뒷모습을 잠깐 봤다. 그녀의 눈가가 살짝 흐려졌지만, 그건 슬픔의 흐림이 아니었다.

그것은 5년 동안 차를 따라준 사람이 처음으로 받은 보답이었다.

---

리운이 사무실에 들어가서 노트북을 열었을 때, 오늘의 첫 의뢰서가 화면에 떴다.

> 의뢰인 #20310412-C
67세 / 남성
의뢰 종류: 영구 보관
사전 분류: 가족 관계 / 30년

리운은 그 의뢰서를 잠깐 들여다봤다.

서른 해. 가족. 영구 보관.

이런 의뢰는 무거운 의뢰였다. 가족과 관련된 30년치 기억을 영구 보관하겠다는 것은, 가족 안에서 일어난 무언가를 평생 잊고 싶다는 뜻이었다. 그리고 67세라는 나이는 그 무언가를 30년 넘게 안고 살아온 사람이라는 뜻이었다.

리운은 의뢰서를 한 번 더 읽었다. 그리고 자리에서 일어나 사무실 한쪽에 있는 작은 거울로 향했다. 그 거울은 의뢰인을 만나기 전에 자기 표정을 점검하기 위해 둔 것이었다. 거울 속의 리운은 평소와 비슷했다. 다만 어제의 얼굴보다 한 톤 풀려 있었다.

리운은 거울을 보면서 자기 표정을 다시 단단하게 만들었다. 의뢰인 앞에서는 흔들리지 않는 사람이어야 했다. 그게 그의 직업이었다. 어제 도하와 마신 술 한 잔도, 한지섭의 편지도, 검은 원피스 여자의 부탁도, 다 잠깐 옆으로 밀어두었다. 의뢰인 앞에서는 *서리운 보관사*만 있어야 했다.

거울 속의 리운이 천천히 평소의 얼굴로 돌아갔다.

리운은 사무실 문 앞으로 가서 손잡이에 손을 올렸다.

오전 10시 정각이었다.', 2111, 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('340ec170-7fed-4585-8d9b-a51e2596cc77', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '30년치 한 마디', 'draft', '오전 10시 정각, 사무실 문이 두드려졌다.

리운은 문을 열었다. 의뢰인은 67세 남자였다. 키가 작은 편이었고, 등이 살짝 굽어 있었다. 회색 점퍼에 베이지색 면바지. 손에는 검은색 가죽 가방을 들고 있었다. 가방은 낡았지만 깨끗했다. 오랫동안 한 사람이 자기 가방을 아끼며 들고 다닌 흔적이었다.

"안녕하세요. 서리운입니다. 들어오시죠."

남자는 가볍게 목례를 하고 사무실에 들어왔다. 리운이 가리킨 의자에 앉기 전에, 그는 잠깐 사무실 안을 둘러봤다. 처음 와본 사람의 시선이었다. 무언가를 확인하려는 것 같기도 했고, 그저 어색해서 시선을 둘 곳을 찾는 것 같기도 했다.

"...생각보다 평범하네요."

남자가 그렇게 말했다. 리운은 가볍게 답했다.

"어떤 곳을 상상하셨어요?"

"글쎄요. 좀 더 무서운 곳일 줄 알았어요. 병원 같거나, 아니면 더 차가운 데일 줄 알았는데. 그냥 사무실이네요."

"네. 그냥 사무실이에요."

남자는 의자에 앉았다. 가방을 무릎 위에 올려놓고, 두 손을 그 위에 가지런히 모았다. 차분한 사람의 동작이었지만, 그 차분함 안쪽에 단단한 결심이 있었다. 리운은 그것을 알아챘다.

리운은 책상 맞은편에 앉아 노트북을 열었다. 화면에 의뢰서가 떠 있었다. *20310415-C. 67세 남성. 영구 보관. 사전 분류: 가족 관계 / 30년.*

"먼저 절차를 안내드리겠습니다."

리운이 평소처럼 입을 열려는데, 남자가 손을 살짝 들었다.

"절차는 인터넷에서 미리 다 봤어요. 사전 상담, 본 이식, 사후 관리. 다 알고 왔습니다."

"네."

"바로 본론으로 들어가도 되겠습니까?"

리운은 의뢰인을 잠깐 봤다. 보통 의뢰인들은 절차 안내를 듣고 싶어했다. 절차를 듣는 시간 동안 자기 결심을 한 번 더 확인하기 때문이었다. 절차를 건너뛰고 본론으로 가자는 건 이미 그 확인을 다 끝낸 사람의 말투였다.

"네. 말씀하시죠."

남자는 잠깐 호흡을 가다듬었다. 그리고 입을 열었다.

"30년 전, 제 딸이 다섯 살 때, 제가 한 말이 있습니다. 그 말 하나를 지우고 싶어서 왔어요."

"한 마디요."

"네. 한 마디."

남자는 거기서 잠깐 말을 멈췄다. 그 한 마디를 다시 입에 올리는 것이 30년이 지난 지금도 어려운 모양이었다. 리운은 재촉하지 않았다. 보관사는 의뢰인의 시간을 기다려주는 직업이었다.

남자는 손을 자기 가방 위에서 천천히 풀었다 모았다 했다. 그러다 결국 그 한 마디를 입 밖으로 냈다.

"*너는 아들이었어야 했어.*"

사무실 안이 잠깐 조용해졌다.

---

리운은 그 말을 들었다. 그리고 그 말의 무게를 받았다.

가족이라는 단어 앞에서 그는 매번 자기 자신을 한 번 점검해야 했다. 7년 동안 익혀온 절차였다. 가족과 관련된 의뢰가 들어올 때마다, 리운은 자기 가슴 안쪽의 봉인이 흔들리지 않도록 한 번 더 단단히 잠갔다. 오늘도 그렇게 했다. 다만 오늘은 그 잠금이 평소보다 약간 더 헐거웠다. 어제 도하와의 술자리, 한지섭의 편지, 그리고 무엇보다 자기 수첩에 *깊음*이라는 한 단어를 추가한 일. 그 모든 것이 잠금을 약간 풀어놓고 있었다.

리운은 의식적으로 호흡을 한 번 가다듬었다. 그리고 직업적인 톤으로 절차상의 안내를 시작했다.

"의뢰인분께 미리 말씀드려야 할 부분이 있습니다. 저희 보관 기술의 특성 때문에요."

"네."

"기억은 신경망 안에서 맥락과 함께 묶여 있어요. 그래서 한 사건의 한 순간만 따로 분리해서 추출할 수 없습니다. 한 마디를 지우시려면, 그 말이 나온 맥락 전체와, 그 말이 가져온 결과들이 함께 추출됩니다. 이 경우에는 그 한 마디가 발화된 자리, 즉 30년 전 백일 잔치 그날의 기억과, 그 후 따님과의 관계 안에서 그 한 마디가 영향을 미친 모든 순간들이 보관 대상이 됩니다."

리운은 거기서 잠깐 말을 골랐다.

"쉽게 말씀드리면, 따님과 관련된 30년치 기억의 상당 부분이 함께 사라집니다. 좋았던 기억도, 평범했던 기억도요. 의뢰서에 *가족 관계 30년*으로 분류된 이유가 그것입니다. 이 부분은 미리 알고 계셨나요?"

남자는 가만히 듣고 있었다. 그의 표정에는 변화가 없었다. 다만 무릎 위의 손이 한 번 작게 움직였다.

"...알고 있었습니다."

"미리 알고 오셨군요."

"네. 인터넷에서 봤어요. 그 부분이 가장 오래 망설이게 한 부분이었습니다."

리운은 고개를 가볍게 끄덕였다. 이런 의뢰인은 흔치 않았다. 보통 사람들은 *한 가지만 지우면 된다*는 환상을 가지고 보관소에 왔다. 자기 인생에서 한 사건만 깨끗하게 도려내고 나머지는 그대로 가져갈 수 있다고 믿었다. 그런데 그건 불가능했다. 한 사건은 다른 사건들과 묶여 있었고, 한 감정은 다른 감정들과 묶여 있었다. 사람의 기억은 책장에 꽂힌 책이 아니라 강물처럼 흐르는 것이었다. 한 줄기만 떼어낼 수 없었다.

이 사실을 미리 알고 받아들인 채로 오는 의뢰인은 드물었다. 30년을 매일 곱씹어본 사람만이 도달할 수 있는 이해였다.

"그럼 한 가지만 더 확인하겠습니다."

"네."

"의뢰인분께서 따님과의 좋은 기억까지 함께 사라진다는 것을 받아들이신 거죠. 함께 식사한 일, 따님이 어렸을 때 함께 놀아준 일, 따님의 졸업식, 결혼 소식, 그런 것들 전부요."

남자는 잠깐 시선을 내렸다. 그리고 천천히 답했다.

"좋은 기억이 많지 않아요. 그래서 받아들이기 쉬웠습니다."

리운은 그 답에 잠깐 말을 잃었다.

좋은 기억이 많지 않다는 것. 30년 동안 한 사람의 아버지로 살면서 좋은 기억이 많지 않다는 것. 그건 이 의뢰인이 30년을 어떻게 살았는지를 한 문장으로 보여주는 답이었다. 그는 그 한 마디 이후로 자기 딸과의 좋은 순간을 거의 만들지 않았다. 만들지 못한 것이 아니라, 만들 자격이 없다고 스스로 결정한 사람이었다.

---

남자는 잠깐 호흡을 가다듬더니 자기 이야기를 이어갔다.

"그날이 둘째 아이의 백일이었어요. 둘째는 아들이었습니다. 첫째는 딸이고요. 30년 전 그 시절엔 아들 낳는 게 큰 일이었어요. 저희 부모님도 그러셨고, 저희 동네도 그랬고. 첫째 딸이 태어났을 때 저희 어머니가 며칠을 우셨어요. 며느리한테 미안해서가 아니라, 손자가 아니어서. 그게 그 시절이었습니다."

남자는 잠깐 시선을 내렸다.

"둘째가 아들로 태어났을 때, 저희 집안 분위기가 완전히 바뀌었어요. 어머니가 처음으로 환하게 웃으셨고, 아버지도 동네방네 자랑하셨고. 백일 잔치를 크게 했어요. 손님이 마흔 명 넘게 왔습니다. 그날 저희 첫째 딸은 다섯 살이었어요. 손님들이 둘째한테만 관심을 보이니까 첫째가 외로웠던 모양이에요. 잔치 중간에 첫째가 저한테 와서 자기도 봐달라고 했어요. 손을 잡아달라고. 안아달라고."

남자는 거기서 다시 한 번 멈췄다.

"그때 제가 술을 한 잔 했어요. 한 잔이 아니라 여러 잔이었던 것 같습니다. 손님들이 자꾸 권하시니까. 정신이 좀 풀려 있었어요. 첫째가 저한테 매달리는데, 그 순간 저한테서 그 말이 나왔어요."

*너는 아들이었어야 했어.*

남자는 그 한 마디를 다시 입에 올리지 않았다. 한 번이면 충분했다.

"손님들이 다 들었어요. 첫째도 들었고요. 다섯 살이 그 말을 정확히 알아들었을 리는 없죠. 그런데 알아들었더라고요. 다섯 살이 어떻게 알아들었는지는 모르겠어요. 표정이 변하더니 조용히 어디론가 가더라고요. 제가 따라가지 않았어요. 따라가지 못했어요. 술 때문이라고 핑계를 댈 수도 있었지만, 그건 핑계예요. 저는 그날 그 말을 한 게 잘못이라는 걸 알면서도 사과하지 않았어요. 자존심 때문이었던 것 같아요. 그 시절 아버지들의 그 자존심."

---

리운은 듣고 있었다.

남자의 말은 빠르지도 느리지도 않았다. 30년 동안 머릿속에서 수천 번 되풀이된 이야기였다. 너무 많이 되풀이되어서 이제는 외워버린 이야기. 리운은 그런 이야기들을 자주 들었다. 보관사 일을 하다 보면, 의뢰인들이 자기 고통을 정리해서 가져오는 경우가 많았다. 정리된 고통은 어떤 면에선 더 잔인했다. 정리할 수 있을 만큼 오래 안고 살았다는 뜻이니까.

"그 후에는요?"

리운이 물었다. 평소에는 의뢰인의 이야기를 다 듣고 절차로 넘어갔지만, 오늘은 한 마디가 더 나왔다.

"그 후가 가장 힘들었습니다."

남자는 자기 손을 봤다.

"첫째는 그날 이후로 저한테 잘 다가오지 않았어요. 다섯 살 아이가 그 한 마디를 정확히 알아들었는지는 모르겠지만, 그 한 마디가 가져온 분위기는 알아들은 것 같아요. 자기가 환영받지 못하는 존재라는 것. 자기 동생은 사랑받고, 자기는 그 사랑의 옆에 있는 사람이라는 것. 다섯 살이 그걸 알면 안 되는데, 알았어요."

"그 후로 첫째는 점점 조용한 아이가 됐어요. 학교 가서도 친구가 별로 없었고, 집에 와서도 자기 방에만 있었어요. 사춘기가 되니까 더 심해졌어요. 저랑 말을 거의 안 했어요. 어머니랑은 그래도 가끔 말했는데, 저한테는 *예*, *아니요*, 그게 전부였어요. 제가 미안하다는 말을 못 했어요. 30년 동안. 한 번도."

"왜 못 하셨어요?"

리운이 물었다. 이 질문도 평소엔 하지 않는 질문이었다. 보관사는 의뢰인의 선택에 개입하지 않는 것이 원칙이었다. 그런데 오늘은 자꾸 한 마디씩 더 나왔다. 리운은 그것을 의식하면서도 멈추지 못했다.

"...자존심 때문이었어요. 그리고 두려움 때문이었고요."

"두려움이요?"

"네. 미안하다고 말하는 순간, 제가 한 일이 진짜가 되니까요. 미안하다는 말을 안 하면, 그 일은 그냥 지나간 작은 사건이 될 수 있어요. 가족 잔치에서 술 취한 아버지가 한 실수. 누구나 그럴 수 있는 일. 그런데 미안하다고 말하는 순간, 그건 제가 평생 짊어져야 할 잘못이 됩니다. 저는 그 짊어짐이 무서웠어요."

남자는 거기서 잠깐 입을 다물었다. 그리고 천천히 다시 입을 열었다.

"근데 결국 짊어지긴 했어요. 사과하지 않은 채로 30년을 짊어졌습니다. 사과한 것보다 더 무거웠어요. 사과했다면 한 번에 무거웠을 텐데, 사과하지 않았더니 30년 동안 매일 조금씩 무거워졌어요. 매일 밤 그 다섯 살의 표정이 떠올랐습니다."

---

리운은 남자의 이야기를 듣는 동안, 자기 가슴 안쪽에서 무언가가 천천히 단단해지는 것을 느꼈다.

처음에는 그것이 분노라고 생각했다. 30년 전에 한 말 한 마디로 자기 딸을 평생 외롭게 만들고, 사과 한 마디를 못 한 채로 30년을 보내고, 이제 와서 그 기억을 지우러 온 사람. 리운에게 이 의뢰는 그가 가장 경멸하는 종류의 의뢰였다. 사과가 아니라 도망. 책임이 아니라 회피.

리운은 사람을 미워하지 않으려고 노력하며 살아왔다. 자기가 사람을 미워할 자격이 있다고 생각한 적이 없었으니까. 자기보다 더 잘못한 사람이 세상 어디에 있겠냐는 생각이 그를 늘 누그러뜨렸다. 그런데 오늘 이 의뢰인 앞에서는 자기 안에서 어떤 단단함이 올라오는 것을 막지 못했다.

다만 리운은 그것을 표정에 드러내지 않았다. 직업적으로 차분한 얼굴을 유지했다. 그게 그가 7년 동안 익혀온 가장 중요한 기술이었다.

"의뢰인분."

리운이 입을 열었다.

"한 가지 여쭤봐도 될까요."

"네."

"따님께 사과하실 생각은 없으셨나요?"

남자는 잠깐 리운을 봤다. 그 시선에 옅은 무언가가 스쳤다.

"...있었어요. 30년 동안 매일 있었습니다. 그런데 못 했어요."

"왜 못 하셨나요?"

"...너무 늦었으니까요. 5년이 지났을 때는 5년이 늦었다고 생각했고, 10년이 지났을 때는 10년이 늦었다고 생각했어요. 30년이 지난 지금은 사과하는 것 자체가 그 아이한테 더 큰 짐이 될 것 같아요. 30년 동안 묻어둔 걸 제가 지금 다시 끄집어내면, 그 아이는 그걸 다시 한 번 살아야 합니다. 그건 제가 더 이상 그 아이한테 할 수 없는 일이에요."

"그래서 기억을 지우러 오신 거고요."

"네."

"기억을 지우면, 따님께 사과하실 필요가 없어지니까요."

리운의 목소리에 평소보다 약간의 무게가 실렸다. 본인도 그것을 의식했지만 멈추지 못했다.

남자는 리운의 말을 듣고 한참 침묵했다. 그 침묵 안에서 무언가를 곱씹는 것 같았다. 그리고 천천히 답했다.

"...아니요. 보관사님."

"네?"

"기억을 지우면 사과할 *기억*이 없어지는 게 아니라, 사과하지 못한 *죄책감*이 없어지는 거예요. 둘은 다릅니다."

리운은 잠깐 말이 막혔다.

"제가 기억을 지우는 건 그 아이한테 사과하지 않기 위해서가 아니에요. 그 아이한테 사과해도 그 아이의 상처는 안 사라진다는 걸 30년 동안 봐왔기 때문이에요. 제가 사과한다고 그 아이가 행복해지는 게 아닙니다. 그 아이는 이미 그 상처를 안고 평생을 살았어요. 제가 지금 사과한다고 그게 되돌려지지 않아요. 다만 제가 이 죄책감을 안고 있는 한, 저는 그 아이한테 무언가를 *해주려고* 자꾸 하게 됩니다. 안부 전화를 한다든가, 명절에 용돈을 보낸다든가, 보고 싶다고 한다든가. 그게 그 아이한테는 또 짐이에요. 사과하지 않은 아버지가 자꾸 무언가를 해주려고 하는 것. 그 아이는 그 모든 것이 사과의 대용품이라는 걸 알고 있고, 그래서 더 괴로울 거예요."

남자는 잠깐 호흡을 골랐다.

"제가 이 기억을 지우면, 저는 그 아이한테 무언가를 해주려는 마음 자체가 사라집니다. 저는 그냥 평범한 70대 노인이 됩니다. 첫째 딸과 거리가 먼 평범한 아버지. 그 거리감을 이상하게 여기지 않게 됩니다. 이 거리가 어디서 왔는지 모르니까, 그 거리를 받아들이게 돼요. 그게 그 아이한테 가장 좋은 일이에요. 그 아이를 자유롭게 해주는 일이에요. 사과로 자유롭게 해줄 수 없으니까, 제가 사라지는 방식으로 자유롭게 해주는 거예요."

리운은 그 말을 들었다.

그리고 자기 안에서 단단해졌던 그 무언가가 천천히 풀리는 것을 느꼈다.

---

남자는 가해자였다. 리운이 처음 그의 이야기를 들었을 때 느낀 그것은 틀리지 않았다. 그는 30년 전 어린 딸에게 평생의 상처를 남긴 사람이었다. 그리고 사과 한 마디를 못 한 채 30년을 보낸 사람이었다. 그건 변하지 않는 사실이었다.

다만 리운이 보지 못한 것이 있었다. 그가 가해자이기만 한 사람은 아니었다는 것. 그는 30년 동안 자기가 한 그 한 마디를 매일 밤 떠올린 사람이었다. 사과하지 못한 채로 매일 무거워진 사람이었다. 자기가 사과해도 딸의 상처가 사라지지 않는다는 것을 30년 동안 지켜봐 온 사람이었다. 그는 자기의 마지막 사랑을 *사라짐*이라는 형태로 주려는 사람이었다.

리운은 그것을 이해할 수 있었다.

이해할 수 있는 것이 무서웠다. 왜냐하면 리운 자신도 비슷한 곳에 있었기 때문이었다. 그는 7년 동안 자기 가족에게 사과하지 못했다. 사과할 사람이 이 세상에 없었으니까. 사과할 수 있었다 해도 사과의 효과를 볼 사람이 없었다. 그는 그 사실 때문에 매일 무거워졌고, 그 무거움을 견디기 위해 *기억 보관사*라는 직업을 자기 자신의 족쇄로 만들었다.

이 67세 남자는 다른 길을 택한 것뿐이었다. 같은 종류의 죄책감을 다른 방식으로 처리하기로 결정한 사람이었다. 리운은 *기억을 안고 살기*로 했고, 이 남자는 *기억을 내려놓기*로 했다. 둘 중 어느 쪽이 옳다고 말할 수 없었다. 둘 다 살아남기 위한 방식이었다.

리운은 자기가 지난 3년 동안 의뢰인들에게 살짝의 우월감을 가지고 있었다는 것을 그제야 깨달았다. 기억을 지우러 오는 사람들을 보면서, 자기는 다르다고 생각했었다. 자기는 안고 가는 사람이고, 저들은 도망치는 사람이라고. 그 우월감이 자기를 버티게 했었다. 그런데 오늘 이 남자가 그 우월감을 부쉈다.

기억을 내려놓는 것도 사랑이 될 수 있다는 것. 그게 오늘 리운이 처음 배운 것이었다.

---

"의뢰인분."

리운이 다시 입을 열었다. 이번엔 목소리가 처음과 달랐다. 단단함이 빠지고, 그 자리에 다른 무언가가 있었다. 본인도 그것을 정확히 알지 못했다.

"네."

"의뢰는 진행하겠습니다. 다만 한 가지만 다시 확인하고 싶어요."

"네."

"이 기억을 지우신 후에, 후회하실 것 같지는 않으신가요?"

남자는 잠깐 침묵했다. 그리고 옅게 웃었다. 그날 그가 보여준 첫 미소였다.

"후회할 거예요. 분명히요."

리운은 그 답이 의외였다. 후회하지 않을 거라고 답할 줄 알았다.

"그런데 그 후회는 제가 안 하게 됩니다."

"무슨 말씀이세요?"

"기억을 지우면, 저는 후회할 *대상*을 잊으니까요. 후회하는 감정은 남아 있을지 몰라요. 가끔 가슴이 답답하거나, 이유 없이 슬프거나, 그런 일은 있을 거예요. 그런데 그 답답함과 슬픔이 어디서 오는지 모르게 됩니다. 알 수 없는 답답함은 견딜 수 있어요. 사람은 알 수 없는 것은 견딜 수 있어요. 견딜 수 없는 건 알면서 어쩌지 못하는 것이에요."

리운은 그 말을 들었다.

그리고 그 말이 자기 자신에게도 해당된다는 것을 알았다.

리운은 7년 동안 *알면서 어쩌지 못한 사람*이었다. 자기가 가족을 죽였다는 것을 알면서, 그 사실을 어쩌지 못한 채 매일 살아왔다. 만약 그 기억을 잊을 수 있었다면 그는 잊었을지도 모른다. 다만 그는 그 길을 스스로 닫았다. 보관사가 됨으로써, 자기 기억을 영원히 자기 안에 봉인함으로써.

이 남자는 다른 선택을 한 것뿐이었다. 그는 알면서 어쩌지 못하는 길을 선택하지 않았다. 모르는 채로 가끔 답답한 길을 선택했다. 둘 다 살아가는 방식이었다.

리운은 노트북에서 시선을 들고 남자를 봤다.

"...알겠습니다. 진행하겠습니다."

"감사합니다."

남자는 가볍게 고개를 숙였다. 그 인사 안에 30년의 무게가 들어 있었다.

---

이식 준비를 하면서, 리운은 평소보다 천천히 움직였다. 사무실 안쪽의 작은 방으로 남자를 안내하고, 의자 두 개를 마주 놓고, 패드를 부착하는 법을 알려주고, 기계를 켰다.

남자는 평온해 보였다. 자기 30년치 무게를 내려놓기 직전인 사람이라기엔 너무 평온했다. 리운은 그 평온함이 어디서 오는 것인지 알 것 같았다. 그것은 결심을 끝낸 사람의 평온함이었다. 30년 동안 매일 결심을 미뤄온 사람이 마지막으로 결심을 마친 후에 오는 평온함.

리운은 자기 쪽 패드를 머리에 부착했다. 그리고 기계의 화면을 봤다. 동기화 진행률이 0퍼센트에서 천천히 올라가고 있었다.

이식이 시작되기 직전, 남자가 한 마디를 했다.

"보관사님."

"네."

"이 기억을 받아주셔서 감사합니다. 그리고 잘 보관해주세요."

리운은 그 말을 들었다.

*잘 보관해주세요.* 그저께 검은 원피스의 여자가 했던 말과 같은 부탁이었다. 두 사람 다 자기 기억을 *잘 보관해달라*고 부탁했다. 보통 의뢰인들은 *잘 지워달라*고 했다. 그런데 이 두 사람은 보관해달라고 했다. 그게 그들이 자기 기억을 다루는 방식이었다.

리운은 짧게 답했다.

"잘 보관하겠습니다."

그리고 기계의 스위치를 눌렀다.

---

30년치 기억이 리운의 머릿속으로 흘러들어오는 동안, 리운은 눈을 감았다. 들어오는 기억을 막을 수는 없었다. 다만 그 흐름의 가운데에 자기를 잃지 않도록, 한 가지 생각만 붙잡고 있었다.

*이 사람은 가해자이자 피해자다.*

그 한 줄을 붙잡고 있으면, 들어오는 기억을 받아도 자기 자신을 지킬 수 있을 것 같았다. 7년 동안 익혀온 또 다른 기술이었다. 받은 기억과 자기 자신을 분리하는 기술. 다만 오늘은 그 기술이 평소만큼 잘 작동하지 않았다.

기억은 색깔로 오지 않았다. 소리로 왔다. 잔치의 시끄러운 소리. 손님들의 웃음. 술잔이 부딪치는 소리. 그리고 그 모든 소리 가운데에서 한 어린 여자아이의 작은 목소리가 있었다.

*아빠.*

다섯 살의 목소리였다.

리운은 그 목소리를 받았다. 받으면서, 자기 가슴 안쪽의 봉인이 한 번 더 흔들리는 것을 느꼈다. 다섯 살의 여자아이의 목소리. 그것은 리운이 견디기 어려운 종류의 소리였다. 7년 전의 어떤 기억과 너무 가까운 종류의 소리였기 때문이었다.

리운은 호흡을 가다듬었다. 한 번. 두 번. 그리고 그 소리를 자기 안의 *보관* 영역으로 옮겼다. 자기 감정과 분리된, 직업적인 보관 영역으로. 거기에 두면 자기 가슴 안쪽이 직접 닿지 않았다. 7년 동안 익혀온 기술이었다.

이식은 20분 동안 진행됐다. 백일 잔치 그날부터 시작해서, 그 한 마디 이후 30년 동안 첫째 딸과 자기 사이에 쌓인 모든 거리감의 순간들이 차례로 들어왔다. 첫째가 점점 조용해지는 모습, 사춘기에 더 거리가 멀어지는 모습, 성인이 되어 집을 떠나는 모습. 30년이 작은 조각들로 리운의 머릿속에 들어왔다.

마지막 조각은 작년이었다. 첫째 딸이 결혼하는 날. 남자는 결혼식장에 가지 못했다. 첫째가 부르지 않았기 때문이었다. 남자는 그날 집에서 텔레비전을 보고 있었다. 텔레비전에서 무슨 프로그램이 나오고 있었는지 그는 기억하지 못했다. 다만 그날 저녁에 그는 평생 처음으로 소리 내어 울었다고 했다. 30년 만의 첫 울음. 그리고 며칠 뒤에 보관사 의뢰를 결심했다고 했다.

기억은 거기서 끊어졌다.

---

이식이 끝났다.

남자는 멍한 얼굴로 잠시 앉아 있었다. 그러다 천천히 자기 이마에 손을 가져다 댔다. 아직 기억이 자기에게서 빠져나갔다는 것을 몸이 받아들이지 못하는 단계였다.

"...끝났나요?"

"네. 끝났습니다."

남자는 자리에서 일어났다. 휘청이지 않았다. 다만 이마에 손을 가져다 댄 채로 잠시 서 있었다. 그리고 천천히 손을 내렸다. 그의 얼굴에는 어떤 감정도 떠 있지 않았다. 30년치 무게가 사라진 자리에는 아무것도 없었다.

리운은 그를 사무실 문까지 배웅했다. 문 앞에서 남자가 한 번 멈췄다. 그리고 리운을 봤다. 리운을 보는 시선에는 아주 옅은 어색함이 있었다. 사람이 자기가 왜 어떤 자리에 있었는지 모를 때 짓는 그런 표정이었다.

"...감사했습니다."

남자는 그렇게 말했다. 무엇에 대한 감사인지는 자기도 모르는 채로.

"안녕히 가세요."

남자는 사무실을 나섰다. 그의 등이 복도를 천천히 걸어가는 것을 리운은 잠깐 봤다. 굽은 등이 30년의 무게를 내려놓고도 여전히 굽어 있었다. 짊어진 것을 내려놓아도 짊어졌던 자리는 그대로 굽은 채로 남아 있었다.

리운은 사무실 문을 닫았다.

그리고 책상 앞으로 돌아와 앉았다. 의자에 등을 기대고, 잠깐 천장을 올려다봤다.

가슴 안쪽에서 다섯 살 여자아이의 목소리가 아직 작게 울리고 있었다. *아빠.* 그 목소리는 이 사무실에서 30년 전에 한 번 불렸고, 오늘 리운의 안에서 다시 울렸다. 두 번 다 응답받지 못한 부름이었다. 다섯 살의 그날, 아버지는 술에 취해 그 부름에 *너는 아들이었어야 했어*라고 답했고, 30년 후 오늘, 그 아버지는 그 부름 자체를 잊어버렸다.

리운은 그 부름의 마지막 보관자가 되었다. 다섯 살 여자아이가 그날 자기 아버지를 부른 그 목소리는 이제 이 세상에서 리운의 안에만 살아 있었다. 다섯 살 여자아이도, 그녀의 아버지도, 그 잔치에 있던 다른 사람들도, 모두 그 목소리를 잊었거나 잊을 것이었다. 다만 리운은 잊을 수 없었다. 보관사니까.

리운은 책상 위에 손을 올렸다. 손가락이 살짝 떨리고 있었다. 7년 동안 거의 떨리지 않던 손이었다.

오후 1시였다. 점심시간이었다.

리운은 자리에서 일어나야 했지만, 일어나지 못했다.', 2752, 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('485f9285-b265-4acc-b255-924940cbe79c', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '점심시간', 'draft', '오후 1시 12분.

리운은 여전히 책상 앞에 앉아 있었다.

평소 같았으면 12시 반에 점심을 먹으러 나갔을 것이다. 회사 근처 김밥집에서 김밥 한 줄과 어묵 국물 한 그릇. 늘 같은 메뉴, 늘 같은 자리. 그게 그의 점심이었다. 시간은 정확히 30분 안에 끝났고, 30분이 지나면 사무실로 돌아왔다.

오늘은 그 30분이 시작되지 않았다.

리운은 자리에서 일어나려고 했다. 두 번 시도했다. 첫 번째 시도에서는 의자를 살짝 뒤로 밀었고, 두 번째 시도에서는 책상에 손을 짚었다. 그러나 일어서지 못했다. 일어서려는 동작과 자기 몸 사이에 어떤 미세한 간극이 있었다. 그 간극은 어제까지는 없던 것이었다.

그는 손을 책상 위에 올려놓고 자기 손가락을 봤다. 손가락은 여전히 살짝 떨리고 있었다. 의뢰인이 떠난 직후 처음 떨리기 시작했고, 30분이 지난 지금도 멈추지 않았다. 7년 동안 거의 떨리지 않던 손이었다.

리운은 떨림을 멈추려고 손가락을 한 번 주먹으로 쥐었다 폈다. 떨림은 잠깐 멈췄다가 다시 돌아왔다. 그는 그것을 한 번 더 시도하지 않았다.

---

받은 기억의 보관 상태 확인을 해야 했다.

원래 리운의 절차로는 다음 날에 했다. 다른 보관사들은 받자마자 했지만 리운은 24시간이 지나기 직전까지 미루는 사람이었다. 다만 오늘은 평소와 달랐다. 다섯 살 여자아이의 목소리가 받은 직후부터 그의 가슴 안쪽에서 작게 울리고 있었고, 그 울림이 가라앉을 기색이 없었다. 보관사로서의 경험상, 이런 울림은 빨리 정리해야 했다. 정리되지 않은 감정은 시간이 지날수록 자리를 잡고, 자리를 잡으면 빼내기가 더 어려워졌다.

리운은 자리에서 일어났다. 이번엔 일어났다. 손이 떨리는 채로.

사무실 문으로 가서 잠금 장치를 걸었다. 안쪽에서. 그리고 창문 블라인드도 내렸다. 4월 오후의 햇빛이 길게 들어오고 있었는데, 그 빛이 차단됐다. 사무실은 어둑해졌다. 기억을 들여다보는 일에 어둠이 필요했다.

그는 책상 앞으로 돌아가 의자에 앉았다. 의자를 뒤로 살짝 밀어 등받이에 기댔다. 두 손을 무릎 위에 올리고, 천천히 숨을 내쉬었다. 한 번. 두 번. 세 번.

그리고 눈을 감았다.

---

기억은 여전히 소리로 시작됐다.

잔치의 시끄러운 소리. 손님들의 웃음. 술잔이 부딪치는 소리. 그리고 그 가운데 어디선가 작게 들리는 *아빠*라는 부름.

리운은 그 소리를 따라갔다. 따라가는 것이 보관 상태 확인의 첫 단계였다. 의뢰인이 맡긴 기억의 결을 따라가면서, 기억이 제대로 자리 잡았는지를 확인하는 작업.

소리는 곧 풍경이 됐다. 30년 전의 한 시골 집이었다. 마당에 천막이 쳐져 있었고, 그 아래로 손님들이 가득했다. 음식이 차려진 큰 상 두 개. 어른들은 술잔을 기울였고, 아이들은 마당 구석에서 뛰어놀았다. 백일 잔치였다. 30년 전의 한국 시골 마을의 풍경이었다.

리운은 의뢰인의 시점으로 그 자리를 봤다. 의뢰인은 마당 한쪽에 앉아 손님들의 술을 받고 있었다. 그의 시야에 어머니가 들어왔다 나갔다. 어머니는 환하게 웃고 있었다. 손자가 태어났으니까. 아버지도 어디선가 손님들에게 둘째의 이름을 자랑하고 있었다.

그리고 시야의 가장자리에 한 작은 그림자가 있었다.

다섯 살의 여자아이였다. 빨간색 원피스를 입고 있었다. 머리는 짧은 단발이었다. 그 아이는 마당 한쪽에 혼자 서서 어른들 쪽을 보고 있었다. 아무도 그 아이에게 관심을 주지 않았다. 그 아이는 잔치의 주인공이 아니었다. 잔치의 주인공은 자기 동생이었고, 자기는 그 옆에 있는 아이였다.

리운은 그 아이를 봤다. 정확히 말하면, 의뢰인의 시점으로 그 아이를 봤다. 의뢰인은 그 아이를 잠깐 봤다가, 다시 손님들 쪽으로 시선을 돌렸다. 그게 그의 첫 번째 외면이었다.

리운은 거기서 잠깐 멈췄다.

평소 같았으면 그는 다음 장면으로 넘어갔을 것이다. 보관 상태 확인은 모든 장면을 자세히 보는 것이 아니라 기억의 뼈대만 훑는 작업이었으니까. 그런데 오늘은 넘어갈 수 없었다. 그 다섯 살의 그림자가 그를 붙잡고 있었다.

---

리운은 그 다섯 살 여자아이를 더 가까이 들여다봤다.

이건 그가 평소에 하지 않는 일이었다. 보관 상태 확인은 기억의 뼈대만 보는 작업이고, 기억의 세부에 들어가는 것은 그 기억을 자기 것으로 만드는 일과 비슷했다. 보관사들은 보통 그렇게 하지 않았다. 받은 기억은 자기 안의 *보관* 영역에 두고, 자기 감정과 분리해서 관리해야 했다. 세부에 들어가면 그 분리가 무너졌다.

리운은 그것을 알면서도 들어갔다. 그 다섯 살의 얼굴을 더 가까이 보고 싶었다. 왜인지는 자기도 알지 못했다. 알지 못한 채로 들어갔다.

다섯 살의 얼굴이 가까워졌다.

작은 얼굴이었다. 빨간 원피스 위로 흰 얼굴이 떠 있었다. 눈은 크고 까맸다. 그 눈은 잔치의 어른들을 보고 있었지만, 동시에 어디에도 초점이 없었다. 자기가 보고 싶지 않은 것을 보지 않으려는 다섯 살의 본능이었다. 입은 다물려 있었고, 입꼬리는 살짝 아래로 내려가 있었다. 그 다섯 살은 울지 않고 있었다. 울고 싶었지만 울면 안 된다는 것을 이미 배운 다섯 살이었다.

리운은 그 얼굴을 봤다. 보면서, 자기 가슴 안쪽의 봉인이 한 번 더 흔들리는 것을 느꼈다. 흔들림은 어제까지의 미세한 흔들림이 아니었다. 오늘의 흔들림은 더 컸다. 봉인의 어딘가에 작은 금이 가는 것 같았다.

리운은 그 금을 막아야 했다. 막는 방법을 그는 알고 있었다. 호흡을 가다듬고, 시선을 다른 곳으로 돌리고, 받은 기억과 자기 자신을 분리하는 7년 동안 익혀온 그 기술을. 그는 그것을 시도했다.

시도했지만, 작동하지 않았다.

다섯 살의 얼굴이 사라지지 않았다. 시선을 돌리려고 해도 돌려지지 않았다. 받은 기억의 한 장면이 자기 안에 자리를 잡으려고 하고 있었고, 리운은 그것을 막을 수 없었다.

그리고 그 다섯 살의 얼굴 위에, 다른 얼굴이 잠깐 겹쳐졌다.

---

리운은 눈을 떴다.

너무 빨리 떴다. 보관 상태 확인을 중단하는 것은 보관사 매뉴얼에서 가장 위험한 행동 중 하나로 적혀 있었다. 정리되지 않은 기억이 그대로 자리를 잡아버리기 때문이었다. 그래도 리운은 떴다. 다른 선택지가 없었다.

사무실은 어둑한 채였다. 블라인드 사이로 가는 햇빛이 한 줄 들어와 책상 위에 떨어져 있었다. 시계를 봤다. 오후 1시 38분이었다. 보관 상태 확인을 시작한 지 20분쯤 지난 시각이었다. 평소엔 한 시간이 넘게 걸리는 작업이었다. 오늘은 20분 만에 끝났다. 끝낸 것이 아니라 중단한 것이었다.

리운은 손을 들어 자기 얼굴을 만졌다. 마른 얼굴이었다. 우는 사람의 얼굴이 아니었다. 이것은 그가 7년 동안 매번 확인해온 것이었다. 자기가 우는지 안 우는지를 손으로 만져서 확인하는 것. 안 운다는 것을 확인하면 일어날 수 있었다. 운다는 것을 확인하면, 그건 또 다른 문제였다.

오늘은 안 울었다. 다만 손이 떨리고 있었다.

리운은 자리에서 일어났다. 이번에는 일어났다. 사무실 문으로 가서 잠금을 풀었다. 그리고 블라인드를 올렸다. 햇빛이 사무실 안으로 길게 들어왔다. 그 빛 아래에 잠깐 서 있었다.

그는 자기 책상의 수첩을 열었다. 검은 가죽 수첩. 오늘 의뢰의 줄을 찾았다. *20310415-C*. 그 옆에 평소처럼 보관 상태 메모를 적어야 했다. 그는 펜을 꺼냈다. 그리고 잠깐 멈췄다.

평소엔 *보관 상태 양호. 잔여감 보통.*이라고 적었다. 며칠 전에는 그것을 *깊음*으로 정정했다. 7년 만에 자기 자신에게 처음으로 솔직해진 한 단어였다.

오늘은 그 한 단어로도 부족했다.

리운은 잠깐 펜을 든 채로 가만히 있었다. 그리고 결국 짧게 적었다.

> *보관 상태 확인 미완. 재시도 필요.*

거짓말 없는 메모였다. 평소엔 적지 않는 종류의 메모였다. 보관 상태 확인을 한 번에 끝내지 못했다는 것은 보관사로서 흔한 일이 아니었다. 매뉴얼상으로는 24시간 안에 재시도해야 했고, 재시도에서도 실패하면 의료지원실에 보고해야 했다. 보고하면 차은오 의사가 그를 부를 것이고, 그녀의 그 집요한 질문들이 시작될 것이다.

리운은 보고하지 않을 생각이었다. 자기 혼자서 다음 시도를 하고, 그때 정리하면 됐다. 7년 동안 그가 자기 일을 처리해온 방식이었다.

그는 수첩을 덮고 가방에 넣었다.

---

사무실을 나선 것은 1시 50분이었다.

평소 점심시간보다 한 시간 늦은 시각이었다. 김밥집은 이미 점심시간 손님이 빠진 후라 한산할 시간이었다. 리운은 김밥집 쪽으로 걸으면서, 잠깐 다른 곳으로 갈까 하는 생각을 했다. 평소 안 가던 곳, 새로운 메뉴, 다른 자리. 그러나 그 생각은 곧 사라졌다. 새로운 곳으로 가는 것은 더 큰 결정이었고, 오늘 그는 더 큰 결정을 내릴 여력이 없었다.

평소처럼 김밥집으로 향했다.

가게 문을 열고 들어갔을 때, 사장님이 카운터 안쪽에서 그를 보고 살짝 멈칫했다. 평소엔 12시 반에 들어오는 손님이 두 시 가까이에 들어왔으니까.

"늦으셨네요."

사장님은 그렇게 말했다. 평소엔 메뉴를 묻지 않는 사람이었는데, 오늘은 한 마디를 덧붙였다.

"오늘은 뭐 드시려고요?"

리운은 잠깐 생각했다. 평소 같았으면 *김밥 한 줄이랑 어묵 국물요*라고 답했을 것이다. 그런데 오늘은 그 말이 입에서 나오지 않았다. 자동으로 나오는 답이 나오지 않는 일이 어제부터 자꾸 일어나고 있었다.

"...오늘은 따뜻한 거 한 그릇 주세요."

리운은 그렇게 답했다. 본인도 그 답에 잠깐 놀랐다. 3년 동안 한 번도 김밥 외의 메뉴를 시킨 적이 없었으니까.

사장님은 잠깐 그를 봤다. 그리고 가볍게 고개를 끄덕였다.

"우동 드릴까요? 따뜻하게."

"네. 부탁드릴게요."

리운은 창가 자리에 앉았다. 늘 앉던 자리. 그 자리만큼은 바뀌지 않았다. 가게 안에는 다른 손님이 한 명뿐이었다. 카운터석에서 혼자 김밥을 먹고 있는 중년 여자. 그녀는 천천히, 아주 천천히 김밥을 한 알씩 입에 넣고 있었다. 점심시간을 늘리려고 일부러 천천히 먹는 사람의 동작이었다. 일터로 돌아가고 싶지 않은 사람의 점심.

리운은 그녀를 잠깐 봤다. 그리고 시선을 거뒀다.

---

우동이 나왔다. 따끈한 국물과 굵은 면. 위에는 작은 어묵 조각과 파가 올라가 있었다. 평범한 우동이었다. 다만 김이 올라오는 것이 평소의 어묵 국물보다 진했고, 향도 진했다. 리운은 잠깐 그 김을 봤다.

그리고 한 젓가락을 떴다.

따뜻했다. 입 안에서 국물의 온기가 천천히 퍼졌다. 7년 동안 리운은 음식의 맛을 잘 느끼지 못하는 사람이었다. 음식은 그에게 살아남기 위해 채워 넣는 것이었지, 즐거움이 아니었다. 오늘 우동 한 젓가락의 따뜻함은 평소와 약간 달랐다. 따뜻했다는 사실이 따로 인식이 됐다. 평소 같았으면 그냥 삼키고 끝났을 것을, 오늘은 잠깐 입 안에서 그 따뜻함을 느꼈다.

리운은 두 젓가락째를 떴다. 그리고 세 젓가락째를. 천천히 먹었다. 그 카운터석의 중년 여자처럼 천천히. 어쩌면 그도 일터로 돌아가고 싶지 않은 사람이었는지도 몰랐다.

식사는 30분 가까이 걸렸다. 평소엔 15분이면 끝났는데. 다 먹고 나서 리운은 잠시 빈 그릇을 봤다. 그릇의 바닥에 작은 국물이 남아 있었다. 그는 그 국물을 마지막까지 마시지는 않았다. 다만 그릇을 한참 봤다.

자리에서 일어나 계산을 했다. 사장님이 평소처럼 *또 와요*라고 말했다. 리운은 *네*라고 짧게 답하고, 잠깐 멈췄다가 한 마디를 덧붙였다.

"...우동 따뜻했어요. 감사합니다."

사장님은 잠깐 멈췄다. 3년 동안 한 번도 음식에 대해 한 마디도 한 적이 없는 손님이 처음으로 한 마디를 한 것이었다.

"...네. 또 따뜻하게 드릴게요."

리운은 짧게 고개를 숙이고 가게를 나섰다. 거리에는 4월 오후의 햇빛이 여전히 가득했다.

---

회사로 돌아가는 길에, 리운은 평소보다 천천히 걸었다.

가슴 안쪽의 다섯 살 목소리는 우동의 따뜻함 덕분에 잠깐 가라앉아 있었다. 완전히 사라진 것은 아니었다. 사라지는 것은 아니라는 걸 그는 알고 있었다. 다만 자리를 잡으려는 그 움직임이 잠깐 멈춰 있었다. 따뜻한 것이 가슴 안쪽의 그 차가운 자리를 살짝 덮어주었다.

리운은 걸으면서, 자기가 우동을 시킨 것이 무슨 의미인지 잠깐 생각했다. 큰 결정은 아니었다. 김밥에서 우동으로 바꾼 것뿐이었다. 다만 7년 동안 그는 *바꾸는 일*을 거의 하지 않았다. 같은 시간, 같은 자리, 같은 메뉴, 같은 동작. 모든 것을 똑같이 유지하는 것이 그의 생존 방식이었다. 변수가 들어오면 무너질 것 같았기 때문이었다.

오늘 그는 처음으로 작은 변수를 자기 안에 들였다. 김밥 대신 우동. 그 작은 변수가 그를 무너뜨리지 않았다. 오히려 그를 잠깐 따뜻하게 했다.

리운은 그 사실을 의식했다. 의식하고, 그것을 평가하지 않으려고 했다. 평가하면 또 다른 잠금이 작동할 것이었다. *나는 따뜻해질 자격이 없는 사람이다*라는 평가가. 7년 동안 그가 자기 자신에게 매일 한 평가였다. 오늘은 그 평가를 잠깐만 옆에 두기로 했다. 하루 정도는 그 평가 없이 살아도 큰일이 나지 않을 것 같았다.

---

회사 1층 로비에 도착했을 때, 시간은 2시 35분이었다. 다음 의뢰는 3시였다. 25분이 남아 있었다.

김 주임이 안내 데스크에서 리운을 봤다. 그녀는 평소처럼 가볍게 목례를 했다. 리운도 목례를 했다. 그러고 나서 잠깐 멈췄다가, 데스크 쪽으로 한 발 다가갔다.

"김 주임님."

"네, 선생님."

"아침에 주신 보리차요."

"네."

"...내일도 따뜻하게 부탁드려요."

김 주임은 잠깐 그를 봤다. 어제 리운이 *오늘도 따뜻하네요*라고 한 마디를 했고, 오늘은 *내일도*라는 말을 더했다. 5년 동안 매일 차를 따라준 사람에게 처음으로 *내일*을 약속받은 것이었다.

"...네. 항상요."

김 주임은 짧게 답했다. 그녀의 목소리에 평소엔 없던 작은 울림이 있었다. 리운은 그것을 듣고도 못 들은 척했다. 그게 김 주임에 대한 그의 배려였다.

리운은 엘리베이터 쪽으로 걸어갔다. 김 주임은 그의 뒷모습을 잠깐 봤다. 그러고 나서 데스크 안쪽에서 보리차 통을 한 번 더 정리했다. 내일 아침을 위해서.

---

3층 리운의 사무실. 그는 코트를 벽에 걸고, 책상 앞에 앉았다. 노트북을 열어 다음 의뢰서를 확인했다.

> 의뢰인 #20310415-D
41세 / 여성
의뢰 종류: 일시 보관 (3개월)
사전 분류: 직장 관련 / 6개월

41세 여성. 일시 보관. 3개월. 직장 관련. 의뢰서의 정보만 보면 평범한 의뢰였다. 직장에서 있었던 6개월치 일을 3개월만 잠깐 맡기고 싶다는 의뢰. 보통은 직장 내 갈등이나 해고 같은 일들이었다. 큰 기억은 아니지만 잠시 거리를 두고 싶어 하는 사람들의 의뢰. 리운에게 익숙한 종류였다.

그는 의뢰서를 잠깐 봤다. 그리고 일어나서 사무실 한쪽의 작은 거울로 향했다. 의뢰인을 만나기 전에 자기 표정을 점검하기 위해 둔 거울. 거울 속의 리운은 평소와 비슷했다. 손은 떨림을 거의 멈춘 상태였다. 다만 어딘가 풀려 있었다. 어제도 그렇게 느꼈는데, 오늘은 더 풀려 있었다.

리운은 거울을 보면서 자기 표정을 다시 단단하게 만들었다. 의뢰인 앞에서는 흔들리지 않는 사람이어야 했다. 그게 그의 직업이었다. 오늘 오전 의뢰의 잔향도, 우동 한 그릇의 따뜻함도, 김 주임에게 한 *내일*이라는 말도, 다 잠깐 옆으로 밀어두었다. 의뢰인 앞에서는 *서리운 보관사*만 있어야 했다.

거울 속의 리운이 천천히 평소의 얼굴로 돌아갔다. 다만 완전히 돌아가지는 않았다. 어딘가 한 톤이 풀려 있었다. 본인은 그것을 알아채지 못했다. 거울로는 보이지 않는 종류의 풀림이었다.

오후 3시. 사무실 문이 두드려졌다.

리운은 문을 열러 갔다.', 1896, 6)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('29390793-ea55-4df0-ae9c-5553ce59c7e9', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '메모리언', 'draft', '오후 3시 정각, 사무실 문이 두드려졌다.

리운은 문을 열었다. 의뢰인은 41세 여성이었다. 평범한 회사원의 옷차림. 짙은 회색 정장 재킷에 검은색 슬랙스. 가방은 가죽이 아닌 천 가방이었고, 한쪽 어깨에 비스듬히 메고 있었다. 화장은 옅었지만 정성스러웠다. 출근하기 위해 그 화장을 한 사람의 정성이었다. 다만 눈 밑에 옅은 그늘이 있었다. 며칠 잠을 못 잔 사람의 그늘.

"안녕하세요. 서리운입니다. 들어오시죠."

여자는 가볍게 목례를 하고 사무실에 들어왔다. 리운이 가리킨 의자에 앉았다. 가방을 무릎 위에 올려놓고, 두 손을 그 위에 모았다. 그러고는 사무실 안을 한 번 훑어봤다. 처음 와본 사람의 시선이었다. 무언가를 확인하려는 시선이라기보다는, 어색해서 시선을 둘 곳을 찾는 동작이었다.

"...많이 들어봤어요. 이런 곳이 있다고."

여자가 그렇게 말했다. 리운은 평소처럼 가볍게 답했다.

"네."

"실제로 와보니까... 그냥 사무실이네요."

"그렇죠. 사무실이에요."

리운은 책상 맞은편에 앉아 노트북을 열었다. 화면에 의뢰서가 떠 있었다. *20310415-D. 41세 여성. 일시 보관 3개월. 사전 분류: 직장 관련 / 6개월.*

"먼저 절차를 안내드리겠습니다."

"네."

리운은 평소의 절차 안내를 시작했다. 사전 상담의 목적, 의뢰서 확인, 기억 추출의 기술적 제약, 일시 보관의 경우 반환 절차, 사후 관리. 그는 그것들을 한 번도 더듬지 않고 차례로 설명했다. 7년 동안 수백 번 한 안내였다. 단어 하나하나가 정해진 자리에 정확히 들어갔다. 의뢰인이 들으면서 특별히 새로 알게 되는 것은 없었지만, 그래도 들어야 하는 절차였다. 보관사가 절차대로 안내했다는 기록이 남아야 했기 때문이었다.

여자는 그 안내를 듣는 동안 한 번도 끼어들지 않았다. 다만 그녀의 손이 무릎 위에서 천천히 움직였다. 손가락을 한 번 풀었다 모았다, 다시 풀었다 모았다.

---

안내가 끝나자 리운은 의뢰서를 한 번 더 확인하면서 물었다.

"의뢰 내용을 확인하겠습니다. 일시 보관 3개월. 사전 분류 직장 관련 6개월. 맞으신가요?"

"네. 맞아요."

"보관할 기억의 구체적인 범위를 말씀해주시겠어요?"

여자는 잠깐 망설였다. 입을 열려다가 다시 다물었다. 그러고는 천천히 말을 꺼냈다.

"6개월 전에 회사에서 큰 실수를 했어요. 제가 담당하던 프로젝트에서 중요한 자료를 잘못 처리해서, 그 자료가 외부로 잘못 전달된 거예요. 그것 때문에 회사가 거래처랑 문제가 생겼고, 손해도 꽤 났습니다. 제 잘못이 명백했어요. 회사에서 징계도 받았고요."

"네."

"그 후로 6개월 동안... 매일 그 일을 생각해요. 출근하면 그 자료를 다시 떠올리고, 회의 때마다 다른 사람들이 저를 어떻게 보는지를 신경 쓰고, 점심시간에 혼자 있으면 그 일이 다시 떠오르고. 6개월이 지났는데도 매일이 그래요. 그래서 이걸 잠깐 맡기고 싶어요. 3개월만요. 3개월 후에는 다시 받을 수 있다고 들었어요."

"네. 3개월 후에 일시 보관 반환 절차를 진행합니다."

리운은 그렇게 답했다. 평소의 절차적 답이었다. 여자는 그 답에 잠깐 고개를 끄덕였다. 그리고 한 박자 쉬었다가, 입을 열었다.

"...보관사님."

"네."

"제가 나쁜 사람일까요?"

리운은 노트북에서 시선을 들었다. 여자를 봤다. 여자는 리운을 마주 보고 있었다. 그 시선에는 무언가 작은 기대 같은 것이 있었다. 답을 듣고 싶어 하는 사람의 시선.

리운은 그 시선을 한 박자 받았다. 그리고 답했다.

"보관사는 의뢰인분의 행위에 대해 도덕적 판단을 하지 않습니다."

여자의 표정이 잠깐 굳었다. 리운은 그것을 알아챘지만, 평소의 톤을 유지했다.

"의뢰인분께서 자신을 어떻게 평가하시는지는 의뢰의 진행과 관계가 없습니다. 의뢰는 의뢰인분의 결정에 따라 진행됩니다. 진행 여부만 확인해주시면 됩니다."

"...네."

여자는 짧게 답했다. 시선을 책상 한쪽으로 옮겼다. 리운은 그녀의 시선이 옮겨가는 것을 봤다. 그리고 평소처럼 다음 절차로 넘어갔다.

"이식은 오늘 진행하시겠어요, 아니면 사전 상담만 하시고 다음 방문 때 진행하시겠어요?"

"...오늘 할게요."

여자의 목소리는 처음보다 조금 낮아져 있었다. 리운은 그 변화를 들었다. 들었지만 그것에 반응하지 않았다. 직업적인 톤을 유지하면서 다음 절차를 안내했다.

"알겠습니다. 그럼 동의서 작성 후에 안쪽 방으로 이동하겠습니다."

---

이식 준비를 하면서, 리운은 평소처럼 움직였다. 사무실 안쪽의 작은 방으로 여자를 안내하고, 의자 두 개를 마주 놓고, 패드를 부착하는 법을 알려주고, 기계를 켰다. 그의 동작은 빠르지도 느리지도 않았다. 정확히 평소의 속도였다.

여자는 패드를 부착하면서 한 번 더 입을 열었다.

"보관사님."

"네."

"...3개월 후에 제가 다시 오면, 보관사님이 그 기억을 돌려주시는 거죠?"

"네. 일시 보관의 경우 같은 보관사가 반환 절차를 진행합니다."

"그럼 그 3개월 동안 보관사님이 제 기억을 가지고 계시는 거고요."

"네."

여자는 잠깐 침묵했다. 그리고 다시 물었다.

"...보관사님은 그 기억을 어떻게 다루세요?"

리운은 손에 든 패드를 천천히 자기 이마에 부착하면서 답했다.

"보관 절차에 따라 분류하고, 정리해서, 보관 영역에 둡니다. 의뢰인의 기억은 보관사의 사적 감정 영역과 분리되어 관리됩니다."

"...분리요?"

"네. 분리됩니다."

여자는 그 답을 한참 곱씹는 것 같았다. 그리고 다시 물었다.

"그 기억을 보시면, 제 마음이 어땠는지도 함께 들어가지 않나요?"

"기억과 함께 그 순간의 감정도 전달됩니다. 다만 보관사는 그 감정을 자신의 감정과 구분해서 관리합니다."

"그게... 가능해요?"

"네. 그게 보관사의 일입니다."

리운의 답은 짧고 정확했다. 한 단어도 더 붙이지 않았다. 여자는 그 짧은 답에 잠깐 멈췄다. 그녀의 얼굴에 작은 무언가가 스쳤다. 그 무언가가 무엇인지 리운은 알 수 있었다. 7년 동안 의뢰인들의 얼굴에서 수백 번 본 그 표정이었다. *이 사람은 사람이 맞나*라는 표정.

리운은 그 표정을 알아챘지만 반응하지 않았다. 반응하지 않는 것이 그의 직업이었다.

---

이식이 시작됐다.

여자의 6개월치 기억이 리운의 머릿속으로 흘러들어왔다. 지난번의 30년치에 비하면 작은 양이었다. 시간은 15분 정도였다. 그 15분 동안 리운은 한 여자의 6개월 동안의 매일을 빠르게 살았다.

기억의 시작은 사고가 일어난 그날이었다. 회사 사무실. 컴퓨터 화면. 잘못 클릭한 *전송* 버튼. 그리고 그 직후의 정적. 여자의 가슴이 한 번에 차갑게 식는 감각. 여자는 그 순간을 평생 잊지 못할 거라고 그날 생각했다. 그런데 그날 이후로 매일 그 순간이 다시 떠올라, 결국 잊는 것이 아니라 *지우는 것*을 선택하게 됐다.

그 후 6개월이 작은 조각들로 들어왔다. 매일 아침의 통근길. 통근길에서 여자는 매일 같은 생각을 했다. *오늘도 회사에 가야 하나.* 그 생각은 출근하지 않겠다는 결심이 아니라, 그저 매일 반복되는 작은 무게였다. 매일 그 무게를 이고 출근했다.

회사에서의 매일. 회의실. 동료들의 시선. 그 시선에는 직접적인 비난이 없었지만 동시에 따뜻함도 없었다. 어색한 거리감. 6개월이 지나도 사라지지 않는 거리감. 점심시간에 여자는 자주 혼자 먹었다. 점심을 같이 먹자고 부르는 사람들이 줄어들었기 때문이었다. 그게 명시적인 따돌림은 아니었지만, 결과적으로는 비슷했다.

저녁에는 집에 돌아와 혼자 밥을 먹고, 텔레비전을 보고, 잠을 청했다. 잠은 잘 오지 않았다. 자려고 누우면 그 *전송* 버튼의 순간이 다시 떠올랐다. 여자는 그 순간을 6개월 동안 매일 밤 다시 살았다.

그리고 가장 최근의 기억은 일주일 전이었다. 여자가 보관소 의뢰를 결심한 날. 그날 여자는 출근길에 지하철에서 한 동료를 우연히 마주쳤다. 그 동료는 여자를 보고 가볍게 인사했다. 평범한 인사였다. 그런데 그 평범한 인사에 여자의 가슴이 다시 한 번 차갑게 식었다. 평범한 인사조차 자기에게는 평범하게 들어오지 않는다는 것. 자기의 감각이 어딘가 망가져 있다는 것. 여자는 그날 출근길 지하철에서 처음으로 보관소를 검색했다.

기억은 거기서 끊어졌다.

---

이식이 끝났다.

여자는 잠깐 멍한 얼굴로 앉아 있었다. 보통 의뢰인들이 보이는 반응이었다. 자기 일부가 사라졌다는 걸 머리로는 모르지만 몸이 먼저 아는 단계.

"...끝났나요?"

"네. 끝났습니다."

리운은 자기 쪽 패드를 떼고 자리에서 일어났다. 평소처럼 사무실 안쪽 방의 불을 잠깐 더 밝혔다. 의뢰인이 자리에서 일어날 때 어지럽지 않도록 하기 위한 작은 배려였다. 매뉴얼에 적혀 있는 절차 중 하나였다.

여자도 패드를 떼고 자리에서 일어났다. 그녀는 잠깐 휘청였다. 리운은 손을 뻗지 않았다. 매뉴얼상 보관사는 의뢰인의 신체에 접촉하지 않는 것이 원칙이었다. 의뢰인이 휘청이면 안정될 때까지 옆에서 기다리는 것이 절차였다.

여자는 곧 안정됐다. 그리고 자기 이마에 손을 가져다 댔다. 평소엔 자기 가슴 속에 있던 어떤 무게가 사라진 것을 그녀는 아직 정확히 인식하지 못하고 있었다. 다만 가슴이 평소보다 가볍다는 것은 느끼고 있는 것 같았다.

"...뭔가 가벼워요."

여자가 작게 말했다. 리운은 짧게 답했다.

"네. 정상적인 반응입니다."

리운은 여자를 사무실 본 공간으로 안내했다. 그녀는 자기 가방을 챙기면서 한 번 더 사무실 안을 둘러봤다. 들어왔을 때와는 다른 시선이었다. 들어왔을 때는 어색해서 시선을 둘 곳을 찾는 동작이었다면, 나갈 때는 자기가 무엇을 두고 가는지를 확인하는 동작이었다. 다만 그녀는 정확히 무엇을 두고 가는지 이미 모르고 있었다.

리운은 그녀를 사무실 문까지 배웅했다. 문 앞에서 여자가 한 번 멈췄다. 리운을 봤다.

"감사합니다."

"3개월 후에 반환 절차로 다시 오시면 됩니다. 일정은 안내데스크에서 잡으시면 됩니다."

"네."

여자는 잠깐 더 머물고 싶어 하는 것 같았다. 무언가 한 마디를 더 하고 싶어 하는 표정이었다. 그러나 결국 하지 않았다. 리운이 말할 틈을 주지 않았기 때문이었다. 리운은 *안녕히 가세요*라고 짧게 말하고 가볍게 고개를 숙였다. 그게 배웅의 끝이었다. 여자는 그 짧은 인사를 받고 사무실을 나섰다.

문이 닫혔다.

---

리운은 사무실 문을 닫고 책상으로 돌아갔다. 의자에 앉아 노트북을 열고, 의뢰서에 평소처럼 메모를 남겼다.

> *의뢰 진행 완료. 일시 보관 3개월. 반환 일정 안내데스크 통해 예약 예정. 의뢰인 상태 정상. 이상 없음.*

평범한 메모였다. 한 줄도 더 붙이지 않았다. 노트북을 닫고, 의자에 등을 기댔다.

오늘 의뢰는 깔끔했다. 절차대로 진행됐고, 시간 안에 끝났고, 의뢰인은 정상적인 상태로 떠났다. 보관사로서 평가할 점이 하나도 없는 의뢰였다. 흔들림은 없었다. 7년 동안 그가 진행해온 수많은 의뢰 중 하나였고, 앞으로 진행할 수많은 의뢰 중 하나일 뿐이었다.

다만 한 가지가 마음에 걸렸다.

여자가 마지막에 짓던 그 표정. *이 사람은 사람이 맞나*라는 표정. 7년 동안 수백 번 본 표정이었다. 그 표정은 보관사의 차가움 앞에서 의뢰인이 자기도 모르게 짓는 반응이었고, 보관사들 사이에서는 별로 특별한 일이 아니었다. 다만 오늘은 그 표정이 평소보다 약간 더 오래 리운의 눈에 남았다. 왜인지는 알 수 없었다.

리운은 그것을 의식하지 않으려고 했다. 의식하지 않는 것이 그의 기술이었다.

---

오후 4시 반쯤, 사무실 문이 두드려졌다. 리운은 답했다.

"네."

문이 열리고 도하가 들어왔다. 도하는 손에 종이컵 두 개를 들고 있었다. 한쪽은 자기 거였고, 다른 하나는 리운에게 줄 거였다.

"형, 커피 한 잔."

도하는 리운의 책상 위에 종이컵을 놓고, 자기는 의뢰인용 소파에 앉았다. 늘 의뢰인이 앉던 자리. 도하는 그 자리에 앉을 때마다 약간 어색해했지만, 사무실에 다른 의자가 없으니 어쩔 수 없었다.

"오늘 의뢰 어땠어요?"

"...괜찮았어요."

리운은 짧게 답했다. 도하는 종이컵을 들어 한 모금 마셨다.

"저는 오늘 두 건 받았어요. 둘 다 작은 거였는데, 두 번째 분이 좀... 우셨어요. 의뢰 받기 전에. 그 자리에서 한 30분 우셨어요. 제가 옆에서 휴지만 계속 드렸어요."

리운은 도하의 말을 듣고 가볍게 고개를 끄덕였다. 도하는 그런 의뢰를 자주 받는 사람이었다. 정확히 말하면 도하의 사무실에 들어간 의뢰인들이 자주 우는 것이었다. 보관사의 분위기가 그런 반응을 끌어내는 것 같았다. 도하는 늘 따뜻해 보였고, 그 따뜻함이 의뢰인의 울음을 받아주었다.

리운의 사무실에서는 의뢰인이 거의 울지 않았다. 같은 사람이 도하의 사무실에 갔으면 울었을 사람도, 리운 앞에서는 울지 않았다. 리운의 차가움이 울음을 차단했기 때문이었다. 두 사람의 그 차이는 보관사 사이에서 잘 알려져 있었다. 의뢰인이 울고 싶어 하면 도하에게, 정리하고 싶어 하면 리운에게. 그게 본원의 비공식 분류였다.

"형은요? 오늘 의뢰인 안 우셨어요?"

"네. 안 우셨어요."

"역시."

도하는 가볍게 웃었다. 그 웃음에는 약간의 부러움과 약간의 걱정이 섞여 있었다. 리운은 그것을 알아챘지만 반응하지 않았다.

"형 사무실에서 우는 의뢰인 본 적이 한 번도 없는 것 같아요. 3년 동안. 진짜 신기해요."

"...우는 분위기가 안 만들어지는 것 같아요."

"형이 안 만드시는 거잖아요."

도하는 그렇게 말했다. 비난이 아니라 그냥 사실을 확인하는 말투였다. 리운은 그 말을 들었다. 들었지만 답하지 않았다.

도하는 더 묻지 않았다. 종이컵을 들어 한 모금 더 마시고, 잠깐 사무실 천장을 봤다.

"형."

"네."

"근데 가끔은요, 의뢰인이 우는 게 좋을 때도 있어요. 우는 의뢰인은 안 무너지거든요. 안 우는 사람이 더 위험해요. 한 선생님이 그러셨잖아요."

리운은 그 말에 잠깐 멈췄다.

도하는 자기가 한 말이 어디로 향하는지 의식하지 못하는 것 같았다. 도하의 시선은 천장에 있었고, 리운을 보고 있지 않았다. 도하는 한지섭의 말을 단순히 일반론으로 인용한 것이었다. 다만 리운에게 그 말은 일반론이 아니었다.

리운은 종이컵을 들어 한 모금 마셨다. 커피는 미지근했다. 도하가 사무실까지 들고 오는 동안 식었던 모양이었다.

"...도하 씨."

"네."

"오늘 두 번째 의뢰인 잘 받으셨어요?"

리운은 그렇게 화제를 돌렸다. 도하는 잠깐 천장에서 시선을 떼고 리운을 봤다. 그러고는 가볍게 고개를 끄덕였다.

"네. 잘 받았어요."

"다행이에요."

도하는 그 한 마디에 잠깐 멈췄다. *다행이에요*는 평소 리운의 말투가 아니었다. 도하는 그 차이를 알아챘다. 하지만 더 캐묻지 않았다. 그게 도하의 배려였다.

도하는 곧 자리에서 일어났다.

"저 갈게요. 형도 일찍 들어가세요."

"네."

도하는 사무실을 나섰다. 문이 닫혔다.

---

리운은 책상 앞에 혼자 남았다. 도하가 두고 간 종이컵을 잠깐 봤다. 미지근한 커피. 평소 같았으면 마시지 않고 그대로 식혔을 것이다. 오늘은 한 모금 더 마셨다. 두 모금째였다.

그러고 나서 자리에서 일어나 사무실 한쪽의 작은 거울로 향했다. 의뢰인을 만나기 전에 자기 표정을 점검하던 그 거울. 그는 거울 앞에 서서 자기 얼굴을 봤다.

거울 속의 리운은 평소의 얼굴이었다. 지난 두 건의 의뢰에서 보였던 풀림이 거의 보이지 않았다. 이번의 의뢰가 그 풀림을 한 번 닫아준 것 같았다. 41세 여성에게 *보관사는 도덕적 판단을 하지 않습니다*라고 답하던 그 순간에, 그는 다시 *서리운 보관사*로 돌아갔다. 7년 동안 익혀온 차가움이 다시 자리를 잡았다.

리운은 그 사실에 안도했다. 평소의 자기 자신으로 돌아왔다는 것에 대한 안도. 그는 안도해야 마땅했다. 보관사에게 흔들림은 위험한 것이었으니까. 평소의 차가움이 그를 살려온 것이었으니까.

다만 그는 거울 속에서 한 가지를 보지 못했다.

거울은 얼굴을 보여줬지만, 가슴 안쪽은 보여주지 못했다. 그의 가슴 안쪽에는 다섯 살 여자아이의 목소리가 여전히 작게 울리고 있었다. *아빠.* 그 목소리는 기억 이식 직후부터 그의 안에서 자리를 잡으려 하고 있었고, 우동 한 그릇이 잠깐 덮어주었지만 사라지지는 않았고, 오늘의 차가운 의뢰 진행으로도 흩어지지 않았다. 그것은 리운의 보관 영역에 들어가지 않은 채, 그의 사적 감정 영역의 가장자리에 머물러 있었다.

7년 동안 그가 한 번도 들이지 않은 자리였다.

리운은 그것을 의식하지 않았다. 의식하지 않는 것이 그의 기술이었다. 그는 거울에서 시선을 거두고, 책상으로 돌아갔다.

---

오후 5시 50분, 그는 의뢰서 정리를 마쳤다. 평소 퇴근 시간 10분 전이었다. 그는 가방을 챙기고, 코트를 입고, 사무실 불을 끄고 나섰다.

복도는 조용했다. 다른 보관사들은 이미 퇴근했거나 자기 사무실에 남아 있었다. 리운은 평소처럼 조용히 복도를 걸어 엘리베이터로 향했다.

1층 로비에서 김 주임이 그를 봤다. 평소처럼 가볍게 목례를 했다. 리운도 목례를 했다. 그러고 나서 잠깐 멈췄다가, 평소엔 하지 않는 한 마디를 했다.

"...내일 봐요."

김 주임은 잠깐 멈췄다. 5년 동안 리운에게 *내일 봐요*라는 인사를 들어본 적이 한 번도 없었다. 평소엔 가벼운 목례로 인사가 끝났다.

"네... 내일 봐요, 선생님."

리운은 짧게 답하고 회사 문을 나섰다.

거리는 4월 저녁의 차분한 공기에 잠겨 있었다. 퇴근하는 사람들이 거리를 가득 채우고 있었다. 리운은 그 사람들 사이를 평소처럼 천천히 걸었다.

7년 동안 그는 매일 이 시간에 이 거리를 걸었다. 같은 길, 같은 발걸음, 같은 표정. 그게 그의 생존 방식이었다.

오늘도 그 생존 방식은 작동했다. 평소처럼 출근하고, 평소처럼 의뢰를 받고, 평소처럼 퇴근했다. 7화의 의뢰는 그가 7년 동안 익혀온 *차가운 보관사*를 한 번 더 확인시켜준 의뢰였다. 5화와 6화의 흔들림은 잠깐의 일탈이었고, 7화에서 그는 다시 제자리로 돌아왔다.

다만 그 제자리에는 작은 이물질이 하나 박혀 있었다. 다섯 살의 *아빠*라는 부름. 리운은 그것을 빼내려고 시도하지 않았다. 빼내려고 하면 더 큰 균열이 생길 것 같았다. 그래서 그는 그것을 그 자리에 둔 채로, 평소의 걸음으로 걸었다.

지하철역까지 가는 길에, 그는 한 번 횡단보도 앞에서 멈췄다. 신호가 빨간색이었다.

그 자리에 서서, 그는 잠깐 자기 가슴 안쪽을 의식했다. 다섯 살의 부름이 거기 있었다. 그리고 그 옆에 검은 원피스 여자가 두고 간 한 사람이 있었다. 그 옆에 30년치 침묵이 있었다. 그 옆에 한지섭의 마지막 편지가 있었다. 그 모든 것들이 그의 가슴 안쪽에서 각자의 자리에 자리 잡고 있었다.

7년 동안 그는 거기에 한 가지 기억만 두고 살았다. 자기 가족의 마지막 순간.

이제 그 옆에 다른 것들이 들어오고 있었다.

신호가 파란색으로 바뀌었다. 리운은 다시 걷기 시작했다. 그의 표정은 평소와 같았다. 누가 봤어도 흔들리는 사람으로 보이지 않았을 것이다.

그는 흔들리지 않았다. 다만 그의 안쪽이 조금씩 채워지고 있었다.

그게 7년 만의 일이었다.', 2256, 7)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('51fb00b9-5d26-4000-9c42-85f061b94997', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '읽지 못한 카톡', 'draft', '월요일 아침이었다.

주말 동안 리운은 평소와 같은 이틀을 보냈다. 토요일에 한강을 따라 두 시간쯤 걸었고, 일요일에는 오피스텔에서 거의 나가지 않았다. 주말의 리운은 평일보다 더 조용했다. 의뢰인도 없고 동료도 없으니까, 그를 사람으로 만들어주는 최소한의 접점마저 사라졌다. 오피스텔에 혼자 있으면 리운은 거의 물건 같았다. 씻고, 먹고, 누워 있었다. 그것이 주말이었다.

다만 이번 주말은 한 가지가 달랐다. 토요일 산책 길에 편의점에 들러 보리차를 샀다. 작은 종이 상자에 든 보리차 티백이었다. 오피스텔에 돌아와서 전기포트로 물을 끓이고, 머그컵에 티백을 넣고, 보리차를 한 잔 우려냈다. 7년 만에 자기 손으로 만든 차였다.

맛은 김 주임이 따라주는 것과 비슷했다. 비슷했지만 달랐다. 김 주임의 보리차에는 5년 동안 매일 같은 시간에 같은 사람을 위해 우려낸 무언가가 더 들어가 있었다. 리운이 만든 보리차에는 그런 게 없었다. 그냥 보리차였다. 그래도 마셨다. 따뜻했다.

일요일 저녁에는 한 딸의 아버지에게서 받은 기억의 보관 상태 확인을 한 번 더 시도했다. 지난번에 중단했던 그 작업. 24시간 안에 재시도해야 한다는 매뉴얼을 지키지 못한 채 이틀이 지났다. 이건 보관사로서 처음 있는 일이었다. 리운은 침대에 누워 눈을 감고 다시 들어갔다.

이번에는 그 다섯 살의 얼굴까지 갔다. 거기서 멈추지 않고 더 나아가려 했다. 하지만 그 얼굴 위에 무언가가 겹쳐지려는 순간, 다시 눈을 떠버렸다. 두 번째 실패였다.

리운은 천장을 보면서, 이것을 의료지원실에 보고해야 하는지를 잠깐 생각했다. 매뉴얼대로라면 보고해야 했다. 그러나 보고하면 차은오 의사가 그를 부를 것이었고, 그녀는 리운에게 잠에 대해 묻고, 식사에 대해 묻고, 감정에 대해 묻고, 리운은 그 모든 질문에 *괜찮습니다*라고 답해야 했다. 그 대답이 거짓말이라는 것을 둘 다 알면서.

리운은 보고하지 않기로 했다. 세 번째 시도를 한 번 더 해보고, 그때도 안 되면 보고하기로. 그것이 그가 자기 자신에게 한 타협이었다.

---

월요일 아침, 7호선 다섯 번째 칸 끝자리에 앉아 리운은 오늘의 의뢰서를 확인했다. 휴대폰에 회사 시스템으로 미리 전달되는 의뢰 정보였다.

> 의뢰인 #20310418-E
20세 / 여성
의뢰 종류: 일시 보관 (6개월)
사전 분류: 우정 관계 / 1년

리운은 그 의뢰서를 잠깐 봤다. 20세. 여성. 우정 관계. 일시 보관 6개월.

스무 살이었다. 리운이 3년 동안 받은 의뢰인 중 가장 어린 나이였다. 보관사 제도에서 의뢰인의 최소 나이는 19세였다. 스무 살은 그 경계에 가까웠다. 보통 이 나이대의 의뢰인은 거의 오지 않았다. 기억을 지운다는 것의 무게를 아직 다 알지 못하는 나이이기 때문에, 사전 심사에서 걸리는 경우가 많았다.

그런데 이 의뢰인은 사전 심사를 통과했다. 그건 이 의뢰인의 사연이 심사위원들을 설득할 만큼 충분한 무게를 가졌다는 뜻이었다. 스무 살이 가져올 수 있는 무게.

리운은 휴대폰을 가방에 넣고 창밖을 봤다. 지하의 어둠이 흘러가고 있었다.

---

오전 10시, 사무실 문이 두드려졌다.

리운은 문을 열었다. 첫인상은 예상과 달랐다.

밝은 베이지색 패딩 재킷. 청바지. 흰색 운동화. 머리는 긴 편이었고, 한쪽으로 묶어져 있었다. 가방은 천 가방이었는데 아이보리색에 작은 캐릭터 키링이 달려 있었다. 대학생의 옷차림이었다. 어딘가 밝아 보였다. 의뢰소에 처음 오는 사람치고는 너무 밝아 보였다.

다만 눈이 달랐다. 그녀의 눈은 옷차림과 어울리지 않았다. 눈 밑에 그늘이 있었고, 그 그늘은 며칠 잠을 못 잔 사람의 것이 아니라, 몇 달째 잠을 제대로 못 자고 있는 사람의 것이었다. 리운은 그 차이를 알았다. 보관사 일을 하면서 사람의 눈을 보는 법을 배웠기 때문이었다. 옷은 바꿀 수 있지만 눈은 바꿀 수 없었다.

"안녕하세요. 서리운입니다."

"안녕하세요."

그녀의 목소리는 밝았다. 밝지만 어딘가 가늘었다. 밝은 목소리를 유지하려고 힘을 쓰고 있는 것 같았다. 리운은 그것을 알아챘지만 반응하지 않았다. 그녀를 사무실 안으로 안내했다.

그녀는 의뢰인용 의자에 앉았다. 가방을 무릎 위에 올리지 않고 옆 바닥에 내려놓았다. 다른 의뢰인들은 보통 가방을 무릎 위에 올렸다. 방패처럼. 이 사람은 그렇게 하지 않았다. 자기를 지키는 방패가 필요하지 않다는 뜻인지, 아니면 이미 지킬 것이 없다는 뜻인지는 알 수 없었다.

리운은 책상 맞은편에 앉아 노트북을 열었다. 평소의 절차를 시작했다.

"먼저 절차를 안내드리겠습니다. 사전 상담의 목적은..."

"네, 알아요."

그녀가 리운의 말을 끊었다. 부드럽게, 그러나 확실하게. 리운은 잠깐 멈췄다. 절차 안내를 끊는 의뢰인은 드물지 않았다. 다만 스무 살 의뢰인이 이렇게 자연스럽게 끊는 건 처음이었다.

"인터넷에서 영상도 봤고, 후기도 봤어요. 사전 상담 하고, 제가 원하면 오늘 바로 이식할 수 있는 거죠?"

"네. 그렇습니다."

"그럼 바로 할게요. 오래 머물면 제가 마음 바꿀 것 같아서요."

리운은 그녀를 잠깐 봤다. 결심한 사람의 말투였다. 다만 67세 남자나 검은 원피스 여자와는 결이 달랐다. 그들의 결심은 오래 곱씹어 단단해진 결심이었지만, 이 스무 살의 결심은 급하게 세워진 결심이었다. 급하게 세운 결심은 자주 무너졌다. 자주 무너지기 때문에 급하게 세우는 것이었다. 리운은 그 차이를 알았다.

"의뢰 내용을 확인하겠습니다. 일시 보관 6개월. 사전 분류 우정 관계 1년. 맞으신가요?"

"네."

"보관할 기억의 범위를 말씀해주시겠어요?"

그녀는 잠깐 말이 없었다. 처음으로. 들어온 뒤 처음으로 그녀에게 침묵이 왔다. 밝은 목소리가 잠깐 멈췄다. 그 멈춤은 3초쯤 지속됐다.

그리고 그녀가 입을 열었다. 이번에는 목소리가 달랐다. 밝지 않았다. 처음으로 그녀의 본래 목소리가 나왔다. 조용하고, 가늘고, 어딘가 갈라져 있는 목소리.

"...친구가 죽었어요."

---

리운은 그 말을 들었다.

*친구가 죽었어요.* 스무 살이 할 수 있는 가장 무거운 말 중 하나였다.

리운은 표정을 바꾸지 않았다. 노트북 화면에서 시선을 들고 그녀를 봤다. 그녀는 리운을 보고 있지 않았다. 그녀의 시선은 책상 위 어딘가에 있었다. 아무 곳도 보지 않는 시선이었다.

"작년 겨울이에요. 12월. 제 친구가... 스스로."

그녀는 그 단어를 끝까지 말하지 않았다. 리운은 끝까지 말하지 않은 그 단어를 알아들었다.

"친구랑 중학교 때부터 같이 다녔어요. 고등학교도 같이 갔고, 대학은 다른 데 갔지만 매일 카톡했어요. 거의 매일. 아침에 일어나면 카톡하고, 학교 끝나면 카톡하고, 밤에 자기 전에 카톡하고. 그게 6년이었어요."

그녀는 잠깐 말을 멈췄다. 손을 자기 무릎 위에 올렸다. 손이 떨리지는 않았다. 다만 손가락이 자기 무릎을 잡고 있었다. 꽉.

"12월 14일이었어요. 그날 밤에 친구가 카톡을 보냈어요. 제가 그때 시험 기간이었거든요. 카톡이 온 건 봤는데, 나중에 답하려고 읽지 않고 넘겼어요. 시험공부가 더 급하다고 생각해서요."

리운은 그녀의 말을 듣고 있었다. 그의 손은 키보드 위에 올려져 있었다. 평소라면 의뢰 내용을 메모했을 것이다. 그러나 오늘은 메모하지 않았다. 손가락이 키보드 위에 놓인 채로 움직이지 않았다.

"다음 날 아침에 일어났을 때, 카톡이 47개가 와 있었어요. 친구가 보낸 게 아니라 다른 애들이 보낸 거였어요. 단톡방에. 저는 그때 알았어요."

그녀는 거기서 다시 한 번 멈췄다. 이번 멈춤은 더 길었다. 5초. 7초. 리운은 재촉하지 않았다.

"친구가 마지막으로 보낸 카톡은 읽지 않은 채로 남아 있었어요. 저 말고 친구가 마지막으로 연락한 사람이 저였거든요. 제가 읽고 답했으면... 달라졌을 수도 있잖아요."

리운은 그 말을 들었다.

*제가 읽고 답했으면 달라졌을 수도 있잖아요.*

7년 전, 리운도 같은 종류의 문장을 자기 자신에게 수천 번 말했었다. *내가 그때 다르게 했더라면. 내가 그때 그렇게 하지 않았더라면.* 그 문장은 사람을 가장 효과적으로 부수는 종류의 문장이었다. 왜냐하면 그 문장에는 답이 없었기 때문이었다. 달라졌을 수도 있고, 달라지지 않았을 수도 있다. 영원히 알 수 없다. 그 *영원히 알 수 없음*이 사람을 가장 깊이 파고드는 죄책감이었다.

리운은 그녀를 봤다. 그녀는 여전히 책상 위 어딘가를 보고 있었다.

"그 후로 1년 동안... 매일 그 카톡을 봐요. 읽지 않은 그 카톡을. 휴대폰을 열 때마다 거기 있어요. 읽지 않은 상태로. 1이라는 숫자가 달린 채로. 저는 그 카톡을 1년 동안 한 번도 읽지 않았어요."

리운은 잠깐 멈췄다.

"읽지 않으셨어요?"

"네."

"왜요?"

이건 직업 외 질문이었다. 자기 자신에게 약속한 것을 리운은 벌써 어기고 있었다. 보관사는 의뢰인의 선택에 개입하지 않는다. 보관사는 사연을 이식에 필요한 만큼만 청취한다. 그 선을 지키겠다고 다시 다짐했는데, 벌써 선을 넘었다.

리운 자신도 그것을 의식했다. 의식했지만 멈추지 못했다. *왜*라는 한 글자가 그의 입에서 나온 것은 직업적 판단이 아니라, 그의 안쪽 어딘가에서 나온 것이었다.

그녀는 리운을 처음으로 봤다. 들어온 뒤 처음으로, 그녀의 시선이 리운의 눈을 정면으로 마주쳤다.

"...읽으면 끝나니까요."

리운은 그 말을 듣고 한참 답하지 못했다.

"읽지 않는 한, 그 카톡은 아직 안 온 카톡이에요. 읽지 않은 1이 남아 있는 한, 저한테는 아직 친구가 보낸 메시지가 하나 남아 있는 거예요. 그걸 읽는 순간 그 1이 사라져요. 그러면 진짜 끝이에요. 친구가 저한테 보낸 마지막 말이, 진짜로 마지막이 돼요."

그녀의 눈가가 살짝 붉어졌다. 그러나 울지는 않았다. 울지 않으려고 힘을 쓰고 있었다. 입을 다물고, 숨을 한 번 들이쉬고, 내쉬고. 스무 살이 7화의 의뢰인처럼 리운 앞에서 울지 않으려는 것이었다. 리운의 사무실에서는 울 수 없다는 것을, 이 스무 살도 본능적으로 느끼고 있었다.

리운은 잠깐 그녀를 봤다. 그리고 평소 같았으면 하지 않을 일을 했다.

책상 위 서류함 옆에 놓인 작은 상자에서 티슈 한 장을 꺼내 그녀 앞에 놓았다.

그것뿐이었다. 한 마디도 하지 않았다. 티슈를 꺼내서 책상 위 그녀 쪽에 놓았을 뿐이었다. 울어도 된다는 허락도, 괜찮다는 위로도 아니었다. 그냥 티슈 한 장을 놓은 것이었다.

그녀는 그 티슈를 봤다. 그리고 잠깐 가만히 있었다.

5초. 10초.

그녀는 티슈를 집지 않았다. 대신 한 번 크게 숨을 들이쉬고, 내쉬었다. 그리고 다시 밝은 목소리로 말했다.

"...그래서요. 보관하고 싶은 건 그 1년이에요. 친구가 죽은 날부터 오늘까지. 그 1년을 잠깐만 내려놓고 싶어요. 6개월 후에 다시 가지러 올게요."

리운은 그녀를 봤다.

이 스무 살은 기억을 영구히 지우러 온 것이 아니었다. 잠깐 내려놓으러 온 것이었다. 6개월 후에 다시 돌아와서 그 무게를 다시 짊어질 생각이었다. 그녀는 잊고 싶은 게 아니었다. 잠깐 쉬고 싶은 것이었다.

리운은 그 차이를 알았다. 그리고 그 차이가 그를 또 한 번 흔들었다. 7년 동안 리운은 *잠깐 내려놓는다*는 선택지를 자기 자신에게 허락한 적이 없었다. 그에게는 *안고 가는 것*과 *도망치는 것*, 두 가지만 존재했다. 잠깐 내려놓았다가 다시 짊어진다는 세 번째 길이 있다는 것을, 이 스무 살이 보여주고 있었다.

리운은 노트북에서 시선을 들고 말했다.

"...알겠습니다. 진행하겠습니다."

---

이식은 12분 만에 끝났다.

1년치 기억이지만, 그 안에 담긴 사건은 실질적으로 하나였다. 친구의 죽음. 그리고 그 후 1년 동안의 매일. 매일이 같은 무게였다. 같은 죄책감, 같은 후회, 같은 *읽지 않은 1*. 그것이 365번 반복된 기억이었다. 다양한 장면이 아니라 같은 감정의 반복이었기 때문에 이식 시간이 짧았다.

리운은 받은 기억을 그의 안쪽 보관 영역에 넣었다. 이번에는 5화처럼 자리를 잡으려는 저항이 없었다. 스무 살의 기억은 30년치 아버지의 기억보다 가벼웠다. 가벼웠지만 아팠다. 가벼운 것이 아픈 건 드문 일이었다. 보통은 무거운 기억이 더 아팠다. 그런데 이 기억은 가벼우면서 아팠다. 읽지 않은 카톡의 *1*이라는 숫자 하나가 365일 동안 그녀를 짓눌러온 기억이었기 때문이었다.

이식이 끝난 후 그녀는 멍한 얼굴로 잠시 앉아 있었다. 그러다 천천히 자기 이마에 손을 가져다 댔다.

"...끝났나요?"

"네."

그녀는 자리에서 일어났다. 그리고 자기 주머니에서 휴대폰을 꺼냈다. 화면을 한 번 봤다. 잠깐 봤다가, 다시 주머니에 넣었다. 그녀의 표정에 아주 작은 변화가 스쳤다. 무언가를 찾으려고 했는데 찾지 못한 사람의 표정. 다만 무엇을 찾으려고 했는지 자체를 이미 모르는 상태였다.

리운은 그녀를 사무실 문까지 배웅했다. 문 앞에서 그녀가 한 번 멈췄다.

"보관사님."

"네."

"제가... 6개월 후에 꼭 올게요."

리운은 잠깐 그녀를 봤다. 일시 보관 의뢰인 중 *꼭 오겠다*고 말하는 사람은 흔치 않았다. 보통은 *오겠다*고만 했다. *꼭*이라는 한 글자가 더 들어간 것은, 그녀가 그 기억을 돌려받을 것을 이미 결심하고 있다는 뜻이었다. 잠깐 내려놓되, 버리지는 않겠다는 결심.

"기다리겠습니다."

리운은 짧게 답했다. 평소의 직업적 톤이었다. 다만 평소엔 *기다리겠습니다*라는 말을 쓰지 않았다. 보통은 *6개월 후에 반환 절차로 다시 오시면 됩니다*라고 했다. 오늘은 그 대신 *기다리겠습니다*가 나왔다. 본인도 그것을 의식했다.

그녀는 가볍게 고개를 숙이고 사무실을 나섰다. 문이 닫혔다.

---

리운은 문이 닫힌 후 잠깐 그 자리에 서 있었다.

그리고 책상으로 돌아가서 수첩을 열었다. *20310418-E*가 적힌 줄에 메모를 적었다.

> *일시 보관 6개월. 반환 예정. 보관 상태 확인 별도 일정.*

그리고 그 아래에 한 줄을 더 적었다. 평소엔 적지 않는 종류의 메모였다.

> *읽지 않은 카톡 1.*

리운은 그 한 줄을 적고 잠깐 수첩을 들여다봤다. 그 *1*이라는 숫자가 수첩 위에서 작게 빛나고 있었다. 스무 살의 소녀가 1년 동안 안고 살았던 숫자. 그 숫자가 이제 리운의 안에 들어와 있었다.

리운은 수첩을 덮었다.

사무실은 조용했다. 창밖에서 4월 오전의 햇빛이 길게 들어와 책상 위를 비추고 있었다. 리운은 그 빛을 잠깐 봤다. 그리고 책상 위에 놓인 티슈 한 장을 봤다. 그녀가 집지 않았던 티슈. 리운이 꺼내서 놓아둔 티슈.

리운은 그 티슈를 한참 봤다.

그것은 7년 동안 리운이 의뢰인에게 건넨 적 없는 것이었다. 도하의 사무실에는 티슈가 항상 의뢰인 쪽에 놓여 있었다. 리운의 사무실에서는 서류함 옆 상자 안에 넣어두고 꺼낸 적이 없었다. 의뢰인이 울 수 없는 사무실에서는 티슈가 필요하지 않았으니까.

오늘 리운은 처음으로 티슈를 꺼냈다. 한 장. 그녀는 그 티슈를 집지 않았다. 울지 않았다. 그런데 리운은 그 티슈를 치우지 않았다. 책상 위에 그대로 놓아두었다.

다음 의뢰인이 오기 전에 치워야 했다. 다음 의뢰인이 보면 이상하게 여길 수 있었다. 보관사의 사무실에 왜 티슈가 놓여 있는지. 그건 *흔들리지 않는 사람*의 사무실에 어울리지 않는 물건이었다.

리운은 그 티슈를 잠깐 더 봤다. 그리고 결국 치우지 않았다. 대신 티슈 상자를 서류함 옆에서 꺼내 책상 위 의뢰인 쪽 모서리에 옮겨놓았다.

작은 변화였다. 누가 봐도 모를 만큼 작은. 다만 리운에게 그것은 큰 변화였다.

7년 동안 울 수 없었던 사무실에 티슈가 놓였다.', 1876, 8)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('d07c8fee-e712-4956-8234-6d2bacfa7690', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '1', 'draft', '오후 의뢰가 없는 날이었다.

월요일 오전에 스무 살 여대생의 의뢰를 받은 뒤, 오후 일정은 비어 있었다. 리운은 사무실에 혼자 앉아 의뢰서 정리를 마쳤다. 창밖에서 4월 오후의 햇빛이 비스듬히 들어와 책상 한쪽을 비추고 있었다. 조용한 오후였다. 복도에서도 사람 소리가 거의 들리지 않았다.

리운은 의뢰서를 닫고, 잠깐 책상 위를 봤다. 의뢰인 쪽 모서리에 놓아둔 티슈 상자가 거기 있었다. 오전에 옮겨놓은 그대로. 하얀 상자가 책상 위에서 작은 자리를 차지하고 있었다.

리운은 그 상자를 잠깐 보다가, 시선을 거뒀다.

수첩을 열었다. 오전 의뢰의 메모가 적혀 있었다. *20310418-E. 일시 보관 6개월. 반환 예정.* 그리고 그 아래에 적어둔 한 줄. *읽지 않은 카톡 1.*

그 *1*이라는 숫자를 잠깐 들여다봤다. 수첩 위의 작은 숫자. 스무 살의 소녀가 1년 동안 매일 봤던 숫자. 읽지 않은 메시지 하나. 읽으면 끝나는 메시지 하나. 그 숫자가 이제 리운의 안에 들어와 있었다.

리운은 수첩을 덮었다.

보관 상태 확인을 해야 했다. 오전에 받은 기억이니까 내일까지는 한 번 훑어봐야 했다. 지난번 의뢰(67세 남자)의 확인을 두 번이나 실패한 것이 아직 마무리되지 않은 상태였지만, 그건 그것이고 이건 이것이었다. 의뢰마다 별도로 확인해야 했다.

리운은 자리에서 일어나 사무실 문의 잠금을 걸었다. 블라인드를 내렸다. 사무실이 어둑해졌다. 의자에 다시 앉아 등받이에 기대고, 두 손을 무릎 위에 올렸다. 숨을 천천히 내쉬었다. 한 번. 두 번. 세 번.

눈을 감았다.

---

기억은 소리로 시작됐다.

카톡 알림음이었다. 짧고 가벼운 전자음. 그 소리가 반복됐다. 한 번. 두 번. 세 번. 네 번. 매일 아침, 매일 저녁, 매일 밤에 울리는 알림음. 그것이 스무 살 소녀의 일상이었다. 친구와의 카톡이 울리는 소리가 그녀의 하루를 구성하는 가장 작은 단위였다.

리운은 그 소리를 따라갔다.

소리가 풍경이 됐다. 교실이었다. 중학교 교실. 창가 자리에 두 명의 여자아이가 나란히 앉아 있었다. 한 명이 의뢰인이었고, 한 명이 친구였다. 친구는 의뢰인보다 키가 작았다. 짧은 머리에 동그란 안경을 쓴 아이. 그 아이는 노트에 무언가를 그리고 있었다. 작은 그림들. 고양이, 구름, 별. 의뢰인은 옆에서 그 그림을 보면서 웃고 있었다.

기억이 넘어갔다. 고등학교. 두 사람은 같은 반이 아니었지만 점심마다 함께 먹었다. 매점에서 빵을 사 와서 옥상 계단에 앉아 나눠 먹었다. 친구는 초코빵을 좋아했고, 의뢰인은 크림빵을 좋아했다. 가끔 바꿔 먹었다. 특별한 대화는 없었다. 그냥 나란히 앉아서 빵을 먹었다. 그게 그들의 우정이었다.

기억이 또 넘어갔다. 대학교. 두 사람은 다른 학교에 갔다. 처음으로 매일 보지 못하게 됐다. 대신 카톡이 시작됐다. 아침에 *일어났어?*, 점심에 *뭐 먹어?*, 밤에 *잘 자*. 매일. 6년 동안.

리운은 그 기억들을 빠르게 훑었다. 보관 상태 확인은 뼈대를 보는 작업이니까, 세부에 너무 깊이 들어갈 필요는 없었다. 다만 이번 기억은 세부가 아름다웠다. 두 사람의 우정이 6년 동안 쌓아온 작은 장면들. 어느 것 하나 특별하지 않았지만, 그 평범함이 전부 아름다웠다. 리운은 보관사 일을 하면서 아름다운 기억을 받는 일이 드물었다. 의뢰인들이 보관소에 가져오는 것은 대부분 고통이었다. 아름다움을 가져오는 사람은 거의 없었다.

이 스무 살은 고통만 가져온 것이 아니었다. 아름다움과 고통을 함께 가져왔다. 6년의 우정 전체를 보관해달라고 한 것이 아니라 마지막 1년만 보관해달라고 했지만, 그 1년 안에 6년의 잔영이 들어 있었다. 친구가 죽은 후 1년 동안 의뢰인이 매일 떠올린 것은 그 1년의 고통이 아니라, 6년의 아름다움이었다. 아름다웠기 때문에 아팠다.

---

기억이 12월 14일에 도착했다.

리운은 거기서 잠깐 멈췄다. 보관 상태 확인의 마지막 구간이었다. 이 지점을 넘겨야 확인이 완료됐다.

12월 14일 밤. 의뢰인은 자기 원룸 책상에 앉아 있었다. 기말고사 시험공부 중이었다. 노트북이 열려 있었고, 교재가 펼쳐져 있었고, 형광펜이 책상 위에 두 자루 놓여 있었다. 방 안에는 라디오가 켜져 있었다. 잔잔한 음악이 흘렀다.

밤 11시 42분. 카톡 알림이 울렸다.

의뢰인은 휴대폰을 봤다. 친구 이름이 떠 있었다. 한 줄짜리 메시지가 미리보기로 살짝 보였지만, 의뢰인은 그것을 읽지 않았다. 시험공부가 더 급했다. 내일 답하면 되니까. 그 판단은 1초도 걸리지 않았다. 휴대폰을 다시 엎어놓고 교재로 돌아갔다.

리운은 그 1초를 받았다.

그 1초 안에 의뢰인의 감정은 거의 없었다. 일상적인 판단이었다. *나중에 답하면 돼.* 그게 전부였다. 그 1초에는 죄책감도 후회도 없었다. 그것은 나중에 올 감정이었다.

기억이 넘어갔다. 12월 15일 아침. 알람이 울렸다. 의뢰인은 눈을 뜨고 휴대폰을 집었다. 화면에 카톡 알림이 가득했다. 47개. 단톡방이었다. 그녀는 단톡방을 열었다.

리운은 그 순간의 감정을 받았다.

그것은 처음엔 혼란이었다. 단톡방에 무슨 일이 있었지? 왜 이렇게 많이 왔지? 혼란이 3초쯤 지속됐다. 메시지를 읽기 시작했다. 읽으면서 혼란이 다른 것으로 변했다. 먼저 *아니*라는 부정이 왔다. 그건 사실이 아니야. 다음으로 *확인해야 해*라는 판단이 왔다. 친구에게 전화했다. 받지 않았다. 다시 걸었다. 받지 않았다. 세 번째 전화에서 친구의 어머니가 받았다. 그 어머니의 목소리는...

리운은 거기서 기억의 속도를 줄였다.

친구의 어머니 목소리를 받는 것은 보관 상태 확인에 필요한 범위를 넘어서는 것이었다. 뼈대만 보면 됐다. 그 이상은 자기 감정 영역을 침범하는 일이었다. 리운은 속도를 줄이면서 그 장면을 빠르게 넘겼다.

장례식. 넘겼다. 친구 어머니가 의뢰인을 안아주는 장면. 넘겼다. 그 후의 매일. 빠르게 넘겼다.

마지막 지점에 도착했다. 1년 후의 오늘 아침. 의뢰인이 이 사무실에 오기 직전. 그녀는 오피스텔에서 나오면서 한 번 더 휴대폰을 봤다. 친구와의 채팅방. 읽지 않은 메시지 *1*. 그 숫자를 3초쯤 봤다. 그리고 화면을 껐다.

기억은 거기서 끝났다.

리운은 천천히 눈을 떴다.

---

사무실은 어둑한 채였다. 블라인드 사이로 햇빛이 가는 줄로 들어와 책상 위를 비추고 있었다. 시계를 봤다. 오후 3시 20분. 확인을 시작한 지 1시간 10분이 지나 있었다.

이번에는 끝까지 갔다. 중단하지 않았다. 지난번 67세 남자의 확인 때처럼 멈추지 않았다.

리운은 손을 들어 자기 얼굴을 만졌다. 마른 얼굴이었다. 울지 않았다. 다만 손이 자기 볼에 닿았을 때, 볼이 평소보다 차가웠다. 혈색이 빠져 있었다. 1시간 넘게 눈을 감고 다른 사람의 1년을 살았으니까.

리운은 수첩을 열었다. *20310418-E* 옆에 메모를 적었다.

> *보관 상태 양호. 잔여감 있음.*

잠깐 펜을 멈췄다. *잔여감 있음*에서 더 적어야 할까 생각했다. 며칠 전에는 *깊음*이라는 한 단어를 추가했었다. 오늘도 뭔가를 더 적을까.

그러지 않았다. *잔여감 있음*으로 충분했다. 거짓말은 아니었다. 잔여감이 있었다. 다만 그것이 어떤 종류의 잔여감인지는 적지 않았다.

수첩을 덮었다.

---

블라인드를 올리자 햇빛이 사무실 안으로 길게 들어왔다. 리운은 그 빛 아래에 잠깐 서 있었다. 볼에 온기가 돌아왔다.

사무실 문의 잠금을 풀고, 복도로 나왔다. 복도는 여전히 조용했다. 시간은 3시 반쯤이었다. 다른 보관사들은 각자 사무실에서 오후 의뢰를 진행 중이거나, 보관 상태 확인 중이거나, 아무것도 하지 않고 있을 시간이었다.

리운은 복도를 천천히 걸었다. 4층으로 올라가는 계단이 복도 끝에 있었다. 4층은 의료지원실과 심리상담실이 있는 층이었다. 리운은 그 계단을 잠깐 봤다. 며칠 전부터 미뤄온 보고가 거기에 있었다. 67세 남자의 보관 상태 확인을 두 번 실패한 것. 매뉴얼대로라면 의료지원실에 보고해야 했다.

리운은 계단을 잠깐 봤다가, 시선을 돌렸다. 아직은 아니라고 생각했다. 세 번째 시도를 한 번 더 해보고 나서.

그는 계단을 지나쳐 다시 자기 사무실 쪽으로 돌아갔다.

---

사무실로 돌아가는 길에 도하의 사무실 앞을 지나갔다. 문이 살짝 열려 있었다. 안에서 도하의 목소리가 들렸다. 의뢰인과 이야기하고 있는 것 같았다. 목소리가 부드러웠다. 도하가 의뢰인 앞에서 쓰는 그 부드러운 톤.

리운은 발걸음을 멈추지 않고 지나갔다. 지나가면서, 도하의 사무실 안에서 작은 소리가 들렸다. 누군가 울고 있었다. 의뢰인이었다. 그리고 그 울음 사이로 도하의 목소리가 잠깐 들렸다.

"...괜찮아요. 천천히."

리운은 그 말을 듣고 잠깐, 정말 잠깐 발걸음이 느려졌다. 그러다 다시 평소 속도로 걸었다.

자기 사무실에 도착해서 문을 열고 들어갔다. 문을 닫고, 책상 앞에 앉았다. 책상 위에 티슈 상자가 의뢰인 쪽 모서리에 놓여 있었다. 오전에 옮겨놓은 그대로.

리운은 그 상자를 잠깐 봤다.

도하는 의뢰인에게 *괜찮아요*라고 말할 수 있는 사람이었다. 리운은 그런 말을 할 수 없는 사람이었다. 할 수 없다고 스스로 정한 사람이었다. 보관사는 위로하는 직업이 아니었고, 리운은 그 직업의 경계를 가장 엄격하게 지키는 사람이었다.

다만 오늘 리운은 티슈를 꺼냈다. *괜찮아요*라고 말하지는 않았지만, 티슈를 꺼냈다.

그게 리운이 할 수 있는 *괜찮아요*였다.

---

오후 5시, 리운은 의뢰서 정리를 마치고 가방을 챙겼다. 퇴근 준비를 하면서 책상 위를 한 번 정리했다. 펜을 꽂고, 수첩을 가방에 넣고, 노트북을 닫았다.

티슈 상자는 치우지 않았다. 의뢰인 쪽 모서리에 그대로 두었다.

코트를 입고 사무실 불을 끄고 나섰다. 복도에서 도하와 마주쳤다. 도하도 퇴근하는 길이었다. 도하의 눈 밑이 평소보다 어두웠다. 오후에 울었던 의뢰인의 잔향이 도하에게 남아 있는 것 같았다.

"형, 퇴근이에요?"

"네."

"오늘 의뢰 어땠어요?"

"괜찮았어요."

"저는 오늘 좀 힘들었어요. 오후에 받은 분이 많이 우셨거든요."

리운은 도하를 잠깐 봤다. 도하의 얼굴에는 피로가 떠 있었지만, 동시에 무언가 담담한 것도 있었다. 울었던 의뢰인을 보내고 나서 자기 자신을 추스른 사람의 담담함.

"도하 씨는 그런 의뢰 받고 나면 어떻게 해요?"

리운이 물었다. 이것도 평소 하지 않는 종류의 질문이었다. 그러나 오늘은 물어보고 싶었다.

도하는 잠깐 걸으면서 생각했다.

"저는요, 집에 가서 따뜻한 물로 샤워를 오래 해요. 30분쯤. 물소리 들으면서 멍 때리면 좀 나아져요. 그래도 안 나아지면 라면 끓여 먹어요."

"라면이요?"

"네. 라면 먹으면 좀 살 것 같아요. 아무 라면이나요. 원래 야식 안 먹는데, 이럴 때만 먹어요."

리운은 가볍게 고개를 끄덕였다. 도하는 자기 자신을 돌보는 방법을 가지고 있었다. 작고 평범한 방법이지만, 자기에게 맞는 방법을.

"형은요? 형은 힘든 의뢰 받고 나면 뭐 해요?"

리운은 그 질문에 잠깐 답하지 못했다. 자기가 힘든 의뢰 후에 뭘 하는지를 생각해봤다. 답은 단순했다. 아무것도 안 했다. 그냥 견뎠다. 견디는 것 외에 다른 방법을 생각해본 적이 없었다.

"...모르겠어요."

리운은 솔직하게 답했다. 도하는 잠깐 그를 봤다.

"형, 오늘 집에 가서 따뜻한 거 드세요. 라면이든 국물이든. 좀 나아질 거예요."

"네."

두 사람은 1층 로비에서 헤어졌다. 도하는 회사 앞 정류장 쪽으로 갔고, 리운은 지하철역 쪽으로 걸었다.

---

퇴근길, 리운은 오피스텔 근처 편의점에 들렀다. 평소처럼 도시락을 집었다. 그러다 잠깐 멈췄다. 도시락을 든 채로 편의점 안을 봤다. 라면이 진열대에 있었다. 컵라면 여러 종류.

리운은 잠깐 서 있었다. 그리고 도시락 옆에 컵라면 하나를 더 집었다.

계산을 하고 편의점을 나섰다. 비닐봉지 안에 도시락 하나와 컵라면 하나가 들어 있었다. 오피스텔 8층으로 올라가서, 현관문을 열고, 신발을 벗고, 가방을 책상 위에 올려놓았다. 평소와 같은 동작들.

도시락을 책상에 두고, 전기포트로 물을 끓였다. 컵라면 뚜껑을 열고 물을 부었다. 3분을 기다렸다. 3분 동안 리운은 창밖을 봤다. 4월 저녁의 서울이 창 너머에 있었다. 건물들의 불빛이 하나씩 켜지고 있었다.

3분이 지나서 뚜껑을 열었다. 김이 올라왔다. 뜨거운 국물 냄새.

리운은 라면을 한 젓가락 떴다. 입에 넣었다. 뜨거웠다. 입천장을 살짝 데일 만큼. 그 뜨거움이 목을 타고 가슴 안쪽으로 내려갔다.

따뜻했다.

리운은 라면을 천천히 먹었다. 국물까지 다 마셨다. 빈 컵을 잠깐 봤다. 컵 바닥에 양념 찌꺼기가 남아 있었다.

도하가 말한 대로였다. 좀 나아졌다. 어디가 어떻게 나아진 건지 정확히 말할 수는 없었지만, 가슴 안쪽의 무언가가 아주 약간 풀린 것 같았다.

리운은 빈 컵을 정리하고, 도시락도 먹었다. 평소처럼 빠르게. 도시락은 평소의 맛이었다. 라면 후에 먹으니까 더 밋밋했다.

식사를 마치고, 양치를 하고, 옷을 갈아입고, 침대에 누웠다. 시간은 9시 반이었다. 평소 시간이었다.

침대에 누워 천장을 봤다. 회색 천장이었다. 매일 보는 천장이었다.

리운은 눈을 감기 전에, 오늘 받은 스무 살의 기억에서 한 장면만 떠올렸다. 중학교 교실. 창가 자리에 나란히 앉은 두 여자아이. 한 아이가 노트에 고양이를 그리고 있고, 다른 아이가 옆에서 웃고 있는 장면. 평범한 오후. 평범한 우정.

그 장면은 아프지 않았다. 아프지 않은 기억을 받은 것이 오래간만이었다. 그 장면이 리운의 가슴 안쪽에서 조용히 자리를 잡았다. 보관 영역이 아니라, 그 옆의 약간 따뜻한 자리에.

리운은 눈을 감았다.

오늘은 잠이 평소보다 빨리 올 것 같았다.', 1640, 9)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('76898e72-7ada-4f48-a072-f42b82d28f50', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '돌아온 자리', 'draft', '오전 11시, 의뢰인이 도착했다.

리운은 사무실 문을 열었다. 30대 후반 남자였다. 키는 평균보다 약간 컸고, 약간 마른 편이었다. 짙은 남색 코트 안에 흰 셔츠와 회색 슬랙스. 손에는 작은 가죽 가방을 들고 있었다. 출근길에 잠깐 들른 사람의 차림이었다.

다만 표정이 평소 의뢰인들과 달랐다. 대부분의 의뢰인은 사무실 문을 열 때 살짝 긴장한 얼굴로 들어왔다. 이 남자는 긴장하지 않았다. 오히려 살짝 들떠 있었다. 무언가를 기대하는 사람의 얼굴이었다.

"안녕하세요. 서리운입니다."

"안녕하세요. 오늘 잘 부탁드립니다."

목소리가 밝았다. 리운은 그를 사무실 안으로 안내했다. 남자는 의뢰인용 의자에 앉으면서 사무실 안을 한 번 둘러봤다. 둘러보는 동작에도 어딘가 즐거움이 섞여 있었다.

"이 사무실에 다시 와보네요. 5년 만에요."

리운은 그를 잠깐 봤다.

"5년 전에 의뢰를 진행하셨던 거군요."

"네. 그때는 다른 보관사 선생님이셨어요. 본원이 아니라 부산 지원에서 했거든요. 이번엔 서울로 이사 왔으니까 본원에서 받게 됐네요."

리운은 책상 맞은편에 앉아 노트북을 열었다. 의뢰서를 확인했다. *20310419-F. 38세 남성. 일시 보관 반환. 원 의뢰: 5년 전 부산 지원, 사전 분류: 신혼여행 / 1주일.*

"5년 전에 일시 보관 신청하셨던 신혼여행 기억의 반환 절차네요."

"네. 맞습니다."

리운은 의뢰서를 한 번 더 확인했다. 일시 보관 반환은 그가 자주 진행하는 절차였다. 서너 달에 한 번씩은 들어왔다. 드문 절차는 아니었지만, 5년이 지나서 돌아오는 건 평균보다 길었다. 보통 일시 보관 반환은 6개월에서 2년 사이에 이루어졌다. 5년이면 의뢰인이 돌아오지 않을 가능성이 더 높은 기간이었다.

이 의뢰인은 5년 동안 잊지 않고 돌아왔다.

"먼저 절차를 안내드리겠습니다."

"네."

"반환은 이식과 동일한 방식으로 진행됩니다. 부산 지원에서 의뢰인분의 기억을 보관해온 보관사 선생님이 사전에 본원으로 그 기억을 이전하셨고, 현재 그 기억은 본원의 임시 보관 시스템에 저장되어 있습니다. 오늘 절차에서는 본원 시스템에서 의뢰인분에게 그 기억을 다시 이식하게 됩니다."

"네."

"이식 시간은 약 15분 정도 예상됩니다. 일주일치 기억이고, 5년 동안 별도 보관 처리되었기 때문에 추가 시간이 필요할 수 있습니다."

리운은 평소대로 절차를 설명했다. 남자는 듣고 있었지만, 그의 시선이 살짝 다른 곳을 향해 있는 것이 보였다. 듣기는 듣되, 머릿속에서 다른 생각이 움직이고 있는 사람의 시선이었다. 리운은 그것을 알아챘지만 그냥 안내를 이어갔다.

---

안내가 끝나자 남자가 입을 열었다.

"보관사님."

"네."

"한 가지 여쭤봐도 될까요?"

"말씀하세요."

남자는 잠깐 망설였다. 자기가 지금 하려는 질문이 이상한 질문일까 봐 망설이는 사람의 표정. 그러다가 결국 입을 열었다.

"기억을 돌려받으면... 어떤 느낌일까요?"

리운은 잠깐 침묵했다.

이건 자주 받는 질문이었다. 일시 보관 반환을 진행하러 오는 의뢰인 중 절반은 이런 종류의 질문을 했다. *어떤 느낌일까요. 다시 처음 만나는 것 같을까요. 신선할까요. 새롭게 느껴질까요.* 표현은 다양했지만 묻는 것은 같았다.

리운의 답도 정해져 있었다. 매뉴얼에 적혀 있지는 않지만, 보관사들 사이에서 암묵적으로 정해진 답이 있었다. *개인차가 있습니다. 직접 경험해보시면 알 수 있어요.* 이 답은 거짓말은 아니었지만 진실의 절반이었다. 진실의 나머지 절반은 의뢰인이 직접 경험한 후에야 알 수 있었다.

리운은 평소의 답을 했다.

"개인차가 있습니다. 의뢰인분께서 직접 경험해보시면 알 수 있을 거예요."

"...그렇군요."

남자는 그 답에 만족하지 못한 것 같았다. 그러나 더 캐묻지 않았다. 캐물어도 같은 답이 돌아올 것을 짐작한 모양이었다.

남자는 잠깐 자기 손을 봤다. 그리고 작게 웃었다.

"사실 저는... 좀 많이 기대하고 왔어요."

"기대요."

"네. 5년 동안 그 기억이 제 안에 없었잖아요. 신혼여행이라는 단어는 알아요. 갔다 왔다는 사실도 알고요. 사진도 있어요. 사진을 보면 *내가 여기 갔구나* 하는 정도로만 알아요. 근데 그 안에 어떤 일이 있었는지, 무슨 음식을 먹었는지, 어떤 풍경을 봤는지, 그런 건 전혀 몰라요. 5년 동안 그 부분이 비어 있었어요."

남자는 자기 손가락을 한 번 풀었다 모았다.

"그래서 오늘 그 기억을 돌려받으면, 마치 그 신혼여행을 처음 가는 것 같지 않을까 싶었어요. 처음 그 풍경을 보는 것 같고, 처음 그 음식을 먹는 것 같고. 5년 동안 잊고 있었던 거니까, 거의 새로운 거잖아요. 새로운 여행을 한 번 더 다녀오는 것 같은 기분이 들지 않을까. 그런 기대를 했어요."

리운은 그의 말을 들었다. 들으면서, 평소엔 하지 않는 일을 잠깐 생각했다. 이 사람에게 미리 말해줄까. *그렇지 않을 거예요*라고. 직업적으로는 말하지 말아야 할 일이었다. 의뢰인이 직접 경험하기 전에 보관사가 그 경험을 미리 정의해주는 것은 윤리적으로 모호했다. 어떤 의뢰인들은 정말로 새로움을 느끼기도 했다. 드물게는 그랬다. 그래서 보관사는 그 가능성을 열어두는 것이 원칙이었다.

리운은 결국 미리 말하지 않기로 했다. 평소처럼.

"그러시군요. 오늘 한 번 직접 경험해보시면 좋겠네요."

남자는 그 답에 가볍게 고개를 끄덕였다.

---

이식은 사무실 안쪽 작은 방에서 진행됐다. 리운은 평소처럼 패드를 부착하는 법을 알려주고, 기계를 켰다. 남자는 패드를 부착하면서 한 번 더 작게 웃었다. 들떠 있었다.

"보관사님."

"네."

"5년 전에 제가 이 기억을 맡길 때, 부산 지원의 그 선생님이 저한테 그러셨어요. *언젠가 다시 받으러 오시면 좋겠네요.* 저는 그때 약속했어요. 꼭 다시 오겠다고. 그게 5년이나 걸렸지만, 그래도 약속을 지킨 거예요."

리운은 가볍게 고개를 끄덕였다.

"그 선생님께서 좋아하시겠네요."

"네. 그분께 따로 연락드릴 생각이에요. 절차 끝나면."

리운은 자기 쪽 패드를 부착하고, 기계의 화면을 봤다. 동기화 진행률이 0퍼센트에서 천천히 올라갔다. 본원의 임시 보관 시스템에서 남자의 일주일치 기억이 그의 뇌로 전송되기 시작했다.

"이식이 시작되면 약간의 어지러움이 있을 수 있어요. 의뢰인분께서 의식하지 않으셔도 기억은 자동으로 자리를 잡습니다. 시간은 약 15분 정도입니다."

"네."

남자는 눈을 살짝 감았다. 리운도 자기 쪽 화면을 통해 진행 상황을 모니터링했다. 평범한 일시 보관 반환이었다. 5년 동안 보관된 기억이지만 분량이 일주일치라 데이터양은 적었고, 사전 분류도 단순했다. 신혼여행. 한 사람의 평범한 일주일.

이식은 13분 만에 끝났다.

"끝났습니다."

남자는 천천히 눈을 떴다. 그리고 자기 이마에 손을 가져다 댔다. 잠깐 가만히 있었다. 30초쯤. 1분쯤.

리운은 그 시간을 기다려줬다. 일시 보관 반환의 경우, 의뢰인이 돌려받은 기억이 자기 안에 자리를 잡는 데 잠시 시간이 필요했다. 보관사는 그 시간 동안 말을 걸지 않는 것이 원칙이었다.

남자가 천천히 손을 내렸다.

---

남자의 표정에는 어떤 감정도 떠 있지 않았다.

리운은 그것을 봤다. 그것은 그가 7년 동안 일시 보관 반환을 진행하면서 거의 매번 본 표정이었다. 기대를 안고 들어왔다가, 빈손으로 나가는 사람들의 표정. 무언가가 일어날 줄 알았는데 아무것도 일어나지 않은 사람의 얼굴.

남자는 잠깐 책상 위 어딘가를 봤다. 그러다 리운을 봤다.

"...이게 다인가요?"

"네."

"이식이 끝난 거예요?"

"네. 끝났습니다. 이제 의뢰인분의 머릿속에 5년 전 신혼여행의 기억이 다시 있습니다."

남자는 그 말을 들었다. 그리고 천천히, 자기 머릿속을 살펴보는 사람처럼 잠깐 가만히 있었다. 리운은 그가 무엇을 하고 있는지 알았다. 그는 자기 안에서 그 신혼여행을 찾고 있었다. 어디 있는지, 어떻게 느껴지는지, 새롭게 느껴지는지를.

남자는 잠깐 가만히 있다가, 입을 열었다.

"...있어요. 분명히 있어요. 거기 갔던 거 기억나요. 첫날 호텔 도착해서 짐 풀고, 둘째 날 해변 갔던 거랑, 셋째 날 시내 구경하면서 골목에서 점심 먹은 거, 그 모든 게 다 있어요."

"네."

"근데..."

남자는 거기서 말을 멈췄다. 자기 머릿속을 한 번 더 살피는 것 같았다.

"...새롭지 않아요."

리운은 가만히 들었다.

"이상하네요. 5년 동안 없었던 기억인데, 지금은 마치 5년 동안 줄곧 거기 있었던 것 같아요. 5년 전부터 알고 있던 일을 그냥 지금 한 번 더 떠올리는 느낌이에요. 새로움이 없어요. 신선함도 없어요. 그냥... 원래 알고 있던 거예요."

리운은 짧게 답했다.

"...개인차가 있습니다."

거짓말이었다. 정확히는 절반의 진실이었다. 개인차는 있었지만, 대부분의 의뢰인이 같은 경험을 했다. 새롭지 않다는 경험. 리운은 그것을 알면서도 *개인차*라는 단어로 그 진실을 흐려놓았다. 그게 매뉴얼이었다.

남자는 리운의 답을 듣고 가볍게 고개를 끄덕였다. 무언가를 깨달은 사람의 끄덕임이었다. 실망한 것 같지는 않았다. 다만 자기가 5년 동안 품어온 기대가 잘못된 종류의 기대였다는 것을 받아들이는 끄덕임이었다.

"그렇군요. 그냥 원래 자리에 있던 거였네요."

리운은 그 말에 답하지 않았다. 답할 필요가 없었다. 남자는 자기 자신에게 말한 것이었다.

---

남자는 자리에서 일어났다. 처음 들어왔을 때의 들뜸은 사라져 있었다. 다만 우울해 보이지도 않았다. 어딘가 차분해진 얼굴이었다. 5년 동안 마음속에 품어온 기대가 사라진 자리에, 다른 무언가가 들어선 것 같았다.

리운은 그를 사무실 문까지 배웅했다. 문 앞에서 남자가 한 번 멈췄다.

"보관사님."

"네."

"오늘 와서 좋았어요. 새롭지는 않았지만요."

리운은 잠깐 그를 봤다.

"...어떤 점이 좋으셨어요?"

이건 직업 외 질문이었다. 그러나 오늘은 평소보다 가벼운 마음으로 나왔다. 무거운 의뢰가 아니었으니까.

남자는 잠깐 생각하다가, 옅게 웃었다.

"제가 5년 동안 안 잊고 있었다는 거요. 그 신혼여행을. 안 가본 사람처럼 살면서도, 결국 5년 후에 다시 받으러 왔잖아요. 안 잊고 싶었던 거예요. 잠깐 내려놓았던 거지, 잊은 게 아니었어요. 오늘 그걸 알았어요."

그는 가볍게 고개를 숙이고 사무실을 나섰다. 문이 닫혔다.

---

리운은 사무실 문을 닫고 책상으로 돌아갔다.

의자에 앉아 의뢰서에 메모를 남겼다.

> *일시 보관 반환 절차 완료. 의뢰인 상태 정상. 이상 없음.*

평소의 메모였다. 한 줄도 더 붙이지 않았다. 노트북을 닫고, 잠깐 의자에 등을 기댔다.

남자가 떠난 자리는 조용했다. 의뢰인용 의자도, 책상 위 티슈 상자도, 그대로 있었다. 다만 사무실 안의 공기가 조금 다르게 느껴졌다. 무언가가 잠깐 들어왔다 나간 후의 공기.

리운은 그 공기를 잠깐 의식했다.

기억은 어디로 갔다가 어디로 돌아오는 것이 아니었다. 그저 자기 자리에 있었다. 잠깐 다른 사람에게 맡겨두었더라도, 돌아오면 그것은 처음부터 그 자리에 있었던 것처럼 느껴졌다. 5년이 지나도 마찬가지였고, 10년이 지나도 마찬가지일 것이었다. 기억은 시간을 모르는 것이니까. 기억에게는 *맡겨진 시간*이라는 것이 없었다. 보관사의 안에 있든 자기 안에 있든, 기억은 그저 *있는 것*이었다.

그래서 일시 보관 반환을 받은 의뢰인들은 거의 매번 같은 경험을 했다. 새롭지 않다는 경험. 신선하지 않다는 경험. 그저 원래 알고 있던 것이 다시 거기 있는 경험.

이 사실은 의뢰인들에게 약간의 실망을 주었다. 그들은 *새롭게 느껴지기*를 기대하고 왔으니까. 다만 어떤 의뢰인들은, 오늘의 그 남자처럼, 실망 대신 다른 것을 받아갔다. *내가 5년 동안 안 잊고 있었다*는 사실. 잊으려고 한 게 아니라 잠깐 내려놓은 것이었다는 사실. 그 사실이 그들에게는 새로움보다 더 큰 것이었다.

리운은 잠깐 자기 자신에 대해 생각했다.

그가 안고 살아가는 것들 — 그의 안에 들어와 자리를 잡은 모든 것들 — 도 마찬가지였다. 그것들은 어디로 갔다가 돌아오는 것이 아니라, 처음부터 그 자리에 있었다. 그는 그것을 잠깐 다른 곳에 맡길 수 있다고 생각해본 적이 없었다. 다만 만약 맡길 수 있었다고 해도, 돌려받으면 똑같았을 것이다. 새롭지 않고, 신선하지 않고, 그저 원래 있던 자리에 있는 것처럼 느껴졌을 것이다.

그러면 차라리 처음부터 안고 가는 것이 낫다고 그는 늘 생각해왔다. 오늘의 의뢰는 그 생각에 한 가지를 더해주었다. 안고 가든 잠깐 맡기든, 그것은 결국 *자기 자리*에 있다는 것. 도망갈 수 없는 종류의 자리에. 사람의 안쪽에는 그런 자리가 있었다. 한 번 들어온 것이 영원히 머무는 자리. 보관사가 받아주든 받아주지 않든, 그 자리는 사라지지 않았다.

리운은 그 깨달음을 잠깐 곱씹었다. 곱씹고, 곧 옆으로 밀어두었다. 곱씹으면 또 다른 길로 흘러갈 것 같았다. 그 길은 오늘 가고 싶지 않은 길이었다.

---

오후 1시였다. 점심시간.

리운은 가방을 챙기지 않고 그대로 자리에서 일어났다. 사무실 불을 끄고 나가서 회사 근처 김밥집으로 향했다. 평소처럼.

다만 오늘은 평소와 한 가지가 달랐다. 김밥집 사장님이 리운을 보고 가볍게 웃었다.

"오늘은 또 우동이세요?"

리운은 잠깐 멈췄다. 그러고는 짧게 답했다.

"...오늘은 김밥 한 줄에 우동 하나요. 같이 주세요."

사장님은 가볍게 고개를 끄덕였다. 리운은 창가 자리에 앉아 잠깐 창밖을 봤다. 4월 정오의 거리는 사람들로 가득했다. 회사원들이 점심을 먹으러 가는 시간. 리운은 그 사람들을 잠깐 봤다.

사람들은 각자의 것을 안고 걷고 있었다. 보이지 않는 것들. 잠시 내려놓고 싶은 것들. 잊고 싶은 것들. 안 잊고 싶은 것들. 그 모든 것들이 그들의 안에서 각자의 자리를 차지하고 있었다.

리운도 자기 안의 것들을 잠깐 의식했다. 그것들은 오늘도 거기 있었다. 어제와 같은 자리에. 어제보다 조금 더 늘어난 채로. 그러나 늘어났다고 해서 더 무겁지는 않았다. 무게는 같았다. 자리만 조금씩 채워지고 있을 뿐이었다.

김밥과 우동이 나왔다. 따뜻했다.

리운은 천천히 먹었다.', 1663, 10)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('aa151d2e-be7c-4f02-b4da-21ec6e970705', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '서리운', NULL, '남', '30세', '마른 편, 키는 평균보다 약간 큼. 눈 밑이 어둡고 입가의 선이 깊음. 웃지 않는 사람의 얼굴. 평일에는 단정한 셔츠와 슬랙스, 거의 무채색. 악수할 때 손이 차가운 사람.', 'ISTJ', '극도로 절제된 감정 표현. 직업적으로 차분하고 정확하며, 사적으로는 모든 변수를 제거하고 같은 패턴을 반복하는 사람. 자기 자신에게 가장 엄격하고, 자기를 돌보는 방법을 가진 적이 없다. 타인과의 거리를 의식적으로 유지하지만, 최근 그 거리가 미세하게 줄어들기 시작했다.', '주인공. 한국기억보존관리원 본원 소속 기억 보관사 3년차. 7년 전 가족 여행 중 자신이 운전하던 차가 사고를 내 부모와 여동생을 모두 잃었다. 면허 딴 지 6개월, 산길에서 트럭이 중앙선을 넘어왔을 때 패닉에 빠져 대응하지 못한 것을 평생의 죄로 안고 살아간다. 보관사 직업을 자기 기억을 영원히 잊지 않기 위한 족쇄이자 속죄의 도구로 삼고 있으며, 타인의 고통을 대신 짊어질 때마다 자기 죄가 덜어진다는 착각으로 버텨왔다. ''흔들리지 않는 사람''으로 입소문이 나 있지만, 최근 의뢰인들의 기억을 받으면서 내면의 봉인이 조금씩 흔들리고 있다.', 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('ed0dbb76-8176-4ce4-a354-0c499c90150a', 'aa151d2e-be7c-4f02-b4da-21ec6e970705', '직업', '기억 보관사 (공식) / 메모리언 (대중 별명)', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('c86fbcd8-99c4-4b92-b153-45f4e312ef7c', 'aa151d2e-be7c-4f02-b4da-21ec6e970705', '버릇·특이사항', '운전을 하지 않음 (지하철 출퇴근). 안정제를 가지고 다니지만 거의 먹지 않음. 잠들기 전 여동생 셀카 사진을 꺼내 봄. 같은 시간, 같은 자리, 같은 메뉴를 반복하는 패턴형 생활. 최근 김밥에 우동을 추가하기 시작.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('319cedbe-0a04-471c-8b51-a236b442189b', 'aa151d2e-be7c-4f02-b4da-21ec6e970705', '비공식 루트에 대한 태도', '보관사 간 비공식 기억 이전의 존재를 알고 있지만, 자기 기억을 맡기기 위해 그 루트를 사용하지 않기로 결정. 사용할 수 있는데도 거부하는 것이 그의 자기처벌의 핵심.', 3)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('12ed74e2-a4dd-428f-a837-3d98e74c4e3e', 'aa151d2e-be7c-4f02-b4da-21ec6e970705', '과거 사고 핵심', '23세, 대학교 3학년 여름. 면허 딴 지 6개월. 가족 여행 중 산길에서 반대편 트럭이 중앙선을 넘어옴. 패닉에 빠져 대응 실패. 아버지(조수석), 어머니(뒷좌석), 여동생(뒷좌석, 20세) 사망. 리운만 생존. 사고 후 4년간 추락, 27세에 보관사 자격 취득.', 4)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('ad0aca32-0687-452e-b1c9-617fab00462b', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '임도하', NULL, '남', '35세', '구체적 외모 묘사는 적으나, 평소 활기찬 분위기. 술을 마시면 얼굴이 살짝 붉어짐. 머리가 가끔 정돈되지 않은 상태.', 'ENFP', '활발하고 농담을 자주 함. 감정 표현이 풍부하고 자주 울지만 그것이 그를 살리는 방식이라는 것을 본인도 알고 있음. 리운에게 끊임없이 말을 걸고 거절당해도 계속 다가가는 사람. 진심으로 걱정하면서도 상대방의 선을 넘지 않는 배려가 있음.', '본원 소속 동료 보관사. 리운보다 한 해 후배. 리운과 가장 자주 마주치는 동료이며, 3년간 거절당하면서도 매번 점심·술·영화를 제안해온 사람. 의뢰인이 자주 우는 사무실의 주인으로, 본원의 비공식 분류에서 ''의뢰인이 울고 싶어 하면 도하에게'' 보내지는 보관사. 리운에게 가장 가까운 동료이자, 동시에 리운이 누구인지를 가장 모르는 사람. 리운이 처음으로 술 제안을 받아들인 상대.', 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('a7b2be83-21a2-4750-b55b-f0b7fc0d2764', 'ad0aca32-0687-452e-b1c9-617fab00462b', '직업', '기억 보관사', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('f78ec1ea-074e-402b-b390-20d2b4e668b2', 'ad0aca32-0687-452e-b1c9-617fab00462b', '한지섭과의 관계', '한지섭과 가까웠으며, 한지섭의 ''잘 우는 사람이 오래 간다''는 말을 기억하고 있음. 한지섭이 자주 데려갔던 술집의 단골.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('4d7d1765-b126-429a-945b-ae5d9441ad84', 'ad0aca32-0687-452e-b1c9-617fab00462b', '힘든 의뢰 후 습관', '따뜻한 물로 30분 샤워, 안 나아지면 라면 끓여 먹음.', 3)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('64d57e90-7e8a-4315-acec-dcbeac1da835', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '김혜원 (김 주임)', NULL, '여', '32세', '구체적 외모 묘사 없음.', 'ISFJ', '따뜻하고 세심함. 보관사들에게 사실상 어머니 같은 존재. 무너지는 보관사를 가장 가까이서 본 사람이면서도, 자기 감정을 드러내지 않으려고 노력함. 말 없는 돌봄의 사람.', '본원 1층 안내데스크 행정직. 5년째 근무. 보관사 7명 모두의 의뢰 일정을 관리하며, 매일 아침 리운에게 보리차를 따라주는 사람. 리운이 처음 입사했을 때부터 ''곧 무너지겠다''고 직감했지만 3년째 무너지지 않는 것을 보며 오히려 더 걱정하게 된 인물. 한지섭이 휴직 전에 ''리운 씨 잘 챙겨주세요. 그 사람은 자기 자신을 챙길 줄 모르는 사람이에요''라는 말을 남겼고, 한지섭이 리운에게 남긴 편지를 전달함.', 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('450bccb9-8f9d-4cff-8e2a-3c16fa46dedc', '64d57e90-7e8a-4315-acec-dcbeac1da835', '직업', '한국기억보존관리원 본원 안내데스크 행정직', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('ba09ba2b-067a-41b8-9307-624846310ae7', '64d57e90-7e8a-4315-acec-dcbeac1da835', '리운과의 관계', '5년간 매일 보리차를 따라줌. 리운은 최근 처음으로 ''오늘도 따뜻하네요'', ''내일도 따뜻하게 부탁드려요'', ''내일 봐요'' 같은 말을 하기 시작.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('f73e68ad-765d-4d98-a3ff-d9db09e8047c', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '한지섭', NULL, '남', '40대 초반 (사망 시)', '구체적 외모 묘사 없음.', '', '생전에는 따뜻하고 말이 많았으며, 동료들과 잘 어울리는 사람이었음. 리운과는 기질이 정반대였지만 늘 리운을 신경 썼고, 혼자 밥 먹고 있으면 도시락 들고 와서 옆에 앉던 사람.', '리운보다 두 해 먼저 자격을 취득한 선배 보관사. 1화 새벽에 자택에서 사망(공식 사인: 심장마비, 동료들은 진실을 짐작). 작년 가을부터 휴직 상태였음. 죽기 전 마지막 몇 달 동안 비공식 루트로 자기 의뢰인들의 가장 무거운 기억을 다른 보관사들에게 넘기고 있었으며, 그중 가장 무거운 것들을 의뢰인 6번(40대 여성 보관사)에게 넘겼다. 리운에게 편지를 남김 — ''언젠가 못 버틸 날이 오면, 누군가에게 가세요. 못 버티겠다고 그 한 마디만 하면 돼요.''', 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('58bbd3f0-cda0-4397-9f93-0af8d608fcb0', 'f73e68ad-765d-4d98-a3ff-d9db09e8047c', '직업', '기억 보관사 (사망)', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('4e8d6a0c-5852-4225-8b54-a388ffb5e7d3', 'f73e68ad-765d-4d98-a3ff-d9db09e8047c', '리운에게 남긴 마지막 질문', '복도에서 마주쳤을 때 — ''리운 씨는 어떻게 버텨요?''', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('88640448-866d-4f7a-a183-57fa881ac2ea', 'f73e68ad-765d-4d98-a3ff-d9db09e8047c', '도하에게 남긴 말', '''도하 씨는 잘 우네요. 우는 사람이 오래 가요. 안 우는 사람이 더 위험해요.''', 3)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('37b6ca41-e1bf-4a12-9dcb-e4afbfa730b9', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '정선재', NULL, '남', '50대 후반', '구체적 외모 묘사 없음.', 'INTJ', '차분하고 말수 적음. 한지섭의 죽음을 누구보다 무겁게 받아들임. 리운의 능력을 인정하지만 너무 많은 의뢰를 받는 것을 우려함. 강요하지 않되 지켜보는 사람.', '본원장이자 1세대 보관사. 2031년 제도 시행 당시 첫 보관사 중 한 명. 현재는 의뢰를 받지 않고 관리·교육 업무만 담당. 비공식 루트의 존재를 알고 있을 뿐 아니라 그것을 처음 만든 사람 중 하나. 이 사실은 3부쯤 드러남. 리운에게 휴직을 권유하지만 강요하지 않음. 2부에서 리운에게 ''당신은 왜 보관사가 되었습니까?''라고 묻는 인물.', 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('88372920-f654-411b-bf88-d5516716aa71', '37b6ca41-e1bf-4a12-9dcb-e4afbfa730b9', '직업', '한국기억보존관리원 본원장 / 1세대 보관사 (현재 의뢰 미수행)', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('63b3f903-7dd7-4eae-949b-47d882130d23', '37b6ca41-e1bf-4a12-9dcb-e4afbfa730b9', '1세대의 비밀', '보관사 간 비공식 기억 이전 관행을 처음 만들고 묵인해온 인물. 제도 초기에 보관사들이 너무 많이 무너지는 것을 보면서 동료들끼리 기억을 나누는 관행을 키워왔다.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('444d4c53-119c-4147-bea6-45160204dee5', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '차은오', NULL, '여', '40대', '구체적 외모 묘사 없음.', '', '직업적으로 정확하고 집요함. 보관사들의 상태를 직감으로 읽는 능력이 있으며, 리운의 매번 ''정상''인 검진 결과가 거짓말이라는 것을 의학적 직감으로 알고 있음. 한지섭의 마지막 검진을 했던 의사로서 자기 책임을 느끼고 있어 리운에게 더 집요하게 매달림.', '본원 4층 의료지원실 보관사 전담 의사. 보관사들의 정신·신체 상태를 정기 검진하고 약을 처방함. 리운의 안정제도 차은오가 처방한 것. 한지섭에게 휴직을 권했지만 그가 죽었기 때문에 또 한 명을 잃고 싶지 않아서 리운에게 더 관심을 기울이는 인물. 1부 후반~2부에서 본격 등장 예정.', 6)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('63f445fe-1cd8-4b8f-a9ae-83f912b5e96b', '444d4c53-119c-4147-bea6-45160204dee5', '직업', '한국기억보존관리원 본원 의료지원실 보관사 전담 의사', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('a60c38b3-24fd-45f2-b883-675073203cf9', '444d4c53-119c-4147-bea6-45160204dee5', '리운 검진 시 습관', '매번 ''잠은 잘 주무세요?'', ''최근에 우는 일은 있으셨어요?'' 같은 질문을 살짝 떠봄. 리운은 매번 ''괜찮습니다''라고 답함.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('8d164aa8-4ba5-4cb2-b579-8c5b450d7393', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '박이수', NULL, '남', '40대 후반', '구체적 외모 묘사 없음.', '', '전직 경찰다운 과묵함과 경계심. 평소엔 거의 드러나지 않지만, 위기 상황에서 전면에 나서는 인물.', '본원 보안팀장. 전직 경찰. 보관사들이 가진 기억은 사실상 국가급 비밀이므로 외부 위협으로부터 보관사들을 보호하는 역할. 1부에서는 배경 인물로, 2부 후반~3부에서 보관소가 외부 세력의 표적이 될 때 큰 역할 예정.', 7)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('76d12f2e-96c4-4356-a72d-4b0e5e556e5d', '8d164aa8-4ba5-4cb2-b579-8c5b450d7393', '직업', '한국기억보존관리원 본원 보안팀장 / 전직 경찰', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('a82a526e-b14c-4579-a158-1c297a418c32', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '조유라', NULL, '여', '28세', '구체적 외모 묘사 없음 (1부 후반에 등장 예정).', 'ENFJ', '밝고 말 많고 감정 표현이 풍부함. 의뢰인의 기억을 받을 때마다 울지만, 다음 날 다시 출근해서 의뢰를 받음. 리운의 정반대. 어머니가 알츠하이머로 기억을 잃어가는 것을 보며 자란 배경 때문에 기억의 무게를 누구보다 잘 알고 있음.', '신입 보관사. 1부 후반(20화 전후)에 본원 발령. 정선재 원장이 리운에게 멘토를 부탁함. 리운에게 ''보관사로서의 다른 길''이 가능하다는 것을 보여주는 거울 같은 인물. 로맨스 라인이 아니라 동료이자 거울. 2부에서 리운에게 ''왜 이 일을 하세요?''라고 물으며 리운의 내면 변화를 자극하는 역할.', 8)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('1249d428-e000-4145-8e73-40e6b2efcde6', 'a82a526e-b14c-4579-a158-1c297a418c32', '직업', '기억 보관사 (신입, 1부 후반 발령 예정)', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('592e2b77-3cbe-4010-8df1-465111963526', 'a82a526e-b14c-4579-a158-1c297a418c32', '보관사가 된 이유', '어머니의 알츠하이머. ''잃어가는 사람들을 봤기 때문에, 지키는 사람이 되고 싶어서.''', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('840254cb-bda7-4450-9de3-8fefffd9620f', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '윤재희', NULL, '여', '33세', '구체적 외모 묘사 없음 (2부 초반에 등장 예정).', '', '끈질기고 직관이 강함. 한지섭을 막지 못한 죄책감을 안고 있으며, 다음 보관사가 무너지는 걸 막고 싶어 함. 리운에게 ''선생님은 다음 한지섭이에요''라고 직접 말하는 사람.', '전직 다큐멘터리 PD. 보관사 제도에 관한 다큐를 만들다가, 한지섭의 죽음 후 ''보관사들은 왜 무너지는가''를 묻는 다큐로 방향 전환. 한지섭과 개인적으로 가까웠으며 마지막으로 무너지는 모습을 옆에서 봄. 리운에게 인터뷰를 요청하며 접근, 리운의 일상에 외부 변수를 던지는 인물. 잠재적 로맨스 라인이 될 수 있으나, 전형적 로맨스가 아니라 ''서로를 구원하려는 두 사람''의 관계. 3부에서 리운의 과거 사고에 관한 옛 기사를 우연히 발견함.', 9)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('2db4b084-2c51-45e7-8fd1-62bbb3b1a236', '840254cb-bda7-4450-9de3-8fefffd9620f', '직업', '전직 다큐멘터리 PD', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('b4cb1ebb-926b-4d12-b811-4e9929d5ed44', '840254cb-bda7-4450-9de3-8fefffd9620f', '한지섭과의 관계', '다큐 인터뷰를 핑계로 만났지만 점점 친구가 됨. 한지섭이 마지막으로 무너지는 모습을 옆에서 봤고, 막지 못한 죄책감이 있음.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('5f7f6ca1-1137-4ada-8f72-9a7f0a62fc31', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '서리운의 여동생', NULL, '여', '20세 (사망 시)', '짧은 단발머리 (사고 직전에 머리를 자름). 셀카에서 밝게 웃고 있는 얼굴.', '', '직접 등장하지 않으나, 셀카 메시지(''오빠 나 머리 잘랐어 어때'')에서 밝고 장난기 있는 성격이 암시됨.', '리운의 여동생. 리운보다 어린 나이에 사고로 사망. 리운의 침대 머리맡 서랍에 그녀의 셀카 사진 한 장이 보관되어 있으며, 리운은 잠들기 전 가끔 그 사진을 꺼내 봄. 리운이 보낸 마지막 답장(''그냥 그래'')을 리운은 평생 후회하고 있음.', 10)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('22547b39-6603-4b48-83c2-2ca187a95bf4', '5f7f6ca1-1137-4ada-8f72-9a7f0a62fc31', '리운에게 보낸 마지막 메시지', '''오빠 나 머리 잘랐어 어때''', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('9705c412-06ce-48fc-b851-979947c7840b', '5f7f6ca1-1137-4ada-8f72-9a7f0a62fc31', '사고 당시 디테일', '뒷좌석에서 어머니 귀에 이어폰 한쪽을 꽂아주며 노래를 들려주고 있었음. 리운은 그 노래를 평생 못 들음.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('8cc395a4-2cdf-43d3-8794-623b8a1e10ce', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '세계관 개요', '근미래(2031년). 기억을 추출·이식하는 기술이 개발되었으나, 기억의 감정·맥락·질감을 보존할 수 있는 저장 매체는 오직 인간의 뇌뿐이다. 디지털 매체에는 기억의 정보만 저장되고 감각은 소실되기 때문에 실용화에 실패했다. 이에 따라 타인의 기억을 자신의 뇌에 이식받아 보관하는 ''기억 보관사''라는 직업이 국가 자격 제도로 만들어졌다. 일반 대중은 보관사들을 ''메모리언''이라는 별명으로 부르며, 이 별명에는 존경과 거리감, 그리고 ''외계인 같다''는 은근한 배제의 뉘앙스가 함께 섞여 있다.', 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('c9421611-a14c-4e68-a7b1-c1ca81adfc2c', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '리운의 사적 공간 — 오피스텔', '서울 마포구, 오피스텔 8층, 원룸 15평형. 리운이 일부러 작은 공간을 골랐다(사람이 채워야 할 공간이 적을수록 비어 있어도 티가 안 나니까). 침대 하나, 작은 책상, 옷장, 미니 냉장고. 식탁 없음(밥은 책상에서). TV 없음. 라디오 한 대(거의 안 켬). 책장에 업무 매뉴얼과 오래된 시집 몇 권(한 번도 펼쳐보지 않음). 벽에 아무것도 없음. 가족 사진도 없음. 침대 머리맡 서랍에 안정제 통과 여동생 셀카 사진 한 장이 있다. 최근 보리차 티백이 추가됨.', 22)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('a609d638-76aa-4b84-8e01-f22ec88f0101', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '리운의 생활 패턴', '하루가 분 단위로 똑같음. 같은 시간 기상, 같은 지하철(7호선 다섯 번째 칸 끝자리), 같은 시간 점심(회사 근처 김밥집, 최근 우동이 추가됨), 같은 시간 퇴근, 같은 시간 취침. 운전을 하지 않음(면허증은 지갑에 있으나 운전대를 잡지 않음). 수면 평균 4~5시간, 자주 깸. 꿈을 거의 기억하지 못함(수면 중 꿈 회상 억제 — 무의식적 자기방어). 주말에는 토요일 한강 산책 2시간, 일요일은 거의 외출하지 않음. 친구 없음, 가까운 친척은 작은아버지 한 분뿐(1년에 한 번 명절 통화).', 23)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('019d32f9-dc06-4f3b-97b5-82c420436b96', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '전체 구조 (70~75화 예상)', '1부(1~20화): ''흔들리지 않는 사람''의 일상. 의뢰인 8사이클. 한지섭의 죽음으로 시작, 미세한 균열 누적, 조유라 발령, 리운의 첫 의뢰 거절로 마무리. 2부(21~40화): 균열의 시작. 조유라·윤재희 등장, 검은 원피스 여자 재등장, 비공식 루트 사건, ''나도 맡길 수 있는가''라는 질문. 3부(41~58화): 과거의 그림자. 윤재희가 옛 기사 발견, 리운의 가족과 사고 존재가 부분적으로 드러남, 정선재의 질문, 윤재희와의 여행에서 첫 고백. 4부(59~75화): 마주봄과 결말. 리운의 사고와 닮은 의뢰, 첫 무너짐, ''못 버티겠다''는 한 마디, 과거의 진실 전부 드러남, 기억을 용서하는 결말.', 24)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('cb48d63f-522d-4fe7-b747-321c4ecb4b81', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8cc395a4-2cdf-43d3-8794-623b8a1e10ce', '한국기억보존관리원', '보건복지부 산하 특수공공기관. 2031년 설립. 정식 명칭은 ''한국기억보존관리원''이며 사람들은 줄여서 ''관리원''이라 부른다. 본원은 서울 종로구 소재 4층짜리 건물이며, 부산·대구·광주에 지원이 있다. 기억 보관사의 배치, 의뢰 관리, 보관사 건강 관리, 보안 업무를 총괄한다.', 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('05bc79ac-a3c7-4eed-9606-f4b9ed21edd6', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', 'cb48d63f-522d-4fe7-b747-321c4ecb4b81', '본원 건물 구조', '1층: 의뢰인 접수처, 대기실(카페 같은 분위기로 의도적으로 따뜻하게 꾸며져 있음), 안내데스크. 2층: 행정실, 보안팀. 3층: 보관사 개인 사무실(각 보관사마다 개인 사무실 배정, 안쪽에 작은 이식실 딸려 있음). 4층: 의료지원실, 심리상담실. 외관은 평범한 사무용 빌딩이나 보안은 엄격하다.', 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('70c490cd-9e80-40ce-8413-5039e98ae45d', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8cc395a4-2cdf-43d3-8794-623b8a1e10ce', '기억 보관사 제도', '국가 자격. 전국에 서른두 명만 존재한다. 본원에 일곱 명(한지섭 사망 후 여섯 명), 지원에 다섯에서 여섯 명씩 배치. 보관사는 의뢰인의 기억을 자신의 뇌에 이식받아 보관하는 직업이며, 계약 형태에 따라 일시 보관·영구 보관·조건부 반환 등이 가능하다. 의뢰인들이 맡기는 기억은 대부분 고통스러운 것들(사고, 이별, 죄책감, 학대, 상실)이다.', 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('80d5a235-d9f7-49a8-bbbe-696c9172dc63', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '70c490cd-9e80-40ce-8413-5039e98ae45d', '보관사의 직업적 대가', '타인의 기억을 받으면서 정체성 혼란이 누적된다. 내 감정인지 받은 감정인지 경계가 흐려지며, 보관사들의 평균 활동 기간은 짧고 정신적으로 무너지거나 직업을 떠나는 사례가 많다. 한지섭의 죽음이 이를 단적으로 보여준다.', 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('8215ba06-b3d7-4d45-a815-1856a33b926e', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8cc395a4-2cdf-43d3-8794-623b8a1e10ce', '기억 이식 기술', '뇌의 해마와 편도체에서 특정 기억의 신경 패턴을 읽어내고, 두 사람의 뇌파를 일시적으로 동기화시킨 상태에서 한쪽의 기억을 다른 쪽으로 옮기는 방식. 핵심 기술은 ''신경 패턴 동기화''. 기억은 단순한 정보가 아니라 감각·감정·맥락이 통째로 묶인 신경 패턴이므로, 이를 보존할 수 있는 매체는 같은 종류의 신경망, 즉 다른 사람의 뇌뿐이다.', 6)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('c19e2c30-f209-45b0-9b0d-5c516b38b3be', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8215ba06-b3d7-4d45-a815-1856a33b926e', '기억의 기술적 제약 — 분리 불가', '기억은 신경망 안에서 맥락과 함께 묶여 있어, 한 사건의 한 순간만 따로 분리해서 추출할 수 없다. 한 마디를 지우려면 그 말이 나온 맥락 전체와 그 말이 가져온 결과들까지 함께 추출되어야 한다. 이 때문에 의뢰인이 원하는 것보다 더 넓은 범위의 기억이 보관 대상이 되며, 좋은 기억도 함께 사라질 수 있다.', 7)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('00d360d5-b466-46af-beba-b8ed383d78dc', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8215ba06-b3d7-4d45-a815-1856a33b926e', '이식 장비', '노트북 정도 크기의 본체와, 양쪽 사람의 관자놀이에 부착하는 두 쌍의 실리콘 패드, 머리띠 형태의 고정 장치로 구성. 본체에 작은 화면이 있어 동기화 진행률과 기억 전송량이 실시간으로 표시된다. 이식 중 보관사는 자기 화면을 볼 수 없고 의뢰인 쪽 화면만 보임(의뢰인 안심용 설계).', 8)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('638c5978-1993-486e-a0fc-83073eaf9847', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8215ba06-b3d7-4d45-a815-1856a33b926e', '이식 소요 시간', '기억의 양에 따라 다름. 평균 10~30분. 5년치 연애 같은 큰 기억은 20~25분, 짧지만 강렬한 트라우마 한 사건은 5~10분. 시간이 짧다고 가벼운 것은 아니며, 강도가 높은 기억은 짧아도 보관사에게 큰 부담을 준다.', 9)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('e6502301-4413-454f-82c0-8460ca96640c', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8215ba06-b3d7-4d45-a815-1856a33b926e', '의뢰인의 이식 경험', '이식 중 의식이 있으며 약간의 어지러움과 기시감을 느낌. 이식 후 해당 기억 부분이 비어 있는 상태가 됨(''기억나지 않는다''가 아니라 ''기억 자체가 없다''). 주변 사람이 관련 사실을 말해도 전혀 떠올리지 못함. 부작용으로 이식 직후 약간의 두통과 멍한 상태가 24시간 지속되며, 드물게 우울감·공허감이 며칠 가는 경우도 있음.', 10)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('3dd32b58-fab1-4b30-a342-03143a9f6d35', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8215ba06-b3d7-4d45-a815-1856a33b926e', '보관사의 이식 경험', '이식 중 의뢰인의 기억이 자기 머릿속으로 흘러들어오는 것을 직접 느낌. 영상뿐 아니라 감각과 감정까지 함께 들어옴. 이식 직후 기억이 ''아직 정리되지 않은'' 상태이며, 며칠에 걸쳐 자기 머릿속에서 새 기억이 자리를 잡음. 이 기간 동안 자기 감정과 받은 감정의 구별이 흐려지는 혼란을 겪으며, 보관사들은 이를 관리하는 자기만의 방법을 가지고 있다(운동, 술, 명상 등). 리운은 아무것도 안 하고 그냥 견딤.', 11)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('3d6d5c8d-4b80-4450-985e-1dc50d712bf0', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8215ba06-b3d7-4d45-a815-1856a33b926e', '보관 상태 확인', '이식 후 24시간 안에 보관사가 받은 기억을 한 번 ''훑어보는'' 절차. 기억이 제대로 보관되었는지, 손실된 부분은 없는지 확인하는 작업. 평소 1시간 이상 소요. 이식은 기계가 자동으로 수행하지만 확인은 보관사가 자기 의식으로 직접 들여다봐야 하기 때문에 시간이 더 걸린다. 형식적으로는 ''필요한 부분만'' 보지만, 사실상 한 번 훑으면 거의 모든 내용을 알게 된다. 보관사들 사이의 공공연한 비밀이며, 의뢰인에게는 알리지 않는다.', 12)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('55821b95-ec0d-489f-ad80-8454edd5fc14', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '3dd32b58-fab1-4b30-a342-03143a9f6d35', '잔여감', '받은 기억의 감정이 일시적으로 보관사 자기 감정처럼 느껴지는 현상. 베테랑 보관사들은 ''잔여감''이라 부른다. 시간이 지나면 가라앉으며, 빠르면 몇 시간, 길면 며칠. 보관사의 컨디션이나 기억의 종류에 따라 잔여감의 깊이가 다르다.', 13)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('1a0408c9-379c-4c46-9013-2a3f9a1573ac', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '70c490cd-9e80-40ce-8413-5039e98ae45d', '영구 보관', '의뢰인이 기억을 돌려받을 의사 없이 영구히 맡기는 계약. 보관사가 사망할 때까지 그의 뇌 안에 존재하며, 보관사 사망 시 함께 소멸한다. ''위탁된 화장''에 비유할 수 있다.', 14)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('940d9437-d1a8-4b70-bccb-8f53211806a3', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '70c490cd-9e80-40ce-8413-5039e98ae45d', '일시 보관과 반환', '의뢰인이 일정 기간 후 기억을 돌려받는 계약. 반환 절차는 이식과 동일한 방식으로 진행. 돌려받은 기억은 원래보다 약간 더 객관적으로 느껴진다고 함(한 번 다른 사람을 거쳐 왔기 때문에 거리가 생김). 이것이 일시 보관의 치유 효과. 단, 대부분의 의뢰인은 돌려받았을 때 ''새로움''이나 ''설렘''을 기대하지만, 실제로는 기억이 원래 자리로 돌아가기만 할 뿐 새롭게 느껴지지 않는다. 기억은 어디로 갔다가 어디로 돌아오는 것이 아니라 그저 자기 자리에 있는 것이다.', 15)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('d04b1346-5edb-4054-8131-0f38068f261c', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '70c490cd-9e80-40ce-8413-5039e98ae45d', '보관사 공식 규정', '보관사는 자기 기억을 타인에게 맡길 수 없다. 보관사 간 기억 이전은 전면 금지. 적발 시 자격 박탈. 보관사는 의뢰인의 행위에 대해 도덕적 판단을 하지 않으며, 의뢰인의 신체에 접촉하지 않는 것이 원칙. 의뢰인 정보는 익명이 원칙이며, 보관사가 알 수 있는 것은 나이·성별·의뢰 종류뿐이다. 의뢰 내용은 의뢰인 본인에게도 사후 공개하지 않음(영구 보관의 경우 의뢰 효과를 무효화할 수 있기 때문).', 16)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('35a1c0dd-ca3f-4c29-99ed-962feecfee1b', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '70c490cd-9e80-40ce-8413-5039e98ae45d', '비공식 루트 (보관사 간 기억 이전)', '공식적으로는 금지되어 있지만, 보관사들 사이에서 비밀리에 이루어지는 기억 이전 관행. 무너지기 직전의 보관사가 동료에게 가장 무거운 기억을 넘기는 일종의 생존 수단. 모든 보관사가 알고 있지만 입 밖에 내지 않으며, 이 비밀 자체가 보관사들을 묶는 동족의식이자 동시에 약점이다. 정선재 원장이 제도 초기에 이 관행을 처음 만든 사람 중 하나. 적발 시 자격 박탈이므로 누군가가 이 사실을 외부에 알리면 협박 카드가 될 수 있다. 리운은 이 루트의 존재를 알지만 자기 기억을 위해서는 절대 사용하지 않기로 결정했다.', 17)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('0be95bfa-0388-45ae-a94b-bdc8cd670b98', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '70c490cd-9e80-40ce-8413-5039e98ae45d', '의뢰인 최소 나이', '보관사 제도에서 의뢰인의 최소 나이는 19세. 아동의 경우 보관 의뢰는 부모 동의와 별도 심의가 필요하며 절차가 복잡하다.', 18)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('1d75a04f-ac35-4ee6-b597-7f6442d8fdae', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '70c490cd-9e80-40ce-8413-5039e98ae45d', '기업 의뢰', '산업 재해 후 회사 차원에서 직원들에게 보관사 의뢰를 권유하는 사례가 점점 늘어나고 있음. ''산재 후 패키지''로 자리 잡는 추세. 비용은 회사가 부담. 직원의 의지가 아니라 회사의 결정으로 오는 의뢰는 본질적으로 강요에 가깝다. 의뢰인 본인이 원하지 않으면 보관사가 미진행으로 처리할 수 있으며, 관리원에서 공식적으로 거절 의사를 전달해줄 수 있다.', 19)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('b28e2ae1-f48f-429d-8af3-6f43201dab77', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', 'cb48d63f-522d-4fe7-b747-321c4ecb4b81', '보관사 사무실 — 리운의 사무실', '3층 끝방. 다른 사무실들과 떨어진 위치(리운이 일부러 가장 구석을 골랐음). 깔끔함을 넘어 휑할 정도로 비어 있음. 책상 하나, 의자 두 개, 의뢰인용 소파, 책장 하나(업무 매뉴얼만 꽂혀 있음). 벽에 그림도 액자도 없음. 창문 하나가 동쪽으로 남. 의뢰인을 만나기 전 자기 표정을 점검하기 위한 작은 거울이 한쪽에 있음. 서랍 안에 빈 USB 케이스들이 가지런히 정리되어 있고(3년치 의뢰 흔적), 한지섭의 편지도 그 안에 보관. 최근 티슈 상자가 서류함 옆에서 의뢰인 쪽 책상 모서리로 옮겨졌다.', 20)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('b76102b2-af73-4a74-a012-e4426cea9cef', '3605f3e5-d13b-4b09-8abe-2dbda51ff90c', 'fa20f003-1140-40a5-969d-66b74f659dcc', '70c490cd-9e80-40ce-8413-5039e98ae45d', '보관사들의 미신', '의뢰가 아닌데도 사람의 강한 감정이 손을 통해 흘러들어올 때가 있다는 보관사들 사이의 미신. 과학적으로 증명된 적은 없지만 보관사들은 다 알고 있다. 만원 지하철에서 누군가의 손목이 닿았을 때 알 수 없는 슬픔이 훅 들어온다는 것. 리운은 이 때문에 7호선 다섯 번째 칸 끝자리(사람 손이 가장 적게 닿는 자리)를 골라 앉는다.', 21)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- dummy-work-3
INSERT INTO work (id, writer_id, title, author_name, description, status, sort_order)
VALUES ('ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '만년취준생', 'Fixture Writer', '??: 현대
??: 현대판타지, 무속, 방송
?: 긴박한, 유머러스, 몰입감
??? ??: 3인칭 전지 시점(다시점). 인터넷 방송 채팅 로그가 본문에 직접 삽입되는 독특한 구조. 대화체 비중이 높고 구어체 사용. 신점/무속 요소와 현대 인터넷 방송 문화가 결합. 시청자 반응이 서사 전개의 핵심 장치로 작동.', 'draft', 3)
ON CONFLICT (id) DO UPDATE SET
    writer_id = EXCLUDED.writer_id,
    title = EXCLUDED.title,
    author_name = EXCLUDED.author_name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('3519e0dc-a624-447e-8e8b-05f31afca804', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '1화', 'draft', '박지훈은 편의점 앞 간이 의자에 앉아 두근거리는 마음으로 휴대폰을 확인했다.

"제발!"

[……귀하의 열정과 우수한 역량에도 불구하고 당사의 사정으로 인해 함께하지 못하여 유감스럽게 생각합니다.]

오늘로 정확히 100번째.
이제는 눈 감고도 외울 수 있는 문구였다.
박지훈은 그대로 캔맥주를 한 모금 들이켰다.
그러나 탄산은 밍숭맹숭하기만 했다.

"아니, 난 도대체 언제쯤 볼을 수 있는 건데!"

그가 얼굴을 일그러뜨린 채 원망을 토해 낼 때였다.

지이이잉-

아무렇게나 놔둔 휴대폰이 울려댔다.
누군가 싶어 확인해 보니 [김우식]이라 되어 있었다.
그와는 떼려야 뗄 수 없는 불알친구.
하는 수없이 전화를 받았다.

"어? 왜?"
"목소리 죽어가는 거 보니 떨어졌구먼."
"야. 약 올리려고 전화했나?"
"시끄럽고. 동네에 포장마차 있지? 거기로 와. 술 한잔 사줄게."
"……고맙다."

박지훈은 빈 맥주캔을 재활용통에 넣은 뒤 몸을 일으켰다.
등까지 들려붙은 뱃가죽에서 꼬르륵거리는 소리가 나고 있었다.

***

동네에 있는 포장마차.
꼼장어에 소주를 시켜놓고 소주잔을 주고받았다.

"크으."

그대로 원샷을 한 뒤 눈을 찡그릴 때였다.
맞은편에 앉아 있던 우식이 물었다.

"이제 어떻게 하려고?"
"뭐, 어쩌겠어. 될 때까지 지원해봐야지."

백 번 찍어 안 넘어가는 나무는 있어도 백한 번은 다를 것이다.
박지훈은 그렇게 생각했다.
그때 우식이 입술을 떼었다.

"너 어릴 때 생각나?"
"뭐?"
"옆집 무당 할매가 그랬잖아. 너 박수될 팔자라고."
"아씨, 그거 다 개소리라고 몇 번을 말해. 그랬으면 진작에 신병을 앓고 내림굿을 받았겠지."
"그거야 그렇지만 너도 이상하다고 생각하지 않나? 네 스펙으로 백여 군데나 떨어진다고? 한 곳도 최종합격 못한다는 건 말이 안 되잖아."

박지훈은 한숨을 내쉬었다.
그도 어렴풋이 느끼고 있었다.
서울 상위권 4년제에 학점은 4.1.
뛰어난 어학 성적에 다수의 자격증까지.
그런데 백 군데 넘게 지원하고도 최종합격이 단 한 번도 없었다.
정말로 괴이한 일이었다.

"야, 그래도 박수 될 팔자라서 회사원이 못 된다는 게 말이 되나? 지금이 무슨 조선시대도 아니고."

박지훈이 고개를 절레절레 젓자 우식이 넌지시 말했다.

"그럼 방송이나 한 번 해보든가."
"뭐? 방송? 너처럼?"
"어. 너 학창 시절에도 고민상담 이런 거 잘했잖아. 썰 풀기도 잘했고. 그런 걸 시청자 상대로 하는 거야. 생각보다 안 어려워. 시청자 수 늘어나면 돈도 꽤 되고."

박지훈은 탐탁지 않은 얼굴로 대답했다.

"그야 너는 몇 년 전부터 방송한 고인물이니까 가능한 거고. 요즘은 인방도 레드오션이라던데?"

너튜브만 봐도 그렇다.
각 분야에서 날고 기던 고인물들이 새롭게 뛰어들고 있는 중이다.
괜히 너튜버 컷이 높아졌다는 이야기가 나오는 게 아니다.

"걱정 마. 내가 네 방송 밀어줄게."

우식의 말에 지훈은 귀가 솔깃했다.
맨땅에 박치기는 좀 그렇지만, 우식이 도와준다면 이야기가 다르다.

"이래서 보자고 한 거였나?"
"네가 오늘 합격했으면 축하주 사주려고 했는데 떨어졌다니까 검사검사 추천해주는 거야. 아님 다음 면접 때까지 방구석에 처박혀서 게임만 할 거잖아."

박지훈은 눈매를 좁혔다.
어릴 때부터 같이 커서 그런가?
서로가 서로에 대해 너무 잘 알고 있는 게 문제라면 문제였다.

"알았어. 한 번 해볼게. 근데 안 내키면 그냥 바로 접을 거야."
"일단 해봐. 또 알아? 그게 네 적성에 맞을지?"
"글쎄다. 그럴 일은 딱히 없을 것 같은데……."

그때까지만 해도 지훈은 그렇게 확신하고 있었다.

***

며칠 뒤, 컴퓨터 앞에 앉은 지훈은 고개를 절레절레 저었다.
모니터 위에 꽂혀 있는 웹캠, 키보드 옆에 놓여 있는 마이크, 그리고 고가의 헤드셋까지.
이 모든 게 우식이 직접 세팅해 준 것들이었다.

"도대체 왜 이렇게까지 잘해주는 건데?"

너무 궁금해서 물었다.
그러자 녀석의 대답이 가관이었다.

"보름 뒤에 대회 열리는 게 있는데 네가 나하고 같이 참가했으면 해서."
"그거하고 방송하고 뭔 상관이야!"
"스트리머만 참가할 수 있거든. 그러니까 최소 20시간은 방송 채워야 해. 알았지?"
"뭐? 20시간?"
"어. 더 채우면 좋고. 여하튼 이따가 방송 켜면 뻐꾸기 날려줄 테니까 잘해봐."

뚝-

전화가 끊겼다.
박지훈은 그동안 우식이 왜 이렇게 잘해줬는지 그제야 알 수 있었다.

하지만, 조금이라도 마음에 내키지 않으면 바로 그만 둘 생각이었다.

"그럼 켜볼까?"

박지훈은 오션(Ocean) 홈페이지에 들어간 뒤 방송 시작 버튼을 눌렀다.

[만년취준생 님의 방송이 시작되었습니다.]

알림이 뜬 그 순간 생각지도 못한 일이 일어났다.
갑자기 온몸이 으슬으슬 떨렸다.
이마에서는 식은땀이 흘러내렸고, 열이 순식간에 치솟았다.
지훈은 본능적으로 깨달았다.
이게 단순한 몸살 같은 게 아니라는 것을.
박수 될 팔자라는 말을 듣고 태어난 뒤, 단 한 번도 겪어본 적 없는 신병이 처음으로 도진 것이었다.
그러기도 잠시, 채팅방에 시청자들이 하나둘 몰려오기 시작했다.

-jmd1311 : 1빠
-bvk0014 : 난하요 우식형 방송 보고 옴
-29세무직 : 난하
-아주카라 : 여긴 뭐하는 방임?
-망나니아이 : 썰방임?

난하, 는 난민 하이라는 뜻이었다.
우식이 지난 번 포장마차에서 한 약속을 지킨 것이다.
우르르 몰려오는 시청자들을 향해 인사를 건네려 할 때였다.
계속해서 머리가 어지럽고 열이 펄펄 끓었다.
그러던 어느 순간.

쓰우우욱-

범상치 않은 기운이 몸 속으로 빨려 들어오는 게 느껴졌다.

"으으"

지훈은 좀처럼 정신을 차릴 수 없었다.
그때였다.
펄펄 끓던 열이 갑자기 씻은 듯이 내려갔다.
동시에 지훈은 몽롱한 정신으로 뭐에 홀린 것처럼 모니터를 쳐다봤다.

-jmd1311 : 아니 인사도 없음?
-아주카라 : 어 님 괜찮음?
-29세무직 : 얼굴 왜 저럼 ㄷㄷ

왁자지껄한 채팅창은 난장판이 따로 없었다.
참다못한 지훈이 입술을 열었는데, 터져 나온 목소리는 본인의 것이 아니었다.

"시끄럽다!"

낮게 깔린 목소리가 마이크를 타고 흘러나갔다.

"쓸데없는 소리 하지 말고 볼 사람만 남아라."

평소였다면 이런 식으로 말하진 않았을 것이다.
그런데 방송이 켜진 순간부터는, 말이 내 의지보다 먼저 튀어나왔다.
더 짧고, 더 차갑게.
채팅창이 순간 정적에 휩싸였다.
그것도 잠시 성난 채팅들이 잇따라 올라오기 시작했다.

-bvk0014 : 뭐야 ㅅㅂ
-29세무직 : 컨셉 이거임? ㅋㅋ
-망나니아이 : 썰은 안 품?
-jmd1311 : 첨 보는데 왜 반말이냐
-백무린 : 혼자 해라 ㅅㅂ
-샤랄라 : 우식이 친구라길래 왔더니 뭐냐

우르르 빠져나가는 시청자들.
그때 한 시청자가 물었다.

-아주카라 : 그래서 뭐하는 방송인데

채팅창을 지켜보던 지훈이 대답했다.

"여긴 점 보러 오는 데다."

그리고 그는 특정 닉네임을 언급하며 입술을 떼었다.

"거기 29세무직. 너, 지금 웃을 때가 아닐 텐데?"

***

순간, 채팅창에 물음표가 도배됐다.

-아주카라 : 점방이었나?
-bvk0014 : 우식이 친구가 박수라고? ㅋㅋ
-29세무직 : 나요? 왜요?
-꽈뚜루뚜루 : 벌써 있어보이는 척 들어가네
-jmd1311 : 또 시작이네 ㅋㅋ
-박열 : 진짜 맞히면 인정

지훈은 그들의 비아냥거림에는 관심도 없다는 듯 화면 너머 29세무직이라는 닉네임 뒤에 숨은 한 사람의 운명만을 응시했다.
그러자 지훈의 시야 위로 기이한 장면들이 겹쳐 보이기 시작했다.
열 살쯤 된 어린 소년이 자전거를 타고 가다가 신호를 위반한 봉고차에 치인다.
잠시 후 한 중년인이 다리가 부러진 아이를 들러메고 허겁지겁 뛰기 시작했다.
그리고 병원에서 이어진 긴급 수술.
지훈은 낮게 깔린 목소리로 입술을 떼었다.

"너 열 살때 교통사고 났었지? 그때 다리 병신될 뻔했던 것을 네 아버지가 살렸어."

채팅창이 잠시 멈칫했다.

-jmd1311 : 뭐야 이거 맞음?
-박열 : 소름인데 ㄷㄷ
-샤월 : 과거도 보나?

그때 29세무직이 채팅을 쳤다.

-29세무직 : ㅈㄹ마
-jmd1311 : 진짜 맞나본데?
-bvk0014 : ㅂㅅ들 또 몰입하네 짜고치겠지
-29세무직 : 개소리 ㄴㄴ

29세무직이 악다구니를 쓸 때, 지훈 눈에 또다른 게 보였다.

"어라? 이 새끼, 불효자였네. 어머니는 무릎 아픈데 너는 연락도 잘 안 하지? 반성 좀 해야겠다."

-29세무직 : 너 뭔데 우리 엄마는 들먹임?

"뭐하긴. 네 신점 봐주고 있지. 아, 병원 모시고 가서 위장도 함께 검사해. 거기서 뭐가 나올 거니까."

-29세무직 : 개새끼야! 우리 엄마는 건들지 말라고!

그러나 지훈은 멈출 생각이 없었다.
아직 이야기하지 못한 게 한 가지 더 남아 있었기 때문이다.

"내일 오후 2시."

지훈이 입술을 뗐다.

"면접 보러 가지 마라."

채팅창이 잠시 멈칫했다.
29세무직이 면접 보러 간다고 말한 적이 없었기 때문이다.

-jmd1311 : 내일 면접 진짜 감?
-박열 : 뭔 사고 나길래 저러는 건데
-29세무직 : 잠깐 나 내일 면접 있는 건 어케 아는데 왜 가지 말라는 건데!

지훈은 절규하는 그를 향해 쐐기를 박았다.

"가면 내일이 네 제삿날이 될 테니까."', 1095, 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('1208428f-253d-4aad-892d-d0115e503fbd', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '2화', 'draft', '-29세무직 : 뭐? 내 제삿날이라고? 좆까!

그 순간, 지훈의 시야가 다시 한번 일그러졌다.
비릿한 연기 냄새와 귀를 찢는 듯한 급브레이크 소음이 고막을 때렸다.
횡단보도를 가로지르던 905번 버스.
비틀거리던 대형 트럭이 옆구리를 처박았다.
유리가 터지고 사람들이 튕겨나갔다.
그 한복판에 피를 흘리며 쓰러진 남자.
29세무직이었다.

"가지 말라면 가지 마!"

말을 내뱉는 순간 두통이 지끈거렸다.
눈이 충혈되면서 코 아래가 뜨끈거렸다.

-jmd1311 : 뭐야 코피까지 흘리네
-박열 : 아니 진짜인가?
-29세무직 : 장난치지 말라고 ㅅㅂ

지훈은 서둘러 방송을 종료했다.
더 버티다간 정말 몸이 망가질 것 같았다.

딸깍.

화면이 꺼짐과 동시에 거짓말처럼 신안(神眼)이 닫혔다.
몸을 감싸고 있던 서늘한 기운도 빠져나갔다.
동시에 입안을 맴돌던 차가운 말투도 함께 멈어지는 듯했다.
신점 볼 때 뱉은 말은 꼭 내 것이 아닌 것처럼, 낯설게만 느껴졌다.
하지만 안심할 틈이 없었다.
무리하게 신안을 열어젖힌 반동이 한꺼번에 몰려온 것이다.

"아, 윽……!"

전신이 찢겨나가는 듯한 고통에 지훈은 억지로 이를 악물었다.
그때 책상 위에 놔둔 휴대폰이 요란하게 울렸다.
김우식이었다.
지훈은 이를 악문 채 전화를 받았다.

"어…… 왜?"
"아니, 네 방송 보려고 했는데 오프라인이길래. 어떻게 된 거야?"
"조금 전에 껐었는데…… 지금 몸 상태가 좋질 않아서 껐어."

그러자 우식이 투덜거렸다.

"아니, 내가 네 방송 밀어주려고 일찍 끄고 네 방송 보러 가달라고 한 건데 그렇게 방송을 끄면 어떻게 해!"

평소 같았으면 미안하다고 했겠지만, 지금 지훈은 숨을 쉬는 것조차 버거웠다.
시야가 벌겋게 달아올라 있었다.

"나…… 진짜 죽을 것 같으니까……."
"뭐? 야, 너 목소리가 왜 이래? 너 어디 아파?"
"…… 나중에. 나중에 말하자."

지훈은 대답을 기다리지 못하고 통화 종료를 눌렀다.
손가락 끝에서 감각이 사라지고 있었다.
간신히 침대 모서리를 붙잡고 몸을 끌었다.
하지만 거기까지였다.
그는 그대로 의식을 잃듯 쓰러지고 말았다.

***

같은 시각.
국내 한 대형 커뮤니티의 인터넷방송 게시판.
이곳은 인터넷방송과 관련된 이야기라면 뭐든 올라오는 곳이었다.
그런 이곳에 클립 하나가 새로 올라왔다.

제목 : (클립) 시청자 보고 면접 가면 죽는다고 예언한 스트리머

클립 내용은 오늘 처음 방송을 시작한 만년취준생의 방송 일부분을 다루고 있었다.
제목이 사람들의 호기심을 자극했는지, 클립은 올라온 지 몇 분 만에 인기글로 치고 올라갔다.
그리고 곧장 댓글이 쏟아졌다.

-asqq41 : 갑자기 눈 돌아가서 반말 찍찍하는 거 보소 ㅋㅋ 컨셉이면 잘 잡긴 했네
-모르굴 : 이거 진짜냐
-써면마스터 : 둘이 짠 거 아님? 원래 알던 사이일 수도 있잖아
-순살라면 : 그래서 저 사람 면접 갔대 안 갔대? 나라면 못 감
-agei : 개쫄리네 다시보기 남아있나
-우주교실 : 딱 봐도 컨셉이지 저걸 어케 다 맞힘 ㅋㅋ
-파에리스 : 홍보 좀 작작해라 하꼬방까지 왜 끌고 오나
-무음방 : 다음에 방송 켜면 나도 맞혀보라 해야지 ㅋㅋ
ㄴ꼬카 : 채팅 못 본 척 넘길 듯 ㅋㅋ
ㄴ무음방 : ㅋㅇ

인방갤 반응은 대체로 싸늘했다.
다만 모두가 한 가지를 궁금해하고 있었다.
29세무직은 정말, 다음 날 면접을 보러 갈까?

***

다음 날.
박지훈은 깊은 물속에서 천천히 떠오르듯 눈을 떴다.

"……으."

그는 작게 신음을 내며 몸을 일으켰다.
어젯밤 몸이 찢겨나갈 것 같은 고통에 그대로 정신을 잃었던 기억이 어렴풋이 떠올랐다.
그래서일까.
그는 잠시 숨을 죽인 채 자신의 몸 상태를 살폈다.

"……어라?"

이상했다.
분명 죽을 것처럼 아팠는데, 지금은 오히려 몸이 지나치게 가벼웠다.
두통도 없었고, 열이 끓던 감각도 감쪽같이 사라져 있었다.

"뭐야……."

박지훈은 멍한 얼굴로 손등을 내려다봤다.
어젯밤 코피를 흘렸던 탓에 손등에 말라붙은 핏자국이 희미하게 남아 있었다.
꿈은 아니었다.
분명히 실제로 겪은 일이었다.

"하룻만에 다 나은 건가?"

혼잣말을 중얼거리며 자리에서 일어섰다.
몸을 이리저리 움직여 봐도 아픈 곳은 전혀 없었다.
오히려 평소보다 컨디션이 더 좋았다.
늘 뻐근하던 어깨도 가볍고, 만성 피로에 찌들어 있던 눈도 맑아졌다.

"이럴 수가 있나?"

박지훈은 잠시 생각에 잠겼다.
어젯밤 방송을 켜자마자 신병 같은 게 찾아왔다.
그러더니 채팅창을 읽는 순간 이상한 것들이 보이기 시작했고, 남의 과거며 현재며 심지어 미래 비슷한 것까지 읽어냈다.
그러다 무리해서 신안을 쓴 반동으로 쓰러졌다.
그런데 지금은 아무렇지 않았다.

"……혹시."

머릿속에 떠오른 가설 하나.
박지훈은 급히 옷을 챙겨 입었다.

"진짜 신안이 트인 거면, 지금도 보여야 맞겠지?"

그는 서둘러 집을 나섰다.

***

바깥 공기는 제법 차가웠다.
하지만 가슴이 두근거리고 있었다.

''보일까?''

집 밖에 나온 그는 골목에서 마주친 동네 아주머니를 빤히 쳐다봤다.
그러나 아무것도 보이지 않았다.

"……왜 안 되지?"

박지훈은 고개를 돌려 편의점 앞에서 전자담배를 물고 있는 아르바이트생을 쳐다봤다.
이번에도 마찬가지였다.
아무것도 보이지 않았다.
지훈은 미간을 좁혔다.

''어제는 분명 보였는데…….''

이번엔 일부러 사람이 많은 대로변으로 나왔다.
횡단보도를 건너는 수많은 사람들.
하지만 누구를 봐도 어제 같은 환영은 전혀 떠오르지 않았다.

"이상하네. 분명 어제는……."

어젯밤 29세무직을 보던 순간이 떠올랐다.
채팅창 닉네임 너머로 기이한 장면들이 겹쳐 보였다.
사고, 피, 비명, 낯선 가족의 모습.
자신이 잘못 본 게 아니었다.
그런데 지금은 아무리 들여다봐도 아무것도 보이지 않았다.

"설마."

그의 등줄기를 타고 서늘한 감각이 스쳐 지나갔다.

"이거 인터넷방송에서만 되는 건가?"

그 순간, 퍼즐이 맞춰졌다.
방송을 켠 순간 찾아온 신병.
사람들 너머로 보였던 환영.
방송이 끝나자 닫혀버린 신안.

"그럼 나는……방송을 켜야만 점을 볼 수 있다는 거잖아?"

어이가 없었다.
인터넷방송을 켜야만 점을 볼 수 있는 박수라니.
하지만 곧이어 더 끔찍한 생각이 들었다.

''만약에 방송을 안 켜면……?''

아무 일도 없으면 다행이다.
혹시 어젯밤 같은 신병이 또 도지게 된다면?
박지훈은 마른침을 삼켰다.
왠지 모르게, 그 가능성을 가볍게 넘길 수가 없었다.

"일단 돌아가자."

그는 더 생각하기를 포기하고 집으로 향했다.
어차피 밖에서는 답이 나오지 않는다.
인터넷방송.
결국 그걸 다시 켜봐야 했다.

***

집에 돌아온 지훈은 곧장 책상 앞으로 향했다.
그는 휴대폰을 집어 들었다.
다행히 배터리는 꽉 차있었다.
전원을 다시 켰다.
켜지자마자 진동이 연달아 울리기 시작했다.

지이잉-
지이잉-

"……뭐야."

지훈은 미간을 좁혔다.
부재중전화 알림이 한가득 떠 있었다.
대부분 우식이었다.
문자도 몇 통 와있었다.

-야 너 왜 전화 안 받나?
-몸은 괜찮나?
-살아는 있는 거지?
-지금 네 집으로 간다.

지훈은 곧장 통화 버튼을 눌렀다.
신호음은 길지 않았다.

"야!"

받자마자 우식이 소리쳤다.

"너 어떻게 된 거야?"
"미안하다. 어젯밤 그대로 쓰러져 잠들었었어."
"뭐? 몸은 좀 어때? 괜찮은 거 맞아?"
"지금은 멀쩡해."
"지금은?"
"어제는 진짜 죽는 줄 알았는데, 자고 일어나니까 멀쩡해졌어."
"별 미친 소리를 다 하네. 병원은?"
"안 가도 돼. 나 괜찮아."
"도대체 어제 무슨 일이 있었던 거야?"

박지훈은 잠시 망설였다.
어디까지 말해야 할지 감이 오지 않았다.
하지만 우식에게까지 숨길 수는 없었다.

"나 어제 방송하면서 이상한 걸 봤어."
"뭔데."
"사람들 과거, 현재, 미래 같은 거."
"뭐?"
"나도 안 믿기는데, 실제로 봤다."

잠깐 침묵이 흘렀다.
잠시 후 우식이 당황한 목소리로 물었다.

"너 진짜 박수된 거야?"
"모르겠어. 밖에 나가서 사람들 쳐다봤는데 아무것도 안 보였어."
"미친. 그럼 방송할 때만 보이는 건가?"

짧게 욕지거리를 내뱉은 우식이 곧장 말을 이었다.

"답 나왔네. 오늘도 방송 켜서 확인해봐."
"그래?"
"확실히 해야 하잖아. 그리고 방송시간대는 가능하면 고정하고. 그래야 시청자들이 꾸준히 유입되거든."

박지훈은 말없이 입술을 깨물었다.

"……알았다."
"그래. 잘해봐. 나도 이따가 네 방송 구경하러 갈게."

지훈은 그대로 전화를 끊었다.
방송 시작까지 남은 시간은 2시간 남짓이었다.

***

어제와 같은 시간.
목이 바짝 말랐다.
어젯밤처럼 또 몸이 뒤틀릴까봐 걱정도 됐다.

"……딱 확인만 하자."

그는 그렇게 중얼거린 뒤 방송 시작 버튼을 눌렀다.

[만년취준생 님의 방송이 시작됐습니다.]

그 순간이었다.
등줄기를 타고 서늘한 기운이 훑고 지나갔다.
곧이어 지훈의 눈빛이 서서히 가라앉았다.

''왔다.''

방금 전까지는 평범하게 보이던 모니터 너머가 달라졌다.
채팅이 쏟아지면서 사람들 너머에 얽힌 기운들이 희미하게 떠올랐다.

-jmd1331 : 어 왔다
-bvk0014 : 사기꾼 새끼 또 왔네
-망나니아이 : 첫사랑 썰은 오늘도 없음?
-무음방 : 저 신점 좀 봐주세요 2트
-파에리스 : 인방갤 보고 왔다
-순살라면 : 어제 왜 면접 가면 죽는다고 한 거예요
-샤월 : 얘가 어제 그 하꼬 맞지
-꼬카 : 면접 가면 죽는다는 애가 애임?

채팅창이 미친 듯이 올라갔다.
어제보다 확실히 빨라졌다.
시청자 수도 눈에 띄게 불어나 있었다.
하지만 놀란 것도 잠시였다.
머릿속을 스치는 서늘한 감각과 함께, 저절로 입술이 열렸다.

"시끄럽다."

낮게 깔린 목소리가 이어졌다.

"채팅창 더럽게 시끄럽네. 궁금한 것만 물어."

순간 채팅창이 또 한 번 요동쳤다.

-bvk0014 : 또 시작이네 ㅋㅋ
-파에리스 : 와 방송 켜자마자 또 저러네
-순살라면 : 아니 그래서 어제 그 사람 왜 죽는다고 한 건데요
-꼬카 : 맞아 그거부터 말해봐

지훈은 입술을 떼었다.

"순살라면, 네가 궁금한 건 그거냐?"

-순살라면 : 네! 왜 죽는다고 한 거예요?

지훈은 잠시 침묵했다.
그사이 어제 29세무직에게서 봤던 환영이 다시 한번 머릿속을 스쳤다.
유리 파편, 급브레이크 소리, 피를 흘리며 쓰러진 남자.
그는 말문을 열었다.

"그 시간에 그 자리에 있으면 죽을 테니까."

채팅창이 순간 멈었다가 폭발적으로 터졌다.

-우주교실 : 와 쎄다
-jmd1311 : 내일이면 들통날 말을 저렇게 한다고?
-bvk0014 : 이 새끼 사기꾼 맞다니까

지훈이 미간을 좁힌 채 소리쳤다.

"시끄럽다. 못 믿겠으면 썩 나가."

그때였다.

빠빵-

낯선 효과음이 방송에 울려 퍼졌다.

[29세무직 님이 물방울 100개를 선물하셨습니다.]

순간 채팅창이 얼어붙었다.

-무음방 : 왔다!
-jmd1311 : 어?
-순살라면 : 헐
-우주교실 : 면접 갔나?
-bvk0014 : 물방울은 왜 쏘는데 또 조작질이냐

그 채팅창 아래로, 29세무직의 채팅이 올라왔다.

-29세무직 : 저 그 일 때문에 할 말 있습니다

채팅창이 순식간에 폭주했다.

-순살라면 : 뭔데?
-우주교실 : 뭔 일이 있었던 거임?
-무음방 : 면접 감?

박지훈은 말없이 채팅창을 내려다봤다.
그리고 자신도 모르게 침을 삼켰다.
대체, 무슨 일이 있었던 걸까.', 1336, 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('a9968e95-f688-4a62-b03a-5f9218a97af3', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '3화', 'draft', '29세무직.
본명은 강진수였다.
그날 오전, 그는 평소보다 늦은 시간에 눈을 떴다.
간밤에 잠을 설쳤기 때문이다.
꿈속에서도 만년취준생의 경고가 귓전을 맴돌았다.

「내일 오후 2시 면접 보러 가지 마라.」
「가면 내일이 네 제삿날이 될 테니까.」

"……제정신인가?"

강진수는 헛웃음을 지으며 넥타이를 조였다.
오늘은 오성전자 1차 면접이 있는 날이었다.
고졸로 시작해 전문대를 졸업하고, 야간 대학까지 다니며 간신히 따낸 기회였다.
스트리머가 던진 말 한 마디에 포기하기엔 인생이 너무 절박했다.
구둣 조건으로 뒷굼을 밀어 넣고 비좁은 원룸을 나설 때까지만 해도 그는 방송에서 들은 말을 반쯤 흘려듣고 있었다.
버스정류장에 도착한 뒤 전광판을 확인했다.
오성전자 쪽으로 가는 버스는 5분 뒤 도착 예정이었다.

''별 일 없을 거야. 순 미신이잖아.''

그런데 이상하게 발걸음이 무거웠다.
괜히 신경이 쓰였다.
그때였다.

지이이잉-

호주머니에 넣어둔 휴대폰이 울렸다.
발신자는 어머니였다.

"엄마, 이 시간에 웬일이야?"
"지금 어디니?"
"나? 버스정류장. 오늘 면접 있는 날이잖아. 엄마는?"
"나 지금 병원에 왔다."

병원이라는 말에 강진수의 낯빛이 단숨에 굳었다.

"병원? 갑자기 왜?"
"아침에 일어났더니 무릎이 너무 쑤셔서 걸질 못하겠더라. 그래서 검사 받았는데 퇴행성 관절염이라네. 아이고, 세월이 참 무섭다."

그 순간, 강진수의 발걸음이 그대로 멈췄다.

「어머니는 무릎 아픈데 너는 연락도 잘 안 하지? 반성 좀 해야겠다.」

어젯밤 방송에서 만년취준생이 했던 말이었다.
등줄기가 축축해졌다.
그가 타야 할 버스가 정류장 앞에 멈춰 섰다.
문이 열리고, 사람들이 우르르 올라탔다.

"안 탈 거예요?"

기사 아저씨가 재촉했다.

"저, 잠시만요."
"진수야? 듣고 있니?"

강진수는 입술을 달싹였다.
손바닥에는 식은땀이 흥건했다.

''설마.''

우연히 맞혔다고 해서 전부 진짜일 리는 없다.
그렇게 생각하면서도 발이 떨어지지 않았다.

"안 타는 거죠? 출발합니다."

결국 버스 문이 닫혔다.

부아앙-

멀어지는 버스를 보던 강진수는 버스정류장 벤치에 털썩 주저앉았다.

''……진짜였다고?''

머릿속이 복잡해졌다.
어릴 적 교통사고 이야기를 맞혔을 때만 해도 반신반의했다.
하지만 어머니 무릎 이야기는 달랐다.
이건 우연으로 넘기기 어려웠다.
강진수는 이를 악물었다.

"……왜 내 제삿날이 될 거라고 했는지 확인해봐야겠어."

그는 다음 버스를 기다렸다.
원래 타려던 버스를 놓친 탓에 도착은 이미 늦어진 뒤였다.
다음 버스를 타고 오성전자 앞 정류장에 도착했을 때는, 원래보다 20분 가까이 늦은 뒤였다.
버스에서 내리려던 강진수는 창밖을 보고 그대로 굳어버렸다.

"……뭐야?"

회사 정문 앞 도로가 완전히 아수라장이 되어 있었다.
사람들이 몰려 있었고, 경찰차와 구급차가 뒤엉켜 있었다.
뿌연 먼지와 연기가 아직 가라앉지 않은 도로 한복판.
횡단보도 바로 옆에서 905번 버스 한 대가 처참하게 옆구리가 찢긴 채 멈춰 서 있었다.
그리고 그 버스를 들이받은 대형 트럭이 비스듬히 밀려나와 가로등에 처박혀 있었다.
산산조각 난 유리 파편과 찢겨나간 차체 조각이 사방에 흩어져 있었다.

"방금 사고 난 거예요?"

강진수가 떨리는 목소리로 묻자, 옆에 서 있던 행인이 혀를 찼다.

"예. 트럭이 중심 못 잡고 버스 옆구리를 들이받았대요. 저 버스가 정류장 지나서 횡단보도 앞에 막 들어오던 참이었다더라고요."

그 말에 강진수의 얼굴이 새하얗게 질렸다.
905번 버스.
자신이 원래 타려던 바로 그 버스였다.
그는 천천히 고개를 돌렸다.
사고가 난 위치는 회사로 들어가려면 반드시 지나야 하는 횡단보도 바로 앞이었다.
만약 자신이 예정대로 도착했더라면.
만약 아까 그 버스를 그대로 탔더라면.
강진수는 침을 삼켰다.
목구멍이 바싹 말라붙었다.

''……죽었겠네.''

단순히 다쳤을지도 모른다가 아니었다.
정말 오늘이 자신의 제삿날이 됐을 수도 있었다.
그는 멍하니 905번 버스를 바라보다가 생각했다.
만년취준생이 해가 서쪽에서 뜬다고 말해도, 지금은 믿을 수 있을 것 같았다.

***

"……이렇게 된 겁니다."

박지훈은 디코로 29세무직의 이야기를 들으며 자신이 본 환상이 진짜였음을 깨달았다.

''내가 본 게 진짜였구나.''

왜 인터넷방송을 할 때만 작동하는지는 모르겠지만, 적어도 한 가지는 확실했다.
그의 신안은 제대로 기능하고 있었다.

"만년취준생 님, 정말 감사합니다. 취뽀하고 더 통 크게 후원하겠습니다!"
"됐고, 몸부터 추슬러. 다음 면접 준비나 잘하고."
"감사합니다!"

29세무직이 디코를 나가자 채팅창이 곧바로 폭주했다.

-순살라면 : 와 저 무슨 영화 보는 줄 알았어요! 대박!
-agei : <링크> 기사도 떴음 ㄷㄷ
-bvk0014 : 난 아직도 반신반의
-dwm9911 : 이걸 아직도 못 믿네 ㅋㅋ
-무음방 : 저 신점 좀 봐주세요 (3트)

박지훈은 채팅창을 훑어봤다.
아까보다 채팅이 훨씬 빨라져 있었다.
시청자 수도 어느새 더 불어 있었다.

''많이 늘었네.''

하지만 서늘한 감각이 다시 머리를 스치는 순간, 입술이 저절로 열렸다.

"다음은 너다. 순살라면."

채팅창이 잠시 멈었다.

-순살라면 : 저요?
-순살라면 : 헐 잠깐 저 부른 거 맞죠

"디코 들어와."

-순살라면 : 네! 지금 바로 들어갈게요!

그러다 박지훈이 문득 입술을 떼었다.

"들어오기 전에 하나만."

-아주카라 : 또 뭔데?
-dwm9911 : 또 뭐 말하려고?

지훈은 아랑곳하지 않고 물었다.

"너 여자지?"

채팅창이 다시 술렁였다.

-순살라면 : 헐

***

"아, 안녕하세요. 순살라면입니다."

순살라면의 목소리는 조금 앳됐다.

"어떻게 제가 여자인 줄 아신 거예요?"
"그건 됐고."

박지훈이 낮게 깔린 목소리로 말했다.

"가만히 있어. 보이는 거부터 말해줄 테니까."
"아, 네!"

여성 시청자가 신점을 보기 시작하자 채팅창 반응도 묘하게 뜨거워졌다.

-스윗똥남 : 갑자기 공기 달달하네 ㅋㅋ
-무음방 : 저도 신점 좀 봐주세요! (4트)
-카숭이 : 여자라 바로 부르네 ㅋㅋ
-꼬카 : 누구는 4트째인데 여자라고 바로 부르네 ㅋㅋ

박지훈은 채팅창을 무시한 채 모니터를 응시했다.
처음엔 별다른 이상이 없어 보였다.
건강도, 집안도 무난했다.

"건강은 괜찮네. 큰 문제 없어."
"정말요? 다행이다."
"부모님도 별 탈 없고."

순살라면의 목소리가 금세 밝아졌다.

"우와, 다행이네요."
"공부도 곧잘 했고. 성적도 나쁘지 않았어."
"헉, 그것도 보여요?"

"보이니까 말하지."

박지훈은 무심하게 대꾸했다.
그러다 순간, 눈빛이 아주 조금 가라앉았다.
처음엔 흐릿한 정도였다.
그런데 볼수록 한쪽이 탁하게 흐려졌다.
마치 맑던 하늘 한쪽으로 먹구름이 몰려오는 것처럼.

"……남자 문제가 있네."

채팅창이 잠깐 멈었다.

-카숭이 : 갑자기?
-스윗똥남 : 오 이건 좀 재밌네

순살라면이 힘없는 목소리로 대답했다.

"…… 어, 맞아요."
"최근에 남자친구랑 크게 싸웠지?"
"네……."
"헤어지자고 하는 걸 네가 다시 붙잡았고."

순살라면이 숨을 삼키는 소리가 디코 너머로 작게 들렸다.

"……네."

박지훈은 미간을 좁혔다.
이제는 흐릿한 수준이 아니었다.
먹구름 뒤쪽으로 비현실적인 장면이 스치기 시작했다.
화려한 네온사인.
술병이 굴러다니는 탁자.
흐트러진 침대.
그리고 낯선 여자와 뒤엉킨 남자.

"하."

박지훈은 짧게 숨을 내뱉었다.
봐도 기분 나쁜 장면이었다.
채팅창은 그 짧은 한숨도 놓치지 않았다.

-꼬카 : 왜 갑자기 조용해짐?
-우주교실 : 뭐가 보였나 본데?
-dk1923 : 설마 더 있나?

그때 순살라면이 조심스럽게 물었다.

"그래도…… 아직은 좋은 사람이라고 믿고 있거든요. 제가 그 사람을 계속 믿어도 될까요?"

박지훈은 곧장 답했다.

"믿지 마."

디코 안이 순간 조용해졌다.

"……네?"
"그 새끼 다른 여자 있어."

채팅창이 그대로 터져버렸다.

-gkp40 : 뭐???
-샤월 : 와 ㅅㅂ
-써면마스터 : 양다리라고?
-우주교실 : 이거 진짜면 개소름인데
-무음방 : 오늘 방송 미쳤다

순살라면은 한동안 말을 잇지 못했다.
디코 너머로 억눌린 숨소리만 들려왔다.

"그, 그럴 리가 없는데요……."

박지훈은 싸늘한 목소리로 잘라 말했다.

"없긴."

잠깐의 정적.

"지금도 만나고 있네."

***

김우식은 힘겹게 눈을 떴다.
휴방날이라고 늘어지게 잤더니 어느새 밤이었다.

"어후……먹을 거 없나."

냉장고를 뒤적여봤지만 먹다 남은 배달 음식 용기뿐이었다.
하는 수 없이 그는 컵라면에 물부터 올렸다.
물이 끓기를 기다리던 우식은 습관처럼 오션에 접속했다.
그러다 문득 박지훈 생각이 났다.

"그러고보니 지훈이도 오늘 방송한다고 했었지."

친구의 방송을 몇 명이나 보고 있을지 궁금했다.
우식은 시청자 수 순으로 화면을 훑었다.
보통이라면 열 명 안팎 방송들 사이에 있어야 할 닉네임이었다.
그런데 만년취준생은 보이지 않았다.

"뭐야?"

우식은 미간을 좁히고 스크롤을 조금 더 올렸다.
그제야 익숙한 닉네임이 눈에 들어왔다.
만년취준생.
그런데 위치가 이상했다.

"……어?"

우식의 눈이 크게 뜨였다.

[시청자 수 : 571명]

"아니, 미쳤나?"

방송 2일차에 시청자 수 오백 명.

"……이 새끼, 도대체 뭘 하고 있는 거야?"

그는 홀린 듯 시청하기 버튼을 눌렀다.', 1063, 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('b5023fa6-d1a0-4ab1-90f4-2af9793db142', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '4화', 'draft', '"아니라고요! 우리 오빠가 그럴 리가 없다고요!"

순살라면이 강하게 부정하고 나섰다.
하지만 박지훈은 표정 하나 바꾸지 않고 칼같이 말했다.

"그럴 리가 없긴."

그는 다시 눈을 감았다가 떴다.
순살라면의 뒤엉킨 기운 너머로 흐릿한 장면이 다시 떠올랐다.
붉은색 네온사인.
술 냄새가 밴 공기.
아무렇게나 흩어진 옷가지.
흐트러진 침대 시트.
그리고 낯선 여자와 뒤엉킨 남자.

''하여간.''

다시 봐도 기분 더러운 광경이었다.

"아까 연락했는데 집이라고 했어요. 이따 다시 전화하자고 했는데……."

순살라면이 애써 침착한 척 말을 이었다.

"만년취준생 님이 뭔가 잘못 보신 거 아닐까요?"

그러나 그녀의 목소리는 가늘게 떨리고 있었다.

-아주카라 : 아 ㅅㅂ 내가 다 불안하네
-agei : 일단 확인은 해봐야지
-무음방 : 순살라면 님 개떨릴 듯
-레전드럼통 : 근데 아직은 모르는 거 아님?
-카에트 : 바쁘다고 이따 전화한다는 게 그렇게 이상한가
-꼬카 : 근데 계속 피하면 그것도 좀 이상하긴 함

박지훈은 비웃듯 코웃음을 쳤다.

"집은 무슨."

순간 채팅창이 멈었다.

"……네?"
"거짓말하네."

지훈의 목소리는 낮았지만 단호했다.

"집에 있는 거 아니야."

디코 너머에서 순살라면이 숨을 가쁘게 내뱉는 소리가 들렸다.

"아니에요! 우리 오빠는 그럴 사람이 아니라고요!"
"아직도 그렇게 생각해?"

박지훈이 미간을 좁혔다.
환영이 점점 더 선명해지고 있었다.
문틈 아래로 새어나오는 조명, 붉은 네온사인, 흐릿한 모텔 간판.
지훈은 쐐기를 박았다.

"네 남자친구. 지금 모텔에 있어."

채팅창이 다시 크게 흔들렸다.

-아주카라 : 와 집이 아니라 모텔이라고?
-dwm9911 : 이건 좀 너무 나간 거 아님?
-카숭이 : 그럼 확인해보면 되잖아
-무음방 : 저 정도면 뭔가 본 거겠지
-레전드럼통 : 모텔은 좀 센데
-agei : 가보면 끝나긴 하겠다

충격을 받은 듯 순살라면은 한동안 아무 말도 하지 못했다.
디코에서는 거칠어진 숨소리만 희미하게 맴돌았다.
한참 뒤에야, 그녀가 간신히 짜낸 듯한 목소리로 물었다.

"……제가 어떻게 해야 하죠?"

박지훈은 차가운 말투로 대답했다.

"전화해. 지금 당장."

***

순살라면은 곧바로 대답하지 못했다.
손이 떨리는지 마이크 너머로 바스락거리는 소음이 작게 섞였다.

한참 뒤에야 그녀가 입을 열었다.

"……지, 지금요?"
"그래, 지금."

박지훈의 대답은 짧고 건조했다.
머뭇거릴 틈조차 주지 않는 목소리였다.
채팅창이 다시 들끓었다.

-무음방 : ㄱㄱㄱㄱ
-agei : 스피커폰 ㄱㄱ
-dwm9911 : 일단 전화부터 해봐요
-카에트 : 받아도 수상하고 안 받아도 수상함

그녀가 망설이다가 결심을 한 듯 떨리는 목소리로 말했다.

"……알겠어요. 잠깐만요."

잠시 후, 휴대폰을 만지는 소리가 들렸다.
그리고 디코 너머로 신호음 가는 소리가 들리기 시작했다.

"스피커폰으로 할게요."

-무음방 : 와 간다
-아주카라 : 오늘 개레전드네 ㅋㅋ

뚜르르-
뚜르르-

그러나 상대는 전화를 받지 않았다.
채팅창이 또 술렁거렸다.

-우주교실 : 퀑기니까 안 받는 거지
-레전드럼통 : 겜 중이면 못 받을 수도 있긴 함
-카숭이 : 그래도 한 번은 받을 법한데
-무음방 : 백퍼 뭐 있다

순살라면이 애써 아무렇지 않은 척 말했다.

"원래 게임할 때는…… 잘 못 받을 때가 많아서."

하지만 그녀의 목소리는 계속해서 떨리고 있었다.

[연결이 되지 않아 음성사서함으로…….]

끝내 통화는 연결되지 않았다.
디코가 조용해졌다.
그 적막을 깨고, 잠시 뒤 카톡 알림음이 들렸다.

까톡-

채팅창이 미친 듯이 올라갔다.

-카에트 : 뭐라고 옴?
-agei : 빨리 읽어봐요
-무음방 : 변명각 ㅋㅋ
-꼬카 : 설마 진짜 바쁘다 이런 거냐

순살라면은 몇 초 동안 말이 없었다.
아마 화면을 읽고 있는 모양이었다.
그러다 그녀가 힘겹게 입술을 뗐다.

"……왜 또? 나 지금 바쁘니까 이따 연락해. 라고 왔어요."

채팅창 반응이 엇갈렸다.

-dwm9911 : 여친 전화도 못 받나 ㅅㅂ
-아주카라 : 이건 좀 수상한데
-레전드럼통 : 저 말만 보면 아직 모르긴 함
-우주교실 : 그러니까 가보면 되잖아
-카숭이 : 모텔은 오버 같아도 계속 피하는 건 이상함

박지훈은 싸늘한 눈으로 모니터를 바라보다가 말했다.

"바쁜 게 아니야. 피하는 거지."

순살라면은 끝내 고개를 떨궜다.
가늘게 떨리던 숨이 몇 번 더 이어졌다가, 이내 이를 악문 목소리가 흘러나왔다.
그 순간 디코 너머로 다른 목소리가 끼어들었다.

"누나, 혼자 가긴 위험해. 나도 같이 가."

남자 목소리였다.
순살라면이 숨을 들이켰다.

"네가 왜 가. 나 혼자 가도 돼."
"어떻게 누나를 혼자 보내. 갈 거면 같이 가."

남동생도 곁에서 함께 방송을 보고 있던 듯했다.

-아주카라 : 오 잘됐다
-gkp40 : 동생 같이 가면 든든하긴 하지
-dwm9911 : 혼자 가는 것보단 낫네

남동생은 거기서 멈추지 않았다.

"증거는 남겨둬야 해. 저 새끼 나중에 발뺌하면 골치 아파. 예식장까지 잡았잖아."

순살라면이 멈칫했다.

"녹화……?"

박지훈은 잠시 화면을 보다가 말했다.

"녹화 말고 영상통화로 하자."

순살라면이 당황한 듯 되물었다.

"영상통화요?"
"그래."

박지훈의 목소리는 낮고 단호했다.

"내가 봐야 길을 자세히 알려줄 수 있으니까. 번호 줘. 내가 걸게."

남동생이 바로 고개를 끄덕였다.

"그게 낫겠다. 누나, 그냥 영통 켜뒤. 어차피 증거 남겨야 하니까."

순살라면은 잠시 망설이다가 결국 천천히 고개를 끄덕였다.

"……알겠어요."

디코 너머로 급하게 움직이는 소리가 들렸다.
서랍 여닫는 소리, 겉옷을 챙기는 소리, 우왕좌왕하는 발걸음 소리까지.

"저 이제 곧 나가려고요."
"누나, 핸드폰 줘. 내가 들게."

남동생이 옆에서 침착하게 끼어들었다.
박지훈은 모니터를 응시한 채 말했다.

"서두를 필요 없어. 아직 거기 있으니까."

그러자 남동생이 대답했다.

"네. 어딘지만 알려주세요."

그 사이 채팅창은 완전히 불타고 있었다.

-꼬카 : 와 씨 진짜 가네
-dwm9911 : 나 치킨 시켰다 ㅋㅋ
-우주교실 : 인방갤에 올리고 온다 ㅋㅋ
-써면마스터 : 내가 벌써 올림 ㅋㅋ

현관문 열리는 소리가 디코 너머로 거칠게 울렸다.

철컥.

박지훈의 눈빛이 차갑게 가라앉았다.

"전화 걸 테니까 영상통화 켜."

잠시 뒤, 방송 화면 아래 연결 중이라는 문구가 떠올랐다.

[영상통화 연결 중입니다.]

***

순살라면.
아니, 올해 스물여덟 살의 노정희.
그녀는 왜 이 밤중에 집 밖을 나서야 하는지 스스로도 이해할 수 없었다.
불과 한 시간 전까지만 해도 남자친구와 연락을 주고받으며 내일은 뭘 먹을지 고민하고 있었는데.
지금은 정체도 모를 스트리머의 신점을 듣고 남동생과 함께 모텔촌으로 걸어가고 있었다.

''이게 맞는 건가?''

하지만 발걸음을 멈출 수 없었다.
그녀의 귓가엔 이어폰이 꽂혀 있었고, 낮고 건조한 남자의 목소리가 또렷하게 들리고 있었다.

"앞만 봐."

노정희는 무의식적으로 침을 삼켰다.
그녀 옆에서는 남동생이 휴대폰을 든 채 영상통화를 이어가고 있었다.

"누나, 천천히 가. 넘어지겠다."
"……응."

자신도 모르게 조바심이 났던 걸까.
발걸음을 조금은 늦췄다.
그러나 여전히 마음은 진정되질 않고 있었다.
밤공기가 차가웠지만, 등줄기는 식은땀으로 축축했다.
거리의 불빛이 번져 보였다.
멀쩡한 정신으로는 도무지 믿을 수 없는 상황이었다.

''아니겠지. 진짜 아닐 거야.''

그렇게 몇 번이고 되뇌었지만, 마음 한구석에는 의심이 따리를 든 채 점점 커져가고 있었다.

"오른쪽."

이어폰 너머로 들리는 목소리.
발걸음을 틀었다.
모텔촌 골목 초입에 들어서자 공기가 달라졌다.
낡은 건물 벽면에 번진 붉은 불빛 주차장 안에 빼뚤게 세워진 차들, 술에 취한 채 흐느적거리며 걷는 사람들까지.

"계속 가."

짧고 단호한 말에 그녀는 마른침을 삼켰다.
호흡이 가빠지고 다리가 점점 무거워졌다.
남동생이 조심스럽게 물었다.

"누나, 괜찮아?"
"……안 괜찮아."

어느새 입술이 바짝 말라붙어 있었다.
그렇다고 여기서 돌아갈 수는 없었다.

"거기. 엘리베이터 타고 3층으로 올라가."

모텔 안으로 들어갔다.
엘리베이터를 타고 3층에서 내렸다.
복도는 생각보다 좁았고, 조명은 어둡기만 했다.
남동생이 휴대폰을 쥔 채 카메라를 비췄다.
노정희는 자신도 모르게 숨을 죽였다.
곧 낮게 가라앉은 목소리가 들려왔다.

"멈추지 말고 끝까지 가."

한 걸음.
또 한 걸음.
노정희는 마치 벼랑 끝으로 떠밀리듯 복도를 걸었다.
문마다 번호가 붙어 있었지만 눈에 잘 들어오지 않았다.
시야가 자꾸 흔들렸다.
심장은 귀 바로 옆에서 뛰는 것처럼 쿵쿵 울렸다.

"……여기?"

남동생이 복도 끝에서 작게 속삭였다.
노정희가 고개를 돌려보니 ''312''라고 적혀 있었다.
문고리는 손만 뻗으면 닿을 거리에 있었다.
하지만 차마 손이 나가지 않았다.
손끝이 덜덜 떨렸다.

"저……."

노정희가 겨우 입을 열었다.

"이제 어떡하죠?"

이어폰 너머로 박지훈의 목소리가 들렸다.

"기다려."

노정희는 고개를 가웃거렸다.
왜 기다리라는 건지 이해할 수 없었다.
그러나 그 한 마디에 움직일 수가 없었다.
그녀의 남동생도 같이 얼어붙은 듯 멈춰 섰다.
복도는 고요했다.
너무 조용해서 문 너머 소리도 들릴 것 같았다.
그때였다.

띵-

엘리베이터 도착음이 복도 끝에서 재차 울렸다.
노정희와 남동생이 동시에 고개를 돌렸다.
엘리베이터 문이 열리더니 배달 봉투를 든 배달기사가 성큼성큼 복도로 가로지르고 있었다.
312호 앞에 선 그는 노정희와 남동생을 힐끔 보더니 고개를 가웃이고선 문을 두드렸다.

"주문하신 배달 왔습니다."

철컥-

굳게 닫혀 있던 312호의 문이 천천히 열리기 시작했다.', 1147, 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order)
VALUES ('59653934-4ef6-452b-98e6-587382767792', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '5화', 'draft', '철컥-

312호의 문이 천천히 열리기 시작했다.
노정희는 숨을 멈춘 채 그 장면을 바라봤다.
심장이 미친 듯이 뛰었다.
문틈이 손가락 하나 들어갈 만큼 벌어졌고, 이내 안쪽에 있던 남자가 얼굴을 내밀었다.
샤워가운 차림이었다.
젖은 머리.
술기운이 덜 빠진 얼굴.
그리고 문 앞에 선 노정희를 본 순간, 눈동자가 크게 흔들렸다.

"……뭐야?"
"……오빠가 왜 여기서 나와?"

남자의 얼굴이 그대로 굳었다.
영상통화 너머로 그 모습을 보던 박지훈은 말없이 모니터를 응시했다.
반면 채팅창은 한 박자 늦게 폭발했다.

-카숭이 : 어?
-써면마스터 : 잠깐
-무음방 : 남친 맞나본데?
-agei : 진짜 남친 맞네?

노정희의 입술이 잘게 떨렸다.
문이 더 열리면서 방 안 풍경이 천천히 드러났다.
흐트러진 침대 시트.
테이블 위에 널브러진 맥주캔.
바닥에 아무렇게나 벗어놓은 여자 구두.
그리고 안쪽에서 들려오는 낯선 여자 목소리.

"오빠, 빨리 안 가지고 오고 뭐해?"

그 한마디에 복도 공기가 얼어붙었다.
남동생 노찬영이 제일 먼저 반응했다.
그는 남자와 노정희 사이를 막아서듯 앞으로 나섰다.

"와."

짧게 뱉은 한마디였지만, 목소리는 이미 싸늘하게 식어 있었다.
노정희는 아무 말도 하지 못했다.
눈앞에 있는 장면이 너무 선명해서, 오히려 머릿속은 텅 비어버린 기분이었다.
문 안쪽에서 여자가 걸어나왔다.
짧은 원피스 차림이었다.
여자는 노정희와 노찬영을 번갈아 보다가, 문 앞에 굳어 있는 남자를 향해 인상을 찌푸리며 물었다.

"오빠, 저 여자는 누구야?"

남자는 입을 열지 못했다.
아니, 열 수가 없었다.
그 순간 노정희가 먼저 입을 열었다.

"여자친구예요."

목소리가 떨렸지만 그녀는 침착했다.
그리고 아주 짧은 침묵 뒤.

"……아니지. 이제는 전 여자친구예요."

채팅창이 그대로 뒤집혔다.

-dwm9911 : 와 씨 개쎄다
-아주카라 : 전 여자친구예요 ㅁㅊ
-보서크 : 속이 다 시원하네
-카에트 : 아까 남친 편 든 내가 미안하다
-꼬카 : 이건 진짜 소름이다

방 안에 있던 여자의 표정이 순식간에 변했다.
그녀는 남자를 노려보더니 믿을 수 없다는 듯 되물었다.

"……뭐?"

노정희는 남자를 똑바로 보며 다시 말했다.

"여자친구였어요. 방금 전까진."

여자는 남자를 쳐다봤다.
남자는 시선을 피했다.
그 짧은 침묵만으로도 답은 충분했다.

짝-!

복도에 날카로운 소리가 울렸다.
여자가 남자의 뺨을 후려친 것이었다.

"미친 새끼 아니야?"

남자는 맞은 쪽 뺨을 붙잡고도 아무 말도 하지 못했다.
노찬영은 기가 막히다는 듯 헛웃음을 흘렸다.

"이야, 진짜 대단하다. 양쪽 다 속였네?"

노정희는 눈가가 붉어져 있었지만 끝내 울지는 않았다.
대신 아주 천천히 숨을 들이마신 뒤, 남자를 향해 말했다.

"다신 연락하지 마."

그 말이 떨어진 순간, 영상통화 너머 채팅창은 걷잡을 수 없이 폭주했다.

-써면마스터 : 끝났다
-레전드럼통 : 개사이다
-무음방 : 저 남자 오늘 인생 끝났네
-agei : 와, 근데 진짜 다 맞혔네
-카숭이 : 이 방송 뭐냐 진짜

노정희는 더 이상 남자를 보지 않았다.
그녀는 그대로 몸을 돌렸고, 노찬영도 곧바로 누나를 따라섰다.
복도를 벗어나기 직전, 노정희의 손이 떨리며 휴대폰을 더 세게 움켜쥐었다.
박지훈의 낮은 목소리가 이어폰 너머로 들려왔다.

"이제 됐다. 끊어."

노정희는 그 말에 짧게 눈을 감았다가 떴다.

"……네."

영상통화가 종료됐다.

***

영상 통화가 종료되고 박지훈은 말없이 등받이에 몸을 기댔다.
조금 전까지 이어지던 긴장감이 한꺼번에 빠져나간 탓일까.
관자놀이가 지끈거렸다.
귀 안쪽이 멍멍했다.
박지훈은 천천히 숨을 들이마셨다가 내뱉었다.

"……하."

짧은 숨이 새어 나왔다.
그러나 쉴 틈이 없었다.
방송 화면 한쪽이 미친 듯이 번쩍이고 있었기 때문이다.

빠빵-
빠빵-

물방울 후원 알림이 연달아 터졌다.

[무음방 님이 물방울 20개를 선물하셨습니다.]
[agei 님이 물방울 50개를 선물하셨습니다.]
[dwm9911 님이 물방울 100개를 선물하셨습니다.]

박지훈은 멍한 얼굴로 채팅창을 훑었다.

-무음방 : 오늘 방송 개재밌었습니다
-agei : 역대급 꿀잼이었어요
-dwm9911 : 몰입하다가 손이 놀렸네 ㅋㅋ
-아주카라 : 와 진짜 개꿀잼 ㄷㄷ
-보서크 : 아니 근데 이거 진짜 다 맞힌 거면 소름인데
-레전드럼통 : 난 아직도 반신반의긴 함
-무음방 : 그래서 제 신점은 언제 봐주시나요? (5트)

채팅창이 쉴 새 없이 올라갔다.
누군가는 재미있었다며 물방울을 쐈고, 누군가는 자기 신점도 봐달라며 아우성이었다.
영상통화가 길어지는 동안 유입도 눈덩이처럼 불은 모양이었다.
박지훈은 멍한 얼굴로 화면 우측 상단을 쳐다봤다.

[현재 시청자 수 : 2,138명]

"……뭐?"

짧게 튀어나온 목소리.
깜짝 놀라고 말았다.
이제 방송을 켠 지 이틀 차.
아까까지만 해도 오백 명이니 육백 명이니 하던 방송에, 어느새 2천 명이 넘는 사람이 몰려 있었다.
박지훈은 마우스를 움켜쥔 손에 힘을 주었다.

''언제부터 이렇게 몰린 거야?''

그 사이 물방울 알림은 계속해서 터지고 있었다.

빠빵-
빠빵-

[샤이커 님이 물방울 50개를 선물하셨습니다.]
-샤이커 : 시청료 납부합니다!

[아주카라 님이 물방울 30개를 선물하셨습니다.]
-아주카라 : 즐겨찾기에, 구독, 알림 설정까지 했습니다! 너무 재밌어요!

박지훈은 그 모습을 보며 고개를 천천히 저었다.
물방울 후원은 지금도 30초 가까이 밀려 있었다.
알림이 끊길 생각을 하지 않았다.
방금 전까지는 그냥 보이길래 아무 생각 없이 내뱉던 말이었다.
그런데 지금은 달랐다.
사람들이 그의 말 한마디에 열광하고, 몰입하고, 돈을 던지고 있었다.
방송이 사람을 붙잡고 있었다.

"……이거."

박지훈이 작게 중얼거렸다.
그 와중에도 물방울 알림은 계속해서 터졌다.

빠빵-

[카에트 님이 물방울 100개를 선물하셨습니다.]
-카에트 : 저도 시청료 내겠습니다!

후원 메시지를 읽던 박지훈의 입꼬리가 올라갔다.

"……이거, 진짜 돈이 되겠는데."

그 말과 동시에 채팅창이 다시 폭주하기 시작했다.

-무음방 : 이제 알았나고 ㅋㅋ 나도 좀 봐줘 (6트)
-카에트 : 돈쭐내줄 테니까 저도 봐주세요
-agei : 선착순이면 여기서부터 1
-dwm9911 : 2
-써면마스터 : 3
-bvk0014 : 난 아직도 반신반의
-써면마스터 : 그럼 나가 ㅋㅋ

박지훈은 쏟아지는 채팅을 잠시 바라보다가 천천히 자세를 고쳐 앉았다.
서늘한 감각은 아직 완전히 사라지지 않았다.
머리는 피곤했지만, 정신은 오히려 또렷해지고 있었다.

''좋아.''

이건 단순히 남의 운세를 봐주는 재주가 아니었다.
잘만 굴리면, 진짜 돈이 되는 일이었다.
돈 되는 건 확인했으니 이제부터 필요한 건 그만의 규칙이었다.

***

''규칙을 정해야겠어.''

이대로는 안 됐다.
아무나 닥치는 대로 봐줄 수도 없고, 그렇다고 아예 돈을 안 받고 넘어갈 일도 아니었다.
박지훈은 천천히 턱을 쓸어내렸다.

''무당은 복채를 받잖아.''

생각해보면 이상한 일도 아니었다.
이렇게 용한데 대가가 없는 게 오히려 더 이상했다.

''그럼 복채를 얼마로 받지?''

채팅창을 보니, 물방울 천 개쯤은 불러도 낼 사람들은 낼 것 같았다.

''천 개로 해?''

그 순간이었다.

우우우웅-

관자놀이 안쪽이 갑자기 울려댔다.
머릿속을 송곳으로 찌르는 것 같은 두통이 훅 밀려들었다.

"……아으."

박지훈은 미간을 확 찌푸렸다.

''천 개는 안 되는 건가?''

그는 고개를 절레절레 저었다.

''그러면 공짜로 봐주라고?''

우우웅-

이번에도 또 머리가 울렸다.
눈앞이 아찔해졌다.
박지훈은 이를 악물었다.

''공짜도 안 된다는 거네.''

순간 감이 왔다.
많이 받아도 안 되고, 아예 안 받는 것도 안 되고.
신점에는 반드시 그에 맞는 대가가 있어야 했다.
박지훈은 천천히 생각에 잠겼다.

''……오백 개는?''

이번엔 두통이 없었다.
지끈거리던 관자놀이가 거짓말처럼 잠잠해졌다.
머릿속을 짓누르던 묵직한 울림도 사라졌다.
박지훈의 눈빛이 가라앉았다.

''오백 개.''

그게 자신의 복채였다.
박지훈은 피식 웃었다.

"그래, 세상에 공짜는 없지."

그는 다시 채팅창을 바라봤다.
여전히 신점을 봐달라는 사람들로 채팅창이 도배되고 있었다.
이미 몇몇은 물방울을 쏘며 스스로를 어필 중이었다.

''그래도 한 명 정도는 공짜로 봐줘도 괜찮지 않으려나?''

가끔은 정말 이유 없이 눈에 밟히는 사람이 있을 수도 있다.
지난번의 29세무직처럼, 바로 내일 죽을 수도 있었던 운명을 타고난 사람.

''방송 켤 때마다 한 명은 공짜로 봐주자. 그 정도는 괜찮겠지?''

다행히 두통은 없었다.
마음 속으로 규칙을 정한 뒤, 그는 마이크를 앞으로 끌어당겼다.

"시끄럽다."

그러자 채팅창이 잠깐 멈었다.
그것도 잠시 다들 웅성대기 시작했다.

-agei : 저도 신점 좀 봐주세요 ㅠㅠ
-무음방 : 나는 저번부터 계속 봐달라고 했다고! (11트)
-샤이커 : 얼마면 봐주실 수 있죠? 저는 돈 낼게요
-dwm9911 : 돈이라면 나도 낼 수 있거든?

박지훈은 낮게 깔린 목소리로 말했다.

"다음 방송부터 복채를 받는다. 물방울 오백 개. 딱 오백 개다."

채팅창이 술렁였다.
누구는 너무 비싸다고 하고, 누구는 너무 저렴하다고 떠들어댔다.
그러나 지훈은 아랑곳하지 않고 말을 이었다.

"그리고 방송 켤 때마다 한 명은 공짜로 볼 거다. 단 누군지는 내가 정한다."

채팅창이 시끌벅적해졌다.

-gkp40 : 공짜도 있음?
-무음방 : 지금 쏘면 되나?
-샤이커 : 후원하면 예약되는 거임?

잠시 고민하던 지훈은 입술을 떼었다.

"선착순으로 예약 받겠다."

그 순간이었다.

빠빵-
빠빵-
빠빵-
빠빵-

[무음방 님이 물방울 500개를 선물하셨습니다.]
[agei 님이 물방울 500개를 선물하셨습니다.]
[dwm9911 님이 물방울 500개를 선물하셨습니다.]
[카에트 님이 물방울 500개를 선물하셨습니다.]
[써면마스터 님이 물방울 500개를 선물하셨습니다.]

기다렸다는 듯, 후원 알림이 연달아 터지기 시작했다.', 1167, 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    word_count = EXCLUDED.word_count,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('a211b07e-e55a-4799-a03e-fd9eced7dfa2', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '박지훈', NULL, '남', '29세', '등까지 들려붙은 뱃가죽에서 꼬르륵거리는 소리가 날 정도로 마른 체형.', '', '무기력하지만 자존심이 있다. 방송 중에는 낮게 깔린 차가운 말투로 변한다. 접신 상태에서는 단호하고 직설적.', '서울 상위권 4년제 졸업, 학점 4.1, 어학 성적 우수, 다수 자격증 보유. 그러나 100곳 넘게 지원하고 단 한 곳도 최종합격 못함. 어릴 때 옆집 무당 할머니에게 ''박수될 팔자''라는 말을 들었다. 방송을 시작한 순간 신병이 도지며 신안(神眼)이 열림. 오션(Ocean) 플랫폼에서 ''만년취준생'' 닉네임으로 활동.', 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('2e389122-80e5-4e3d-83df-a2f65f9a282c', 'a211b07e-e55a-4799-a03e-fd9eced7dfa2', '직업', '무직 (전직 편의점 알바). 현재 오션 스트리머.', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('035e9f3a-c258-44db-8537-abfd8c7a07dd', 'a211b07e-e55a-4799-a03e-fd9eced7dfa2', '능력', '신안(神眼) - 방송 중에만 발동. 채팅창 닉네임 너머로 그 사람의 과거, 현재, 미래가 환영으로 보인다. 방송 종료 시 신안이 닫힌다.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('5683dd42-ef99-4fe8-bf1d-94854a564da6', 'a211b07e-e55a-4799-a03e-fd9eced7dfa2', '방송 말투', '접신 상태에서 평소와 전혀 다른 낮고 차가운 말투. ''시끄럽다'', ''쓸데없는 소리 하지 말고 볼 사람만 남아라'' 등 반말 사용.', 3)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('61e2842c-20e2-410d-98cb-565b235f07dc', 'a211b07e-e55a-4799-a03e-fd9eced7dfa2', '복채 규칙', '물방울 500개. 많이 받으면(1000개) 두통, 공짜로 하려 해도 두통. 500개가 정확한 복채. 방송당 1명은 공짜로 봐줌 (본인이 선택).', 4)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('2e8445bd-d528-4888-ac9a-f60c66296bed', 'a211b07e-e55a-4799-a03e-fd9eced7dfa2', '신병 부작용', '신안을 무리하게 사용하면 코피, 전신 고통, 실신. 다음 날 회복 후 오히려 컨디션이 좋아짐.', 5)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('e97506af-0531-4f8f-ab4c-1ef937fa8319', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '김우식', NULL, '남', '29세 추정 (박지훈과 동갑 불알친구)', '', '', '실용적이고 센스 있다. 친구를 위하면서도 자기 이익(대회 참가)을 챙기는 영리함. 겉으로는 투덜거리지만 속으로 잘 챙긴다.', '박지훈의 어릴 때부터 함께 자란 불알친구. 오션(Ocean) 플랫폼의 기존 스트리머(고인물). 지훈에게 방송을 권유하고 장비(웹캠, 마이크, 헤드셋)를 직접 세팅해줌. 방송 첫날 자기 시청자들에게 지훈 방송을 홍보해줌(뻐꾸기). 실제 목적은 스트리머만 참가 가능한 대회에 지훈과 함께 참가하기 위함.', 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('82cf6c9c-2bd0-4df5-9409-d575244c9298', 'e97506af-0531-4f8f-ab4c-1ef937fa8319', '직업', '오션(Ocean) 스트리머. 몇 년 전부터 방송한 고인물.', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('72b4cda9-4b2c-4519-aa02-91dc588c8328', 'e97506af-0531-4f8f-ab4c-1ef937fa8319', '역할', '지훈의 방송 입문 조력자. 장비 세팅, 시청자 유입(뻐꾸기), 방송 노하우 전달.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('fd1d9a29-ad9e-4ea2-9cda-00ea51f1410b', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '강진수', NULL, '남', '29세', '넥타이를 매고 구두를 신은 면접 준비 차림.', '', '절박하고 성실하다. 고졸에서 전문대, 야간대학까지 다니며 기회를 만들어온 노력파. 처음엔 신점을 믿지 않았으나 경험 후 완전히 신뢰.', '오션 닉네임 ''29세무직''. 지훈의 첫 번째 시청자이자 첫 번째 신점 대상. 10살 때 교통사고를 당해 아버지가 살려줌. 어머니 무릎이 아프고 연락을 잘 안 하는 불효자. 오성전자 1차 면접 날, 지훈의 경고를 듣고 버스를 놓쳐 905번 버스 사고를 모면. 이후 물방울 100개를 후원하며 감사를 표함.', 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('f3a094cd-d651-422f-83cd-6ea51be6aca2', 'fd1d9a29-ad9e-4ea2-9cda-00ea51f1410b', '오션 닉네임', '29세무직', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('1075cb79-28ca-4fd9-a97c-04ddab858067', 'fd1d9a29-ad9e-4ea2-9cda-00ea51f1410b', '특이사항', '지훈이 경고하지 않았으면 905번 버스 사고로 사망했을 인물. 지훈의 신안이 진짜임을 증명한 첫 번째 사례.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('96333909-3b22-4aef-8e8a-6eaf9da8e2b6', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '노정희', NULL, '여', '28세', '', '', '겉으로는 밝고 순진하지만, 결정적 순간에 단단함을 보인다. 남자친구 배신을 확인한 후 ''전 여자친구예요''라고 침착하게 말할 수 있는 강인함.', '오션 닉네임 ''순살라면''. 지훈의 두 번째 신점 대상. 남자친구와 예식장까지 잡은 상태였으나, 지훈의 신안을 통해 남자친구의 양다리가 밝혀짐. 남동생 노찬영과 함께 모텔로 가서 현장을 확인하고 남자친구와 결별.', 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('1e9a9925-0c82-4e1f-8243-21ad99506d5c', '96333909-3b22-4aef-8e8a-6eaf9da8e2b6', '오션 닉네임', '순살라면', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('1f3076fc-9bea-4387-ba60-eaa8fec0db55', '96333909-3b22-4aef-8e8a-6eaf9da8e2b6', '특이사항', '지훈이 성별(여자)을 맞힘. 남자친구가 모텔에서 다른 여자와 있는 것을 신안으로 확인. 예식장까지 잡은 상태에서 결별.', 2)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, appearance, mbti, personality, content, sort_order)
VALUES ('6cb02138-173e-4b68-a612-62a2e502e868', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '노찬영', NULL, '남', '20대 추정 (노정희의 남동생)', '', '', '침착하고 실용적. 누나를 걱정하면서도 증거 확보를 먼저 챙기는 냉정함.', '노정희(순살라면)의 남동생. 누나와 함께 방송을 보고 있다가, 누나가 모텔에 가겠다고 하자 동행을 자처. 영상통화 촬영을 맡고 현장에서 누나를 보호하는 역할.', 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    name = EXCLUDED.name,
    profile_image_url = EXCLUDED.profile_image_url,
    gender = EXCLUDED.gender,
    age = EXCLUDED.age,
    appearance = EXCLUDED.appearance,
    mbti = EXCLUDED.mbti,
    personality = EXCLUDED.personality,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO character_custom_field (id, character_id, field_name, field_value, sort_order)
VALUES ('eb7a6ca8-65f1-4fc8-b363-5c4a2c07da89', '6cb02138-173e-4b68-a612-62a2e502e868', '역할', '누나의 보호자 겸 증거 확보 담당. 영상통화 시 카메라를 들고 촬영.', 1)
ON CONFLICT (id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    field_name = EXCLUDED.field_name,
    field_value = EXCLUDED.field_value,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('8783b128-e251-4ff3-9ed5-2f1e25c70c76', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '오션(Ocean) 방송 플랫폼', '작품 내 가상의 인터넷 방송 플랫폼. 실제 아프리카TV/트위치와 유사한 포지션. 스트리머가 개인 방송을 할 수 있으며, ''물방울''이라는 후원 시스템이 있다. 방송 시작 시 ''[만년취준생 님의 방송이 시작되었습니다.]'' 형태의 알림이 뜬다. 시청자 수가 실시간으로 표시되며, 즐겨찾기·구독·알림 설정 기능이 있다. 스트리머 전용 대회도 열리며, 참가 조건으로 최소 20시간 방송 이력이 필요하다.', 1)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('3bd07e90-48b3-4bbe-9a71-edc5554992e1', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '인방갤 (인터넷방송 게시판)', '국내 대형 커뮤니티의 인터넷방송 관련 게시판. 방송 클립이나 화제가 되는 장면이 올라오는 곳. 만년취준생의 첫 방송 클립이 ''시청자 보고 면접 가면 죽는다고 예언한 스트리머''라는 제목으로 인기글에 올라감. 반응은 대체로 싸늘하지만 호기심을 유발하여 시청자 유입에 기여.', 4)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('fafb8b0e-4320-4d08-960b-b131695f693a', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '신병(神病)', '무속에서 영적 존재와 연결되는 과정에서 겪는 신체적·정신적 변화. 박지훈은 방송 시작 버튼을 누르는 순간 신병이 처음 도짐. 증상: 온몸이 으슬으슬 떨림, 이마에 식은땀, 열이 순식간에 치솟음, 범상치 않은 기운이 몸속으로 빨려 들어옴. 신병 이후 신안(神眼)이 열림.', 5)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('7d6e629f-c418-430d-aec0-b30aa3a6cad6', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '복채 규칙', '신점의 대가. 물방울 500개가 박지훈의 정확한 복채. 많이 받으려 하면(1000개) 두통이 발생하고, 공짜로 하려 해도 두통 발생. 500개에서만 두통이 없음. 신적 존재가 대가의 균형을 강제하는 것으로 추정. 추가 규칙: 방송당 1명은 공짜로 봐줌(본인이 선택). 선착순 예약제. 다음 방송부터 적용.', 9)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('b220fa3a-5491-41e5-a288-da5683d1273e', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', NULL, '905번 버스 사고', '강진수(29세무직)가 오성전자 면접을 위해 타려던 버스. 횡단보도 앞에서 대형 트럭이 중심을 잃고 버스 옆구리를 들이받음. 유리 파편, 찢겨나간 차체, 사상자 발생. 강진수가 어머니 전화로 버스를 놓치지 않았다면 사망했을 사건. 박지훈의 신안이 실제로 작동함을 증명한 핵심 사건.', 10)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('93f164a3-f049-4663-95d0-197fc08df396', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8783b128-e251-4ff3-9ed5-2f1e25c70c76', '물방울 후원 시스템', '오션 플랫폼의 후원 화폐 단위. 시청자가 스트리머에게 물방울을 선물하면 ''[닉네임 님이 물방울 N개를 선물하셨습니다.]'' 알림과 함께 ''빠빵-'' 효과음이 울린다. 후원 시 메시지를 함께 남길 수 있다. 물방울 개수는 자유롭게 설정 가능(20개~500개 이상).', 2)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('5960c51a-1afe-444a-93ed-12ebefcfac1b', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '8783b128-e251-4ff3-9ed5-2f1e25c70c76', '뻐꾸기', '다른 스트리머의 방송으로 자기 시청자를 보내주는 행위. 김우식이 자기 방송을 일찍 끝내고 시청자들에게 박지훈의 방송을 보러 가달라고 한 것. 시청자 유입을 위한 스트리머 간 호의/교류 수단.', 3)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('672becf5-9549-435c-ae86-d5378aa6e41f', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', 'fafb8b0e-4320-4d08-960b-b131695f693a', '신안(神眼)', '신병을 통해 열린 영적 시각 능력. 채팅창 닉네임 너머로 그 사람의 과거·현재·미래가 환영(비전)으로 보인다. 핵심 제약: 인터넷 방송 중에만 작동. 방송 종료 시 신안이 닫히고, 밖에서 사람을 봐도 아무것도 보이지 않음. 과거는 사실적 장면(교통사고 등), 미래는 예언적 장면(버스 사고 등)으로 보임.', 6)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('70316277-8f08-4459-ab27-18f53895cd94', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', '672becf5-9549-435c-ae86-d5378aa6e41f', '신안 부작용', '신안을 무리하게 사용하면 코피, 두통, 눈 충혈, 전신 고통이 발생하며 심할 경우 실신. 첫 방송에서 무리하여 실신 후 다음 날 완전 회복. 회복 후에는 오히려 평소보다 컨디션이 좋아짐(어깨 가벼움, 만성 피로 해소, 눈이 맑아짐).', 7)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order)
VALUES ('c0a1da64-b186-429c-86d3-370ac8d7c220', 'ab4e90c6-5790-4ee0-aa93-2099a58992ae', 'fa20f003-1140-40a5-969d-66b74f659dcc', 'fafb8b0e-4320-4d08-960b-b131695f693a', '접신 상태', '방송 중 신안이 열리면 박지훈의 말투와 성격이 변한다. 평소의 무기력한 29세 무직 청년에서, 낮게 깔린 차가운 목소리로 단호하게 말하는 인물로 변모. ''시끄럽다'', ''쓸데없는 소리 하지 말고 볼 사람만 남아라'' 등 반말 사용. 본인 의지보다 말이 먼저 튀어나오는 감각. 방송 종료 후 되돌아보면 낯설게 느껴짐.', 8)
ON CONFLICT (id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    writer_id = EXCLUDED.writer_id,
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    content = EXCLUDED.content,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

COMMIT;
