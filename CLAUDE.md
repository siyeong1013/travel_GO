# travel GO (트래블고)

여행 일정 플래너 PWA. 현재 목표는 **개인용 MVP** (로그인 없음, 로컬 저장).

## 기술 스택

- Vite + React + TypeScript (strict)
- Tailwind CSS v4 (`@tailwindcss/vite`)
- 상태관리: Zustand
- 라우팅: React Router
- 로컬 DB: IndexedDB (Dexie)
- 드래그 정렬: dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) — 터치 지원
- 지도: Google Maps JavaScript API + Places API (New), React 바인딩은 `@vis.gl/react-google-maps`
- PWA: `vite-plugin-pwa` (generateSW, autoUpdate)
- 테스트: Vitest + `fake-indexeddb`

## 명령어

```bash
npm run dev       # 개발 서버
npm run build     # 타입체크 + 프로덕션 빌드
npm run preview   # 빌드 결과 미리보기 (PWA/오프라인 확인은 여기서)
npm test          # Vitest
npm run lint
```

## 폴더 구조

```
src/
  app/            # 라우터, 프로바이더, 레이아웃
  pages/          # 라우트 단위 화면 (얇게 유지, 로직은 features로)
  features/
    trips/        # 여행 목록/생성/수정 (컴포넌트, 스토어, 훅)
    schedule/     # 날짜별 일정, 드래그 정렬, 메모/시간 편집
    places/       # 장소 검색 (Places API)
    map/          # 지도, 마커, 경로선
  data/
    models/       # 도메인 타입 (Trip, ScheduleItem, Place)
    repositories/ # 저장소 인터페이스 (TripRepository 등)
    local/        # IndexedDB(Dexie) 구현체
    index.ts      # 구현체 주입 지점 (나중에 http 구현으로 교체)
  lib/            # 날짜 유틸, id 생성, google maps 로더 등
  components/ui/  # 공용 UI (Button, BottomSheet, EmptyState ...)
```

## MVP 범위 밖

- 로그인/계정, 기기 간 동기화, 일정 공유·협업, 예약(항공/숙소/투어), 리뷰·커뮤니티, 도시 가이드 콘텐츠, 실제 경로 계산, 푸시 알림.
- 위 기능은 **요청 없이 구현하지 않는다.**

## 핵심 규칙

### 저장소 레이어
- UI/스토어는 **반드시 `data/repositories`의 인터페이스만** 사용한다. Dexie/IndexedDB를 직접 import 하지 않는다.
- 구현체 선택은 `src/data/index.ts` 한 곳에서만. 백엔드 이전 시 `data/http/` 구현을 추가하고 여기만 바꾼다.
- 모든 저장소 메서드는 `Promise`를 반환한다 (로컬이어도 비동기 — HTTP와 시그니처 동일).
- 저장소는 도메인 타입을 입출력한다. DB 스키마 전용 타입이 생기면 저장소 내부에서 변환한다.
- Dexie 스키마 변경은 `db.version(n).stores(...).upgrade()`로 **버전을 올려서** 한다.
- 기존 `version` 정의는 **삭제하거나 수정하지 않는다** (기존 사용자 데이터 마이그레이션 보장).

### 데이터 모델 규칙 (백엔드 이전 대비)
- ID: `crypto.randomUUID()` (PostgreSQL `uuid`와 호환). 클라이언트에서 생성.
- 날짜: `'YYYY-MM-DD'` 문자열 (여행지 현지 날짜, 타임존 없음). `Date` 객체로 저장하지 않는다.
- 시간: `'HH:mm'` 문자열, 선택값.
- 타임스탬프: `createdAt`, `updatedAt`는 ISO 8601 문자열.
- 정렬: 같은 날짜(또는 보관함) 안에서 `order` 정수 (0부터). 순서 변경 시 해당 날짜 항목의 `order`를 재부여.
- 장소 정보는 Places 응답을 **스냅샷으로 저장** (오프라인 조회 + API 비용 절감). `placeId`는 참조용.
- **보관함(날짜 미지정)**: `ScheduleItem.date`는 `string | null`. `null`이면 보관함 항목이다.
  - 보관함 항목은 날짜 항목과 별개의 `order`를 가진다.
  - 보관함 ↔ 날짜(또는 날짜 ↔ 날짜)로 옮기면 출발지·도착지 양쪽의 `order`를 재부여한다.
- 여행 기간이 줄어들면 범위 밖 날짜의 일정은 삭제하지 않고, **"보관함으로 이동 / 삭제"** 중 사용자가 선택한다.

