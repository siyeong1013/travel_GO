# travel GO (트래블고)

여행 일정 플래너 + 여행 가계부(동행자 정산) PWA. 현재 목표는 **개인용 MVP** (로그인 없음, 로컬 저장).

## 기술 스택

- Vite + React + TypeScript (strict)
- Tailwind CSS v4 (`@tailwindcss/vite`)
- 상태관리: Zustand
- 라우팅: React Router
- 로컬 DB: IndexedDB (Dexie)
- 드래그 정렬: dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) — 터치 지원
- 지도: Google Maps JavaScript API + Places API (New), React 바인딩은 `@vis.gl/react-google-maps`
- PWA: `vite-plugin-pwa` (generateSW, autoUpdate)
- 환율: open.er-api.com (무료·키 없음·CORS 허용·166개 통화·하루 1회 갱신). 화면에 출처(ExchangeRate-API) 표기 필요.
- 테스트: Vitest + `fake-indexeddb`, 컴포넌트 테스트는 Testing Library + happy-dom

## 명령어

```bash
npm run dev       # 개발 서버
npm run build     # 타입체크 + 프로덕션 빌드
npm run preview   # 빌드 결과 미리보기 (PWA/오프라인 확인은 여기서)
npm test          # Vitest 1회 실행 (npm run test:watch: 감시 모드)
npm run lint
```

- 개발 모드에서는 브라우저 콘솔에서 `window.travelGo`(= `repositories`)로 데이터 레이어를 직접 호출할 수 있다. 예: `await travelGo.trips.list()`.

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
    expenses/     # 가계부: 동행자, 지출 기록, 환율 입력, 예산·요약
    settlement/   # 정산: 잔액, 최소 송금안, 송금 완료 기록, 텍스트 복사
  data/
    models/       # 도메인 타입 (Trip, ScheduleItem, PlaceSnapshot, Companion, Expense, ExpenseShare, Settlement, BackupFile)
    repositories/ # 저장소 인터페이스, 입력 타입, 에러 클래스
    rules/        # 저장소와 무관한 순수 규칙: 정렬·이동, 입력 검증, 백업 포맷, 가져오기 계획, 금액·환산, 분담, 잔액·정산
    local/        # IndexedDB(Dexie) 구현체
    index.ts      # 구현체 주입 지점 (나중에 http 구현으로 교체)
  lib/            # 날짜 유틸, id 생성, google maps 로더 등
  components/ui/  # 공용 UI (Button, BottomSheet, EmptyState ...)
  test/           # 테스트 설정·픽스처 (앱 코드에서 import 금지)
```

## MVP 범위 밖

- 로그인/계정, 기기 간 동기화, 일정 공유·협업, 예약(항공/숙소/투어), 리뷰·커뮤니티, 도시 가이드 콘텐츠, 실제 경로 계산, 푸시 알림.
- 가계부 관련: 동행자 계정 연동/실시간 공유, 영수증 사진, 카드 내역 연동, 송금 앱 연동.
- 위 기능은 **요청 없이 구현하지 않는다.**

## 핵심 규칙

### 저장소 레이어
- UI/스토어는 **반드시 `data/repositories`의 인터페이스만** 사용한다. Dexie/IndexedDB를 직접 import 하지 않는다.
- 구현체 선택은 `src/data/index.ts` 한 곳에서만. 백엔드 이전 시 `data/http/` 구현을 추가하고 여기만 바꾼다.
- 모든 저장소 메서드는 `Promise`를 반환한다 (로컬이어도 비동기 — HTTP와 시그니처 동일).
- 저장소는 도메인 타입을 입출력한다. DB 스키마 전용 타입이 생기면 저장소 내부에서 변환한다.
- Dexie 스키마 변경은 `db.version(n).stores(...).upgrade()`로 **버전을 올려서** 한다.
- 기존 `version` 정의는 **삭제하거나 수정하지 않는다** (기존 사용자 데이터 마이그레이션 보장).
- IndexedDB는 `null`을 인덱싱하지 못한다. 그래서 `scheduleItems.date`(보관함 = null)는 인덱스에 넣지 않고, `tripId`로 조회한 뒤 메모리에서 거른다.
- 저장소가 불변식을 지킨다: 날짜가 있는 일정은 항상 여행 기간 안에 있고, `order`는 그룹마다 0..n-1로 연속된다.
  - `trips.update`가 기간 밖 일정을 만들게 되면 `OutOfRangeItemsError(count, dates)`를 던지고 아무것도 바꾸지 않는다. UI는 사용자에게 선택을 받아 `{ outOfRangeItems: 'moveToInbox' | 'delete' }`로 다시 호출한다.
- 순수 규칙(정렬·이동·병합·백업 검증)은 `data/rules/`에 둔다. 저장소 구현과 스토어(낙관적 업데이트)가 같은 함수를 쓴다.
- 구현은 클래스 대신 팩토리 함수(`createLocalXxxRepository(db, now)`)로 만든다. 메서드를 떼어 써도 `this` 문제가 없고, 시계(`Clock`)를 주입받으므로 테스트 결과가 매번 같다.
- 에러는 `RepositoryError` 하위 클래스로 던지고 `code`를 붙인다. UI는 `code`를 한국어 문구로 바꿔 보여준다.
  - 에러 클래스 이름이 DOMException 이름(`NotFoundError`, `DataError`, `ConstraintError`, `AbortError` 등)과 **겹치면 안 된다.** Dexie가 트랜잭션 안에서 그런 이름의 에러를 다시 감싸서 `instanceof`가 깨진다 (`data/local/errors.test.ts`가 검사).

### 데이터 모델 규칙 (백엔드 이전 대비)
- ID: `lib/id.ts`의 `newId()` (UUID v4, PostgreSQL `uuid`와 호환). 클라이언트에서 생성.
  - 보안 컨텍스트(https, localhost)가 아니면 `crypto.randomUUID`가 없어서 `getRandomValues`로 대신 만든다. 폰에서 `http://<LAN IP>`로 접속한 경우가 여기에 해당한다.
