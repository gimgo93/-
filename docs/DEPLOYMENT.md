# 독립 앱 배포

이 프로젝트의 저장소는 **gimgo93/-**이고 배포 주소는 **https://ageclan.com/app/**입니다.
`gimgo93/aGe-Clan`에 파일을 추가하거나 게임 Worker를 교체하지 않습니다.

## 개발

Node.js 22.13 이상에서 저장소 루트에서 실행합니다.

```sh
npm ci
npm test
npm run build
npm run dev
```

로컬 서버의 `/app/`에서 화면을 확인합니다. 기본 포트는 8789입니다.
`public/app/index.html`, `style.css`, `icon.svg`가 시작 화면입니다.
이후 앱의 정적 파일을 `public/app/`에 추가하고 서버 기능은 `src/worker.js`에 구현할 수 있습니다.
API를 만들 때는 `/app/api/`처럼 이 앱 경로 아래에 둡니다.
현재 화면은 준비 페이지이며 로그인·저장·백엔드 기능은 아직 없습니다.

## Cloudflare 연결 조건

- `ageclan.com`이 있는 Cloudflare 계정에서 별도 Worker `ilgok-independent-app`을 사용합니다.
- `wrangler.jsonc`의 라우트는 `ageclan.com/app`와 `ageclan.com/app/*` 두 개뿐입니다.
  `ageclan.com/*`로 확대하지 마세요. `www` 호스트는 이번 라우트에 포함하지 않습니다.
- Worker route는 **프록시 활성화된 DNS 레코드**가 필요합니다. 기존 문서의 DNS only 설정이
  여전히 적용 중이라면 라우트만 배포해도 연결되지 않습니다.
- 현재 도메인의 A/CNAME 대상, Cloudflare 프록시 상태, 기존 Worker 라우트 및 TLS 호환성을
  먼저 확인하세요. Sites origin/인증 TXT를 지우거나 임의로 DNS 대상을 교체하지 마세요.
- 프록시 전환이 필요한 경우 Sites origin과 Cloudflare 프록시의 호환성을 확인한 뒤
  `/game/`, 기존 API 및 WebSocket이 계속 작동하는지 검증해야 합니다.
  아직 이 확인이 끝나지 않았으면 DNS 전환을 진행하지 마세요.

DNS 프록시 전환을 사용할 수 없으면 현재 호스팅의 경로 라우팅 지원이 필요합니다.
DNS 레코드만으로 `/app` 같은 URL 경로를 분리할 수는 없습니다.

## 인증과 게시

Cloudflare 인증을 준비합니다. 로컬 PC는 `npx wrangler login`을 사용할 수 있습니다.
클라우드에서는 환경 설정에 `CLOUDFLARE_API_TOKEN`을 안전하게 등록합니다.
토큰을 소스나 채팅에 넣지 마세요. 프록시 인증 대상은 `api.cloudflare.com`입니다.

필요한 최소 권한은 대상 계정의 **Workers Scripts: Edit**, 대상 zone의
**Workers Routes: Edit**, **Zone: Read**입니다. DNS 확인에는 **DNS: Read**가 필요합니다.
계정 선택이 필요한 경우 비밀이 아닌 `CLOUDFLARE_ACCOUNT_ID`를 환경에 지정합니다.
DNS 편집 권한은 기본 배포에 필요하지 않으며 이 프로젝트는 DNS를 자동 변경하지 않습니다.

```sh
npm run deploy
```

GitHub push만으로 자동 배포되지는 않습니다. 배포 명령은 앱 Worker와 두 라우트를 갱신합니다.
기존의 정확히 같은 라우트가 있으면 소유 Worker를 확인한 뒤 교체 여부를 결정하세요.
`workers.dev`와 공개 preview URL은 기본적으로 비활성화했습니다.

## 게시 후 확인

1. `/app`가 `/app/`로 이동하고 준비 화면, CSS와 아이콘이 반환되는지 확인합니다.
2. `/app/missing`이 404인지 확인합니다.
3. 게임의 `/game/`, 기존 API 및 실제 WebSocket 연결을 확인합니다.
4. 문제가 생기면 새 Worker의 `/app`와 `/app/*` 라우트만 해제합니다.

## 도메인을 함께 사용하는 범위

저장소와 Worker는 독립이지만 같은 호스트의 경로를 공유하므로 브라우저 출처는 같습니다.
새 앱에서는 게임의 쿠키·localStorage·Service Worker를 재사용하지 마세요.
저장소 키에 앱 전용 접두사를 쓰고, 쿠키와 Service Worker scope를 `/app/`로 제한하세요.
계정·데이터까지 강한 출처 격리가 필요해지면 별도 서브도메인을 검토합니다.
