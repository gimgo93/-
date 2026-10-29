CREATE TABLE policies(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,cost INTEGER NOT NULL CHECK(cost>0),beneficiaries INTEGER NOT NULL CHECK(beneficiaries>=0));
CREATE TABLE opinions(id TEXT PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL,district TEXT NOT NULL,category TEXT NOT NULL,policy_id TEXT NOT NULL REFERENCES policies(id),severity INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 5),vulnerability INTEGER NOT NULL CHECK(vulnerability BETWEEN 1 AND 5),classification_method TEXT NOT NULL DEFAULT 'keyword',is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)),created_at TEXT NOT NULL);
CREATE INDEX opinions_source_date ON opinions(is_demo,created_at);
CREATE TABLE request_limits(id TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX request_limits_expiry ON request_limits(expires);

-- All costs (10,000 KRW) and beneficiary counts are simulation assumptions.
INSERT INTO policies VALUES
('lighting','어두운 골목길 조명 개선','생활안전','야간 보행 구간에 조명을 설치하고 정기 점검 체계를 마련합니다.',2800,420),
('bus','마을버스 배차 간격 단축','교통','출퇴근 시간대 마을버스 운행을 늘려 이동의 불편을 줄입니다.',4500,600),
('clinic','찾아가는 동네 진료소','의료','의료 접근이 어려운 주민을 위한 순회 진료를 운영합니다.',6000,300),
('access','누구나 다니는 경사로','복지','주요 생활시설의 턱을 낮추고 휠체어 접근 경사로를 설치합니다.',1800,160),
('recycle','생활권 분리수거 거점','환경','분리수거 공간을 정비하고 수거 안내와 관리 인력을 연결합니다.',1400,500),
('shade','무더위 쉼터와 그늘길','환경','보행 동선에 그늘과 쉬어 갈 수 있는 공간을 마련합니다.',3200,450),
('crosswalk','안심 통학로 보행 신호','교통','학교 주변 횡단보도의 신호 시간과 보행 환경을 개선합니다.',2400,380),
('care','이웃 돌봄 방문 서비스','복지','돌봄이 필요한 어르신에게 정기 방문과 생활 지원을 연결합니다.',3800,120),
('community','주민 생활 제안 검토','기타','새로운 생활 문제를 검토하고 주민과 실행 방안을 구체화합니다.',1000,100);