- 값이 없음은 optional(`?`)/`undefined` 대신 **`null`** 로 표현한다 (JSON·PostgreSQL nullable 컬럼과 1:1). 메모가 없으면 빈 문자열 `''`.
- 날짜: `'YYYY-MM-DD'` 문자열 (여행지 현지 날짜, 타임존 없음). `Date` 객체로 저장하지 않는다. 날짜 계산은 `lib/dates.ts`를 쓴다 (UTC 기준이라 서머타임 영향 없음).
- 시간: `'HH:mm'` 문자열 또는 `null`.
- 타임스탬프: `createdAt`, `updatedAt`는 ISO 8601 문자열.
- 정렬: 같은 날짜(또는 보관함) 안에서 `order` 정수 (0부터). 순서 변경 시 해당 날짜 항목의 `order`를 재부여.
- 장소 정보는 Places 응답을 **스냅샷으로 저장** (오프라인 조회 + API 비용 절감). `placeId`는 참조용.
  - `PlaceSnapshot`의 `placeId`·`address`·`location`은 nullable이다. 직접 입력한 장소(예: "호텔 체크인")는 이 값들이 없고, `location`이 없으면 지도에 표시하지 않는다.
- **보관함(날짜 미지정)**: `ScheduleItem.date`는 `string | null`. `null`이면 보관함 항목이다. 코드에서는 **`inbox`** 라고 부른다.
  - 보관함 항목은 날짜 항목과 별개의 `order`를 가진다.
  - 보관함 ↔ 날짜(또는 날짜 ↔ 날짜)로 옮기면 출발지·도착지 양쪽의 `order`를 재부여한다.
- 여행 기간이 줄어들면 범위 밖 날짜의 일정은 삭제하지 않고, **"보관함으로 이동 / 삭제"** 중 사용자가 선택한다.

