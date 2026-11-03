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
- 환율: open.er-api.com (무료·키 없음·CORS 허용·166개 통화·하루 1회 갱신). 약관상 출처 링크 표기 필요, 캐시 허용, 1시간에 1번 이하로 요청 (넘으면 20분간 429).
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
  lib/            # 날짜 유틸, id 생성, 환율 API, google maps 로더 등
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
  - 단 Google 약관에 따라 Google에서 받은 **주소·좌표는 30일까지만** 둔다. `PlaceSnapshot.fetchedAt`·`TripCity.fetchedAt`에 받은 시각을 기록하고, 직접 입력했거나 데이터가 없으면 `null`이다. 자세한 규칙은 "Google Maps / Places"의 저장 약관 항목.
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
    - `lib/share.ts`: `copyText()`가 실패하면 글 전체가 선택된 읽기 전용 입력칸 시트(`CopyTextSheet`)를 띄운다. "공유" 버튼은 `navigator.share`가 있을 때만 보이고, 공유가 거절되면(닫기는 제외) 같은 시트를 띄운다.
    - 텍스트(`settlementText()`): `[제목 정산]`, `총 지출 · n명`, 각자 쓴 돈, 송금할 돈(없으면 "모두 정산했어요."), 송금 완료, 빠진 지출 안내(`※`). 금액은 정산 통화.
  - 송금안은 보내는 사람, 받는 사람의 동행자 순서로 보여준다(`orderTransfers()`). 체크하면 그 금액 그대로 송금 기록을 만들고, 잔액과 송금안을 다시 계산하므로 그 줄은 "송금 완료"로 옮겨 간다. 일부만 보낸 경우를 기록하는 기능은 없다.
  - 송금 완료 체크 해제(기록 삭제)는 체크박스 토글이라 확인 시트 대신 하단 안내의 "되돌리기"로 되살린다 (확인 단계 규칙의 예외). 체크할 때도 되돌리기를 띄운다.
