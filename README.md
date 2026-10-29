# -
2026 통합인재 해커톤
에너지 관련 주제로 선정하였으며 어플 구성요소와 보고서 기반으로 만들 것
브랜치는 두개 이상 제작하지 않을 것

## 독립 앱 개발 공간

새 앱의 코드는 이 저장소(`gimgo93/-`)에서 관리합니다.
연결할 주소는 **https://ageclan.com/app/**이며, aGe-Clan 게임과 별도 프로젝트입니다.

- 시작 화면: `public/app/`
- 독립 Worker 및 경로 처리: `src/worker.js`, `wrangler.jsonc`
- 개발: `npm ci` → `npm run dev` (로컬 `/app/`, 포트 8789)
- 검증: `npm test` → `npm run build`
- 도메인 연결 및 게시 조건: [배포 안내](docs/DEPLOYMENT.md)

현재는 준비 화면과 배포 구성을 제공합니다. 실제 도메인 연결은 Cloudflare 인증과
기존 도메인의 프록시·라우트 호환성을 확인한 뒤 진행합니다.