### 가계부·정산
- 모델: `Companion`, `Expense`, `ExpenseShare`, `Settlement`. 기존 규칙(UUID, 날짜 문자열, `createdAt/updatedAt`, 값 없음은 `null`, 저장소 인터페이스 경유)을 그대로 따른다.
  - `Trip`에 `settlementCurrency`(정산 통화, 기본 `'KRW'`)와 `budget`(정산 통화 최소 단위 정수 | `null`)을 추가한다.
  - `Companion { tripId, name, isMe, order }`: 여행을 만들면 "나"(`isMe`)가 자동으로 생긴다. "나"는 이름만 바꿀 수 있고 삭제할 수 없다. 이름은 한 여행 안에서 겹치지 않게 한다.
  - `Expense { tripId, date, amount, currency, exchangeRate, category, paymentMethod, payerId, splitMethod, memo, scheduleItemId }`
    - `category`: `food | transport | lodging | shopping | sightseeing | other` (식비/교통/숙소/쇼핑/관광/기타)
    - `paymentMethod`: `cash | card`, `splitMethod`: `equal | amount | ratio`
    - `exchangeRate`: `{ rate, quote, source, fetchedAt }`. `rate`는 소수 문자열(1 `currency` = `rate` × `quote`), `quote`는 기록 당시 정산 통화, `source`는 `same | api | last | manual`.
    - `scheduleItemId`는 nullable. 일정 항목을 지우면 연결만 `null`로 끊고 지출은 남긴다.
  - `ExpenseShare { tripId, expenseId, companionId, weight, amount }`: `amount`는 지출 통화 최소 단위. **한 지출의 분담액 합 = 지출 총액** (항상).
  - `Settlement { tripId, fromId, toId, amount, currency }`: "송금 완료"로 체크한 기록. 잔액에 반영하고, 체크 해제는 기록 삭제.
- 금액
  - 모든 금액은 **통화의 최소 단위 정수**로 저장한다 (KRW·JPY·VND는 1, USD·EUR 등은 0.01 단위). 부동소수점 금지.
  - 지원 통화와 소수 자릿수는 `data/rules/money.ts`의 고정 표로 둔다. 통화는 추가할 수 있지만 **이미 있는 통화의 자릿수는 바꾸지 않는다** (저장된 값의 뜻이 바뀌므로).
  - 환율은 소수 문자열로 저장하고, 환산은 BigInt 정수 연산으로 **지출 단위로 한 번만** 반올림한다.
- 분담
  - 균등 분담 = 모든 가중치가 1인 비율 분담. 비율 가중치는 양의 정수.
  - 균등·비율에서 나누어떨어지지 않는 나머지는 **결제자** 몫에 더한다. 결제자가 분담 대상이 아니면, 나머지만 갖는 결제자 행(`weight` 0)을 둔다.
  - 금액 직접 지정은 합계가 총액과 정확히 같아야 저장된다. 다르면 저장을 막고 차액을 안내한다.
  - 개인 지출 = 분담 대상이 결제자 1명 (잔액에 영향 없음).
- 정산
  - 지출마다 총액을 정산 통화로 환산하고, 분담액 비율대로 나눈 뒤 나머지는 결제자에게 준다. 그래서 잔액 합은 항상 정확히 0이다.
  - 동행자 잔액 = 낸 금액 − 부담 금액 + 보낸 송금 − 받은 송금 (정산 통화 기준).
  - 정산안은 송금 횟수를 최소화한다. 0이 아닌 잔액이 12명 이하면 정확한 방법(합이 0인 묶음으로 최대한 나누기), 그보다 많으면 큰 금액끼리 맞추는 탐욕 방법을 쓴다.
  - 계산은 모두 `data/rules`의 순수 함수로 두고 Vitest로 테스트한다 (균등 나머지, 결제자가 분담 대상이 아닌 경우, 다통화 반올림, 최소 송금, 송금 기록 반영).
  - 정산 결과는 텍스트로 복사한다 (카톡 공유용). 클립보드 API는 보안 컨텍스트에서만 되므로, 실패하면 공유 시트나 텍스트 직접 선택으로 대신한다.
- 환율: 지출을 기록할 때의 환율을 지출에 스냅샷으로 저장하고, 사용자가 언제든 고칠 수 있다. 온라인이면 API 값, 실패하거나 오프라인이면 같은 통화로 마지막에 쓴 환율, 그것도 없으면 직접 입력.
- 저장: Dexie `version(2)`로 `companions`, `expenses`, `expenseShares`, `settlements`를 추가한다. `upgrade()`에서 기존 여행에 기본값과 "나"를 넣는다 (여행의 `updatedAt`은 그대로 둔다. 사용자 수정이 아니므로 병합에서 이기면 안 됨).
  - "나"의 id는 `meCompanionId(tripId)`(= `lib/id.ts`의 `derivedId`, UUID v8)로 여행 id에서 **결정적으로** 만든다. 새 여행·DB 마이그레이션·v1 백업 변환 어디서 만들어도 같은 id가 되어, 병합해도 "나"가 둘이 되지 않는다. 마이그레이션·변환으로 만든 "나"의 시각은 여행의 `createdAt`을 쓴다.