### 데이터 보존
- 앱 시작 시 `navigator.storage.persist()`를 요청한다 (지원 시).
- MVP에 **JSON 내보내기/가져오기** 기능을 포함한다 (백업 + 향후 서버 이전용).
  - 내보내기 형식에 `schemaVersion` 필드를 포함한다.
  - 가져오기는 기존 데이터와 **병합 / 덮어쓰기** 중 사용자가 선택하고, 실행 전 확인 단계를 둔다.
  - 병합 시 같은 `id` 충돌은 **`updatedAt`이 더 최근인 쪽**을 남긴다 (같으면 기존 유지).
  - 병합 후 날짜(보관함 포함)별로 `order`가 겹치거나 비면, 기존 순서(`order` → `createdAt`) 기준으로 0부터 재부여한다.
  - 가져오기 전 미리보기에 **"새로 추가 n개 / 갱신 n개 / 유지 n개"** 를 보여준다.

### Google Maps / Places
- API 키는 `.env.local`의 `VITE_GOOGLE_MAPS_API_KEY`. 커밋 금지 (`.env.example`만 커밋).
- Map ID가 필요한 기능(Advanced Marker)은 `VITE_GOOGLE_MAPS_MAP_ID`.
- Places는 **Places API (New)** 사용 (`AutocompleteSuggestion`, `Place.fetchFields`). 레거시 Autocomplete 위젯 사용 금지.
- 요청 필드는 필요한 것만 (`id, displayName, formattedAddress, location`) — 과금 최소화. 자동완성은 세션 토큰 사용.
- 키가 없거나 오프라인이면 지도/검색 영역에 안내 상태를 보여주고 앱은 정상 동작해야 한다.
- 경로선: MVP는 일정 순서대로 장소를 **직선(Polyline)** 으로 연결한다.
- Directions/Routes API는 **사용하지 않는다** (별도 과금).
- 실제 길찾기는 구간별 "구글맵에서 길찾기" 외부 링크(`https://www.google.com/maps/dir/?api=1&...`)로 제공한다.

### PWA / 오프라인
- 앱 셸은 서비스워커로 프리캐시. 여행/일정 조회는 IndexedDB 기반이라 오프라인 동작.
- 지도 타일·장소 검색은 오프라인 미지원 (안내 표시). 구글 지도 리소스를 SW로 캐시하지 않는다 (약관).
- iOS Safari에서 설치되지 않은 상태면 "공유 → 홈 화면에 추가" 안내를 **1회** 보여준다.
  - 닫으면 다시 띄우지 않고, 설정 화면에서 다시 볼 수 있다.
  - 저장소 보존을 위해 설치를 권장하는 문구를 포함한다.

### UI (모바일 우선)
- 기준 폭 360~430px. 데스크톱은 가운데 정렬된 모바일 폭 컨테이너.
- 주요 액션은 화면 **하단** (엄지 영역): 하단 고정 버튼/FAB, 바텀시트.
- 터치 타깃 최소 44px. `env(safe-area-inset-*)` 반영.
- 삭제 등 파괴적 동작은 확인 단계 필요.
- UI 문구는 한국어.
- 드래그 정렬:
  - dnd-kit `TouchSensor`에 activation delay(약 200ms, tolerance 5px)를 주거나 드래그 핸들을 사용해 **스크롤과 충돌하지 않게** 한다.
  - 같은 날짜 안의 이동과 **날짜 간(보관함 포함) 이동**을 모두 지원한다.

### 코드 스타일
- 함수 컴포넌트 + 훅. default export 지양 (페이지 컴포넌트 제외 가능).
- 경로 별칭 `@/` → `src/`.
- Zustand 스토어는 feature 폴더 안에 (`features/trips/tripStore.ts`). 스토어 액션이 저장소를 호출.

## 진행 방식
- 구현 단계별로 진행하고, 각 단계 끝에 실행/확인 방법을 제시한다.
- 결정사항이 바뀌면 이 파일을 갱신한다.

## 결정 로그
- 2026-11-02: 초기 스택/구조/데이터 모델 결정 (위 내용).
- 2026-11-02: 데이터 보존(persist·JSON 백업), Dexie 버전 규칙, 보관함(date=null), 날짜 간 드래그·터치 설정, 직선 경로+외부 길찾기 링크, iOS 설치 안내, MVP 범위 밖 항목 추가.
- 2026-11-02: 가져오기 병합은 updatedAt 최신 우선, 병합 후 그룹별 order 재부여, 미리보기에 추가/갱신/유지 개수 표시.
- 2026-11-02: `/root/pjt`는 독립 git 저장소(main). 상위 `/root` 저장소는 `.gitignore`로 `pjt/` 제외.
- 2026-11-02: 0단계 완료. Vite 8 / React 19 / React Router 7 / Tailwind 4. TypeScript는 typescript-eslint 호환 때문에 `~6.0` 고정 (7.x 금지, typescript-eslint 지원 시 재검토).