- 환율: 지출을 기록할 때의 환율을 지출에 스냅샷으로 저장하고, 사용자가 언제든 고칠 수 있다. 온라인이면 API 값, 실패하거나 오프라인이면 같은 통화로 마지막에 쓴 환율, 그것도 없으면 직접 입력.
  - 우선순위: API → 이 여행에서 같은 통화로 마지막에 쓴 환율 → 다른 여행에서 마지막에 쓴 환율(`expenses.usedRates()`) → 직접 입력. 모두 정산 통화 기준(`quote`)이 같은 것만 쓴다.
  - API 호출은 `lib/exchangeRateApi.ts`. **지출 통화를 기준으로** 요청하고(`/v6/latest/JPY`) 정산 통화 값을 읽는다. 응답 값은 소수 6자리로 반올림돼 오므로, 원화 정산에서는 이쪽이 정밀하다(JPY→KRW `8.510259`, 반대 방향 KRW→JPY는 `0.117506`). 숫자는 `rateText()`로 유효숫자 10자리 이하의 소수 문자열로 바꾼다.
  - 받은 표는 기준 통화별로 기기(localStorage `travel-go:latest-rates`)와 `features/expenses/rateStore.ts`에 두고, 제공자의 다음 갱신 시각까지(받은 뒤 최소 1시간) 다시 요청하지 않는다. 같은 통화의 동시 요청은 하나로 합친다. 기한이 지난 표는 쓰지 않는다. 오프라인(`navigator.onLine === false`)이면 바로 실패하고, 요청은 8초에 끊는다.
  - 지출 폼: 새 지출은 열 때, 통화를 바꾸면 항상, "최신 환율 불러오기" 버튼으로 조회한다. 수정할 때는 저장된 환율을 그대로 두고, 다시 입력해야 하는 환율만 열 때 조회한다. 조회 결과는 **요청한 뒤 통화와 환율 칸이 그대로일 때만** 넣는다 (입력한 값이 이긴다).
  - `fetchedAt`은 API가 환율을 발표한 시각(`time_last_update_unix`)이다. `last`로 다시 쓸 때도 그대로 옮긴다. 그래서 `fetchedAt`이 있으면 API에서 온 환율이다. 폼은 `11.3 09:02 기준`처럼 보여준다.
  - 출처 표기(약관): API에서 온 환율이 화면에 쓰이면 "Rates By Exchange Rate API" 링크(https://www.exchangerate-api.com, `RateAttribution.tsx`)를 둔다. 폼의 환율 칸 아래, 가계부 목록·요약 화면 끝(`usesApiRates()`).
- 저장: Dexie `version(2)`로 `companions`, `expenses`, `expenseShares`, `settlements`를 추가한다. `upgrade()`에서 기존 여행에 기본값과 "나"를 넣는다 (여행의 `updatedAt`은 그대로 둔다. 사용자 수정이 아니므로 병합에서 이기면 안 됨).
  - "나"의 id는 `meCompanionId(tripId)`(= `lib/id.ts`의 `derivedId`, UUID v8)로 여행 id에서 **결정적으로** 만든다. 새 여행·DB 마이그레이션·v1 백업 변환 어디서 만들어도 같은 id가 되어, 병합해도 "나"가 둘이 되지 않는다. 마이그레이션·변환으로 만든 "나"의 시각은 여행의 `createdAt`을 쓴다.
- 저장소: `companions`(목록·추가·이름 변경·`usage`·삭제), `expenses`(입력은 분담 대상 `participants`, 분담액은 저장소가 `splitExpense`로 계산. `usedRates()`: 모든 여행에서 통화·정산 통화 쌍마다 가장 최근 지출의 환율), `settlements`. 일정 항목을 지우면(직접 또는 기간 축소 시 삭제) 연결된 지출의 `scheduleItemId`만 `null`로 바꾼다. 여행을 지우면 딸린 것을 모두 지운다.
- 순수 규칙: `data/rules/money.ts`(통화 표·`parseAmount`·`convertAmount`), `split.ts`(`splitExpense`·`participantsFromShares`), `expense.ts`(입력 검증), `companion.ts`, `ledger.ts`(`buildLedger`: 합계·카테고리·날짜·동행자별 낸 돈/쓴 돈·잔액), `settlementPlan.ts`(`planTransfers`).
- 백업: `BACKUP_SCHEMA_VERSION`을 2로 올린다(10단계 이후 3: 아래 장소 데이터 기한). v1 파일은 기본값과 "나"를 채워 변환한다. 병합할 때 지출과 그 분담은 한 묶음으로 다룬다 (파일 쪽 지출이 더 최근이면 분담 전체를 파일 것으로 교체).
- 동행자 삭제: "나"는 삭제 불가. 결제자이거나, 금액 지정 분담·송금 기록에 들어 있거나, 빼면 분담 대상이 아무도 안 남는 지출이 있으면 삭제를 막고(`CompanionInUseError`에 해당 지출·송금 목록) 화면이 그 목록을 보여준다. 균등·비율 분담에만 들어 있으면 확인 후 빼고 남은 사람끼리 다시 나눈다. 확인 화면에 쓸 영향 범위는 `companions.usage()`로 미리 조회한다.
- 정산 통화: 지출이나 송금 기록이 하나라도 있으면 바꿀 수 없다 (`CurrencyLockedError`). 환율 스냅샷이 기존 정산 통화 기준이기 때문.
- 예산: 여행 전체(동행자 모두의 지출 합계) 기준. 개인 예산은 범위 밖.
  - 정산 통화를 바꾸면 예산을 지운다 (이전 통화 단위의 값이라서). `trips.update`가 하는 일이고, 새 예산을 같이 넘기면 그 값을 쓴다. 정산 통화 시트는 저장 전에 이를 알린다.
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
  - 키 하나로 지도와 장소 검색을 모두 쓴다. JS API가 Places 요청에도 스크립트를 로드한 키를 쓰기 때문이다. 그래서 그 키에 **Maps JavaScript API**와 **Places API (New)**가 둘 다 허용돼야 한다.
  - 브라우저 번들에 그대로 실리는 키라서, 콘솔에서 HTTP 리퍼러 제한(`http://localhost:5173/*`, 확인용 `http://localhost:5174/*`, 배포 주소)과 API 제한(위 두 API)을 건다.
  - Vite 개발 서버는 `.env.local`이 바뀌면 스스로 재시작해서 새 키를 읽는다.
- Map ID가 필요한 기능(Advanced Marker)은 `VITE_GOOGLE_MAPS_MAP_ID`.
- Places는 **Places API (New)** 사용 (`AutocompleteSuggestion`, `Place.fetchFields`). 레거시 Autocomplete 위젯 사용 금지.
- 고른 장소의 상세는 **`formattedAddress, location`만** 요청한다(Place Details Essentials). 이름은 자동완성 제안의 `mainText`를 쓴다. `displayName`(Pro)을 요청하면 세션을 끝내는 호출이 가장 비싼 SKU(Enterprise + Atmosphere)로 청구된다.
- 자동완성은 세션 토큰을 쓴다. 검색 한 번(첫 요청부터 고를 때까지)이 토큰 하나다. `placePrediction.toPlace().fetchFields()`가 같은 토큰으로 세션을 끝내고, 다음 검색은 새 토큰으로 한다. 고르지 않고 닫으면 요청마다 청구된다.
- 키가 없거나 오프라인이면 지도/검색 영역에 안내 상태를 보여주고 앱은 정상 동작해야 한다.
- 로더: `lib/googleMaps.ts`의 `importMapsLibrary(name)`. Google의 "dynamic library import" 방식이라 처음 쓸 때 스크립트를 한 번만 넣는다(`language=ko`). 로드에 실패하면(오프라인 등) 다음 호출에서 다시 시도한다. 페이지에 이미 `google.maps.importLibrary`가 있으면 그걸 쓴다. 지도(11단계)도 이 로더를 거쳐 API를 두 번 로드하지 않게 한다.
- 장소 검색 (`features/places/`)
  - `placeSearch.ts`: `createPlaceSearch()`/`placeSearch`(세션 단위 `suggest`·`pick`), `searchBias(trip, items)`. 편향은 여행 도시 위치, 없으면 위치가 있는 일정 중 마지막에 추가한 곳을 중심으로 반경 30km다(제한이 아니라 우선순위).
  - `usePlaceSearch(text, { kind, bias })` 훅: 입력이 멈추고 300ms 뒤에 검색하고, 2글자 미만은 검색하지 않는다. 늦게 온 이전 응답은 버린다. 이어서 입력하는 동안은 이전 결과를 계속 보여준다(`refines`, 조합 중인 마지막 글자 허용). 실패하면 "다시 시도"를 띄운다.
  - 화면: `PlaceSuggestionList`(결과·상태 안내·출처), `PlaceSearchSheet`(기존 일정에 장소 연결), `SearchUnavailableNote`(키 없음/오프라인 안내).
  - 여행 도시는 `kind: 'region'`(`includedPrimaryTypes: ['(regions)']`: 도시·지방·국가)로 검색한다. 고른 도시는 `TripCity`의 `placeId`·`location`으로 저장한다. 폼은 입력칸 글자가 고른 이름과 같을 때만 연결을 유지하고(`linkedCity`), 저장된 도시는 입력칸에 타이핑하기 전까지 검색하지 않는다.
- 출처 표기(정책): 구글 지도 위가 아닌 곳에 Places 데이터(제안, 이름·주소)를 보여주면 "Google Maps" 텍스트를 둔다(`GoogleMapsAttribution`: 번역 금지 `translate="no"`, 12px, #5E5E5E, 보통 굵기, 같은 영역 안). 제안 목록, Google 장소가 있는 날의 일정 목록 아래, 편집 시트의 장소 줄에 둔다.
- 저장 약관: place ID는 무기한 저장해도 된다. 위경도는 Places API 서비스 약관상 **최대 30일**만 캐시할 수 있다. 이름·주소는 저장을 허용하는 조항이 없다. 이렇게 지킨다(`data/rules/placeData.ts`).
  - Google에서 받은 주소·좌표(장소)와 좌표(여행 도시)에는 받은 시각 `fetchedAt`을 둔다. 저장소 검증상 Google 데이터에는 `fetchedAt`이 꼭 있어야 하고, 직접 입력한 값에는 없다(`null`, 기한 없음).
  - **30일**이 지나면 주소·좌표를 지운다(`placeId`와 이름은 남김). 이름은 일정·여행의 제목(사용자가 고칠 수 있는 값)으로 보고 그대로 둔다.
    - 지우는 곳: 앱 시작(`schedule.expirePlaceData()`, `trips.expirePlaceData()`), 읽을 때(`schedule.listByTrip`, `trips.list`·`get`가 지우고 DB에도 반영), 쓸 때(만들기·수정), 백업 내보내기·가져오기(`expireBackupData`).
  - **7일**이 지난 데이터(또는 지워진 Google 장소)는 여행 상세 화면을 열 때 온라인이고 키가 있으면 다시 받는다(`usePlaceDataRefresh` → `refreshTripPlaceData`). Place Details Essentials(`formattedAddress, location`, 한국어)를 세션 없이 장소마다 한 번씩(동시 4개) 요청하고, 실패한 장소는 건너뛴다. 오프라인에서 돌아와도 다시 시도한다. 여행 출발 전에 한 번 열면 3주 이상 오프라인으로 쓸 수 있다.
  - 갱신과 삭제는 사용자 수정이 아니므로 `updatedAt`을 바꾸지 않는다(백업 병합에서 이기면 안 됨). 저장소 메서드 `schedule.refreshPlaces(tripId, PlaceData[])`, `trips.refreshCity(id, PlaceData)`는 같은 `placeId`인 것만 바꾼다.
  - Dexie `version(3)`과 백업 v3에서 `fetchedAt`이 생겼다. 그 전 데이터는 받은 시각을 몰라서 레코드의 `createdAt`으로 채운다(실제보다 이를 수밖에 없으니 기한을 넘기지 않음).
  - 편집 시트에서 데이터가 지워진 Google 장소는 "주소와 위치는 온라인일 때 다시 불러와요."로 보인다.
- 경로선: MVP는 일정 순서대로 장소를 **직선(Polyline)** 으로 연결한다.
- Directions/Routes API는 **사용하지 않는다** (별도 과금).
- 실제 길찾기는 구간별 "구글맵에서 길찾기" 외부 링크(`https://www.google.com/maps/dir/?api=1&...`)로 제공한다.

### PWA / 오프라인
- 앱 셸은 서비스워커로 프리캐시. 여행/일정 조회는 IndexedDB 기반이라 오프라인 동작.
- 지도 타일·장소 검색은 오프라인 미지원 (안내 표시). 구글 지도 리소스를 SW로 캐시하지 않는다 (약관).
- 환율 API 응답도 SW로 캐시하지 않는다. 앱이 localStorage에 직접 두고 유효 기간을 판단한다.
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
  - 시트가 열려 있는 동안 뒤 페이지 스크롤을 막는다(`html`의 `overflow: hidden`). 열린 시트 수를 세어 마지막 시트가 닫힐 때 푼다. "이전 값 되돌리기" 방식은 겹친 시트(편집 시트 위의 삭제 확인)가 함께 닫힐 때 부모가 먼저 정리되면서 잠금이 남아 페이지가 스크롤되지 않았다(`scheduleFlows.test.tsx`의 삭제 흐름이 검사).
- 입력칸 글자 크기는 16px 이상 (iOS Safari가 포커스 시 확대하지 않도록). 공용 `TextField`를 쓴다.
  - 입력칸 제목 줄의 작은 버튼(`action`: "시간 지우기", "이전 이름으로", "최신 환율 불러오기")은 `-my-3 -mr-2 h-11 px-2`로 줄 높이는 그대로 두고 누르는 영역만 44px로 만든다.
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
  - 장소 추가 시트: 이름을 입력하면 검색 결과가 뜨고, 고르면 주소·위치와 함께 저장된다. 결과 아래 "'○○' 그대로 추가"는 이름만 저장한다. 검색이 되는 동안 Enter는 키보드만 닫는다(실수로 위치 없는 장소가 생기지 않게). 키가 없거나 오프라인이면 안내와 함께 예전처럼 이름 + "추가"로 동작한다.
  - 편집 시트의 장소 줄: 주소(없으면 "주소와 위치가 없어요.")와 "장소 찾기 / 다시 찾기"가 있다. 검색 시트(`PlaceSearchSheet`)는 일정 이름으로 바로 검색한다. 고르면 이름도 그 장소 이름으로 바뀌고, 이름칸에 "이전 이름으로"가 생긴다(예: "호텔 체크인"이라는 이름에 호텔 위치만 붙이기). 저장해야 반영된다.
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
- 가계부 화면 (`features/expenses/`):
  - 여행 상세의 **일정 / 가계부** 전환은 URL `?tab=expenses`(없으면 일정)에 둔다. 전환 링크는 `replace`이고 `?day=`는 그대로 둔다 (`features/trips/tripView.ts`).
  - 가계부 탭 = 요약 카드(총 지출, 정산 통화 버튼 "KRW 기준", 동행자 수·이름, "동행자 관리") + 날짜별 지출 목록 + 하단 "지출 추가". 목록은 여행 날짜(Day n)별로 묶고 기간 밖 지출은 "여행 전 / 여행 후"로 묶으며, 묶음마다 정산 통화 합계를 보여준다. 다른 통화 지출은 원래 금액과 `≈ 환산액`을 함께 보여준다.
  - 지출 폼은 전체 화면이다: `/trips/:id/expenses/new`, `/trips/:id/expenses/:expenseId` (수정·삭제). 저장하면 이전 화면으로 돌아간다.
  - 새 지출 기본값: 통화·결제 수단은 이 여행의 마지막 지출을 따르고(없으면 정산 통화·카드), 결제자는 "나", 분담은 전원 균등, 날짜는 여행 중이면 오늘 아니면 첫날. 카테고리는 기본값 없이 고르게 한다.
  - 환율(정산 통화와 다른 통화일 때만): 이 여행에서 같은 통화로 마지막에 쓴 환율을 미리 채운다(`source: 'last'`). 고치면 `manual`. 입력칸 아래에 환산액(`≈ 10,849원`)을 보여준다.
  - 분담: 나누는 방법(균등/금액 지정/비율) + 함께 낼 사람 체크("모두", "결제한 사람만" 바로가기). 균등·비율은 사람별 몫을 바로 계산해 보여주고, 금액 지정은 "합계 / 총액 · n원 남음(초과)"를 바로 보여준다. 금액 지정으로 바꿀 때 입력칸이 모두 비어 있으면 현재 몫으로 채운다 (처음부터 합이 맞게).
  - 폼 검증은 `features/expenses/expenseForm.ts`의 순수 함수다. 오류 문구는 제출할 때 보여주고 첫 오류 칸(`name`)에 포커스한다.
  - 일정 연결은 폼의 "일정 연결" 선택(날짜별 묶음)으로 한다. 지워진 일정에 대한 연결은 폼을 열 때 버린다 (스토어가 옛 값을 들고 있어도 저장이 막히지 않게).
  - 동행자 시트: 추가·이름 바꾸기·삭제. 삭제는 먼저 `usage()`를 조회해서, 막히면 해당 지출 목록(누르면 그 지출 수정 화면)을 보여주고, 아니면 확인 시트("빼고 다시 나누기" / "삭제")를 띄운다.
  - 정산 통화는 요약 카드의 "KRW 기준" 버튼 → 시트에서 바꾼다. 지출·송금 기록이 있으면 선택을 막고 이유를 보여준다.
  - 요약 카드: 예산이 있으면 진행 막대와 "n원 남음 / 초과 · 예산 · n% 사용"(퍼센트는 내림). 맨 아래 줄에 "예산 정하기(수정)"와 "지출 요약 ›".
  - 예산 시트(`BudgetSheet`): 정산 통화 금액 하나. 비우고 저장하면 예산 없음. 바뀌지 않았으면 저장하지 않는다.
  - 지출 요약 화면 `/trips/:id/expenses/summary`: 예산, 카테고리별(지출 있는 것만, 큰 순서, 비율), 날짜별(여행 날짜 전부 + 지출이 있을 때만 여행 전/후, 막대는 가장 큰 날 기준), 동행자별 낸 돈/쓴 돈 표(2명 이상일 때, "정산 ›" 링크), 환율을 다시 입력해야 하는 지출 목록(누르면 수정 화면).
  - 정산 화면 `/trips/:id/expenses/settlement` (`features/settlement/`): 주고받을 돈(사람별 잔액), 송금할 돈(체크 = 송금 완료), 송금 완료(체크 해제 = 기록 삭제), 하단 "공유"·"정산 결과 복사". 동행자가 1명이거나 지출·송금 기록이 없으면 안내만 보여준다. 요약 카드에는 동행자가 2명 이상일 때 "정산 · 송금 n건 남았어요 ›" 줄이 있다.
  - 전체 화면 페이지의 제목 있는 구역은 `components/ui/PageSection`(제목 줄 버튼은 `sectionActionClass`)을 쓴다.
  - 한글 설명 문단은 `break-keep`(word-break: keep-all)으로 띄어쓰기에서만 줄을 바꾼다. 기본값은 음절마다 줄이 바뀌어 "두세 / 요."처럼 된다.
  - 칩 모양 선택은 `components/ui/ChoiceGroup`(네이티브 radio + fieldset)을 쓴다.
- 금액 표시는 `lib/format.ts`의 `formatMoney(amount, currency)`를 쓴다: 원화는 `12,000원`, 다른 통화는 기호를 앞에 (`¥1,200`, `$12.34`). 기호는 `data/rules/money.ts`의 통화 표에 있다.
- 화면 문구에 조사가 붙는 이름이 들어가면 `lib/format.ts`의 `josa()`를 쓴다 (`도톤보리를`, `보관함으로`, `Day 2로`). "을(를)"을 직접 쓰지 않는다. 동행자 "나"는 `josa('나', '이/가')` → `내가`.

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
  - 가계부 스토어(`features/expenses/expenseStore.ts`)도 한 번에 한 여행의 동행자·지출·송금 기록을 들고 있다. 동행자 추가·이름 변경과 송금 기록 추가·삭제는 바로 반영하고, 나머지 쓰기(지출 추가·수정·삭제, 동행자 삭제의 재분담)는 저장한 뒤 다시 읽는다. 여행 상세 화면은 두 탭의 데이터를 모두 불러온다 (여행 삭제 확인에 일정·지출 개수를 보여주므로).
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
- 메모리 라우터에는 브라우저 기록(`history.state.idx`)이 없어서, 테스트에서 저장 후 "뒤로"는 항상 대체 경로(`backFallback`)로 간다.
- 테스트는 네트워크에 나가지 않는다. `test/setup.ts`가 테스트마다 `fetch`를 실패하게 바꿔서 환율 API는 오프라인처럼 보인다. API 응답이 필요하면 `stubRatesApi(() => latestRatesBody('JPY', { KRW: 8.510259 }))`(`test/app.tsx`, `test/fixtures.ts`)를 쓴다. `resetApp()`은 localStorage(기기에 둔 환율)도 비운다.
- 숨긴 radio 칩(`ChoiceGroup`)은 Playwright 같은 실제 브라우저 자동화에서 radio가 아니라 `label`을 눌러야 한다. 송금 체크박스는 체크하면 그 줄이 목록에서 빠지므로 `check()`가 아니라 `click()`을 쓴다 (`check()`는 같은 자리의 다음 줄을 다시 누른다).
- 장소 검색: 테스트는 API 키가 없는 상태로 시작한다. Vitest가 `.env.local`도 읽으므로 `test/setup.ts`가 `VITE_GOOGLE_MAPS_API_KEY`를 매번 비운다. 검색이 필요하면 `stubPlacesApi([OSAKA_CASTLE, ...])`(`test/app.tsx`)를 쓴다. 테스트 키와 가짜 `google.maps.importLibrary`(`test/places.ts`의 `fakePlacesApi`: 이름에 입력이 들어간 장소를 제안, `failSearch`·`failPick` 옵션)를 넣고 요청 기록(`requests`, `fetched`)을 돌려준다.
  - happy-dom은 외부 스크립트를 받지 않는다(`vite.config.ts`의 `disableJavaScriptFileLoading`). 로더 테스트는 `document.head.append`를 가로챈다.
  - 검색은 입력이 멈추고 300ms 뒤에 하므로 `findBy*`로 기다린다. happy-dom에는 CSS가 없어 제안 버튼의 접근성 이름이 "오사카성일본 …"처럼 붙어서 나온다. 그래서 `/^오사카성/`처럼 앞부분으로 찾는다.
  - 오프라인은 `vi.spyOn(navigator, 'onLine', 'get')` + `fireEvent(window, new Event('online'|'offline'))`.
  - 장소 픽스처: `makePlace()`(Google 장소, `fetchedAt: T0`), `namedPlace()`(직접 입력), `typedCity()`(직접 입력한 도시).
  - 화면 흐름 테스트에서 저장소는 테스트 시계(2026-01-01부터)를 쓰고, 여행 화면의 갱신 판단은 실제 시계를 쓴다. 그래서 갱신되면 안 되는 Google 데이터는 실제 현재 시각으로 찍는다(`placeFlows.test.tsx`의 `OSAKA_CITY`). 30일 지난 데이터는 저장소 테스트에서 `db`에 직접 넣어 확인한다(저장소로 쓰면 바로 지워짐).
- 클립보드: `userEvent.setup()`이 `navigator.clipboard`를 메모리 스텁으로 바꾸므로 복사한 내용은 `navigator.clipboard.readText()`로 확인한다. 실패는 `vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(...)`. happy-dom에는 `navigator.share`가 없어서, 공유 테스트는 `Object.defineProperty`로 넣고 테스트 뒤에 지운다 (`app/settlementFlows.test.tsx`).
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
| 7 | 동행자 + 지출 기록 화면: 일정/가계부 탭, 동행자 관리, 지출 폼(3가지 분담 방식, 검증), 날짜별 목록, 일정 연결, 환율 직접 입력, 정산 통화 설정 | 완료 |
| 8 | 환율 자동 입력(오프라인 대체) + 예산·요약(카테고리/날짜/동행자별) | 완료 |
| 9 | 정산: 잔액, 최소 송금안, 텍스트 복사·공유, 송금 완료 기록 | 완료 |
| 10 | 장소 검색 (Places API) | 완료 |
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
- 2026-11-02: 7단계(동행자 + 지출 기록 화면) 완료. 일정/가계부 전환은 `?tab=expenses`, 지출 폼은 전체 화면 라우트. 정산 통화 설정을 7단계로 당김 (지출을 기록하면 잠기므로 지출 기록 전에 정할 수 있어야 함). 같은 통화의 마지막 환율 미리 채우기도 7단계에 넣음 (8단계는 API 환율과 여행 간 마지막 환율을 더함). 카테고리는 기본값 없이 필수 선택. 일정 쪽에서 지출을 보거나 추가하는 진입점은 아직 없음 (지출 폼의 "일정 연결"만).
- 2026-11-03: 8단계(환율 자동 입력 + 예산·요약) 완료. 환율 API는 지출 통화를 기준으로 요청 (응답이 소수 6자리라 원화 정산에서 정밀). 응답은 기기에 두고 다음 갱신까지(최소 1시간) 다시 요청하지 않음 (약관). 우선순위는 API → 이 여행의 마지막 환율 → 다른 여행의 마지막 환율 → 직접 입력. 조회 중에 입력한 값은 덮어쓰지 않음. 저장된 지출을 수정할 때는 환율을 자동으로 바꾸지 않음. `fetchedAt` = API 발표 시각. 정산 통화를 바꾸면 예산을 지움 (저장소 규칙). 요약은 별도 화면(`/trips/:id/expenses/summary`). 잔액은 9단계에서 보여줌.
- 2026-11-03: 9단계(정산) 완료. 정산은 별도 화면(`/trips/:id/expenses/settlement`), 요약 카드에 남은 송금 건수 줄. 송금안 체크 = 그 금액 그대로 송금 기록 (일부 송금 기록은 범위 밖). 체크·해제 모두 되돌리기 안내로 처리하고 확인 시트는 쓰지 않음. 공유 텍스트에 "각자 쓴 돈"을 넣음 (송금 금액의 근거). 복사 실패 시 직접 복사 시트, 공유 버튼은 Web Share가 있을 때만. 송금 기록 쓰기는 지출 스토어에서 바로 반영 (다른 기록에 영향 없음).
- 2026-11-03: 10단계(장소 검색) 완료. Places API (New) 데이터 API(`AutocompleteSuggestion` + `fetchFields`)를 직접 쓰고 목록 UI는 앱에서 그린다. 상세 필드에서 `displayName`을 빼고 이름은 제안의 `mainText`를 쓴다(세션 청구가 Enterprise + Atmosphere → Essentials로 내려감). 여행 도시도 검색으로 고르고(`(regions)`), 장소 검색은 그 근처 30km를 우선한다. 직접 입력은 "그대로 추가"로 남긴다. 편집 시트에서 기존 일정에 장소를 연결할 수 있다(이름 유지 선택 가능). 출처는 "Google Maps" 텍스트. `@types/google.maps` 3.66.7(dev). `@vis.gl/react-google-maps`는 11단계에서 지도와 함께 넣는다. 실제 키로 확인했다. 검색 한 번은 자동완성 1회 + 상세 1회였고, 상세 요청도 `ko`와 같은 세션 토큰으로 갔다. 일본 주소는 한국어로 요청해도 "1-1 Ōsakajō, Chuo Ward, Osaka, 540-0002 일본"처럼 로마자가 섞여 온다(Google 데이터 그대로).
- 2026-11-03: Google 약관을 지키기로 함(사용자 결정). Google에서 받은 주소·좌표에 받은 시각을 두고, 7일이 지나면 온라인일 때 다시 받고, 30일이 지나면 지운다. 이름은 일정·여행 제목으로 보고 남긴다. Dexie v3, 백업 v3(이전 데이터의 받은 시각은 `createdAt`). 갱신·삭제는 `updatedAt`을 바꾸지 않는다. 실제 API로 확인함(8일 지난 장소를 열자 `GetPlace` 1회로 주소·좌표·받은 시각만 바뀜).