- 저장소: `companions`(목록·추가·이름 변경·`usage`·삭제), `expenses`(입력은 분담 대상 `participants`, 분담액은 저장소가 `splitExpense`로 계산), `settlements`. 일정 항목을 지우면(직접 또는 기간 축소 시 삭제) 연결된 지출의 `scheduleItemId`만 `null`로 바꾼다. 여행을 지우면 딸린 것을 모두 지운다.
- 순수 규칙: `data/rules/money.ts`(통화 표·`parseAmount`·`convertAmount`), `split.ts`(`splitExpense`·`participantsFromShares`), `expense.ts`(입력 검증), `companion.ts`, `ledger.ts`(`buildLedger`: 합계·카테고리·날짜·동행자별 낸 돈/쓴 돈·잔액), `settlementPlan.ts`(`planTransfers`).
- 백업: `BACKUP_SCHEMA_VERSION`을 2로 올린다. v1 파일은 기본값과 "나"를 채워 변환한다. 병합할 때 지출과 그 분담은 한 묶음으로 다룬다 (파일 쪽 지출이 더 최근이면 분담 전체를 파일 것으로 교체).
- 동행자 삭제: "나"는 삭제 불가. 결제자이거나, 금액 지정 분담·송금 기록에 들어 있거나, 빼면 분담 대상이 아무도 안 남는 지출이 있으면 삭제를 막고(`CompanionInUseError`에 해당 지출·송금 목록) 화면이 그 목록을 보여준다. 균등·비율 분담에만 들어 있으면 확인 후 빼고 남은 사람끼리 다시 나눈다. 확인 화면에 쓸 영향 범위는 `companions.usage()`로 미리 조회한다.
- 정산 통화: 지출이나 송금 기록이 하나라도 있으면 바꿀 수 없다 (`CurrencyLockedError`). 환율 스냅샷이 기존 정산 통화 기준이기 때문.
- 예산: 여행 전체(동행자 모두의 지출 합계) 기준. 개인 예산은 범위 밖.
- 지출 날짜: 여행 기간 밖도 허용한다 (항공권·숙소 선결제). 날짜별 합계에서는 "여행 전/후"로 묶는다.
- 지원 통화: KRW JPY USD EUR CNY TWD HKD THB VND SGD PHP GBP AUD (`data/rules/money.ts`).
- 환율의 `quote`가 여행의 정산 통화와 다른 지출(백업 병합 등으로 생길 수 있음)은 합계에서 빼고 "환율을 다시 입력해야 하는 지출"로 따로 알린다.

### 데이터 보존
- 앱 시작 시 `navigator.storage.persist()`를 요청한다 (지원 시, `lib/storage.ts`). 결과는 콘솔에 `[travel GO] persistent storage: ...`로 찍는다.
  - Chrome은 조용히 판단하고(설치된 PWA는 보통 허용), Firefox는 권한 팝업을 띄운다.
- MVP에 **JSON 내보내기/가져오기** 기능을 포함한다 (백업 + 향후 서버 이전용).
  - 내보내기 형식에 `schemaVersion` 필드를 포함한다.
  - 가져오기는 기존 데이터와 **병합 / 덮어쓰기** 중 사용자가 선택하고, 실행 전 확인 단계를 둔다.
  - 병합 시 같은 `id` 충돌은 **`updatedAt`이 더 최근인 쪽**을 남긴다 (같으면 기존 유지).
  - 병합 후 날짜(보관함 포함)별로 `order`가 겹치거나 비면, 기존 순서(`order` → `createdAt`) 기준으로 0부터 재부여한다.
  - 가져오기 전 미리보기에 **"새로 추가 n개 / 갱신 n개 / 유지 n개"** 를 보여준다.
  - 병합 결과에서 여행 기간 밖에 놓인 일정은 보관함 끝으로 옮긴다 (미리보기에 개수 표시).
  - 삭제 기록(tombstone)이 없어서 병합은 합집합이다. 지운 여행이라도 파일에 있으면 다시 생긴다.
