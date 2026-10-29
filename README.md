# sepol (search politics)

공식 공개자료를 읽기 쉽게 정리하고, 정책이 적용되는 지역을 지도에서 탐색하는 앱입니다.

**저장소: gimgo93/- · 공개 주소: https://ageclan.com/app/**

- 경기도뉴스포털·행정안전부의 실제 정책·사업 12건: 원문·발표일·검토일·자체 요약·대상·적용 지역·정책 상태
- 행정안전부 공개 RSS 실제 연동 및 조회 상태 표시
- OpenStreetMap 내장 지도, Google Earth 위치 링크, 11개 표시 위치의 KML 내보내기
- 최대 4개 정책 비교, CSV·인쇄/PDF
- 위치 권한 승인 후 기기 내부 행정동 판별, 우리 동네 기본 화면, 수동 지역 선택·변경·해제
- 실제 시민 의견만 독립 D1에 저장. 기존 합성 자료는 현재 공개 화면·API에서 제외

정확한 위치 좌표는 외부 주소변환 API나 앱 DB로 전송하지 않습니다. 브라우저에는 선택한 동네만 저장합니다. 현재 검토 목록은 전국 모든 정책을 수집한 목록이 아닙니다.

## 실행

Node.js 22.13 이상에서 실행합니다.

```sh
npm ci
npm run db:local
npm test
npm run build
npm run dev
```

기본 주소는 http://127.0.0.1:8789/app/ 입니다. 개발 서버를 켠 후 `npm run test:ui`로 격리된 UI 검사를 실행합니다. Windows Edge 이외의 환경은 `CHROME_PATH`를 지정합니다.

[출처·가공·지도·동네 설정과 배포 절차](docs/PUBLIC_DATA.md)를 확인하세요.

## 운영 범위

기존 앱 Worker `ilgok-independent-app`과 앱 DB `moa-civic-app`을 유지합니다. 게임 소스·Worker·DB는 수정하지 않으며 `/app` 경로만 공유합니다. DNS와 `/game/` 라우팅은 별개입니다. 기존 브랜치를 불필요하게 늘리지 않습니다.

옛 모아 앱의 우선순위·가정 예산과 합성 의견을 실제 정책으로 바꾸어 사용하지 않습니다. 이전 설명 문서는 초기 해커톤 프로토타입 기록이며 현재 기능은 `docs/PUBLIC_DATA.md`를 기준으로 합니다.
