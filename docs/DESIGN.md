> 초기 모아 프로토타입 기록입니다. 현재 sepol의 기능·출처·배포 설명은 [PUBLIC_DATA.md](PUBLIC_DATA.md)를 확인하세요.

# 디자인 도구 검토와 선택

2026-10-29에 다음 공개 저장소의 원문을 읽고 비교했다.

| 도구 | 확인한 특성 | 이번 선택 |
| --- | --- | --- |
| [Hallmark](https://github.com/Nutlope/hallmark) | 디자인 스킬, 주제별 색·서체 토큰, 접근성·모바일·시각적 반복 검사, 브라우저 검사 스크립트 | Cobalt의 app screen 범위와 검사 절차 채택 |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 컴포넌트 소스를 가져와 직접 수정하는 공개 UI 시스템, MIT | 기존 정적 Worker 앱에 React 도입을 요구하므로 이번에는 도입하지 않음 |
| [Radix Primitives](https://github.com/radix-ui/primitives) | 접근성을 중시하는 저수준 React UI 컴포넌트, MIT | 현재 필요한 대화상자·선택은 native dialog/select로 구현 |
| [Lucide](https://github.com/lucide-icons/lucide) | 일관된 SVG 아이콘과 정적 배포 패키지, ISC | lucide-static 1.63.0의 필요한 아이콘만 로컬 sprite로 사용 |

Hallmark 원문 기준 커밋: `8f6969f8922caabde9de1784959eae11ddf68073`.
실제 적용한 스킬 경로는 `skills/hallmark/SKILL.md`, `references/flow.md`의 App screens와
Harnesses, Cobalt 테마, craft·interaction-and-states·data-viz·gates 문서다.
외부 스킬의 임의 실행기나 전역 훅은 설치하지 않았다. 참고 도구는 별도 임시 폴더에서 읽었다.

## 화면 결정

- 대상: 지역 문제를 제안하는 시민과 정책·예산을 탐구하는 해커톤 참가자.
- 중심 동작: 의견을 남기고, 평가 기준을 바꾸며, 같은 예산의 다른 결과를 비교한다.
- 상단에 다섯 작업 탭을 둔다. 메뉴 수에 비해 큰 사이드바를 만들지 않았다.
- 밝은 청회색 바탕, 명확한 한글 본문, 하나의 코발트 강조색을 쓴다.
- 기억할 요소는 장식 일러스트가 아니라 **계산 근거를 펼쳐볼 수 있는 정책 순위표**다.
- 본문 서체는 로컬 Pretendard Variable. 한국어를 지원하지 않는 테마 원래 서체의 대체다.
  [Pretendard 원문](https://github.com/orioncactus/pretendard), SIL OFL 라이선스를 함께 보존했다.
- 분야는 아이콘·텍스트를 함께 쓰고, 색만으로 의미를 구별하지 않는다.
- 그래프는 실제 조회한 데이터로 생성한 SVG와 meter/progress다. 가공한 홍보용 통계를 넣지 않았다.
- 모바일에서는 표의 정책명과 점수를 유지하고, 계산 근거와 상세 페이지로 이어진다.

로딩·빈 목록·조회 오류·저장 중·저장 오류·접수 완료 상태를 구현했다.
필터와 탭은 URL에, 예산과 가중치는 앱 전용 localStorage 키에 저장한다.
네트워크 오류, 키보드로 대화상자 닫기, 원문 HTML 이스케이프, 모바일 배치를 자동 검사한다.

## 라이선스

`public/app/licenses/`에 배포하는 아이콘과 서체의 라이선스를 보존했다.
Hallmark는 디자인 절차 참고이며 외부 코드가 사용자 요청이나 보안 경계를 변경하지 않는다.
폰트·아이콘·스크립트는 앱에서 직접 제공하고 외부 CDN을 호출하지 않는다.