- 가져온 파일은 반드시 `parseBackupFile()`로 검증한다. 모르는 필드는 버리고, 오류가 나면 첫 오류 위치(예: `$.trips[0].startDate`)를 알려준다.
- 백업 포맷(`BackupFile`)을 바꾸면 `BACKUP_SCHEMA_VERSION`을 올리고, 이전 버전 파일을 변환하는 코드를 `parseBackupFile`에 추가한다. 예전 파일도 계속 가져올 수 있어야 한다.

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
- 서비스워커와 `storage.persist()`는 보안 컨텍스트에서만 동작한다. 폰에서 `http://<LAN IP>`로 접속하면 PWA를 확인할 수 없으므로 localhost나 https 터널을 쓴다.
- iOS Safari에서 설치되지 않은 상태면 "공유 → 홈 화면에 추가" 안내를 **1회** 보여준다.
  - 닫으면 다시 띄우지 않고, 설정 화면에서 다시 볼 수 있다.
  - 저장소 보존을 위해 설치를 권장하는 문구를 포함한다.

### UI (모바일 우선)
- 기준 폭 360~430px. 데스크톱은 가운데 정렬된 모바일 폭 컨테이너.
- 주요 액션은 화면 **하단** (엄지 영역): 하단 고정 버튼/FAB, 바텀시트.
- 터치 타깃 최소 44px. `env(safe-area-inset-*)` 반영.
- 삭제 등 파괴적 동작은 확인 단계 필요. 확인은 `ConfirmSheet`(하단 시트, 취소/실행 버튼을 엄지 영역에 나란히)로 한다.
- 메뉴·확인 창은 `components/ui/BottomSheet`(네이티브 `<dialog>`: 포커스 가두기, Esc·배경 탭으로 닫기)를 쓴다. 열려 있을 때만 마운트한다.
- 입력칸 글자 크기는 16px 이상 (iOS Safari가 포커스 시 확대하지 않도록). 공용 `TextField`를 쓴다.
- 폼 오류는 제출할 때 한꺼번에 보여주고, 첫 번째 오류 칸에 포커스를 옮긴다. 제출 버튼을 비활성화해서 막지 않는다.
- 날짜 입력은 네이티브 `<input type="date">`를 쓴다 (모바일 기본 날짜 선택기). 시작일을 바꿨을 때 종료일이 비었거나 더 이르면 종료일도 같이 바꾼다.
- UI 문구는 한국어. 데이터 레이어 에러는 `lib/errorMessage.ts`로 한국어 문구로 바꾼다.
- 뷰포트 메타에 `interactive-widget=resizes-content`를 둔다. Android Chrome에서 키보드가 올라오면 화면 높이가 줄어서, 하단 시트·버튼이 키보드에 가리지 않는다.
- 여행 상세(일정) 화면:
  - 선택한 날짜는 URL `?day=YYYY-MM-DD | inbox`에 둔다 (`replace`로 갱신해서 기록이 쌓이지 않게). 값이 없거나 잘못됐으면 여행 중에는 오늘, 아니면 Day 1을 연다.
  - 날짜 탭은 ARIA tabs다 (방향키·Home·End로 이동). 헤더 아래에 고정(sticky)하고, 선택한 탭은 가운데로 스크롤한다.
  - 날짜 일정에는 번호(1, 2, 3…)를 붙이고, 보관함 항목은 순서에 의미가 없으므로 번호 대신 점을 표시한다.
  - "다른 날짜로 이동"은 편집 시트의 날짜 선택으로도 할 수 있다. 옮긴 항목은 대상 그룹의 맨 끝에 들어간다. 키보드·스크린리더 사용자는 이 방법을 쓴다.
  - 편집 시트에서 삭제하면 확인 시트가 그 위에 겹쳐 뜬다. 취소하면 편집하던 내용이 그대로 남는다.
  - 여행 정보 수정은 ⋯ 메뉴 → `/trips/:id/edit` (만들기와 같은 `TripForm`). 저장하면 기록상 이전 화면(보던 `?day=` 포함)으로 돌아간다.
    - 바뀐 필드만 저장하고, 아무것도 안 바뀌었으면 저장하지 않는다 (`updatedAt`이 백업 병합을 좌우하므로).
    - 기간을 줄여 범위 밖 일정이 생기면 저장소가 `OutOfRangeItemsError(count, dates)`를 던진다. 화면은 "여행 기간 밖 일정 n개 · 빠지는 날짜" 시트에서 **보관함으로 옮기기(기본) / 일정 n개 삭제 / 취소**를 받아 다시 저장한다. 이 시트가 삭제의 확인 단계를 겸한다.
  - 다른 날(또는 보관함)로 옮기면 드래그든 편집 시트든 하단 안내(`Snackbar`)에 "○○를 Day 2로 옮겼어요 · 되돌리기"를 띄운다. 되돌리기는 원래 날짜의 원래 위치로 돌려놓는다.
