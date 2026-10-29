# sepol — 공개 정책·지도·동네 설정

## 현재 기능

sepol(search politics)은 실제 공식 발표를 읽기 쉽게 정리하고 적용 지역을 지도에서 살피는 서비스다. `https://ageclan.com/app/`에 배포하며 게임과 Worker·DB를 공유하지 않는다.

- `data/reviewed-publications.json`: 2026-10-29 원문 검토 자료 12건. 경기도뉴스포털 10건, 행정안전부 2건. 항목별 공공누리 제1유형·원문 URL·발행일·자체 작성 요약·적용 범위·위치 판단 근거 보존.
- `data/policy-catalog.json`: 표시용으로 정규화한 정책 목록. 원문에서 확인한 사업비만 표시하며, 예산·동의 수·심각도·효과 점수를 임의 생성하지 않는다.
- `data/source-research.json`: API/RSS 조사 결과와 접근·가공 제한.
- 행정안전부 실제 공개 RSS를 서버에서 조회하고 30분 캐시한다. 검토한 정책 목록과 최신 RSS 목록을 구분한다. 오류를 오래된 자료로 숨기거나 실시간 수신 성공으로 표시하지 않는다.
- 이전 38개 합성 의견과 9개 가상 정책은 현재 화면에서 사용하지 않는다. 옛 `/api/dashboard`, `/api/opinions`는 410을 반환한다. 원래 DB 기록은 삭제하지 않는다.
- 실제 접수 의견만 `civic_feedback_v2`에 저장한다. 정책 요약은 시민 청원으로 표시하지 않는다.

## 출처

1. 경기도뉴스포털 공개 원문: https://gnews.gg.go.kr/ — 선별한 기사별 공공누리 제1유형. REST API는 문서상 31개 시군 대상·인증키 필요이므로 사설 앱 연동에 사용하지 않는다. 이번 원문 검토 자료를 API 실시간 수집이라고 표시하지 않는다.
2. 행정안전부 RSS: https://www.mois.go.kr/gpms/view/jsp/rss/rss.jsp?ctxCd=1012 — 인증키 없이 실제 XML 응답 확인. 안내 https://mois.go.kr/frt/sub/a08/rss/screen.do . `title/link/pubDate`만 최신 목록에 노출하고 원시 HTML 본문은 표시하지 않는다.
3. 온통청년: https://www.youthcenter.go.kr/cmnFooter/openapiIntro/oaiDoc — 인증키 필요, 조사만 완료.
4. 경기데이터드림: https://data.gg.go.kr/portal/openapi/usagePage.do — 인증키 없이 sample은 5건 제한, 전체 정책 목록으로 사용하지 않는다.
5. 서울시 RSS는 응답했지만 현재 확인 기사 대부분에 변경금지 조건이 있어 이번 가공 목록에서 제외했다. 정책브리핑 RSS는 2026-07-01 중단 공지를 확인해 사용하지 않았다.

## 지도와 Google Earth

내장 지도는 로컬 배포 Leaflet 1.9.4와 OpenStreetMap 표준 타일을 사용한다. 일반적인 현재 화면 조회만 하며 타일 선다운로드·오프라인 지도 저장 기능은 없다. 지도에 OSM 저작권을 표시한다.

지도에는 11개 표시 위치가 있다. 정확한 시설 주소·사업 경계가 확인되지 않으면 행정구역 대표 위치로 표시한다. 다의적인 교량 검색 결과와 행사장 검색 결과를 정확한 시설로 채택하지 않았다. 시흥의 행사장과 정책 센터의 주소를 동일시하지 않았다. 지도점별 원문 근거·좌표 출처·정밀도 설명을 보존한다.

Google Earth 웹은 사이트에 직접 iframe으로 넣지 않는다. 각 위치를 Earth 검색 URL로 연결하고 다중 위치는 `application/vnd.google-earth.kml+xml` KML로 내보낸다. KML에는 요약·원문·확인일·좌표 해석이 함께 들어간다.

