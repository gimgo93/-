# 모아

시민의 목소리를 정책 우선순위와 예산 배분으로 연결하는 시민 참여 앱입니다.
인문사회 융합인재 해커톤 계획서의 앱 구성요소를 바탕으로 만들었습니다.

**저장소: gimgo93/-** · **배포 대상: ageclan.com/app/**

aGe-Clan과 다른 프로젝트입니다. 코드·Worker·DB를 분리하고 도메인 경로만 공유합니다.
브랜치는 두 개 이상 만들지 않는 기존 저장소 방침을 유지합니다.

## 할 수 있는 일

- 시민 의견 접수와 독립 D1 DB 저장, 키워드 기반 분야 분류와 근거 표시
- 심각성·취약계층 영향·빈도를 반영하는 정책 우선순위와 가중치 조절
- 예산·비용·수혜 규모를 바꾸는 세 가지 배분 방식의 비교
- 의견 추이·분야별 비중 시각화, 정책 제안서와 CSV·인쇄/PDF
- 시연 자료와 시민 접수 의견의 분리, 검색과 지역·분야 필터

38개 의견과 9개 정책의 초기 자료는 **합성 시연 데이터**입니다.
비용과 수혜 인원은 비교용 가정이며 실제 통계나 확정 예산이 아닙니다.
분류는 설명 가능한 한국어 키워드 규칙이며, 학습된 언어모델을 사용한다고 주장하지 않습니다.

## 로컬 개발

Node.js 22.13 이상이 필요합니다.

```sh
npm ci
npm run db:local
npm test
npm run build
npm run dev
```

기본 포트 8789의 `/app/`에서 실행됩니다. 로컬 D1은 `.wrangler/state`에 보존됩니다.
초기화 명령은 적용된 migration을 기록하므로 반복 실행할 수 있습니다.

Chromium을 사용할 수 있으면 서버 실행 상태에서 UI 검증을 실행합니다.

```sh
CHROME_PATH=/usr/bin/chromium npm run test:ui
```

의견 접수·중복 방지·공개 내용 이스케이프·가중치·예산·오프라인 복구·24개 화면 조건을 검사합니다.
이 명령은 localhost에만 작성 요청을 보내며, 검증을 위해 만든 의견을 로컬 DB에서 삭제합니다.

## 파일

| 위치 | 역할 |
| --- | --- |
| `public/app/app.js`, `index.html`, `moa.css` | 화면과 상호작용 |
| `public/app/tokens.css`, `base.css` | 디자인 토큰과 접근성 기본값 |
| `public/app/logic.js` | 분류·우선순위·예산 계산과 입력 검증 |
| `src/worker.js` | `/app` 라우팅, 조회·접수 API, D1 연결 |
| `migrations/` | 독립 DB 스키마와 분리된 시연 자료 |
| `scripts/prepare-deploy.mjs` | 앱 DB ID를 검증하고 배포 설정 생성 |

[계획서와 기능 연결](docs/APP_PLAN.md) · [디자인 도구 비교](docs/DESIGN.md) · [실행 검증](docs/VALIDATION.md) · [배포 안내](docs/DEPLOYMENT.md)

## 도메인 게시 상태

GitHub push는 실제 Worker 게시가 아닙니다. Cloudflare 인증, 독립 앱 DB 생성,
기존 DNS 프록시·라우트 호환성 확인이 필요합니다. 배포 안내에 상세 절차가 있습니다.
`/game/` 또는 `ageclan.com/*`를 이 앱으로 라우팅하지 마세요.