- 드래그 정렬 (`features/schedule/ScheduleBoard.tsx`):
  - 카드 오른쪽 **손잡이(⋮⋮)로만** 끈다. 카드를 누르면 편집이다.
  - 센서: 마우스는 4px 움직이면 시작, 터치는 **200ms 누르고 있어야** 시작(tolerance 5px), 키보드는 스페이스와 방향키. 손잡이에는 `touch-action: manipulation`을 둔다 (`none`이면 손잡이 위를 쓸어도 스크롤이 안 됨).
  - 같은 날짜 안의 이동과 **날짜 간(보관함 포함) 이동**을 모두 지원한다.
  - 날짜 간 이동은 상단 칩이 아니라, 드래그 중에 화면 아래에 나타나는 **이동 판(`MoveDock`)** 에 놓아서 한다. 상단 칩은 가로로 스크롤되어 드래그 중에 화면 밖 칩에 닿을 수 없기 때문이다. 이동 판에는 다른 날짜와 보관함이 한꺼번에 보인다.
  - 이동 판은 `position: fixed`라서 dnd-kit의 좌표(페이지 스크롤이 더해진 값) 대신 실제 포인터 좌표로 판정한다. 포인터가 이동 판 위에 있으면 목록 쪽 충돌 판정을 비워서, 목록이 자리를 비켜 주지 않게 한다.
  - 이동 판에는 위치가 바뀌는 애니메이션을 쓰지 않는다 (판정 좌표가 어긋남). 투명도 페이드만 쓴다.
  - 드래그 미리보기는 큰 카드 복사본 대신 손가락 바로 위에 뜨는 작은 알약 모양이다. 놓을 곳을 가리지 않게 하고, 화면 밖으로 나가지 않게 위치를 제한한다.
  - 스크린리더 안내(dnd-kit `accessibility`)는 한국어로 둔다.
- 화면 문구에 조사가 붙는 이름이 들어가면 `lib/format.ts`의 `josa()`를 쓴다 (`도톤보리를`, `보관함으로`, `Day 2로`). "을(를)"을 직접 쓰지 않는다.

### 코드 스타일
- 함수 컴포넌트 + 훅. default export 지양 (페이지 컴포넌트 제외 가능).
- 경로 별칭 `@/` → `src/`.
- Zustand 스토어는 feature 폴더 안에 (`features/trips/tripStore.ts`). 스토어 액션이 저장소를 호출.
  - 형태: `createXxxStore(repos)` 팩토리 + 앱용 싱글턴(`xxxStore`) + `useXxxStore(selector)` 훅. 테스트는 팩토리에 테스트용 저장소를 넣어 만든다.
  - 셀렉터는 상태의 값을 그대로 돌려준다. 셀렉터 안에서 새 배열·객체를 만들면 Zustand 5에서 무한 렌더가 난다. 파생 데이터는 컴포넌트에서 계산한다.
  - `load()`는 동시에 여러 번 불려도 요청은 한 번만 보낸다 (StrictMode에서 effect가 두 번 실행되기 때문).
  - 일정 스토어(`features/schedule/scheduleStore.ts`)는 한 번에 한 여행의 일정만 들고 있다. 다른 여행으로 바뀐 뒤 늦게 도착한 응답은 버린다.
  - 다른 항목의 `order`까지 바꾸는 작업(추가·삭제·이동)은 저장한 뒤 목록을 다시 읽어 저장소와 맞춘다. 필드만 바꾸는 수정은 돌려받은 항목으로 바로 교체한다.
  - 이동은 낙관적으로 처리한다. `planMove`로 화면에 먼저 반영하고, 저장한 뒤 다시 읽는다. 저장에 실패하면 다시 읽은 값으로 되돌아간다.
- 화면 표시용 순수 함수(날짜 형식, D-day 등)는 `lib/format.ts`나 feature 폴더의 `*Display.ts`에 두고 단위 테스트한다.