공개 장소 좌표 캐시는 `data/public-location-cache.json`이다. 일회성 Nominatim 조회는 단일 실행·초당 1회 이하·결과 캐시 원칙을 지킨다. 시민 좌표나 사용자 주소를 Nominatim에 보내지 않는다. 정책: https://operations.osmfoundation.org/policies/nominatim/ . 애매한 결과는 수동으로 검토하고 채택하지 않는다.

## 우리 동네와 위치 권한

- `동네 설정 → 위치 권한 요청`을 누를 때 HTML Geolocation 권한을 요청한다. 브라우저가 실제 허용 창을 관리한다.
- 승인한 좌표를 브라우저 안에서 2026-10-01 행정동 경계와 point-in-polygon으로 대조한다. 정확한 좌표는 서버·외부 주소변환 API·DB·localStorage로 보내거나 저장하지 않는다.
- localStorage에는 선택한 행정동의 코드·이름·대표 위치·설정 방법만 저장한다. 원래 GPS 좌표가 아니다.
- 위치 설정 방식이 자동이고 이미 권한이 `granted`일 때만 재방문 시 위치를 재확인한다. 수동 변경하면 자동 갱신을 중지한다. 설정 해제로 브라우저의 저장 동네를 제거할 수 있다. 권한 철회는 브라우저 설정에서 한다.
- 거부·시간초과·조회 실패·국외·경계 밖은 수동 선택을 안내한다. 오차 1.5km 초과는 자동 확정하지 않는다. 경계 가까이에서는 직접 확인·변경을 권장한다.
- 시·도/시군구/읍면동 선택은 3,559개 행정동 목록을 사용한다. 2026-10-01 이후 변동은 자동 반영하지 않는다.
- 동네 관련 정책은 원문의 적용 범위(전국·광역·시군)를 기준으로 연결한다. 가까운 위치라는 이유만으로 동네 주민 전체가 대상이라고 주장하지 않는다. 현재 정책 12건은 전국 모든 정책을 포함하지 않으며 데이터가 부족한 지역에는 전국 자료 위주로 표시될 수 있다.

경계 출처 표기: 본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다. sepol에서 소수점 5자리 반올림·시도별 분할·색인을 추가했습니다. 원본 SHA256은 `public/app/regions/index.json`에 보존했습니다.

경계 데이터 재생성:

```sh
# 공개 원본을 별도로 내려받은 뒤 파일 경로를 인자로 전달
# https://raw.githubusercontent.com/vuski/admdongkor/master/ver20261001/HangJeongDong_ver20261001.geojson
node scripts/prepare-neighborhoods.mjs /absolute/path/HangJeongDong_ver20261001.geojson
npm run data:prepare
```

## 검증과 배포

```sh
npm ci
npm run db:local
npm test
npm run build
npm run dev
# 별도 터미널, Windows 기본 Edge 사용 또는 CHROME_PATH 지정
npm run test:ui
```

UI 검사는 localhost에서만 작성하며 테스트 UUID 한 행만 로컬에서 정리한다. 위치는 모의 좌표로 검증하며 사용자 브라우저 권한을 조작하지 않는다. 실제 운영 DB에 검증용 시민 의견을 생성하지 않는다.

원격 DB ID는 `bc455ddb-e9c2-4aee-a63f-ea354345de60`이다. 기존 `moa-civic-app` 이름은 데이터를 유지하기 위해 그대로 쓴다. Worker 이름도 `ilgok-independent-app`을 유지한다. 환경의 기본 Wrangler 로그인을 쓰려면 해당 CLI를 직접 실행한다. 앱 래퍼는 XDG_CONFIG_HOME을 작업 폴더로 격리한다.

```sh
# MOA_DATABASE_ID 환경 변수에 기존 앱 DB ID를 설정
node scripts/prepare-deploy.mjs
node node_modules/wrangler/bin/wrangler.js d1 migrations apply APP_DB --remote --config .output/wrangler.deploy.json
node node_modules/wrangler/bin/wrangler.js deploy --config .output/wrangler.deploy.json
```

배포 범위는 `ageclan.com/app`, `ageclan.com/app/*`뿐이다. DNS·게임 Worker·게임 DB를 변경하지 않는다. 0003 migration은 새 의견 테이블을 추가하며 옛 기록을 삭제하지 않는다.
