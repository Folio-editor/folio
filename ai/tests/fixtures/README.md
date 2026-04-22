# AI 더미 테스트셋

AI 기능(인덱싱, 초안 생성, 검수) 프롬프트 테스트용 더미 데이터.

## 작품 구성
- dummy-work-1: (장르 추후 확정)
- dummy-work-2: (장르 추후 확정)
- dummy-work-3: (장르 추후 확정)

## 각 작품 폴더 내 파일
- meta.json: 작품 메타데이터 (제목, 장르, 시대, 톤, 문체)
- episodes.json: 회차 원문 (10~20화)
- characters.json: 인물 설정집
- worldnotes.json: 세계관 노트
- foreshadows.json: 복선 목록
- expected-summaries.json: "좋은 요약" 기준 예시 (프롬프트 평가용)

## 데이터 형식
각 JSON 파일의 스키마는 데이터 투입 시 확정.