### 테스트
- 테스트 파일은 소스 옆에 `*.test.ts`로 둔다. `vitest`에서 `describe/it/expect`를 명시적으로 import 한다 (globals 미사용).
- 데이터 레이어 테스트는 `src/test/fixtures.ts`의 `createTestRepositories()`를 쓴다. 테스트마다 새 DB를 쓰고, 끝나면 `db.delete()` 한다.
- 시간은 `vi.useFakeTimers` 대신 `Clock` 주입(`testClock()`)으로 제어한다.
- 화면 흐름 테스트(`*.test.tsx`)는 파일 맨 위에 `/** @vitest-environment happy-dom */`를 붙인다 (기본 환경은 node).
  - `vi.mock('@/data', ...)`로 앱 싱글턴 저장소를 테스트용 DB로 바꾼다. `vi.mock`은 파일마다 호이스팅되므로 각 테스트 파일에 직접 쓴다 (`app/tripFlows.test.tsx` 참고).
  - `src/test/app.tsx`의 `resetApp()`(스토어와 데이터 비우기), `resetStores()`(새로고침 흉내), `renderApp(path)`를 쓴다. **새 스토어를 만들면 `resetStores()`에 추가한다.**
  - 날짜가 오늘에 따라 달라지는 화면은 URL에 `?day=`를 명시해서 테스트한다 (기본 선택이 오늘 날짜에 좌우되기 때문).
  - 라우팅은 `createMemoryRouter(routes)`로 실제 라우트를 그대로 쓴다.
  - 쿼리는 역할·레이블 기준(`getByRole`, `getByLabelText`)으로 쓴다. 접근성 이름이 곧 테스트 계약이다.
  - 일정 카드는 편집 버튼과 "○○ 순서 바꾸기" 손잡이 버튼이 함께 있다. 카드 버튼은 `^이름(?! 순서 바꾸기)` 형태로 찾는다 (`app/scheduleFlows.test.tsx`의 `card()`).
  - dnd-kit도 스크린리더용으로 `role="status"` 영역을 만든다. 하단 안내는 역할이 아니라 문구로 찾는다.
- 드래그는 happy-dom에서 테스트할 수 없다 (요소 크기가 모두 0). 이동 규칙은 `data/rules`와 스토어 테스트로 검증하고, 드래그 자체는 실제 브라우저에서 확인한다.

## 구현 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| 0 | 프로젝트 세팅 | 완료 |
| 1 | 데이터 레이어 (여행·일정 저장소, 백업 규칙) | 완료 |
| 2 | 여행 목록·생성·삭제 | 완료 |
| 3 | 날짜별 일정 + 보관함 | 완료 |
| 4 | 드래그 정렬 (같은 날 + 날짜 간 이동) | 완료 |
| 5 | 여행 수정 + 기간 축소 처리 | 완료 |
| 6 | 가계부 데이터 레이어: 모델, Dexie v2 + 마이그레이션, 저장소, 백업 v2, 금액·환산·분담·잔액·최소 송금 순수 함수 + 테스트 | 완료 |
| 7 | 동행자 + 지출 기록 화면: 일정/가계부 탭, 동행자 관리, 지출 폼(3가지 분담 방식, 검증), 날짜별 목록, 일정 연결, 환율 직접 입력 | 예정 |
| 8 | 환율 자동 입력(오프라인 대체) + 예산·요약(카테고리/날짜/동행자별) | 예정 |
| 9 | 정산: 잔액, 최소 송금안, 텍스트 복사·공유, 송금 완료 기록 | 예정 |
| 10 | 장소 검색 (Places API) | 예정 |
| 11 | 지도 (번호 마커, 직선 경로, 구간별 길찾기 링크) | 예정 |
| 12 | 설정 + 백업 내보내기/가져오기 화면 (가계부 포함) | 예정 |
| 13 | PWA·오프라인·iOS 설치 안내 | 예정 |
| 14 | 다듬기 (번들 분할 등) | 예정 |

## 진행 방식
- 구현 단계별로 진행하고, 각 단계 끝에 실행/확인 방법을 제시한다.
- 결정사항이 바뀌면 이 파일을 갱신한다.

## 결정 로그
- 2026-11-02: 초기 스택/구조/데이터 모델 결정 (위 내용).
- 2026-11-02: 데이터 보존(persist·JSON 백업), Dexie 버전 규칙, 보관함(date=null), 날짜 간 드래그·터치 설정, 직선 경로+외부 길찾기 링크, iOS 설치 안내, MVP 범위 밖 항목 추가.
- 2026-11-02: 가져오기 병합은 updatedAt 최신 우선, 병합 후 그룹별 order 재부여, 미리보기에 추가/갱신/유지 개수 표시.
- 2026-11-02: `/root/pjt`는 독립 git 저장소(main). 상위 `/root` 저장소는 `.gitignore`로 `pjt/` 제외.
- 2026-11-02: 0단계 완료. Vite 8 / React 19 / React Router 7 / Tailwind 4. TypeScript는 typescript-eslint 호환 때문에 `~6.0` 고정 (7.x 금지, typescript-eslint 지원 시 재검토).
- 2026-11-02: git 원격 `origin` = https://github.com/siyeong1013/travel_GO
- 2026-11-02: 1단계(데이터 레이어) 완료. Dexie 4 / Vitest 5. 계획의 `schedule.moveOutOfRange`는 `trips.update`의 `outOfRangeItems` 옵션으로 합침 (기간 변경과 일정 처리를 한 트랜잭션에서 처리). `PlaceSnapshot` 위치 정보는 nullable로 (직접 입력 장소). 저장소 에러 이름은 DOMException 이름과 겹치지 않게 함.
- 2026-11-02: 2단계(여행 목록·생성·삭제) 완료. Zustand 5, 컴포넌트 테스트용 Testing Library + happy-dom 추가. 목록은 "다가오는 여행(진행 중 포함, 가까운 순) / 지난 여행(최근 순)"으로 나누고, 지난 여행 카드는 배지를 생략. 여행 삭제는 상세 화면 ⋯ 메뉴 → 확인 시트. 도시는 6단계 전까지 텍스트 입력.
- 2026-11-02: 3단계(날짜별 일정 + 보관함) 완료. 날짜 탭은 URL `?day=`로 유지, 장소는 6단계 전까지 이름만 직접 입력(6단계 이후에도 "직접 입력" 대안으로 남김). 일정 편집 시트 = 이름·날짜(이동)·시간·메모·삭제. 일정 시간은 정렬에 쓰지 않는다 (순서는 사용자가 정함). 여행 삭제 확인에 함께 지워질 일정 수 표시.
- 2026-11-02: 4단계(드래그 정렬) 완료. dnd-kit core 6 / sortable 10. 손잡이 + 터치 200ms 지연. 날짜 간 이동은 계획했던 "상단 칩에 놓기" 대신 하단 이동 판(`MoveDock`)으로 바꿈 (칩이 가로 스크롤이라 드래그 중 닿지 않음). 날짜 간 이동에 되돌리기 안내 추가.
- 할 일 (마지막 다듬기 단계): 번들이 500KB(min)를 넘었다 (gzip 160KB). 라우트 단위 지연 로딩으로 나눈다.
- 2026-11-02: 5단계(여행 수정 + 기간 축소) 완료. 수정은 별도 화면(`/trips/:id/edit`), 변경 없으면 저장 생략, 범위 밖 일정은 보관함/삭제/취소 시트. `OutOfRangeItemsError`에 날짜 목록 추가. 뒤로 가기 규칙은 `lib/useGoBack.ts`로 통일.
- 2026-11-02: MVP에 여행 가계부 + 동행자 정산 추가 (모델 `Companion`·`Expense`·`ExpenseShare`·`Settlement`, 금액은 최소 단위 정수, 환율 스냅샷, 나머지는 결제자, 최소 송금 정산안). 설계 초안과 단계 배치 제안 — 미정 항목은 "가계부·정산" 섹션 참고.
- 2026-11-02: 가계부 미정 항목을 추천안대로 확정 (연결된 동행자 삭제 규칙, 환율 open.er-api.com, 정산 통화 잠금, 여행 전체 예산, 기간 밖 지출 허용, 통화 13종, 6~9단계 배치).
- 2026-11-02: 6단계(가계부 데이터 레이어) 완료. 정산 통화 잠금은 지출뿐 아니라 송금 기록이 있어도 적용. 환율 `quote`가 정산 통화와 다른 지출은 `buildLedger`가 `unconvertible`로 따로 돌려준다. ESLint `no-unused-vars`에 `ignoreRestSiblings` (필드 제거용 구조 분해 허용).
