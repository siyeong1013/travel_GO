# travel GO (트래블고)

여행 일정 플래너 + 여행 가계부(동행자 정산) PWA. 개인용 MVP(1~14단계)를 마쳤고, 지금은 로그인과 친구 초대를 만든다("로그인·친구 초대 계획", 15~19단계). 로그인(16), 서버 저장·동기화(17), 친구 초대(18)까지 했고, 다음은 다듬기(19)다.

## 기술 스택

- Vite + React + TypeScript (strict)
- Tailwind CSS v4 (`@tailwindcss/vite`)
- 상태관리: Zustand
- 라우팅: React Router
- 로컬 DB: IndexedDB (Dexie)
- 드래그 정렬: dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) — 터치 지원
- 지도: Google Maps JavaScript API + Places API (New). React 바인딩 라이브러리 없이 `lib/googleMaps.ts` 로더로 직접 쓴다 (11단계 결정 참고)
- PWA: `vite-plugin-pwa` (generateSW, autoUpdate)
- 환율: open.er-api.com (무료·키 없음·CORS 허용·166개 통화·하루 1회 갱신). 약관상 출처 링크 표기 필요, 캐시 허용, 1시간에 1번 이하로 요청 (넘으면 20분간 429).
- 테스트: Vitest + `fake-indexeddb`, 컴포넌트 테스트는 Testing Library + happy-dom, 서버 SQL은 PGlite(`@electric-sql/pglite` 0.5.11, WASM Postgres)
- 로그인: Supabase Auth (`@supabase/supabase-js` 2.118, 16단계). 처음 쓸 때 받는 조각이다(214KB, gzip 55KB).
- 항공편: AeroDataBox(RapidAPI 무료 Basic), 서버 함수 `api/flight.ts`(Vercel)로 부른다. 아래 "항공편".
- 세계 지도: Natural Earth 1:50m(공개)를 `scripts/world-map.mjs`로 SVG 경로로 바꿔 앱에 넣었다(`features/countries/worldMap.ts`). 실행할 때 지도 라이브러리가 없다.
- 나라별 지역 지도: Natural Earth 1:10m 도·주·현(공개)을 `scripts/region-maps.mjs`로 나라마다 SVG 경로 파일(`public/regions/JP.json`)로 만들었다. 그 나라를 열 때 받는다. 아래 "다녀온 나라".
- 도시 이름: Natural Earth 1:10m 인구 밀집지(공개, 한국어 이름 포함)를 같은 스크립트가 지역별 목록(`features/countries/places.ts`)으로 만든다. 나라·지역을 도시 이름으로 찾는 데 쓴다.

## 명령어

```bash
npm run dev       # 개발 서버
npm run build     # 타입체크 + 프로덕션 빌드
npm run preview   # 빌드 결과 미리보기 (PWA/오프라인 확인은 여기서. 지도까지 보려면 --port 5174: API 키 리퍼러에 있는 포트)
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
    backup/       # 설정 화면의 백업 내보내기·가져오기
    sync/         # 계정과 동기화(언제 할지, 상태 표시)
    sharing/      # 친구 초대·참여, 함께하는 사람
    countries/    # 다녀온 나라: 세계 지도, 나라 찾기
    install/      # 홈 화면에 추가 안내 (iOS)
    account/      # 로그인(카카오·구글, Supabase), 계정 화면
  data/
    models/       # 도메인 타입 (Trip, ScheduleItem, PlaceSnapshot, Companion, Expense, ExpenseShare, Settlement, BackupFile)
    repositories/ # 저장소 인터페이스, 입력 타입, 에러 클래스
    rules/        # 저장소와 무관한 순수 규칙: 정렬·이동, 입력 검증, 백업 포맷, 가져오기 계획, 금액·환산, 분담, 잔액·정산
    local/        # IndexedDB(Dexie) 구현체
    sync/         # 서버와 맞추기: 기록 단위 규칙, 동기화 엔진, Supabase 호출
    sharing/      # 여행 공유: 초대 링크·참여·멤버 (서버 함수 호출)
    index.ts      # 구현체 주입 지점 (나중에 http 구현으로 교체)
  lib/            # 날짜 유틸, id 생성, 환율 API, google maps 로더 등
  components/ui/  # 공용 UI (Button, BottomSheet, EmptyState ...)
  test/           # 테스트 설정·픽스처 (앱 코드에서 import 금지)
api/              # Vercel 서버 함수 (flight.ts: 항공편 조회). 앱 코드는 타입만 가져온다
scripts/          # 한 번 돌려 만드는 파일 (world-map.mjs: 세계 지도, region-maps.mjs: 나라별 지역 지도와 도시 이름)
public/regions/   # 나라별 지역 지도 (region-maps.mjs가 만듦, 앱이 열 때 받음)
supabase/migrations/ # 서버 SQL (사용자가 SQL Editor에서 실행)
```

## MVP 범위 밖

- 예약(항공/숙소/투어), 리뷰·커뮤니티, 도시 가이드 콘텐츠, 실제 경로 계산, 푸시 알림.
- 가계부 관련: 영수증 사진, 카드 내역 연동, 송금 앱 연동.
- 위 기능은 **요청 없이 구현하지 않는다.**
- 로그인/계정, 기기 간 동기화, 여행 공유(친구 초대)·같이 고치기, 동행자 계정 연동은 MVP 다음 계획으로 옮겼다("로그인·친구 초대 계획"). 그 단계 전에는 만들지 않는다.

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
  - 보통 저장소가 만든다. 새 여행만은 폼이 미리 만들어 `trips.create(input, { id })`로 넘길 수 있다(표지 색을 고르는 데 쓰므로). 저장소는 소문자 UUID만 받는다(`cleanId`).
  - id를 입력(`NewTrip`)이 아니라 옵션으로 받는 이유: 기존 여행을 펼쳐 넣어 "비슷한 새 여행"을 만들어도 id가 따라오지 않게.
  - 보안 컨텍스트(https, localhost)가 아니면 `crypto.randomUUID`가 없어서 `getRandomValues`로 대신 만든다. 폰에서 `http://<LAN IP>`로 접속한 경우가 여기에 해당한다.
- 값이 없음은 optional(`?`)/`undefined` 대신 **`null`** 로 표현한다 (JSON·PostgreSQL nullable 컬럼과 1:1). 메모가 없으면 빈 문자열 `''`.
- 날짜: `'YYYY-MM-DD'` 문자열 (여행지 현지 날짜, 타임존 없음). `Date` 객체로 저장하지 않는다. 날짜 계산은 `lib/dates.ts`를 쓴다 (UTC 기준이라 서머타임 영향 없음).
- 시간: `'HH:mm'` 문자열 또는 `null`.
- 타임스탬프: `createdAt`, `updatedAt`는 ISO 8601 문자열.
- 정렬: 같은 날짜(또는 보관함) 안에서 `order` 정수 (0부터). 순서 변경 시 해당 날짜 항목의 `order`를 재부여.
- 장소 정보는 Places 응답을 **스냅샷으로 저장** (오프라인 조회 + API 비용 절감). `placeId`는 참조용.
  - 단 Google 약관에 따라 Google에서 받은 **주소·좌표는 30일까지만** 둔다. `PlaceSnapshot.fetchedAt`·`TripCity.fetchedAt`에 받은 시각을 기록하고, 직접 입력했거나 데이터가 없으면 `null`이다. 자세한 규칙은 "Google Maps / Places"의 저장 약관 항목.
  - `PlaceSnapshot`의 `placeId`·`address`·`location`은 nullable이다. 직접 입력한 장소(예: "호텔 체크인")는 이 값들이 없고, `location`이 없으면 지도에 표시하지 않는다.
- 여행은 가는 나라(`countries`: ISO 3166-1 코드, 고른 순서, 0~15개)와 도시(`cities`: `TripCity` 목록, 고른 순서, 1~20개)를 갖는다. 나라는 15개까지라 도시 검색을 그 나라 안으로 좁힐 수 있다(Google의 한도). 검사는 `cleanTripFields`(코드, 겹침, 개수).
  - Dexie `version(8)`에서 `city` 하나가 `cities`가 됐고 나라는 빈 목록이다(`updatedAt`은 그대로). 그 전 버전을 만드는 코드는 동작은 그대로 두고 옛 모양의 타입(`TripBeforeV8`)만 붙였다.
- 여행 표지 사진(`Trip.cover: CoverPhoto | null`)은 사용자가 고른 사진을 기기에서 줄여서 여행 기록 안에 JPEG `data:` URL로 둔다. 큰 표지용 `image`(긴 변 1600px)와 목록용 `thumbnail`(가운데 정사각형 192px) 두 장이다.
  - 그래서 사진이 여행과 함께 저장·병합(`updatedAt`)·백업되고, 화면은 `<img src>`로 바로 쓴다. 사진을 바꾸거나 빼는 것은 여행 수정이다(`trips.update(id, { cover })`, `null`이면 뺌).
  - 저장소는 이미지 `data:` URL만 받는다(`isImageDataUrl`: jpeg/png/webp, 크기 상한). 다른 주소를 받으면 남이 만든 백업 파일이 앱을 열 때마다 외부로 요청을 보내게 할 수 있어서다.
  - Dexie `version(4)`에서 생겼다(기존 여행은 `null`, `updatedAt`은 그대로).
- **보관함(날짜 미지정)**: `ScheduleItem.date`는 `string | null`. `null`이면 보관함 항목이다. 코드에서는 **`inbox`** 라고 부른다.
  - 보관함 항목은 날짜 항목과 별개의 `order`를 가진다.
  - 보관함 ↔ 날짜(또는 날짜 ↔ 날짜)로 옮기면 출발지·도착지 양쪽의 `order`를 재부여한다.
- 여행 기간이 줄어들면 범위 밖 날짜의 일정은 삭제하지 않고, **"보관함으로 이동 / 삭제"** 중 사용자가 선택한다.

### 가계부·정산
- 모델: `Companion`, `Expense`, `ExpenseShare`, `Settlement`. 기존 규칙(UUID, 날짜 문자열, `createdAt/updatedAt`, 값 없음은 `null`, 저장소 인터페이스 경유)을 그대로 따른다.
  - `Trip`에 `settlementCurrency`(정산 통화, 기본 `'KRW'`)와 `budget`(정산 통화 최소 단위 정수 | `null`)을 추가한다.
  - `Companion { tripId, name, isMe, accountId, order }`: 여행을 만들면 "나"(`isMe`)가 자동으로 생긴다. "나"는 이름만 바꿀 수 있고 삭제할 수 없다. 이름은 한 여행 안에서 겹치지 않게 한다. `accountId`는 친구와 같이 쓰는 여행에서 그 사람의 계정이다(18단계, 아래 "친구 초대·함께 쓰기").
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
  - API 호출은 `lib/exchangeRateApi.ts`. **지출 통화를 기준으로** 요청하고(`/v6/latest/JPY`) 정산 통화 값을 읽는다. 응답 값은 소수 6자리로 반올림돼 오므로, 원화 정산에서는 이쪽이 정밀하다(JPY→KRW `8.510259`, 반대 방향 KRW→JPY는 `0.117506`).
  - 앱이 채우는 환율은 보이는 대로 쓴다(사용자 요청, 2026-11-05): 1 이상은 소수점 둘째 자리(`1379.22`, `8.50`), 1 미만은 유효숫자 4자리(`0.05271`, 2자리면 베트남 동이 `0.05`로 뭉개짐). 반올림은 `roundRate()`(`data/rules/money.ts`, BigInt)다.
  - `rateText()`가 API 값을 이렇게 바꾸고, 폼은 API·마지막 환율·저장된 지출을 열 때도 이렇게 보여준다(`shownRate`). 사용자가 직접 입력한 환율(`manual`)은 입력한 그대로 둔다.
  - 받은 표는 기준 통화별로 기기(localStorage `travel-go:latest-rates`)와 `features/expenses/rateStore.ts`에 두고, 제공자의 다음 갱신 시각까지(받은 뒤 최소 1시간) 다시 요청하지 않는다. 같은 통화의 동시 요청은 하나로 합친다. 기한이 지난 표는 쓰지 않는다. 오프라인(`navigator.onLine === false`)이면 바로 실패하고, 요청은 8초에 끊는다.
  - 지출 폼: 새 지출은 열 때, 통화를 바꾸면 항상, "최신 환율 불러오기" 버튼으로 조회한다. 수정할 때는 저장된 환율을 그대로 두고, 다시 입력해야 하는 환율만 열 때 조회한다. 조회 결과는 **요청한 뒤 통화와 환율 칸이 그대로일 때만** 넣는다 (입력한 값이 이긴다).
  - `fetchedAt`은 API가 환율을 발표한 시각(`time_last_update_unix`)이다. `last`로 다시 쓸 때도 그대로 옮긴다. 그래서 `fetchedAt`이 있으면 API에서 온 환율이다. 폼은 `11.3 09:02 기준`처럼 보여준다.
  - 출처 표기(약관): API에서 온 환율이 화면에 쓰이면 "Rates By Exchange Rate API" 링크(https://www.exchangerate-api.com, `RateAttribution.tsx`)를 둔다. 폼의 환율 칸 아래, 가계부 목록·요약 화면 끝(`usesApiRates()`).
- 저장: Dexie `version(2)`로 `companions`, `expenses`, `expenseShares`, `settlements`를 추가한다. `upgrade()`에서 기존 여행에 기본값과 "나"를 넣는다 (여행의 `updatedAt`은 그대로 둔다. 사용자 수정이 아니므로 병합에서 이기면 안 됨).
  - "나"의 id는 `meCompanionId(tripId)`(= `lib/id.ts`의 `derivedId`, UUID v8)로 여행 id에서 **결정적으로** 만든다. 새 여행·DB 마이그레이션·v1 백업 변환 어디서 만들어도 같은 id가 되어, 병합해도 "나"가 둘이 되지 않는다. 마이그레이션·변환으로 만든 "나"의 시각은 여행의 `createdAt`을 쓴다.
- 저장소: `companions`(목록·추가·이름 변경·`usage`·삭제), `expenses`(입력은 분담 대상 `participants`, 분담액은 저장소가 `splitExpense`로 계산. `usedRates()`: 모든 여행에서 통화·정산 통화 쌍마다 가장 최근 지출의 환율), `settlements`. 일정 항목을 지우면(직접 또는 기간 축소 시 삭제) 연결된 지출의 `scheduleItemId`만 `null`로 바꾼다. 여행을 지우면 딸린 것을 모두 지운다.
- 순수 규칙: `data/rules/money.ts`(통화 표·`parseAmount`·`convertAmount`), `split.ts`(`splitExpense`·`participantsFromShares`), `expense.ts`(입력 검증), `companion.ts`, `ledger.ts`(`buildLedger`: 합계·카테고리·날짜·동행자별 낸 돈/쓴 돈·잔액), `settlementPlan.ts`(`planTransfers`).
- 백업: `BACKUP_SCHEMA_VERSION`을 2로 올린다(10단계 이후 3: 아래 장소 데이터 기한, 표지 사진 이후 4: 그 전 파일의 여행은 사진 없음, 18단계 이후 5: 동행자의 `accountId`, 그 전 파일은 `null`, 다녀온 나라 이후 6: `visitedCountries`, 그 전 파일은 빈 목록, 여행의 나라·도시 여러 개 이후 7: 여행의 `countries`·`cities`(그 전 파일은 `city` 하나를 목록으로, 나라는 없음), 다녀온 곳에 지역 코드). v1 파일은 기본값과 "나"를 채워 변환한다. 병합할 때 지출과 그 분담은 한 묶음으로 다룬다 (파일 쪽 지출이 더 최근이면 분담 전체를 파일 것으로 교체).
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
- 화면: 설정(`/settings`, 여행 목록의 톱니바퀴) → `features/backup/`. 스토어는 `backupStore`(저장소 호출, 마지막으로 내보낸 시각).
  - 백업 내보내기: "파일로 저장"은 다운로드(`lib/download.ts`), 파일 이름은 `travel-go-backup-YYYY-MM-DD-HHmm.json`(기기 시간). 파일 공유를 받는 브라우저(Safari)에서는 "공유"도 보인다(`canShareFile`·`shareFile`, `lib/share.ts`). Chrome은 JSON 파일 공유를 받지 않아서 버튼이 없다.
  - 저장하거나 공유하면 그 시각을 기기에 둔다(localStorage `travel-go:last-backup`). 설정 화면에 "마지막으로 내보낸 때"로 보여준다. 공유 창을 닫기만 했으면 남기지 않는다.
  - 백업 가져오기: "백업 파일 고르기" → `readBackupFile`(JSON 읽기 + `parseBackupFile`). 읽지 못하면 `errorMessage` 문구와 "문제 위치: `$.trips[0].startDate`"(`invalidAt`)를 보여준다.
  - 가져오기 시트(`ImportSheet`)가 확인 단계다. 파일 정보(내보낸 때, 종류별 개수), 방법(병합이 기본 / 덮어쓰기), 미리보기(`previewImport`)를 보여준다. 미리보기는 병합이면 "새로 추가 / 갱신 / 유지", 덮어쓰기면 "지워짐 / 가져옴"의 합계와 종류별 개수(`previewLines`)이고, 보관함으로 옮겨질 일정 수도 보여준다. 미리보기가 나오기 전에는 실행할 수 없다. 덮어쓰기 버튼은 빨간색이다.
  - 가져온 뒤에는 `backupStore`가 여행·일정·가계부 스토어를 비운다. 그래서 다음에 여는 화면이 새 데이터를 읽는다.

### Google Maps / Places
- API 키는 `.env.local`의 `VITE_GOOGLE_MAPS_API_KEY`. 커밋 금지 (`.env.example`만 커밋).
  - 키 하나로 지도와 장소 검색을 모두 쓴다. JS API가 Places 요청에도 스크립트를 로드한 키를 쓰기 때문이다. 그래서 그 키에 **Maps JavaScript API**와 **Places API (New)**가 둘 다 허용돼야 한다.
  - 브라우저 번들에 그대로 실리는 키라서, 콘솔에서 HTTP 리퍼러 제한(`http://localhost:5173/*`, 확인용 `http://localhost:5174/*`, 배포 주소)과 API 제한(위 두 API)을 건다.
  - 키는 Google Cloud 프로젝트 "My First Project"(번호 `705597297951`)에 있다. 콘솔 목록의 "Maps Platform Demo Project"(다른 키), "My Maps Project"(키 없음)가 아니다. `https://console.cloud.google.com/apis/credentials?project=705597297951`로 바로 연다. 키의 프로젝트를 모를 때는 그 키로 다른 API(예: 번역)를 불러 보면 거절 메시지에 프로젝트 번호가 나온다.
  - 결제 계정은 Google Cloud 무료 체험판이다(2026-11-04). 체험은 크레딧을 다 쓰거나 기간이 끝나면 끝나고, 그 뒤로는 유료 계정으로 바꾸기 전까지 지도·검색이 멈춘다(앱의 나머지는 그대로). 유료로 바꾸면 하루 할당량 상한을 건다(아래 "로그인·친구 초대 계획"의 비용 항목).
  - 2026-11-04 확인: 웹사이트 제한이 `https://travel-go-lemon.vercel.app/*`, `http://localhost:5173/*`, `http://localhost:5174/*`이다. 다른 주소(비슷한 `*.vercel.app` 포함)는 `API_KEY_HTTP_REFERRER_BLOCKED`.
  - Vite 개발 서버는 `.env.local`이 바뀌면 스스로 재시작해서 새 키를 읽는다.
- Map ID가 필요한 기능(Advanced Marker)은 `VITE_GOOGLE_MAPS_MAP_ID`(`googleMapsMapId()`). 비어 있으면 Google이 시험용으로 주는 `DEMO_MAP_ID`를 쓴다. 개발에는 충분하지만, 출시 전에는 콘솔에서 Map ID를 만들어 넣는다.
  - 2026-11-04에 키와 같은 프로젝트(My First Project)에 JavaScript Map ID를 만들었다. `.env.local`과 Vercel 환경 변수에 같은 값을 둔다. 배포용 빌드로 확인함: 실제 지도·마커가 뜨고 콘솔 오류가 없다.
- Places는 **Places API (New)** 사용 (`AutocompleteSuggestion`, `Place.fetchFields`). 레거시 Autocomplete 위젯 사용 금지.
- 고른 장소의 상세는 **`formattedAddress, location`만** 요청한다(Place Details Essentials). 이름은 자동완성 제안의 `mainText`를 쓴다. `displayName`(Pro)을 요청하면 세션을 끝내는 호출이 가장 비싼 SKU(Enterprise + Atmosphere)로 청구된다.
- 자동완성은 세션 토큰을 쓴다. 검색 한 번(첫 요청부터 고를 때까지)이 토큰 하나다. `placePrediction.toPlace().fetchFields()`가 같은 토큰으로 세션을 끝내고, 다음 검색은 새 토큰으로 한다. 고르지 않고 닫으면 요청마다 청구된다.
- 키가 없거나 오프라인이면 지도/검색 영역에 안내 상태를 보여주고 앱은 정상 동작해야 한다.
- 로더: `lib/googleMaps.ts`의 `importMapsLibrary(name)`. Google의 "dynamic library import" 방식이라 처음 쓸 때 스크립트를 한 번만 넣는다(`language=ko`). 로드에 실패하면(오프라인 등) 다음 호출에서 다시 시도한다. 페이지에 이미 `google.maps.importLibrary`가 있으면 그걸 쓴다. 지도도 이 로더로 `maps`·`marker` 라이브러리를 받는다.
- 장소 검색 (`features/places/`)
  - `placeSearch.ts`: `createPlaceSearch()`/`placeSearch`(세션 단위 `suggest`·`pick`), `searchBias(trip, items)`. 편향은 도시가 하나인 여행은 그 도시, 여러 개면 위치가 있는 일정 중 마지막에 추가한 곳(일정이 거기까지 왔으니), 그것도 없으면 위치가 있는 첫 도시를 중심으로 반경 30km다(제한이 아니라 우선순위).
  - `usePlaceSearch(text, { kind, bias })` 훅: 입력이 멈추고 300ms 뒤에 검색하고, 2글자 미만은 검색하지 않는다. 늦게 온 이전 응답은 버린다. 이어서 입력하는 동안은 이전 결과를 계속 보여준다(`refines`, 조합 중인 마지막 글자 허용). 실패하면 "다시 시도"를 띄운다.
  - 화면: `PlaceSuggestionList`(결과·상태 안내·출처), `PlaceSearchSheet`(기존 일정에 장소 연결), `SearchUnavailableNote`(키 없음/오프라인 안내).
  - 여행 도시는 `kind: 'region'`(`includedPrimaryTypes: ['(regions)']`: 도시·지방·국가)로 검색한다. 고른 도시는 `TripCity`의 `placeId`·`location`으로 저장한다.
    - 여행의 나라를 골랐으면 그 나라 안에서만 찾는다(`includedRegionCodes`, Google은 15개까지).
    - 도시는 여러 개를 칩으로 넣는다(`TripCitiesField`). 검색 결과 아래 "'○○' 그대로 넣기"는 이름만 넣는다. 고르지 않고 입력칸에 남은 글자는 만들 때 이름만 있는 도시로 들어간다(`formCities`). 같은 장소, 이미 있는 이름은 다시 넣지 않는다(`withCity`).
    - 저장된 도시는 칩이라서 열 때 검색하지 않는다.
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
- 지도 (`features/map/`)
  - `DayMap`: 날짜 탭의 일정 목록 위에 그 날 장소를 보여준다(높이 192px 카드). 보관함은 순서가 없어서 지도도 없다. 위치가 있는 일정이 하나도 없으면 아무것도 그리지 않고 API도 부르지 않는다.
  - 마커는 카드와 같은 번호(목록 순서 + 1)이고, 위치가 없는 일정은 건너뛴다. 그래서 번호가 빌 수 있어서 지도 아래에 "2번은 위치가 없어서 지도에 없어요."를 둔다. 선은 위치가 있는 장소를 순서대로 잇는다.
  - 순수 규칙은 `route.ts`(`routeStops`, `unplacedNumbers`, `routeLegs`, `directionsUrl`, `routeFrame`), 지도 조작은 `routeMap.ts`(`createRouteMap(container, libraries)` → `show(stops)`·`destroy()`)에 둔다.
  - 마커는 Advanced Marker에 번호 원(`div`, Tailwind 클래스)을 넣는다. 마커는 기본으로 점 위에 서므로 원을 반만큼 내려서 가운데가 점에 오게 한다. `title`이 "1번 오사카성"(접근성 이름)이다.
  - 카메라: 장소들이 다 보이게 맞춘다(여백 24px). 한 곳이거나 모두 약 200m 안이면 줌 16으로 가운데에 둔다(끝까지 확대되지 않게). 장소 구성이 바뀔 때만 다시 맞추고, 순서만 바뀌면 사용자가 옮긴 화면을 그대로 둔다.
  - 지도 옵션: `gestureHandling: 'cooperative'`(한 손가락은 페이지 스크롤, 두 손가락이 지도), `clickableIcons: false`, 기본 UI 없이 전체 화면 버튼만.
  - 같은 카드 안에서 날짜를 바꾸면 지도 하나를 그대로 쓰고 마커만 다시 그린다(지도를 새로 만들 때마다 Dynamic Maps 1회 청구). 빈 날이나 보관함을 거쳐 돌아오면 새로 만든다.
  - 상태: 키가 없거나 지도가 아직 없을 때 오프라인이면 안내 문구, 불러오는 중에는 회색 상자, 실패하면 "지도를 불러오지 못했어요 · 다시 시도". 한 번 뜬 지도는 오프라인이 돼도 그대로 둔다.
  - 구간별 길찾기: 일정 타임라인의 장소 사이에 "직선 1.4km · 길찾기"(새 탭)를 둔다. 목적지 바로 위 항목의 카드 아래에 놓고(`legsAbove`), 위치 없는 항목을 건너뛰는 구간은 "1번에서 직선 3.1km"처럼 출발 번호를 붙인다. 거리는 두 장소의 직선 거리(`distanceMeters`, `formatDistance`: 10m 단위, 1km부터 0.1km, 10km부터 1km 단위)라서 "직선"이라고 쓴다. 같은 자리로 가는 구간(예: 같은 호텔)은 뺀다. 이동 수단은 Google 지도가 고른다. 드래그하는 동안에는 자리만 남기고 숨긴다(순서가 바뀌면 틀린 값이라서).
    - Google 장소는 `origin`/`destination`에 **이름**, `*_place_id`에 place ID를 넣는다. 지도는 ID로 장소를 찾고, 이름은 ID를 못 찾을 때만 쓴다(이름을 "성 구경"으로 바꿔도 오사카성으로 감). 좌표를 넣으면 ID를 무시하고 그 좌표에서 가장 가까운 곳(예: 근처 가게)으로 잡으므로, 좌표는 place ID가 없는 장소에만 쓴다. 실제 Google 지도로 확인함.
    - 거리·길찾기 줄은 카드와 같은 목록 항목(`li`) 안에 있다. 그래서 화면 흐름 테스트의 `cards()`(항목 글자)에 붙어 나온다.

### PWA / 오프라인
- 앱 셸은 서비스워커로 프리캐시. 여행/일정 조회는 IndexedDB 기반이라 오프라인 동작.
- 지도 타일·장소 검색은 오프라인 미지원 (안내 표시). 구글 지도 리소스를 SW로 캐시하지 않는다 (약관).
- 환율 API 응답도 SW로 캐시하지 않는다. 앱이 localStorage에 직접 두고 유효 기간을 판단한다.
- 서비스워커와 `storage.persist()`는 보안 컨텍스트에서만 동작한다. 폰에서 `http://<LAN IP>`로 접속하면 PWA를 확인할 수 없으므로, 폰에서는 배포 주소(https)로 확인한다.
- iOS Safari에서 설치되지 않은 상태면 "공유 → 홈 화면에 추가" 안내를 **1회** 보여준다.
  - 닫으면 다시 띄우지 않고, 설정 화면에서 다시 볼 수 있다.
  - 저장소 보존을 위해 설치를 권장하는 문구를 포함한다.
- 구현: `vite-plugin-pwa`(`vite.config.ts`).
  - manifest: 이름 travel GO, `display: standalone`, 흰 테마색, 아이콘(192·512, 마스커블 512).
  - 아이콘은 `public/favicon.svg`(파란 배경에 45° 기울어 이륙하는 흰 비행기, 가운데 동그란 구멍)에서 그렸다. 마스커블·`apple-touch-icon`(180)은 모서리 없이 꽉 채운 판이고, `favicon.ico`(16·32·48)도 있다. 비행기는 안드로이드 마스커블의 최소 안전 원(반지름 40%) 안에 들어간다. 그림을 바꾸면 PNG와 `index.html`의 시작 화면 그림도 같이 바꾼다.
  - `index.html`에 iOS 홈 화면 앱용 메타가 있다(전체 화면, 상태 표시줄 `default`: 흰 바탕에 진한 글씨, 앱 헤더와 같음).
- 서비스워커(generateSW)는 앱 파일(화면별 조각, Supabase 조각, 도시 이름 조각 포함, 51개)만 프리캐시하고, 화면 주소는 모두 `index.html`로 연다(`navigateFallback`). 런타임 캐시는 나라별 지역 지도(`/regions/*.json`, `travel-go-regions`)뿐이다. 그래서 구글·환율 요청은 서비스워커를 거치지 않는다.
- 앞으로 가기는 막는다(`lib/useNoForwardHistory.ts`, `AppLayout`, 사용자 요청 2026-11-05). 아이폰은 오른쪽 끝에서 밀면 앞으로 가서, 떠난 화면(예: 이미 저장한 지출 폼)이 다시 열렸다.
  - 화면은 누르는 것으로만 열고, 기록은 뒤로만 간다(왼쪽 끝에서 밀기, 뒤로 버튼).
  - React Router의 `useBlocker`가 앞으로 가는 POP(`history.state.idx`가 지금보다 큼)을 막으면, 라우터가 브라우저를 원래 자리로 돌려놓는다. 화면은 바뀌지 않는다. 막는 장치는 하나만 둘 수 있다(React Router 제약).
  - 메모리 라우터(테스트)에는 `idx`가 없어서 막지 않는다. 규칙은 `goesForward` 단위 테스트, 동작은 실제 브라우저(Chromium `goForward`)로 확인했다.
  - 그래도 아이폰은 앞 기록이 있으면 밀 때 떠난 화면의 그림을 미끄러져 들어오게 보여 준다(배포 뒤 사용자가 메인에서 확인, 2026-11-05). WebKit 코드로 확인한 것이다.
    - 끝 밀기는 페이지보다 먼저 잡히는 WebKit의 동작이라 CSS(`touch-action`)나 터치 이벤트로 막을 수 없다. 앞 기록이 있을 때만 시작한다(`ViewGestureController::canSwipeInDirection`).
    - 기록은 지울 수 없고, 새 기록을 넣어야 그 앞이 잘린다.
    - 마지막 터치 뒤 10초가 지나 스크립트가 넣은 기록은 리디렉션처럼 본다. 거기서 뒤로 가면 바로 전 기록 하나를 건너뛴다(그 기록이 맨 처음이면 건너뛰지 않음, `WebBackForwardList`).
  - 그래서 뒤로 간 뒤 0.6초가 지나면 앞 기록을 정리한다(`aheadPlan`, `leaveNothingAhead`).
    - 보통은 지금 화면의 복사본 하나를 앞에 둔다(새 기록을 넣고 라우터 몰래 한 칸 뒤로). 앞으로 밀면 같은 화면이 나오고, 위의 막는 장치가 돌려놓는다. 뒤로 가기는 그대로다.
    - 아이폰 홈 화면 앱을 새로 열어 메인에서 시작했으면(기록 1개), 메인으로 돌아왔을 때 메인 복사본 위에 메인을 올리고 거기 머문다. 앞 기록이 아예 없어서 오른쪽 밀기가 시작되지 않는다. 대신 메인에서 왼쪽 끝을 밀면 아래의 메인이 보였다가 다시 위로 올라간다.
    - 브라우저 탭과 안드로이드는 메인도 복사본만 둔다. 메인에서 뒤로 가면 앱을 떠나야 하는데(이전 페이지, 앱 닫기), 아래의 복사본이 그걸 막기 때문이다.
    - 메인을 올리는 것은 기록 맨 처음(0)과 그 위(1)에서만 한다. 그래야 복사본에 리디렉션 표시가 붙어도, 거기서 뒤로 가면 맨 처음의 메인에 닿는다.
  - 라우터 몰래 하는 이동: `watchOwnHistorySteps`가 라우터보다 먼저(`router.tsx`) `popstate`를 듣고, 앱이 낸 이동이면 라우터에 넘기지 않는다. 기록을 더 넣을 때는 라우터의 `navigate`로 넣어서 라우터의 번호가 맞는다(넣을 때 지금 번호를 다시 읽음).
  - 이 이동들이 스크롤을 움직이지 않게, 그동안 `history.scrollRestoration`을 `manual`로 둔다. 메인 맨 아래 기록은 계속 `manual`이다.
  - Chrome은 한 번도 누르지 않은 페이지가 넣은 기록을 뒤로 가기에서 건너뛴다. 그래서 누른 적이 없으면(`navigator.userActivation.hasBeenActive`) 정리하지 않는다.
  - 확인: Chromium(폰 크기)의 탭과 아이폰 홈 화면 앱 흉내(UA, `navigator.standalone`, 기록 1개)에서 기록 번호·길이, 앞으로 가기, 스크롤(400 그대로)을 봤다(개발 서버·빌드, 배포 주소에서도 같음). 아이폰의 밀기 자체는 실제 아이폰으로만 확인할 수 있다.
- 업데이트(`registerType: 'autoUpdate'`): 앱이 `virtual:pwa-register`를 쓰지 않아서 등록 스크립트(`registerSW.js`)는 로드 때 등록만 한다.
  - 새 서비스워커는 설치되면 바로 자리를 잡고(`skipWaiting`·`clientsClaim`), 열려 있는 화면은 새로고침하지 않는다. 새 버전은 다음에 앱을 열 때 보인다. 입력 중인 폼이 날아가지 않게 하려는 것이다(실제 브라우저로 확인함).
  - 화면 코드는 처음 열 때 받는 조각이라("번들 나누기"), 업데이트 전에 열어 둔 화면이 업데이트로 지워진 옛 조각을 부를 수 있다. 그러면 한 번 새로고침해서 새 버전으로 연다(`lib/chunkErrors.ts`).
- 번들 나누기 (`app/router.tsx`): 여행 목록(첫 화면)과 없는 주소 화면 말고는 처음 열 때 코드를 받는다(React Router `lazy`, `lazyPage()`). 첫 화면에 받는 파일이 625KB에서 468KB(gzip 149KB)로 줄었다. 남은 것은 거의 라이브러리다(react-dom 202KB, Dexie 96KB, React Router 89KB).
  - 16단계(Supabase 조각 추가)부터는 빌드 도구(Rolldown)가 React 부분을 따로 떼어, 첫 화면이 `index` 364KB와 `react` 105KB를 같이 받는다(`index.html`이 미리 받음). 합계(gzip 약 149KB)는 같다. 지난 커밋을 따로 빌드해 비교했고, 목록 화면이 `lib/supabase`를 불러오는 것과는 상관이 없었다.
  - 17단계(동기화)부터 첫 화면은 gzip 약 155KB다(동기화 코드 +6KB). Rolldown은 공용 조각에 그 안의 아무 모듈 이름을 붙인다(예: React가 든 조각이 `PageHeader-*.js`).
  - 18단계(공유)부터 첫 화면은 gzip 약 158KB다. 초대·참여 화면은 처음 열 때 받는다.
  - 18단계 뒤 요청 8가지를 넣은 뒤로는 gzip 약 159KB다(빌드 출력의 `index`와 `PageHeader` 합). 다녀온 나라 화면(세계 지도 포함, gzip 38KB)은 처음 열 때 받는다.
  - 여행의 나라·도시 여러 개 뒤로는 약 162KB다(목록의 국기와 나라 이름, 앱 시작 때 여행의 나라 칠하기).
  - 도시 이름 목록(`places.ts`, gzip 56KB)은 따로 떼어, 찾는 화면이 처음 쓸 때 받는다(`usePlaces`). 첫 화면은 그대로 약 162KB다.
  - `lazy`는 함수 형태로 쓴다. 객체 형태(`lazy: { Component }`)는 React Router가 불러온 항목을 그 객체에서 직접 지워서(`lazy[key] = undefined`), 같은 라우트 정의로 라우터를 여러 번 만드는 테스트에서 두 번째부터 "No route matches"가 난다.
  - 첫 화면의 코드를 받는 동안은 빈 기둥(`hydrateFallbackElement`)을 보여준다.
  - 화면 코드를 받지 못하거나 화면이 오류로 멈추면 `RouteError`("화면을 불러오지 못했어요 · 다시 시도")가 뜬다.
- 옛 조각 처리 (`lib/chunkErrors.ts`의 `reloadOnChunkError`, `main.tsx`에서 등록)
  - Vite는 조각을 받지 못하면 `vite:preloadError`를 낸다. 그러면 열려던 화면 주소(라우터에서 진행 중인 이동)로 한 번 새로고침한다.
  - 10초 안에 또 실패하면(오프라인, 깨진 배포) 다시 새로고침하지 않고 오류 화면을 둔다. 새로고침한 시각은 탭의 sessionStorage에 두고, 그게 막혀 있으면 새로고침하지 않는다(무한 새로고침 방지).
  - 새로고침하기로 한 뒤에는 실패한 화면이 오류를 띄우지 않고 기다린다(`reloadingForChunk()`). 그래서 떠나는 페이지에 오류 화면이 번쩍이지 않고, 실패한 화면이 기록에 남지 않는다(뒤로 가면 목록). 뒤로 가기로 옛 페이지가 브라우저 캐시에서 살아나면(`pageshow`의 `persisted`) 그 페이지도 새로고침한다.
  - 실제 브라우저(Chromium, `vite preview`)로 확인함: 새 버전이 옛 조각을 지운 뒤 "설정"을 누르면 한 번 새로고침해 새 설정 화면이 열리고, 기록은 한 칸만 늘고, 뒤로 가면 목록이다. 계속 없는 조각은 한 번만 새로고침한 뒤 오류 화면을 두고, "다시 시도"로 돌아온다.
- 시작 화면: 앱을 열면 흰 바탕에 아이콘과 "travel GO"(GO는 파란색)가 떠오르듯 나왔다가 사라진다.
  - 앱 코드가 돌기 전 첫 화면부터 보이도록 `index.html`에 그림·글자·CSS를 직접 넣었다(`#splash`). 앱이 처음 그려지면 `AppLayout`이 `hideSplash()`(`app/splash.ts`)를 부른다. 페이지를 열고 0.9초가 지나기 전이면 그때까지 두고, 0.3초 동안 흐려진 뒤 지운다.
  - 탭마다 한 번만 보인다(sessionStorage `travel-go:splash-shown`, `index.html`의 인라인 스크립트). 새로고침(업데이트 뒤의 새로고침 포함)에는 안 나오고, 홈 화면 앱을 새로 열거나 새 탭에서 열면 나온다. 사이트 데이터가 막혀 있으면 매번 나온다.
  - 움직임 줄이기 설정이면 떠오르는 효과 없이 나온다.
- 홈 화면 안내 (`features/install/`)
  - iOS(iPhone, 또는 Mac처럼 보이지만 터치가 되는 iPad, `lib/platform.ts`의 `isIos`)의 브라우저에서만 보인다. 홈 화면에서 열었으면(`isStandalone`: `display-mode: standalone` 또는 `navigator.standalone`) 보이지 않는다.
  - 여행 목록 위의 배너(`InstallBanner`)는 닫기(X)를 누를 때까지 보이고, 닫으면 기기에 남겨(localStorage `travel-go:install-banner-closed`) 다시 띄우지 않는다. 방법을 본 것만으로는 닫지 않는다.
  - 방법 시트(`InstallGuideSheet`): 공유 버튼(안 보이면 ⋯ 먼저) → ‘홈 화면에 추가’ → ‘추가’ 3단계와 데이터 보존 이유가 있다. 이미 만든 여행은 추가 전에 백업으로 내보내고, 홈 화면 앱에서 안 보이면 가져오라는 안내도 있다(홈 화면 앱의 저장 공간이 Safari와 이어지는지는 확인하지 못해서, 어느 쪽이든 안전한 방법을 안내함).
  - 설정 화면 맨 위의 "홈 화면에 추가" 구역(`InstallSettings`)에서 언제든 다시 볼 수 있다.
  - Android·데스크톱 Chrome은 브라우저가 설치를 제안하므로 따로 안내하지 않는다.

### 배포 (Vercel)
- 15단계에서 시작했다. GitHub `main`에 올리면 Vercel이 `npm run build`로 빌드해서 바로 배포한다(무료 Hobby 플랜). 빌드가 실패하면 이전 버전이 그대로 남는다.
- 주소: https://travel-go-lemon.vercel.app (Vercel 프로젝트 `travel-go`). `main`에 올리는 것이 곧 배포다.
- 확인함(2026-11-04)
  - HTTP: 화면 주소는 `index.html`, 없는 `/assets/` 조각은 404, 서비스워커가 받는 앱 파일 37개가 모두 있다. 빌드에 든 지도 키가 `.env.local`의 키와 같다.
  - 실제 브라우저(Chromium, 폰 크기): 설치 가능 오류가 없다. 도시·장소 검색(구글)으로 여행과 일정을 만들면 지도에 번호 마커 2개, 직선, 길찾기가 뜬다. 오프라인으로 다시 열어도 목록·여행이 열리고, 새 창에서 `/settings`를 바로 열 수 있다. 콘솔 오류는 없다.
- 확인함(2026-11-05, 16단계)
  - HTTP: 첫 화면 파일에 Supabase 주소와 publishable 키가 들어 있고 secret 키는 없다. 서비스워커가 받는 앱 파일 40개가 모두 있다. 파일 이름이 로컬 빌드와 같다(Vercel 환경 변수 값이 `.env.local`과 같음).
  - 실제 브라우저(Chromium, 폰 크기): 목록 머리줄에 계정 아이콘이 있고, 계정 화면이 열린다. 두 로그인 버튼이 Supabase(PKCE, 돌아올 곳은 배포 주소의 `/account`)를 거쳐 카카오·구글 로그인 화면으로 간다. 콘솔 오류는 없다.
- 확인함(2026-11-05, 17단계)
  - HTTP: `index.html`이 로컬 빌드와 같고, 서비스워커가 받는 앱 파일 41개가 모두 있다. Supabase 주소와 publishable 키는 첫 화면 조각(`PageHeader-*.js`)에 있다.
  - secret 키는 없다(`sb_secret_` 뒤에 글자가 이어지는 것이 없음). 로그인 조각에 있는 `sb_secret_`는 supabase-js가 키 종류를 가리는 글자라서, 그 글자만 찾으면 잘못 걸린다.
  - 실제 브라우저(Chromium, 폰 크기, 로그아웃 상태, 구글 요청은 막음): 첫 화면과 여행 만들기에 로그인 조각을 받지 않는다. IndexedDB v5(표 8개), 계정 화면의 새 안내, 서비스워커 캐시 41개. 콘솔 오류는 없다.
- 확인함(2026-11-05, 18단계)
  - HTTP: `index.html`과 조각 37개가 로컬 빌드와 같다(Vercel의 카카오 키도 같은 값). 서비스워커가 받는 앱 파일 46개가 모두 있다.
  - `/join/…`·`/trips/…/people`은 `index.html`이고, `invite-card.jpg`는 그림 그대로다. 카카오 키는 초대 화면 조각(`TripPeoplePage-*.js`)에만 있고, secret 키는 없다.
  - 카카오: 배포 주소의 카드 확인 요청(위 "카카오톡 공유"의 확인 방법)에 그림, 제목, 설명, "참여하기", 경로까지 그대로인 링크가 모두 들어 있다. 그림은 카카오 CDN에 같은 크기로 옮겨졌다.
  - 실제 브라우저(Chromium, 폰 크기, 로그아웃 상태, 구글 요청은 막음): 첫 화면에 로그인 조각을 받지 않는다. 여행 메뉴에 "친구 초대"가 있고, 함께하는 사람 화면은 로그인을 권한다. 잘못된 초대 링크는 실제 `invite_preview`를 거쳐 "이 초대 링크는 쓸 수 없어요"다. IndexedDB v6(표 8개), 서비스워커 캐시 46개, 콘솔 오류는 없다.
- 확인함(2026-11-05, 18단계 뒤 요청 8가지)
  - 기능마다 커밋을 나눴고(6개와 문서 1개), 중간 커밋도 하나씩 따로 꺼내 타입 검사·린트·테스트를 통과했다.
  - HTTP: `index.html`, `sw.js`, 서비스워커가 받는 앱 파일 47개가 로컬 빌드와 같다. `/countries` 같은 화면 주소는 `index.html`이고, 없는 `/assets/`·`/api/` 주소는 404다.
  - `/api/flight`: 편명이 없으면 400 `invalid`, 로그인하지 않았거나 세션이 틀리면 401 `signedOut`이다. 키가 없으면 503이 나오는 자리라서, Vercel에 `AERODATABOX_API_KEY`가 들어간 것도 확인됐다(사용자가 넣음). 배포된 코드에 그 키는 없다.
  - 실제 브라우저(Chromium, 폰 크기, 로그아웃 상태, 구글 요청은 막음)
    - 여행이 하나면 큰 카드가 없고, 둘이면 하나다. 앞으로 가기는 막히고 뒤로 가기는 된다.
    - API 환율(응답은 흉내)이 `8.46`으로 채워진다.
    - 다녀온 나라: 지도 누르기, 되돌리기, "사이판" 찾기가 된다. 장소 추가의 항공편 줄은 로그인을 권한다.
    - 콘솔 오류는 없다.
  - 지도 모양의 한가운데를 누르는 확인 스크립트가 프랑스 대신 말리를 눌렀다. 프랑스 모양에 해외 영토(프랑스령 기아나 등)가 들어 있어서 한가운데가 아프리카에 떨어진 것이고, 앱 문제가 아니다. 본토를 누르면 프랑스가 들어간다(배포 주소에서 확인함).
- 확인함(2026-11-05, 여행의 나라·도시, 기간 달력, 지역 지도)
  - 기능마다 커밋을 나눴고(4개와 문서 1개), 중간 커밋도 하나씩 따로 꺼내 타입 검사·린트·테스트를 통과했다.
  - HTTP: `index.html`, `sw.js`, 서비스워커가 받는 앱 파일 49개, 지역 지도 194개가 로컬 빌드와 같다. 지역 지도는 `application/json`이다.
    - `/countries/JP`·`/trips/new`는 `index.html`이고, 없는 `/regions/` 주소는 404다.
    - `/api/flight`는 전과 같고(400 `invalid`, 401 `signedOut`), 비밀 키는 없다.
  - 실제 브라우저(Chromium, 폰 크기, 로그아웃 상태, 구글 요청은 막음)
    - 새 여행: 나라 2개, 도시 2개(이름만), 달력으로 고른 기간, 항공편(로그인을 권함)으로 만들면 첫날 일정에 `KE723`이 들어간다. 표지와 목록은 `🇯🇵🇹🇼 오사카 · 교토`다.
    - 다녀온 나라: 어제 시작한 여행의 나라 2곳이 저절로 칠해진다. 일본 지역 지도에서 오사카부를 누르면 "1곳 / 47"이다. 오프라인으로 다시 열어도 그 지도가 서비스워커 캐시에서 열린다.
    - 콘솔 오류는 구글을 막아서 생긴 장소 검색 실패 기록(`usePlaceSearch`)뿐이다.
  - 서버 SQL(`20261107120000_cities_regions.sql`)은 실행했는지 밖에서 알 수 없다. 바꾼 함수의 모양이 그대로이고, 지역 코드 검사는 로그인해야 닿는다. SQL Editor에서 `select pg_get_constraintdef(oid) from pg_constraint where conname = 'visited_countries_code_check'`가 `-[A-Z0-9]{1,3}`가 든 검사면 실행된 것이다.
- 확인함(2026-11-06, 목록 줄, 도시 이름으로 찾기, 편명 일정 채우기)
  - 기능마다 커밋을 나눴고(3개와 문서 1개), 중간 커밋도 하나씩 따로 꺼내 타입 검사·린트·테스트를 통과했다. 올린 뒤 약 40초 만에 배포됐다.
  - HTTP: `index.html`, `sw.js`, 서비스워커가 받는 앱 파일 51개(도시 이름 조각 포함), 지역 지도 193개가 로컬 빌드와 같다.
    - 지역 지도에는 도시 목록이 없다(`places.ts`로 옮김). 지운 `/regions/SG.json`은 404다.
    - `/countries/FR?q=…`는 `index.html`이다. `/api/flight`는 전과 같고(400 `invalid`, 401 `signedOut`), 비밀 키는 없다.
  - 실제 브라우저(Chromium, 폰 크기, 구글·Supabase 요청은 막음)
    - 로그아웃 상태로 만든 여행 둘이 모두 줄이다(큰 카드 없음).
    - 나라 찾기: 파리 → 프랑스, 로마 → 이탈리아, 삿포로 → 일본, 나트랑 → 베트남, 푸켓 → 태국(푸껫), 제주도 → 대한민국(제주). 싱가포르 줄에는 "지역"이 없다.
    - 프랑스 줄의 "지역 ›"이 `/countries/FR?q=파리`로 열려 일드프랑스가 맨 위다. 베트남은 호이안 → 꽝남성. 새 여행의 나라 고르기도 삿포로 → 일본이다.
    - 편명만 들어간 일정(`KE723`)을 편집 시트에서 채우고 저장하면 `KE723 인천 → 간사이`, 09:00, 편 정보 메모가 된다. 로그인은 브라우저에만 둔 가짜 세션이고, `/api/flight` 답은 흉내 냈다(실제 AeroDataBox 조회 없음).
    - 콘솔 오류는 막은 Supabase 요청에서 나온 것뿐이다.
- `vercel.json`
  - 화면 주소(`/trips/…`, `/settings` 등)는 `index.html`로 연다. Vercel은 파일이 있는 경로(`/`, `sw.js`, 아이콘 등)를 먼저 내주고, 나머지만 이 규칙(`rewrites`)으로 보낸다.
  - `/assets/`는 이 규칙에서 뺀다. 그래서 없는 조각은 404다. `index.html`을 내주면 업데이트 뒤의 옛 조각 요청이 HTML을 받고, 서비스워커 설치도 200이라서 그 HTML을 조각으로 저장해 버린다.
  - `/assets/`는 파일 이름에 해시가 있어서 1년 캐시(`immutable`)다. `index.html`·`sw.js`는 Vercel 기본값(`max-age=0, must-revalidate`)이라 매번 새 버전을 확인한다.
  - 규칙은 Vercel이 쓰는 변환기(`@vercel/routing-utils`)로 확인했다: 헤더 → 파일 → `rewrites` 순서.
- 환경 변수는 Vercel 프로젝트 설정에 둔다(`VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_MAP_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, 18단계부터 `VITE_KAKAO_JAVASCRIPT_KEY`). 종류는 Config(저장한 뒤에도 값이 보임)로 둔다. 모두 브라우저에 실리는 값이라 Secret으로 숨길 이유가 없다. 빌드할 때 번들에 들어가므로 값을 바꾸면 다시 배포해야 반영된다.
  - 예외: `AERODATABOX_API_KEY`(항공편)는 서버 함수만 읽는 비밀 키다. `VITE_`를 붙이지 않고, 종류는 Secret(Sensitive)으로 둔다. 함수는 실행할 때 읽으므로 다시 빌드할 필요는 없지만, 새 값은 새 배포부터 쓴다.
  - `vercel.json`의 `rewrites`는 `/api/`도 뺀다(서버 함수가 `index.html`로 가지 않게).
- Hobby 플랜은 계정 주인의 커밋만 배포한다(커밋 이메일이 GitHub 계정의 주소여야 함). 그래서 커밋 이메일은 GitHub가 주는 대신 쓰는 주소(`134910028+siyeong1013@users.noreply.github.com`, 이 저장소의 `.git/config`)다. 공개 저장소라서 진짜 이메일을 기록에 남기지 않으려는 것이기도 하다.

### 로그인 (Supabase Auth, 16단계)
- 프로젝트는 `.env.local`·Vercel의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`(`sb_publishable_…`, 공개용)다. 비어 있으면 로그인이 없다(여행 목록의 계정 버튼도 없고, `/account`는 "로그인을 쓸 수 없어요"). secret 키는 앱에 절대 넣지 않는다.
  - 2026-11-04에 사용자가 무료 프로젝트 `szjkqiatfclsoxoluetf`(`https://szjkqiatfclsoxoluetf.supabase.co`)를 만들었다(GitHub 계정으로 가입). 두 값은 `.env.local`과 Vercel 환경 변수에 있다.
  - 켜진 로그인 방식은 `curl https://<ref>.supabase.co/auth/v1/settings -H 'apikey: <publishable 키>'`의 `external`로 본다. 제공자가 꺼져 있으면 로그인 버튼이 Supabase의 400 페이지(`provider is not enabled`)로 간다.
  - 돌아올 주소 목록은 `GET /auth/v1/verify?token=x&type=magiclink&redirect_to=<주소>`의 `Location`으로 확인한다. 목록에 있는 주소면 그 주소로, 없으면 Site URL로 오류(`otp_expired`)와 함께 보낸다. 로그인은 일어나지 않는다.
    - 2026-11-04 확인: 5173·5174·배포 주소의 `/settings`·`/account`는 그대로 돌아오고, 목록에 없는 주소는 Site URL로 간다.
- 대시보드 설정 (Authentication)
  - URL Configuration: Site URL은 `https://travel-go-lemon.vercel.app`. Redirect URLs는 `http://localhost:5173/**`, `http://localhost:5174/**`와 처음 넣은 `https://travel-go-lemon.vercel.app/settings`(이제 쓰지 않음)다.
    - Site URL과 scheme·host·port가 같은 주소는 목록에 없어도 받아 준다(supabase/auth `internal/utilities/request.go`의 `IsRedirectURLValid`). 그래서 배포 주소의 어느 화면으로 돌아와도 되고, 로그인 화면을 `/account`로 옮길 때 대시보드를 고치지 않았다.
    - 그 밖의 주소(다른 포트 등)는 목록에 없으면 Site URL(`/`)로 보낸다. `/`에서는 로그인 코드를 읽지 않아서 받은 `?code=`가 그대로 버려진다.
    - 개발 서버에서 로그인했는데 배포 주소의 `/?code=`로 가면, 브라우저 주소의 포트가 5173·5174가 아닌 것이다.
      - 사용자는 VS Code 원격 접속(Remote-SSH)으로 개발 서버를 연다. VS Code가 원격 5173을 내 컴퓨터의 다른 포트로 이어 줄 수 있다. 2026-11-04에 첫 로그인은 됐지만, 서버를 다시 켠 뒤에 이렇게 됐다.
      - 같은 이유로 지도 키(리퍼러 제한)도 막힌다. VS Code 포트(PORTS) 탭에서 5173의 로컬 포트를 5173으로 맞춘다.
      - 내가 띄운 확인용 서버(5174)도 VS Code가 자동으로 이어 주므로, 내 컴퓨터의 포트를 차지할 수 있다.
      - 원격의 `localhost`와 달리 `127.0.0.1`은 포트와 상관없이 받아 준다(`IsRedirectURLValid`의 loopback 규칙). 하지만 지도 키 리퍼러에는 없다.
  - Sign In / Providers
    - 이메일 로그인은 끈다(앱은 카카오·구글만 쓴다).
    - 새 사용자 가입(Allow new users to sign up)은 켜 둔다. 끄면 처음 로그인하는 사람이 `signup_disabled`로 막힌다.
- 구글 (Google Cloud의 Google 인증 플랫폼)
  - 지도 키와 같은 프로젝트(My First Project)에 둔다. 무료 체험이 끝나면 그 프로젝트의 결제가 꺼지지만, 로그인은 결제가 필요 없어서 그대로다.
  - 2026-11-04에 설정했다.
    - `/auth/v1/settings`에서 구글이 켜지고 이메일이 꺼진 것을 확인했다.
    - `/auth/v1/authorize?provider=google`이 오류 없이 구글 로그인 화면(`/v3/signin/identifier`)으로 간다. `client_id`는 프로젝트 번호 `705597297951-`로 시작한다.
    - 사용자가 개발 서버(5173)에서 실제 구글 계정으로 로그인했다. 설정 화면에 이름, 사진(사진이 없는 계정이라 구글이 만든 이름 그림), "Google로 로그인했어요"가 보였다.
  - 웹 애플리케이션 클라이언트 `travel GO`의 승인된 리디렉션 URI는 `https://szjkqiatfclsoxoluetf.supabase.co/auth/v1/callback` 하나다. 구글과는 Supabase 서버가 주고받으므로 자바스크립트 원본은 필요 없다.
  - Client ID·secret은 Supabase의 Google 제공자에만 넣는다. secret은 만들 때 한 번만 보인다(2025년 4월부터). 잃어버리면 그 클라이언트에 secret을 새로 추가한다.
  - Supabase는 구글에 `email`·`profile`만 요청한다(supabase/auth `internal/api/provider/google.go`).
    - 이름·이메일·프로필만 요청하는 앱은 '테스트' 상태여도 누구나 로그인된다. 테스트 사용자 목록에 없어도 되고, 경고나 7일 만료도 없다(Google 도움말 "Manage App Audience").
    - 그래서 앱을 게시(Publish)하지 않고, 데이터 액세스(범위)도 설정하지 않는다.
  - 구글 로그인 창에는 앱 이름 대신 `szjkqiatfclsoxoluetf.supabase.co`가 나온다.
    - 이름을 띄우려면 브랜드 인증이 필요하다.
    - 브랜드 인증을 받으려면 리디렉션 주소의 도메인을 우리가 소유해야 한다. 그러려면 Supabase 맞춤 도메인(유료)이 먼저다.
  - 6개월 동안 구글 로그인 요청이 없는 클라이언트는 구글이 지운다.
    - 지우기 30일 전에 메일이 오고, 지운 뒤에도 30일 이상 복구할 수 있다.
    - Supabase 세션은 구글 없이 갱신된다. 그래서 모두 로그인한 채로 지내기만 해도 지워질 수 있다. 메일이 오면 한 번 구글로 로그인한다.
- 카카오 (카카오디벨로퍼스, 2025년에 바뀐 메뉴 기준)
  - 앱 `travel GO`. 아이콘은 배포 주소의 `apple-touch-icon.png`(180px), 앱 대표 도메인은 배포 주소다.
  - 비즈 앱 전환: [앱] > [일반] > [비즈니스 정보] > [개인 개발자 비즈 앱]. 앱 주인이 먼저 프로필 > [계정 설정] > [본인인증]을 해야 한다.
    - 이메일 동의항목은 비즈 앱(또는 테스트 앱)이면 심사 없이 설정된다.
    - [앱] > [추가 기능 신청]의 심사(영업일 3~5일, 개인정보 처리방침 필요)는 다른 개인정보 항목용이다.
  - [카카오 로그인] > [사용 설정]의 상태를 ON으로 한다.
  - [동의항목]은 닉네임 필수, 프로필 사진 선택, 카카오계정(이메일) 선택이다. 항목마다 동의 목적을 적는다.
  - 리다이렉트 URI와 클라이언트 시크릿은 [앱] > [플랫폼 키] > [REST API 키]의 키 설정에 있다(예전의 [카카오 로그인] 메뉴가 아님).
    - 리다이렉트 URI는 Supabase 콜백 하나다.
    - 호출 허용 IP 주소는 비운다. 토큰은 Supabase 서버가 받는다.
    - 클라이언트 시크릿은 키를 만들 때부터 켜져 있다. 코드가 카카오 로그인·비즈니스 인증 두 줄인데, 카카오 로그인 줄의 것을 쓴다.
    - 리다이렉트 URI 칸 옆의 [+]는 칸을 하나 더 만드는 버튼이다. 입력하고 오른쪽 아래 [저장]만 누르면 된다.
  - Supabase의 Kakao 제공자에 REST API Key, Client Secret Code를 넣고 "Allow users without an email"을 켠다. 칸 이름은 supabase/supabase의 `AuthProvidersFormValidation.tsx`에서 확인했다.
  - 확인 방법: 카카오의 인가 주소(`kauth.kakao.com/oauth/authorize`)는 키나 리다이렉트 URI가 틀려도 먼저 카카오 로그인 화면으로 보낸다(검사는 로그인 뒤).
    - 그래서 키는 토큰 주소(`/oauth/token`)에 가짜 코드를 보내 본다. 아는 키면 KOE010(`Bad client credentials`, 시크릿이 필요함), 없는 키면 KOE101이다.
    - 2026-11-05: `/auth/v1/settings`에서 카카오가 켜졌고, Supabase가 쓰는 키가 KOE010이었다.
  - 2026-11-05: 사용자가 개발 서버(5173)의 계정 화면에서 실제 카카오 계정으로 로그인했다.
  - 180일 동안 설정 변경이나 API 호출이 없으면 '장기 미이용 앱'이 된다. 앱 관리 페이지에서 해제한다.
- `lib/supabase.ts`: `supabaseConfig()`, `supabase(config)`. 클라이언트는 처음 쓸 때 코드를 받아 하나만 만든다. 로그인은 PKCE다. 제공자가 `?code=`를 붙여 돌려보내면 클라이언트가 시작하면서 세션으로 바꾸고 주소에서 지운다.
- `features/account/`
  - `account.ts`: `Account`(이름·사진·제공자, `toAccount(user)`: 카카오 닉네임은 `full_name`·`name`, 사진은 `avatar_url`이고 `http://`는 `https://`로), `loginOutcome(search)`.
  - `auth.ts`: `Auth` 인터페이스(`start`·`onChange`·`signIn`·`signOut`)와 Supabase 구현 `supabaseAuth()`.
    - `start()`는 돌아온 로그인을 마친 뒤 세션을 읽는다. 주소에 `error`가 있거나 `code`가 남아 있으면(이 브라우저에서 시작한 로그인이 아님) 그 결과를 돌려주고 주소에서 지운다.
    - Supabase는 오류를 query와 fragment(`#error=…&sb=`) 두 곳에 붙인다. 그래서 둘 다 지운다.
    - `access_denied`에 `error_code`가 없으면 카카오·구글에서 거절한 것(취소)이다.
    - `error_code`가 있으면 Supabase가 막은 것(가입 꺼짐, 차단된 사용자, 이메일 확인 필요)이라 실패로 본다.
    - 2026-11-04에 supabase/auth의 `redirectErrors`·`getErrorQueryString`(`internal/api/external.go`)에서 확인했다. 실제 클라이언트(개발 서버)로 돌아온 주소를 열어 보니, 안내가 뜨고 주소에 화면 경로만 남았다.
    - 로그아웃은 이 기기에서만(`scope: 'local'`) 한다. 연결이 없어도 이 기기의 세션은 지운다.
  - `accountStore.ts`: `status`(`idle → loading → signedIn | signedOut`, 설정이 없으면 `unavailable`), `account`, `loginError`. `load()`는 한 번만 시작하고, 그 뒤로는 `onChange`(다른 탭, 세션 만료)를 따른다.
  - 계정 화면 `/account`(`pages/AccountPage.tsx`): 여행 목록 머리줄의 사람 아이콘(설정 톱니바퀴 왼쪽, 접근성 이름 "계정")으로 연다. 설정 화면에는 계정 구역이 없다(사용자 요청).
  - `AccountProfile.tsx`: 계정 화면 본문이다. 위쪽 프로필 줄(64px 동그라미, 이름 줄, 오른쪽에 테두리 알약 버튼)과 아래 회색 안내 상자로 되어 있다.
    - 로그아웃 상태: 회색 동그라미에 사람 그림, "로그인해 주세요", 알약 "로그인". 안내 상자는 로그인하면 생길 것과, 안 해도 기기에 저장된다는 내용이다.
    - 로그인 상태: 프로필 사진(없거나 깨지면 이름 첫 글자), 이름, "카카오로/Google로 로그인했어요", 알약 "로그아웃". 프로필 줄 아래에 동기화 상태 한 줄(`SyncNote`)이 있고, 안내 상자는 여행이 계정에 저장된다는 내용이다.
    - 돌아온 로그인이 취소·실패였으면 프로필 줄 아래에 안내(`role="alert"`)를 띄운다.
    - 알약 버튼은 보이는 모양은 작고, 누르는 영역은 44px이다.
  - `LoginSheet.tsx`: "로그인" 알약이 여는 하단 시트다.
    - 카카오 로그인(노란 #FEE500, 검정 말풍선)과 Google 계정으로 로그인(흰 바탕, 회색 테두리, 네 색 G) 버튼이 있다(`LoginButtons.tsx`, 각 회사 디자인 가이드).
    - 오프라인이면 누를 때 "인터넷에 연결되면 로그인할 수 있어요.", 제공자로 보내지 못하면 "로그인 화면을 열지 못했어요."를 시트 안에 보여준다.
    - 카카오톡 인앱 브라우저(`isKakaoTalk`)에서는 구글이 로그인을 막는다. 그래서 Google 버튼을 끄고 "다른 브라우저로 열기"(`kakaotalk://web/openExternal?url=`)를 둔다.
  - 로그인하고 돌아올 곳은 `/account`다(`accountStore.signIn`).
- 여행을 계정에 저장하는 것은 17단계(아래 "서버 저장·동기화")다.

### 서버 저장·동기화 (17단계)
- 기기 DB(IndexedDB)가 먼저다. 화면·스토어는 지금처럼 저장소만 쓰고, 동기화 층(`data/sync/`)이 그 아래에서 서버와 맞춘다. 로그인하지 않으면 동기화하지 않는다.
- 로그아웃하면 이 기기의 여행을 지운다(2026-11-05 사용자 결정). 같은 계정으로 다시 로그인하면 서버에서 다시 받는다. 서버에 못 올린 변경이 있으면 로그아웃 전에 알린다.
- 서버: `supabase/migrations/20261105120000_sync.sql`. 사용자가 SQL Editor에 붙여 넣어 실행한다. 다시 실행해도 결과가 같다.
  - `records`: 모든 기록을 앱의 JSON 그대로(`data`) 둔다. `kind`는 trip·scheduleItem·companion·expense(분담 포함)·settlement이다. `format`은 기록 모양의 버전(`RECORD_SCHEMA_VERSION`, 백업 버전 중 기록이 마지막으로 바뀐 것)이라, 모델이 바뀌어도 서버 표는 그대로다.
    - 백업 6판(다녀온 나라)은 기록 모양을 바꾸지 않아서 `format`은 5였다. 올렸다면 아직 업데이트 안 된 기기가 새 기록을 "새 버전이 나왔어요"로 멈췄을 것이다. 기록 모양이 바뀔 때만 둘을 같이 올린다.
    - 7판(여행의 나라, 도시 여러 개)은 여행 기록 모양을 바꿔서 `format`도 7이다. 아직 업데이트 안 된 기기는 새 여행 기록을 받으면 "새 버전이 나왔어요"로 멈추고, 앱을 다시 열면(자동 업데이트) 이어 간다. 옛 형식(`city`)으로 남은 기록은 새 앱이 백업과 같은 규칙으로 바꿔 읽는다.
  - `trip_members`: 여행을 읽고 쓸 수 있는 계정. 처음 올린 계정이 `owner`이고, 18단계부터 초대로 참여한 `member`도 있다.
  - 읽기는 RLS(내가 멤버인 여행의 기록만)로 한다. 쓰기는 `sync_push(changes)`로만 한다(security definer, 표에 직접 쓰는 권한은 없음).
  - 기록마다 `updatedAt`이 늦은 쪽이 이긴다(같으면 서버 것을 둔다). 새 형식(`format`)으로 쓴 기록은 옛 앱이 덮어쓰지 못한다. 서버가 받지 않으면(`stale`) 서버의 지금 기록을 같이 돌려준다.
  - 지운 기록은 데이터 없는 줄(`deleted`)로 남긴다. 다른 기기에 삭제를 전하려는 것이다.
  - 여행 삭제는 언제나 이긴다. 서버에서 그 안의 기록도 함께 지운다. 지운 여행에는 다시 쓸 수 없다(`gone`).
  - `seq`는 서버에 쓴 순서다. 기기는 마지막으로 본 `seq` 다음부터 읽는다. 쓰기는 한 번에 하나씩(advisory lock)이라 `seq` 순서가 커밋 순서와 같다(뒤늦게 커밋된 작은 번호를 놓치지 않음).
  - 구글 장소 데이터 30일 규칙은 서버 사본에도 지킨다. pg_cron이 매일 한국 시간 03:17에 `private.expire_place_data()`를 돌린다. `updatedAt`과 `seq`는 바꾸지 않는다. 도시가 여러 개인 여행(`cities`)은 `20261107120000_cities_regions.sql`부터 도시마다 지운다(옛 `city`도 계속).
  - Supabase API는 16MB 요청도 받는다(2026-11-05 확인). 기기는 4MB씩 나눠 보낸다.
- 테스트: `src/test/syncDatabase.ts`가 PGlite에 Supabase 흉내(역할, `auth.users`, `auth.uid()`)와 마이그레이션을 넣는다. 서버 규칙은 `data/sync/serverSql.test.ts`가 검사한다.
- 기기 쪽 (`data/sync/`)
  - `records.ts`(순수 규칙): 기록을 서버 단위로 본다(지출은 분담과 한 묶음). `syncedRecords`(Dexie v5)에 서버가 가진 각 기록의 `updatedAt`을 둔다. 이것과 다르거나 기기에서 사라진 기록이 올릴 것이다. 받은 기록은 백업과 같은 검사(`parseRecord`)를 거친다.
  - 기록마다 늦은 `updatedAt`이 이긴다. 기기에서 고친 기록이 서버 것보다 이르면(시계가 늦은 기기) 서버 것보다 1ms 늦은 시각으로 보내고 기기에도 그 시각을 적는다. 본 것을 고친 것은 이겨야 해서다.
  - 기기에서 지운 기록은 지운 것을 알아챈 시각으로 보낸다. 다른 기기가 그 뒤에 고쳤으면 되살아난다. 여행 삭제는 늘 이긴다.
  - 받은 것이 있으면 그 여행의 일정 순서를 고친다(`normalizeSchedule`). 예: 두 기기가 같은 날에 동시에 넣은 일정.
  - `syncEngine.ts`: 받기 → 올리기 순서다.
    - 받기: 마지막 `seq` 다음부터 100개씩 끝까지 받은 뒤, 한 트랜잭션으로 적는다(중간에 일정을 고치면 아직 안 받은 변경과 엇갈림).
    - 올리기: 4MB·200개씩, 서버 답에 따라 최대 3번 다시 보낸다. 서버가 거절한 기록(`stale`)은 같이 온 서버 것을 받아들인다(더 늦게 고친 쪽이 남음).
    - 한 번에 하나만 한다(탭끼리는 `navigator.locks`).
    - 처음 동기화하면 그 기기의 여행이 계정 것이 된다. 다른 계정의 여행이 있으면 먼저 지운다.
    - `forget()`은 로그아웃할 때 기기의 여행과 동기화 기록을 지운다. 진행 중이던 동기화는 계정이 바뀐 것을 보고 적지 않는다.
  - 서버에 이 앱보다 새 형식(`format`)의 기록이 있으면 거기서 받기를 멈추고 "새 버전이 나왔어요"를 띄운다.
  - `supabaseServer.ts`: `rpc('sync_push')`와 `from('records').select().gt('seq', n)`. 요청은 30초에 끊는다.
  - `watchWrites.ts`: 저장소의 쓰기가 끝나면 알린다(장소 정보 갱신·만료는 수정이 아니라서 빠짐).
  - `data/index.ts`는 `createDataLayer`로 `repositories`, `syncEngine`, `onLocalWrite`를 내보낸다.
- 화면 쪽 (`features/sync/`)
  - `syncStore`는 이럴 때 동기화한다: 로그인했을 때, 고친 뒤 1.5초, 다시 연결될 때, 앱으로 돌아올 때(`visibilitychange`, 컴퓨터는 창 `focus`), 서버가 변경을 알릴 때(18단계 실시간), 앱을 보는 동안 2분마다. 계정이 든 여행의 역할(`roles`)도 둔다.
  - 상태는 `off | syncing | synced | pending | offline | error | needsUpdate`다. 계정 화면의 프로필 아래 한 줄(`SyncNote`)이 이를 보여준다.
  - 받은 것이 있으면 스토어가 그 자리에서 다시 읽는다(`reload()`). 로딩 상태를 거치지 않으므로 여행 상세 화면이 잠깐 비지 않는다.
  - 앱 시작(`AppLayout` → `startSync`) 때 Supabase 코드는 이 브라우저에 세션(`sb-<ref>-auth-token`, `hasStoredSession`)이 있을 때만 받는다. 로그인하지 않은 사람의 첫 화면은 그대로다.
  - 로그아웃 순서
    - 먼저 한 번 동기화한다.
    - 확인 시트를 띄운다("로그아웃할까요?"). 올리지 못한 변경이 있으면 개수와 빨간 버튼이 나온다.
    - 확인하면 `syncEngine.forget()` → 스토어 비우기 → Supabase 로그아웃 순서로 한다.
- 백업 가져오기도 기기의 쓰기라서 로그인 중이면 계정에 올라간다. 덮어쓰기면 계정의 여행도 파일대로 바뀐다. 서버에서 지운 여행은 가져와도 다시 지워진다.
- 확인함(2026-11-05)
  - 실제 브라우저(빌드, 로그아웃 상태): 첫 화면에 Supabase 코드를 받지 않는다. IndexedDB가 v5(표 8개)가 되고, 콘솔 오류가 없다.
  - 사용자가 개발 서버(5173)의 평소 창과 시크릿 창(다른 기기 역할)에서 같은 카카오 계정으로 써 봤다(됨). 여행이 다른 창에 보이고, 고친 것이 건너가고, 로그아웃하면 여행이 지워졌다가 다시 로그인하면 돌아왔다.
  - 배포한 뒤 사용자가 실제 아이폰(홈 화면 앱)과 PC 브라우저로 배포 주소를 써 봤다(됨). 서로의 여행이 보이고, 고친 것이 건너갔다.

### 친구 초대·함께 쓰기 (18단계)
- 여행을 만든 계정(`owner`)이 초대 링크를 보내면, 받은 사람이 로그인해서 참여한다(`member`). 참여한 사람도 일정·가계부·여행 정보를 고친다. 여행 삭제와 초대 관리(링크 만들기·끊기, 내보내기)는 만든 사람만 한다.
- 서버: `supabase/migrations/20261105200000_sharing.sql`(동기화 SQL 다음에 실행, 다시 실행해도 같음). 표에 직접 쓰는 권한은 없고 함수로만 한다. 답은 `{ status, ... }`이고, 세션이 없을 때만 오류다.
  - `invites`: 여행마다 링크 하나. `token`은 무작위 UUID 16바이트를 주소에 쓸 수 있는 base64로 적은 22글자다. 7일 동안 여러 명이 쓸 수 있고, 끊으면 지운다. 만료된 링크는 다음에 만들 때 새것으로 바뀐다.
  - `create_invite`·`current_invite`·`revoke_invite(trip)`: 만든 사람만 쓴다. 거절 이유는 `no_trip`(아직 서버에 없음), `gone`(삭제됨), `forbidden`이다.
  - `invite_preview(token)`: 로그인 전(anon)에도 링크의 여행 제목·도시(여러 개면 ` · `로 이어서, `20261107120000_cities_regions.sql`부터)·기간·초대한 사람 이름을 준다. 끊겼거나 만료됐거나 여행이 지워졌으면 `invalid`.
  - `join_trip(token)`: 로그인한 계정을 `member`로 넣는다. 이미 들어 있으면 `member` 상태와 그 역할로 답한다.
  - `trip_people(trip)`: 멤버에게만 사람 목록을 준다(만든 사람 먼저). 이름·사진은 `auth.users`의 로그인 정보에서 그때그때 읽는다. 규칙은 앱의 `toAccount`와 같다(`full_name` → `name` → `preferred_username`, 사진은 https로).
  - `leave_trip(trip)`: 멤버가 나간다. 만든 사람은 `forbidden`이고, 대신 여행을 지운다.
  - `remove_member(trip, member)`: 만든 사람이 내보낸다. 자기 자신은 내보낼 수 없다.
  - 멤버의 쓰기는 `sync_push`가 받는다. 여행 삭제만 `forbidden`이다(17단계 SQL 그대로).
  - `records`를 Realtime 발행(`supabase_realtime`)에 넣는다.
  - 2026-11-05에 사용자가 SQL Editor에서 실행했다. 확인: `POST /rest/v1/rpc/invite_preview`(publishable 키, `{"token":"x"}`)가 `{"status": "invalid"}`이고, 로그인 없이 부른 `join_trip`은 401(`permission denied`)이다. 실행 전에는 404다.
- 동기화 (`data/sync/`)
  - 기기는 계정이 든 여행과 그 역할을 `syncState.trips`에 둔다(`memberships()`: `trip_members`의 내 줄).
  - 마지막 `seq` 다음부터 받는 것만으로는 참여하기 전에 쓰인 기록(작은 `seq`)을 못 받는다. 그래서 목록에 새로 생긴 여행은 그 여행의 기록을 처음부터 받는다(`pullTrip`).
  - 받기 순서: `seq` 다음부터 받기 → 멤버 목록 → 새 여행 통째로 받기 → 한 트랜잭션에 적용.
  - 서버에 있던(`syncedRecords`에 있는) 여행인데 목록에 없으면 기기에서 지운다(나갔거나 내보내짐). 아직 올리지 않은 여행은 그대로다.
  - 17단계 기기(`trips` 없음)는 처음 한 번, 만든 여행은 이미 다 받았다고 보고 참여한 여행만 통째로 받는다.
  - 멤버가 여행을 지우면(백업 덮어쓰기 등) 서버가 거절(`forbidden`)한다. 그러면 그 여행을 잊고 다음 동기화에서 통째로 다시 받는다.
  - `forgetTrip(id)`: 나간 여행을 서버에 알리지 않고 기기에서 지운다. `roles(userId)`: 화면이 쓰는 역할.
- "나"와 계정 (`Companion.accountId`, Dexie v6, 백업 v5)
  - 동행자에 계정을 이을 수 있다. `companions.claim(id, accountId)`는 그 계정이 전에 고른 동행자의 연결을 푼다. 다른 계정의 동행자면 `ValidationError`다.
  - 앱을 쓰는 사람의 동행자는 `myCompanion(companions, accountId, role)`이다. 내 계정이 이어진 동행자, 없으면 내가 만든 여행(또는 로그인하지 않았을 때)의 "나"다. 참여한 사람은 고르기 전에는 없다.
  - 지출 폼은 이 사람을 결제한 사람으로 먼저 고른다. 동행자 시트는 이 사람의 삭제 버튼을 없앤다.
  - "나"(`isMe`)는 참여한 사람에게는 만든 사람이고, 여전히 지울 수 없다.
  - 가계부는 모두 이름으로 보여준다(사용자 요청, 2026-11-05). 동행자 시트에 "나" 표시가 없다.
  - 로그인하면 가계부에 내 계정을 이름으로 넣는다(`myCompanionStep` → `useAccountInLedger`). 여행 화면과 함께하는 사람 화면이 가계부를 읽은 뒤에 한다.
    - 내 여행: "나"를 내 계정에 잇고, 이름이 아직 "나"면 로그인 이름으로 바꾼다. 이름 없는 로그인(`NO_NAME`)이면 "나"로 둔다.
    - 참여한 여행: 아직 누구의 것도 아닌 동행자 중 로그인 이름과 같은 사람을 잇는다. 없으면 새로 넣는다(`accountCompanionId(trip, account)`: 같은 계정의 기기 둘이 동시에 넣어도 하나). 만든 사람의 "나"는 고르지 않는다.
    - 누구의 것도 아닌 다른 동행자가 있으면 그중 누가 나인지 모르므로 묻는다(`ask`). 참여 화면은 "가계부에서 누가 나예요?"를 띄우고, 다른 화면은 그대로 둔다(함께하는 사람 화면의 "가계부에서 나"로 고름).
    - 이름이 겹치면 번호를 붙인다(`companionNameFor`: `민수 2`). 20자를 넘으면 자른다.
    - 동기화 스토어가 그 계정의 역할을 읽은 뒤에만 한다(`rolesOf`). 그 전에는 참여한 여행이 내 여행처럼 보여서, 만든 사람의 "나"를 잘못 이을 수 있다.
  - 처음 초대 링크를 만들 때 "나"의 이름이 아직 "나"면(이름 없는 로그인) 친구들에게 보일 이름을 묻는다. 그리고 "나"를 만든 사람의 계정에 잇는다.
- 화면 (`features/sharing/`)
  - 여행 ⋯ 메뉴의 "친구 초대"(멤버에게는 "함께하는 사람")가 `/trips/:id/people`을 연다. 멤버의 메뉴에는 "여행 삭제"가 없다.
  - 함께하는 사람 화면
    - 사람 목록: 사진·이름, "나", "만든 사람" 표시.
    - 만든 사람에게는 "초대 링크"(만들기, 카카오톡으로 보내기, 공유, 링크 복사, 링크 끊기)와 사람별 "내보내기"가 있다.
    - 멤버에게는 "이 여행에서 나가기"가 있다.
    - "가계부에서 나"로 누가 나인지 바꾼다.
    - 로그인하지 않았으면 로그인 버튼이 나온다(돌아올 곳은 이 화면).
  - 참여 화면 `/join/:token`
    - 순서: 링크 미리보기(여행 표지 색, 초대한 사람) → 로그인 → "참여하기" → 동기화로 여행 받기 → 가계부에 이름으로 들어감(위 `myCompanionStep`) → 여행 화면.
    - 가계부에 누가 나인지 모를 사람이 있을 때만 "가계부에서 누가 나예요?"를 묻는다. 고르지 않고 닫으면 로그인 이름으로 새로 넣는다(시트에 그렇게 적혀 있음). 그래서 참여한 사람은 모두 가계부에 있다.
    - 로그인하고 돌아올 곳은 이 화면이다. 카카오톡 안에서는 Google 로그인이 꺼진다.
    - 쓸 수 없는 링크면 "이 초대 링크는 쓸 수 없어요"를 보여준다.
  - `sharingStore`: 화면에 보이는 여행의 사람·링크와 서버 호출(만들기·끊기·내보내기·나가기)을 맡는다. 아직 서버에 없는 여행에 링크를 만들면 먼저 동기화한다.
  - "초대 링크 만들기"는 그 여행의 가계부를 읽은 뒤에 눌린다. "나"의 이름을 물을지가 가계부에 달려 있어서다(빨리 누르면 이름 묻기를 건너뛰던 문제, 전체 테스트를 돌릴 때 드러남). 로그인 이름이 있으면 "나"가 이미 그 이름이라 묻지 않는다.
- 카카오톡 공유 (`lib/kakaoShare.ts`)
  - 카카오 JavaScript SDK 2.8.4(`t1.kakaocdn.net`, SRI 해시)를 링크가 보일 때 미리 받는다. 컴퓨터에서는 공유가 팝업이라 누른 그 자리에서 열어야 한다(기다린 뒤에 열면 브라우저가 막음).
  - 카드
    - 제목은 "‘여행 이름’ 여행에 초대받았어요", 설명은 도시·기간, 버튼은 "참여하기"다.
    - 그림은 `public/invite-card.jpg`(800×400, 파란 배경에 비행기와 travel GO)다.
    - 템플릿 ID는 필요 없다(`sendDefault`).
  - 키(`VITE_KAKAO_JAVASCRIPT_KEY`, 공개용)가 없으면 이 버튼이 없고 공유·링크 복사만 있다.
  - 카카오 콘솔
    - [앱] > [플랫폼 키] > [JavaScript 키]의 [JavaScript SDK 도메인]에 배포 주소, `http://localhost:5173`, `http://localhost:5174`를 넣는다(포트까지 맞아야 함).
    - 카드 링크의 도메인은 [앱] > [제품 링크 관리] > [웹 도메인]에 배포 주소를 넣고 기본 도메인으로 둔다.
    - 등록하지 않은 도메인의 링크는 기본 웹 도메인의 첫 화면(경로 없이)으로 바뀐다. 그래서 개발 서버에서 보낸 카드는 초대 화면이 아니라 배포 주소의 첫 화면을 열고, 그림도 빠진다(카카오가 localhost의 그림을 받지 못함). 개발 서버에서는 링크 복사로 시험한다.
    - 2026-11-05에 설정했다. 키는 `.env.local`에 있고, 테스트는 키가 없는 상태로 시작한다(`test/setup.ts`가 비움).
  - 확인 방법: 휴대폰의 SDK가 카카오톡을 열기 전에 부르는 요청을 똑같이 보낸다. 메시지는 가지 않는다.
    - 요청은 `GET https://kapi.kakao.com/v2/api/kakaolink/talk/template/default?link_ver=4.0&template_object=<카드 JSON, snake_case>`다.
    - 헤더는 `Authorization: KakaoAK <JavaScript 키>`와 `KA: sdk/2.8.4 os/javascript … origin/<인코딩한 주소> app_key/<키>`다.
    - 등록한 주소면 카드 템플릿(`template_args`)이 오고, 아니면 401 `domain mismatched`다. 2026-11-05: 세 주소는 통과, example.com은 막혔다. 배포 주소의 링크는 경로까지 그대로였다.
    - 카드 그림은 카카오가 받아서 자기 CDN(`k.kakaocdn.net`)에 옮긴다(`NONE_KAGE_IMAGE_SUPPORTED` 경고는 그 안내다). 받지 못하면 그림 없이 간다. 배포 전에는 `invite-card.jpg` 주소가 `index.html`을 줘서 빠졌다.
  - 공유에 실패하면 SDK가 페이지를 카카오 주소로 옮길 수 있다. 홈 화면 앱에서는 돌아올 버튼이 없다. 그래서 공유·링크 복사를 늘 같이 두고, 실제 아이폰으로 확인한다.
    - 휴대폰에서 SDK는 카드 확인 요청(아래 확인 방법)을 보낸 뒤 페이지 주소를 카카오톡을 여는 주소로 바꾼다. 아이폰은 유니버설 링크(`talk-apps.kakao.com/scheme/…`), 안드로이드는 intent다. 확인 요청이 실패하면 `sharer.kakao.com/picker/failed`로 옮긴다(SDK 2.8.4 코드).
    - 2026-11-05: 실제 아이폰 홈 화면 앱에서 됐다(아래 확인함).
  - 하루 3만 건 무료다. 유료 사용을 직접 켜지 않으면 넘어도 오류만 난다.
- 실시간 반영 (`supabaseWatch`)
  - Realtime의 Postgres Changes로 `records`의 INSERT·UPDATE를 듣는다. 서버가 구독자마다 RLS로 거르므로 볼 수 있는 여행의 변경만 온다. 알림이 오면 0.5초 뒤에 동기화한다.
  - 작은 열(`trip_id`, `seq`)만 받는다. 사진이 든 기록은 1MB를 넘어서, 그대로면 큰 값이 빠진 채 온다.
  - 연결이 끊긴 동안의 변경은 다시 오지 않는다. 그래서 다시 연결되면(두 번째 `SUBSCRIBED`부터) 한 번 동기화한다. 서버가 채널을 닫으면(`CLOSED`) 5초 뒤에 다시 듣는다.
  - 내 변경도 돌아온다(같은 계정의 다른 기기 것과 구별할 수 없음). 받을 것 없는 받기 한 번이다.
  - 로그인한 뒤에만 듣고(채널은 그 계정의 토큰으로 들어감), 로그아웃하면 채널을 지운다.
  - 무료 한도: 동시 연결 200, 초당 100건, 한 달 200만 건. 넘어도 청구는 없다.
- 테스트
  - 서버 함수: `data/sharing/sharingSql.test.ts`(PGlite, 앱의 `createSharingServer`로 부름).
  - 두 계정의 동기화: `syncEngine.test.ts`의 "sync of shared trips".
  - 화면 흐름: `app/sharingFlows.test.tsx`(김여행 = 카카오, Jane Doe = 구글).
- 확인함(2026-11-05)
  - 사용자가 개발 서버(5173)에서 평소 창(카카오, 만든 사람)과 시크릿 창(구글, 친구)으로 초대 링크 → 참여 → 같이 고치기를 해 봤다(됨).
  - 배포한 뒤 사용자가 실제 아이폰 홈 화면 앱에서 카카오톡으로 카드를 보내고(나와의 채팅), 카드의 "참여하기"로 카카오톡 안에서 초대 화면을 열어 참여까지 해 봤다(됨).

### 다녀온 나라 (`features/countries/`, 2026-11-05 사용자 요청)
- 화면 `/countries`: 여행 목록 머리줄의 지구본 아이콘(접근성 이름 "다녀온 나라")으로 연다. 위에 다녀온 곳 수("3곳")와 세계 지도, 아래에 나라 찾기와 다녀온 나라 목록이 있다.
  - 지도에서 나라를 누르면 넣거나 빼고, 하단 안내의 "되돌리기"로 되살린다. 너무 작아 안 보이는 나라(싱가포르, 괌, 홍콩 등 69곳)는 다녀왔을 때 점으로 그린다.
  - 나라 찾기("나라나 도시 이름"): 한국어 이름(기기의 `Intl.DisplayNames`, 홍콩·마카오 등은 짧게 고침), 영어 이름, 코드, 흔히 부르는 이름(사이판 → 북마리아나 제도, 하와이 → 미국, 발리, 잉글랜드)으로 찾는다. 목록의 체크박스로 넣고 뺀다.
  - 도시 이름으로도 찾는다(사용자 요청 2026-11-06: 삿포로, 파리, 로마). 나라 이름 아래에 찾은 도시가 회색으로 보인다(`프랑스 / 파리`, `searchCountries(query, places)`의 `places`). 그 줄의 "지역 ›"은 지역 화면을 그 도시로 찾은 채 연다(`/countries/FR?q=파리`).
    - 순서: 이름이 검색어와 같은 것, 검색어로 시작하는 것, 검색어가 든 것. 같으면 나라 이름으로 찾은 것이 도시로 찾은 것보다 먼저이고, 도시는 그 지역 목록에서 앞에 있는(이름난) 것이 먼저다(시드니는 호주, 캐나다 순서).
    - 새 여행 폼의 "나라 고르기"(`TripCountriesField`)도 같은 함수라서 도시 이름으로 찾는다.
  - 지도는 장식(`role="img"`, 다녀온 나라 이름을 읽어 줌)이고, 스크린리더는 목록을 쓴다.
- 여행의 나라(새 여행 폼에서 고름)는 여행이 시작되면 다녀온 나라에 저절로 들어간다(사용자 선택 2026-11-05, `tripCountriesToMark`).
  - 앱이 시작할 때(`AppLayout`), 이 화면을 열 때, 동기화로 바뀐 것이 들어왔을 때 확인한다(`countryStore.markTrips`, 한 번에 하나).
  - 그 여행이 시작된 뒤에 사용자가 직접 뺀 나라는 다시 넣지 않는다. 뺀 날(기기 날짜)이 그 나라의 가장 늦게 시작한 여행의 시작일보다 이르면 다시 넣는다(그 뒤에 또 간 것).
  - 넣을 때는 저장소의 `set`을 쓴다. 넣을 것이 있을 때만 동기화 알림이 간다(`listAll()`은 뺀 표시까지 읽음).
- 나라별 지역(도·주·현, 사용자 선택 2026-11-05): 도시는 지도에서 점이라서, 면으로 칠할 수 있는 다음 단위로 했다.
  - 나라 줄의 "지역 2/47 ›"(`regionCount`)로 `/countries/JP`를 연다(`CountryRegions`). 위에 그 나라에서 다녀온 곳 수와 지도, 아래에 지역 찾기와 체크 목록이 있다.
  - 지역마다 그 안의 도시와 이름난 곳을 붙였다(사용자 요청 2026-11-05: 베트남에 나트랑·호이안, 호주에 시드니·멜버른이 없다. 2026-11-06: 도시 이름으로 찾아져야 한다). 지역은 도·주라서 도시가 따로 없기 때문이다.
    - 지역 찾기("지역이나 도시 이름")에서 그 이름으로도 찾는다(나트랑 → 카인호아성, `findRegions`). 순서는 나라 찾기와 같다(로마는 라치오, 에밀리아로마냐 순서).
    - 지역 이름 아래에 회색으로 4곳까지 보인다(`shownPlaces`): 찾은 곳 먼저, 나머지는 이름난 순서. 지역 이름에 이미 든 곳(교토부의 교토)은 빼고 보인다(데이터에는 있어서 나라 찾기에서 교토 → 일본).
  - 찾기 규칙(`searchKey.ts`의 `searchTries`, 앞의 것이 하나도 못 찾을 때만 다음 것)
    - 먼저 적힌 그대로(글자·숫자만, 소문자: `writtenKey`).
    - 끝에 붙인 도시·도 이름(시, 도, 군, 현, 성, 주, 부, 구, 특별시, 광역시 등)을 떼고. 두 글자 이상 남을 때만이다(제주도 → 제주, 광주는 그대로). 그래서 제주도로 제주특별자치도를, 삿포로시로 삿포로를 찾는다.
    - 그래도 없으면 소리로(`soundKey`: ㄱㄲㅋ, ㄷㄸㅌ, ㅂㅃㅍ, ㅅㅆ, ㅈㅉㅊ, ㅐㅒㅔㅖ, ㅙㅚㅞ를 같게 봄). 데이터의 표기(호찌민, 끄라비, 푸껫, 구마모토, 지바)를 흔히 쓰는 표기(호치민, 크라비, 푸켓, 쿠마모토, 치바)로도 찾는다.
    - 소리로 찾기를 맨 처음부터 하면 파리가 이탈리아의 바리를, 교토가 도쿄도를 찾았다. 그래서 적힌 그대로 찾은 것이 있으면 하지 않는다.
  - 도시 데이터(`features/countries/places.ts`, `PLACES`): 지역 코드(`FR-IDF`)마다, 지역 지도가 없거나 어느 지역에도 들지 않는 곳은 나라 코드(`SG`)에 둔다. 이름난 순서이고 7,594곳, 133KB(gzip 56KB)다.
    - 찾는 화면(나라 찾기, 지역 화면, 나라 고르기 시트)이 처음 쓸 때 받는 조각이다(`usePlaces`: 오기 전에는 도시 없이 찾음). 첫 화면에 넣지 않으려고 `countryNames.ts`는 도시 목록을 가져오지 않고 인자로 받는다(`countryNames.ts`는 여행 목록이 씀).
  - 지도를 누르면 넣거나 빼고 "되돌리기"가 있다. 작은 지역(워싱턴 D.C., 모스크바 등)은 다녀왔을 때 점으로 그린다. 지역을 넣으면 그 나라도 다녀온 나라에 넣는다(지역을 빼도 나라는 그대로).
  - 데이터: `scripts/region-maps.mjs`가 Natural Earth 1:10m admin-1(v5.1.2, 40MB GeoJSON)을 나라마다 단순화(점 약 3,500개)해서 `public/regions/JP.json`(가로 1000 기준 SVG 경로와 한국어 이름 `name_ko`, 13~50KB)으로 만든다. 193개 나라, 합쳐 4.5MB다. 다시 만드는 방법은 스크립트 첫머리에 있다.
    - 지역이 하나뿐인 나라, 100곳을 넘는 나라(슬로베니아·라트비아·우간다의 기초 자치단체), 보스니아(데이터의 지역 모양이 서로 맞지 않음), 싱가포르(지역이 지역사회 개발 위원회의 구역이라 여행과 상관없음)는 지역 지도가 없다.
    - 같은 스크립트가 `places.ts`도 만든다. 도시는 Natural Earth 1:10m populated places(v5.1.2, 7,342곳, 모두 한국어 이름 `NAME_KO`가 있음)이고, 앞에 스크립트의 `PLACES`(관광지, 데이터에 없는 작은 도시, 흔히 쓰는 표기: 나트랑, 데이터는 냐짱)를 둔다. 같은 지역에서 이름이 같으면 하나만 둔다.
    - 위치로 지역을 찾는다: 그 점이 든 지역, 바다에 떨어진 해안 도시는 0.3° 안의 가장 가까운 지역. `PLACES`의 결과는 나라마다 한 줄씩 찍으니, 다시 만들 때 그 줄을 확인한다.
      - Natural Earth에 섬이 없거나 경계가 거친 곳은 `PLACES`에 지역 코드를 직접 적는다: 피피섬(끄라비, 옆 팡응아로 들어갔음), 나오시마(가가와현, 오카야마현), 공주(충청남도, 세종), 깟바(하이퐁), 플리트비체(리카센), 말레(카푸 환초). 데이터에 섬이 없는 코따오·꼰다오는 뺐다.
    - 한국어 이름에 붙은 도시·구 이름은 뗀다(`CITY_WORD`: 일본·한국·북한·중국·대만·베트남의 삿포로시, 서울특별시, 타오위안 시, 퉁런 지구. 다른 나라는 띄어 쓴 "쿠웨이트 시"만). 한 글자만 남으면 그대로 둔다(일본의 쓰시, 중국의 진시).
    - 지도가 따로 나라로 두지 않는 곳은 그 나라에 넣는다: 프랑스 해외 레지옹(기아나·과들루프·마르티니크·레위니옹·마요트), 스발바르(노르웨이), 소말릴란드·북키프로스·코소보(세계 지도와 같게). 남극 기지 40곳, 지브롤터, 투발루는 지도에 나라가 없어서 뺀다.
    - 크림반도의 도시는 Natural Earth가 러시아에 두고, admin-1의 크림·세바스토폴도 러시아(코드는 `UA-43`·`UA-40`)라서 어느 지역 지도에도 없다. 그래서 그 도시들은 러시아 나라에 든다(나라 찾기로만 찾음).
    - Natural Earth의 한국어 이름이 틀린 곳은 스크립트의 `NAMES`로 고쳤다.
      - 베트남 성 셋은 그 성이 속한 권역의 이름이었다(VN-39 "동 남 보" → 동나이성, 박깐성, 흥옌성). 모양은 맞다(`gn_name`과 넓이로 확인).
      - 잘린 이름(노던 준, 유콘 준 → 준주), 도시와 그 둘레가 같은 이름(모스크바, 자그레브, 타슈켄트, 키예프 → 키이우시·키이우주, 부에노스아이레스, 민스크, 사나, 베스프렘, 산시성 둘 → 산시성 (섬서)·(산서))을 고쳤다. 옛 이름(누르술탄 → 아스타나)도 고쳤다.
      - 러시아는 Natural Earth의 코드가 ISO와 반대다(`RU-MOS`가 모스크바시, `RU-MOW`가 모스크바주). 그래서 이름은 코드가 아니라 Natural Earth의 영어 이름(`name`)을 보고 붙인다.
    - Natural Earth 5.1.2 그대로라서 그 뒤의 행정 구역 개편은 들어 있지 않다. 예를 들어 베트남은 2025년에 성을 63개에서 34개로 합쳤지만, 지도는 합치기 전이다(호이안이 꽝남성).
    - 너무 잘게 나뉜 나라는 큰 지역으로 묶고 이름을 직접 붙였다: 프랑스 18 레지옹, 이탈리아 20 주, 스페인 17 자치지방과 세우타·멜리야, 영국 4 구성국, 필리핀 17 지방.
    - 멀리 떨어진 지역은 지도에서 빼고 목록에만 둔다(프랑스 해외 레지옹, 카나리아, 아조레스·마데이라, 갈라파고스, 산안드레스, 카리브 네덜란드, 스발바르, 채텀). 칠레 이스터섬, 남아공 프린스에드워드, 일본 미나미토리·오키노토리섬은 그 지역의 모양에서만 뺀다(오키나와는 남김).
    - 투영: 미국은 알래스카·하와이를 옆 칸에 넣는 `geoAlbersUsa`, 나머지는 가장 큰 땅을 가운데 둔 메르카토르다(날짜변경선을 넘는 러시아·피지도 이어짐).
    - 줄이다 방향이 뒤집힌 다각형(지구 반보다 넓게 계산됨)은 되돌린다. 메릴랜드가 미국 지도 전체를 덮었다.
  - 앱은 처음 열 때 받는다(`loadRegionMap`, 실패하면 다음에 다시). 서비스워커는 미리 받지 않고(193개를 모두 받을 필요가 없음), 연 나라만 보관한다(StaleWhileRevalidate, 40개). 그래서 한 번 연 나라는 오프라인에서도 열린다.
  - `vercel.json`의 화면 주소 규칙에서 `regions/`를 뺐다(없는 파일이 `index.html`이 아니라 404).
  - 저장: 지역 표시도 같은 표(`visitedCountries`, id `JP-27` = ISO 3166-2, `isRegionCode`)와 서버 `visited_countries`에 둔다. 나라 화면의 수와 세계 지도는 나라 코드만 센다.
- 지도 데이터: `scripts/world-map.mjs`가 Natural Earth 1:50m(world-atlas 2.0.2)를 단순화(점 10%만 남김)해서 Natural Earth 투영의 SVG 경로로 만든다(1000×444, 남극 뺌, 235곳, 104KB, gzip 35KB). 다시 만드는 방법은 스크립트 첫머리에 있다.
  - 북키프로스·소말릴란드는 키프로스·소말리아에 넣고, 코소보는 `XK`로 둔다. 프랑스령 기아나처럼 해외 영토가 본국과 한 모양인 나라도 있다(Natural Earth 그대로).
  - 화면 코드와 함께 처음 열 때 받는 조각이다(서비스워커가 미리 받아 둠, 앱 파일 47개).
- 저장: `VisitedCountry { id: 나라 코드, visited, updatedAt }`(Dexie v7 `visitedCountries`). 뺀 나라는 `visited: false`로 남겨 다른 기기에 전한다. 고칠 때는 지금 시각, 기기 시계가 늦으면 가진 것보다 1ms 뒤로 찍는다(`countryStamp`).
  - 백업 6판에 들어간다(지역 코드는 7판부터). 병합은 나라마다 늦은 `updatedAt`이 이긴다(`mergeById`).
- 동기화(로그인했을 때): 기록(`records`)과 따로, 계정마다 나라 표를 둔다(`supabase/migrations/20261106120000_countries.sql`, 공유 SQL 다음에 실행).
  - `visited_countries(user_id, code, visited, updated_at)`: RLS로 내 줄만 읽고, 쓰기는 `save_visited_countries(changes)`로만 한다(나라마다 늦은 쪽이 이김).
  - 동기화 끝에 서버의 나라를 모두 받아 더 늦은 것을 기기에 적고, 기기 쪽이 더 늦은 것을 보낸다(`syncCountries`). 서버에서는 1000줄씩 나눠 읽는다(Supabase API가 한 번에 1000줄까지, 지역까지 넣으면 넘을 수도 있음).
  - 지역 코드를 받으려면 `20261107120000_cities_regions.sql`(나라 SQL 다음에 실행)이 서버의 코드 검사를 넓힌다(`^[A-Z]{2}(-[A-Z0-9]{1,3})?$`).
  - 처음 로그인한 기기의 나라는 계정 것이 되고, 로그아웃하면 기기에서 지운다(여행과 같다).
  - 실시간 알림은 없다(`records`만 듣는다). 앱으로 돌아올 때·2분마다 하는 동기화로 건너간다.
  - 이 단계가 실패해도(SQL을 아직 실행하지 않은 서버 등) 여행 동기화는 끝난다. 경고만 남기고 다음 동기화에 다시 한다.
- 테스트: `data/sync/countriesSql.test.ts`(서버, 지역 코드 포함), `syncEngine.test.ts`의 "sync of visited countries", `app/countryFlows.test.tsx`(지도를 누르는 것은 `svg [data-code="JP"]`, 여행의 나라 칠하기, 지역 화면은 `fetch`로 작은 가짜 지도를 줌), `data/rules/country.test.ts`(`tripCountriesToMark`), `features/countries/searchKey.test.ts`(`soundKey`, `searchTries`), `regionMaps.test.ts`(`findRegions`, `shownPlaces`), `countryNames.test.ts`(`searchCountries`).
  - 화면 흐름 테스트는 실제 `places.ts`를 쓴다. `test/app.tsx`가 화면 코드와 함께 미리 받아 둔다(`loadPlaces`).

### 항공편 (AeroDataBox, 2026-11-05 사용자 요청)
- 일정 "장소 추가"의 이름 칸에 편명(`KE723`, `7C1301`, `KAL723`: `parseFlightNumber`)을 치면 "KE723 항공편 정보 불러오기" 줄이 뜬다. 날짜 탭에서만 뜬다(보관함은 날짜가 없음).
  - 누르면 그 날짜에 출발하는 편을 찾아 보여주고, "이 항공편 추가"로 그 날짜에 넣는다.
    - 이름은 `KE723 인천 → 간사이`이고, 시간은 출발 시각(현지)이다.
    - 메모는 `Korean Air · 인천 T2 출발 → 간사이 T1 도착 10:55`(다른 날 도착이면 "다음 날")이다.
    - 공항 이름은 자주 가는 공항 127곳을 한국어로 두고(`flightItem.ts`), 나머지는 데이터의 영어 이름이다. 위치는 없다(지도에 안 나옴).
  - 편명일 때는 구글 장소 검색을 하지 않는다(검색마다 요금). "'KE723' 그대로 추가"는 남는다.
  - 로그인하지 않았으면 "로그인하면 항공편 정보를 불러올 수 있어요."다. 못 찾으면 이유를 보여주고, 그대로 추가할 수 있다.
- 새 여행 폼에도 항공편 칸이 있다(`TripFlightsField`, 만들 때만). 편명과 출발일(첫 편은 시작일, 다음 편부터 종료일이 기본, 기간을 나중에 고르면 빈 출발일을 채움)을 넣고 "○○ 항공편 정보 불러오기"로 찾는다. 편명 칸의 Enter도 찾기다(폼 제출이 아님).
  - 찾은 편의 도착 나라를 여행의 나라에 더한다(`withFlightCountries`, 공항의 `countryCode`). 먼저 찾은 편이 떠나는 나라(집)는 빼서, 돌아오는 편은 더하지 않는다. 더해진 나라는 칩으로 보이고 뺄 수 있다.
  - 만들면 찾은 편은 출발일에, 못 찾았거나 불러오지 않은 편은 편명만 그 날에 일정으로 넣는다(`flightScheduleItems`). 여행 기간 밖이면 보관함이다. 일정 넣기가 실패해도 여행은 만들어진다(기록만 남김).
  - 로그인하지 않았으면 찾기는 "로그인하면… 만들면 편명만 일정에 들어가요."다.
- 편명만 있는 일정(위처럼 못 찾은 편, 그대로 추가한 편명)은 일정 편집 시트에서 채운다(2026-11-06 사용자 요청).
  - 이름이 편명뿐이고 장소가 이름만이면, 장소 줄 대신 "KE723 항공편 정보 불러오기"가 보인다(편명으로 구글 검색을 하지 않음).
  - 시트에서 고른 날짜에 출발하는 편을 찾는다. 날짜를 바꾸면 그 날로 다시 찾는다. 보관함이면 "날짜를 고르면 … 불러올 수 있어요."다.
  - "이 항공편으로 채우기"를 누르면 이름·시간(출발 시각, 데이터에 없으면 그대로)·메모를 채운다. 메모는 이미 쓴 것을 편 정보 아래에 남긴다(`withFlightMemo`). 저장해야 반영된다.
  - 같은 일정을 고치는 것이라서 순서와 이어 둔 지출이 그대로다(지우고 새로 넣으면 지출 연결이 풀림).
- 서버 함수 `api/flight.ts`(Vercel, `GET /api/flight?number=KE723&date=2026-12-01`, `Authorization: Bearer <Supabase 세션>`)
  - 세션은 Supabase `/auth/v1/user`로 확인한다. 로그인한 계정만 묻게 해서 무료 한도를 지킨다.
  - AeroDataBox `GET https://aerodatabox.p.rapidapi.com/flights/number/{편명}/{날짜}?dateLocalRole=Departure`(헤더 `X-RapidAPI-Key`, `X-RapidAPI-Host`)를 부르고, 일정에 필요한 것만 돌려준다(`flightsFromAeroDataBox`: 화물편과 겹친 편은 뺌). 공항마다 나라 코드(`countryCode`, 응답의 `airport.countryCode`)도 준다.
  - 답은 `{ status: ok | notFound | invalid | signedOut | unavailable | busy | error }`다. 204·400·404는 못 찾음, 429는 `busy`, 401·403(키 거절)과 키 없음은 `unavailable`이다.
  - `"type": "module"`이라 Node가 이 파일을 ES 모듈로 돌린다. 확장자 없는 상대 경로 import는 실행할 때 깨질 수 있어서, 앱 코드에서는 타입만 가져온다(`import type`은 사라짐).
  - 개발·미리보기 서버도 `/api/flight`를 받는다(`vite.config.ts`의 `flightApi` 플러그인, `.env.local`의 `AERODATABOX_API_KEY`). 서비스워커는 `/api/`를 화면으로 열지 않는다(`navigateFallbackDenylist`).
- AeroDataBox 조건(2026-11-05 문서·약관)
  - Basic(무료)은 한 달 400단위이고, 이 조회는 2단위라 약 200번이다. 1초에 1번까지이고, 넘으면 다음 달까지 거절된다(청구 없음).
  - 상업용은 안 된다. 미래 일정은 1년 앞까지다(데이터가 있으면).
  - 무료 플랜은 출처 표시가 필요하다. 데이터를 보여주는 곳에 "항공편 정보: AeroDataBox" 링크를 둔다(`https://aerodatabox.com`, `noreferrer`를 붙이면 안 됨).
  - 저장: 사용자 기록(일정)에 넣은 값은 그 기록이 있는 동안 둘 수 있다(약관 5.8). 기록에 필요 없는 필드나 응답 전체는 남기지 않는다. 키를 공개 저장소나 브라우저에 두면 안 된다(약관 6.1.2).
- 2026-11-05: 사용자가 RapidAPI에서 AeroDataBox Basic을 구독하고 키를 `.env.local`에 넣었다(RapidAPI 화면의 "Subscribe to run" → Basic).
  - 실제 조회(KE723, 11-12)가 됐다. `scheduledTime.local`은 `2026-11-12 08:50+09:00` 꼴이라 앱이 그대로 읽는다.
  - 남은 양은 응답 헤더로 본다. `x-ratelimit-api-units-limit` 400, `x-ratelimit-api-units-remaining`이 있고, 한 번에 2단위를 쓴다. 요청 수 한도(`x-ratelimit-requests-limit`)는 1600이다.
  - 개발 서버는 로그인하지 않은 요청에 `401 signedOut`으로 답한다(키가 없으면 `503 unavailable`).
- 테스트: `api/flight.test.ts`(함수, 가짜 Supabase·AeroDataBox), `src/lib/flights.test.ts`, `features/schedule/flightItem.test.ts`, `app/flightFlows.test.tsx`(`/api/flight` 답을 `fetch`로 흉내).

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
- 여행 기간은 한 달력에서 시작일과 종료일을 고른다(`components/ui/DateRangeSheet`, 사용자 요청 2026-11-05: 시작일·종료일을 따로 고르던 것).
  - 폼의 "여행 기간" 칸(`ButtonField`: 입력칸처럼 보이는 버튼, 이름은 "여행 기간 12.1 (화) – 12.3 (목) · 2박 3일")을 누르면 하단 시트가 열린다.
  - 달이 아래로 이어진다(사용자 선택). 오늘(또는 고른 시작일) 2달 전부터 오늘 2년 뒤까지 있고, 맨 위 "이전 달 더 보기"가 1년씩 더 붙인다(보던 자리는 그대로). 고른 시작일의 달에서 열린다.
  - 시작일 → 종료일을 누르면 사이가 띠로 칠해진다. 시작일보다 앞을 누르거나 둘 다 고른 뒤 누르면 새 시작일이다. 같은 날을 두 번 누르거나 시작일만 고르고 "선택"하면 당일치기다. 아무것도 안 골랐으면 "선택"이 이유를 알린다.
  - 일요일 빨강, 토요일 파랑, 오늘은 `aria-current="date"`. 날짜 버튼의 이름은 `2026년 12월 1일 화요일`(`lib/calendar.ts`의 `dayName`), 고른 날은 `aria-pressed`.
  - 그 밖의 날짜(지출 날짜, 항공편 출발일)는 네이티브 `<input type="date">`다(모바일 기본 날짜 선택기).
- UI 문구는 한국어. 데이터 레이어 에러는 `lib/errorMessage.ts`로 한국어 문구로 바꾼다.
- 뷰포트 메타에 `interactive-widget=resizes-content`를 둔다. Android Chrome에서 키보드가 올라오면 화면 높이가 줄어서, 하단 시트·버튼이 키보드에 가리지 않는다.
- 여행 상세(일정) 화면:
  - 선택한 날짜는 URL `?day=YYYY-MM-DD | inbox`에 둔다 (`replace`로 갱신해서 기록이 쌓이지 않게). 값이 없거나 잘못됐으면 여행 중에는 오늘, 아니면 Day 1을 연다.
  - 날짜 탭은 ARIA tabs다 (방향키·Home·End로 이동). 헤더 아래에 고정(sticky)하고, 선택한 탭은 가운데로 스크롤한다.
  - 날짜 일정에는 번호(1, 2, 3…)를 붙이고, 보관함 항목은 순서에 의미가 없으므로 번호 대신 점을 표시한다.
  - 날짜 일정은 타임라인이다: 왼쪽 번호를 세로선으로 잇고(항목 사이 간격 없이 각 항목이 선을 그림), 카드 아래에 다음 장소까지의 거리·길찾기를 둔다. 보관함은 점만 있고 선이 없다.
  - "다른 날짜로 이동"은 편집 시트의 날짜 선택으로도 할 수 있다. 옮긴 항목은 대상 그룹의 맨 끝에 들어간다. 키보드·스크린리더 사용자는 이 방법을 쓴다.
  - 편집 시트에서 삭제하면 확인 시트가 그 위에 겹쳐 뜬다. 취소하면 편집하던 내용이 그대로 남는다.
  - 편집 시트의 "지출" 구역(`features/expenses/ItemExpenses.tsx`, `itemExpenses()`): 이 일정에 연결된 지출(누르면 그 지출 수정 화면), 정산 통화 합계, "지출 추가"가 있다.
    - "지출 추가"는 `/trips/:id/expenses/new?item=<일정 id>`로 연다. 폼이 일정 연결과 그 일정의 날짜를 채운다(`newExpenseValues`의 `scheduleItem`). 저장하면 기록상 이전 화면(그 날짜의 일정)으로 돌아간다.
    - 시트에서 바꾼 내용이 있으면 지출 화면으로 가기 전에 먼저 저장한다(그대로 가면 사라지므로). 바꾼 게 없으면 저장하지 않는다(`updatedAt`이 백업 병합을 좌우하므로).
  - 장소 추가 시트: 이름을 입력하면 검색 결과가 뜨고, 고르면 주소·위치와 함께 저장된다. 결과 아래 "'○○' 그대로 추가"는 이름만 저장한다. 검색이 되는 동안 Enter는 키보드만 닫는다(실수로 위치 없는 장소가 생기지 않게). 키가 없거나 오프라인이면 안내와 함께 예전처럼 이름 + "추가"로 동작한다.
  - 편집 시트의 장소 줄: 주소(없으면 "주소와 위치가 없어요.")와 "장소 찾기 / 다시 찾기"가 있다. 검색 시트(`PlaceSearchSheet`)는 일정 이름으로 바로 검색한다. 고르면 이름도 그 장소 이름으로 바뀌고, 이름칸에 "이전 이름으로"가 생긴다(예: "호텔 체크인"이라는 이름에 호텔 위치만 붙이기). 저장해야 반영된다. 이름이 편명뿐이면 이 줄 대신 항공편 불러오기다(위 "항공편").
  - 새 여행 폼(`TripForm`, 여행 정보 수정과 같은 폼): 여행 이름 → 나라(`TripCountriesField`: 국기 칩, "나라 고르기" 시트에서 이름·흔히 부르는 이름·도시 이름으로 찾아 체크, 고른 것이 위에 와서 체크하는 동안 줄이 움직이지 않음) → 도시(`TripCitiesField`, 여러 개) → 여행 기간(달력) → 항공편(새 여행만, `TripFlightsField`) → 표지 사진. 오류는 제목·도시·기간 순서로 첫 칸에 포커스한다(`TRIP_FORM_FIELDS`).
    - 시트들이 폼 안에 있어서, 시트의 입력칸(나라 이름, 편명)에서 Enter를 눌러도 폼을 보내지 않게 막았다.
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
  - 일정 연결은 폼의 "일정 연결" 선택(날짜별 묶음)으로 하고, 일정 편집 시트의 "지출 추가"로도 연결된 채 시작한다. 지워진 일정에 대한 연결은 폼을 열 때 버린다 (스토어가 옛 값을 들고 있어도 저장이 막히지 않게).
  - 동행자 시트: 추가·이름 바꾸기·삭제. 삭제는 먼저 `usage()`를 조회해서, 막히면 해당 지출 목록(누르면 그 지출 수정 화면)을 보여주고, 아니면 확인 시트("빼고 다시 나누기" / "삭제")를 띄운다.
  - 정산 통화는 요약 카드의 "KRW 기준" 버튼 → 시트에서 바꾼다. 지출·송금 기록이 있으면 선택을 막고 이유를 보여준다.
  - 요약 카드: 예산이 있으면 진행 막대와 "n원 남음 / 초과 · 예산 · n% 사용"(퍼센트는 내림). 맨 아래 줄에 "예산 정하기(수정)"와 "지출 요약 ›".
  - 예산 시트(`BudgetSheet`): 정산 통화 금액 하나. 비우고 저장하면 예산 없음. 바뀌지 않았으면 저장하지 않는다.
  - 지출 요약 화면 `/trips/:id/expenses/summary`: 예산, 카테고리별(지출 있는 것만, 큰 순서, 비율), 날짜별(여행 날짜 전부 + 지출이 있을 때만 여행 전/후, 막대는 가장 큰 날 기준), 동행자별 낸 돈/쓴 돈 표(2명 이상일 때, "정산 ›" 링크), 환율을 다시 입력해야 하는 지출 목록(누르면 수정 화면).
  - 정산 화면 `/trips/:id/expenses/settlement` (`features/settlement/`): 주고받을 돈(사람별 잔액), 송금할 돈(체크 = 송금 완료), 송금 완료(체크 해제 = 기록 삭제), 하단 "공유"·"정산 결과 복사". 동행자가 1명이거나 지출·송금 기록이 없으면 안내만 보여준다. 요약 카드에는 동행자가 2명 이상일 때 "정산 · 송금 n건 남았어요 ›" 줄이 있다.
  - 전체 화면 페이지의 제목 있는 구역은 `components/ui/PageSection`(제목 줄 버튼은 `sectionActionClass`)을 쓴다.
- 여행 표지: 사용자가 고른 사진(`Trip.cover`)이 있으면 사진, 없으면 여행 id로 고른 그라데이션(`features/trips/tripCover.ts`의 `coverStyle`, 8가지)이다. 그래서 여행마다 무작위로 정해지고, 이름·도시를 바꿔도 다른 기기·백업에서도 그대로다. 양 끝 색 모두 흰 글씨가 4.5:1 이상이다. 작은 표지에는 사진의 썸네일, 없으면 도시 첫 글자(`coverInitial`)를 쓴다. Google 장소 사진이나 스톡 사진은 쓰지 않는다(사용자 결정: 요금, 오프라인, 약관).
  - 사진 위의 흰 글씨는 글씨 묶음에 붙인 그늘(`photoTextShade`)로 읽히게 한다. 묶음의 `pt-16`에서 흐려지다가 글씨가 시작되는 곳부터 검정 55% 이상이라, 흰 사진에서도 4.5:1 이상이다(실제 브라우저에서 잼: 5.1:1 이상). 사진 위치 비율로 깐 그늘은 밝은 사진에서 글씨 뒤가 비어서 쓰지 않는다.
  - 단계 배지는 사진 위에서 흰 바탕 + 진한 글씨(`coverBadgeClass`)다. 여행 화면은 헤더 아이콘 아래에 위쪽 그늘을 둔다(흰 사진에서 3.3:1 이상). 흰 사진 썸네일이 배경에 묻히지 않게 `ring-1 ring-black/5`.
  - 여행 목록: 모든 여행이 작은 표지가 붙은 줄(`TripCard`)이다. 지난 여행의 작은 표지는 흐리게.
    - 처음에는 가장 가까운(진행 중 포함) 여행을 큰 표지 카드로 보여 줬다. 사용자 요청으로 여행이 하나일 때 없앴고, 둘일 때도 "왜 쟤만 크니"라고 해서 아예 없앴다(2026-11-05).
  - 표지와 목록 줄은 나라의 국기와 도시들을 `🇯🇵🇹🇼 오사카 · 교토`처럼 보여 준다(`tripPlacesText`). 국기와 나라 이름은 세계 지도 없이 쓰도록 나라 코드 목록을 따로 둔다(`countryCodes.ts`, `world-map.mjs`가 같이 만듦).
  - 여행 상세: 위쪽이 표지(`TripCover`: 단계·국기·도시들, 제목 = 페이지의 h1, 기간)이고 헤더(`TripPageHeader`)가 그 위에 겹친다. 사진이 있으면 표지가 더 높고(헤더 + 17rem) 글씨가 아래에 붙는다. 헤더는 맨 위에서만 투명(흰 아이콘)이고, 조금이라도 스크롤하면 흰 바가 되며, 표지가 다 지나가면 제목이 나온다(`lib/useScrolledPast.ts`, IntersectionObserver. 없으면 계속 투명). 헤더의 제목은 표지 h1과 겹치므로 `aria-hidden`.
  - 일정/가계부 전환은 밑줄 탭(`TripViewTabs`, 링크 + `aria-current`)이다.
  - 가계부 요약 카드는 연한 회색(`bg-gray-50`) 카드에 큰 총액이다.
  - 표지 사진 고르기: 여행 만들기·수정 폼의 "표지 사진" 칸(`CoverPhotoField`)이다.
    - 사진이 없으면 그 여행의 그라데이션 칸이 곧 "사진 고르기" 버튼이다(아래 "고르지 않으면 이 색으로 꾸며요."). 사진이 있으면 미리보기와 "다른 사진 고르기 / 사진 빼기"가 나온다.
    - 새 여행 화면(`TripCreatePage`)은 열 때 여행 id를 만들어 그 색을 보여주고, 만들 때 그 id를 넘긴다. 그래서 입력하는 동안 색이 바뀌지 않고, 만든 여행도 같은 색이다.
    - 고르면 바로 줄인다(`features/trips/coverPhoto.ts`의 `prepareCoverPhoto`, `lib/image.ts`). 화면에 보이는 방향(카메라 회전 정보)대로 그리고, 투명한 곳은 흰색으로 채운다. 줄이는 동안은 저장 버튼을 막는다(사진이 빠진 채 저장되지 않게).
    - 브라우저가 읽지 못하는 파일(예: Safari 밖의 HEIC)이면 "이 사진은 열 수 없어요. 다른 사진을 골라 주세요."를 보여준다.
    - 저장해야 반영되고, 같은 사진이면 바뀐 것으로 치지 않는다(`toTripPatch`).
  - 한글 설명 문단은 `break-keep`(word-break: keep-all)으로 띄어쓰기에서만 줄을 바꾼다. 기본값은 음절마다 줄이 바뀌어 "두세 / 요."처럼 된다.
  - 하나만 고르는 선택은 `components/ui/ChoiceGroup`(네이티브 radio + fieldset)을 쓴다. 기본은 칩 모양이고, 지출 카테고리는 `appearance="checks"`(이모지 없이 동그라미 체크 + 이름)다.
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
  - `vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData())`로 앱 싱글턴(저장소, 동기화 엔진, `onLocalWrite`)을 테스트용 DB로 바꾼다. `vi.mock`은 파일마다 호이스팅되므로 각 테스트 파일에 직접 쓴다.
  - 동기화·공유 화면 테스트는 `createTestData(server)`에 PGlite 서버(`createSyncDatabase()`)를 준다. 동기화와 공유 호출(`connectSharing`)이 그 서버로 간다. 실시간 알림(`watchServer`)은 오지 않는다. `app/syncFlows.test.tsx`·`app/sharingFlows.test.tsx`는 `vi.hoisted`로 서버를 공유하고, 테스트마다 `server.reset()`·`syncEngine.forget()`을 부른다. 기기 둘의 동기화는 `data/sync/syncEngine.test.ts`.
  - `supabaseFake`의 사용자 id는 UUID(`USER_IDS`)이고, 세션을 `sb-test-auth-token`에 둔다(앱 시작 때 계정을 불러오는 조건).
  - `src/test/app.tsx`의 `resetApp()`(스토어와 데이터 비우기), `resetStores()`(새로고침 흉내), `renderApp(path)`를 쓴다. **새 스토어를 만들면 `resetStores()`에 추가한다.**
  - 여행 폼의 기간은 `pickTripDates(user, start, end)`(`test/app.tsx`)로 고른다: 달력을 열어 두 날을 누르고 "선택"한다(지난 날짜면 "이전 달 더 보기"를 누름). 달력은 오늘 2년 뒤까지라서, 먼 미래 날짜 대신 오늘에서 계산한 날짜를 쓴다(`coverFlows.test.tsx`의 `ahead`).
  - 날짜가 오늘에 따라 달라지는 화면은 URL에 `?day=`를 명시해서 테스트한다 (기본 선택이 오늘 날짜에 좌우되기 때문).
  - 라우팅은 `createMemoryRouter(routes)`로 실제 라우트를 그대로 쓴다.
  - 화면 코드는 처음 열 때 받으므로, `test/app.tsx`가 테스트 파일을 불러올 때 모든 화면 코드를 미리 받아 둔다(부하가 걸리면 그것만으로 첫 `findBy*`의 1초를 넘길 수 있어서). 화면 코드를 못 받는 경우는 `vi.mock('@/pages/…', () => { throw … })`로 만든다(`app/routeErrors.test.tsx`).
  - 가계부 화면(`ExpensePageShell`: 지출 추가·수정, 요약, 정산)은 제목이 먼저 뜨고 본문은 가계부와 쓴 환율을 읽은 뒤에 뜬다. 제목만 기다린 뒤 본문을 바로 찾지 말고, 본문 요소를 `findBy*`로 기다린다.
  - 쿼리는 역할·레이블 기준(`getByRole`, `getByLabelText`)으로 쓴다. 접근성 이름이 곧 테스트 계약이다.
  - 일정 카드는 편집 버튼과 "○○ 순서 바꾸기" 손잡이 버튼이 함께 있다. 카드 버튼은 `^이름(?! 순서 바꾸기)` 형태로 찾는다 (`app/scheduleFlows.test.tsx`의 `card()`).
  - dnd-kit도 스크린리더용으로 `role="status"` 영역을 만든다. 하단 안내는 역할이 아니라 문구로 찾는다.
- 메모리 라우터에는 브라우저 기록(`history.state.idx`)이 없어서, 테스트에서 저장 후 "뒤로"는 항상 대체 경로(`backFallback`)로 간다.
- 테스트는 네트워크에 나가지 않는다. `test/setup.ts`가 테스트마다 `fetch`를 실패하게 바꿔서 환율 API는 오프라인처럼 보인다. API 응답이 필요하면 `stubRatesApi(() => latestRatesBody('JPY', { KRW: 8.510259 }))`(`test/app.tsx`, `test/fixtures.ts`)를 쓴다. `resetApp()`은 localStorage(기기에 둔 환율)도 비운다.
- 숨긴 radio 칩(`ChoiceGroup`)은 Playwright 같은 실제 브라우저 자동화에서 radio가 아니라 `label`을 눌러야 한다. 송금 체크박스는 체크하면 그 줄이 목록에서 빠지므로 `check()`가 아니라 `click()`을 쓴다 (`check()`는 같은 자리의 다음 줄을 다시 누른다).
- 로그인: 테스트는 Supabase 설정이 없는 상태로 시작한다(`test/setup.ts`가 비움). 로그인이 필요한 화면 흐름 테스트는 파일에서 `vi.mock('@supabase/supabase-js', …)`로 `createClient`가 `supabaseFake.client`(`test/supabase.ts`)를 돌려주게 하고 `stubSupabase()`(`test/app.tsx`)를 부른다(`app/accountFlows.test.tsx`).
  - 앱이 처음 만든 클라이언트를 계속 쓰므로 가짜는 파일에 하나다. 테스트마다 `supabaseFake.reset()`을 부른다.
  - 가짜로 하는 일: `signedIn(user)`(기기에 세션), `returnsAs(user)` + 주소 `?code=`(로그인하고 돌아옴), `changeElsewhere(user | null)`(다른 탭). `signIns`·`signOuts`로 호출을 확인한다. 사용자 픽스처는 `kakaoUser()`, `googleUser()`.
  - 돌아온 주소는 `window.history.replaceState`로 만든다. 메모리 라우터와 별개라서, 앱의 로그인 코드는 `window.location`을 읽는다.
- 장소 검색: 테스트는 API 키가 없는 상태로 시작한다. Vitest가 `.env.local`도 읽으므로 `test/setup.ts`가 `VITE_GOOGLE_MAPS_API_KEY`(와 `VITE_GOOGLE_MAPS_MAP_ID`)를 매번 비운다. 검색이 필요하면 `stubPlacesApi([OSAKA_CASTLE, ...])`(`test/app.tsx`)를 쓴다. 테스트 키와 가짜 `google.maps.importLibrary`(`test/places.ts`의 `fakePlacesApi`: 이름에 입력이 들어간 장소를 제안, `failSearch`·`failPick` 옵션)를 넣고 요청 기록(`requests`, `fetched`)을 돌려준다. 가짜 `importLibrary`는 라이브러리 이름별로 답하고, 장소 검색 스텁에도 가짜 지도가 들어 있다.
- 길찾기 링크는 목록 안에 있다: `screen.queryAllByRole('link', { name: /까지 길찾기$/ })`(`app/mapFlows.test.tsx`의 `legLinks()`).
- 지도: `stubMapsApi()`(`test/app.tsx`)가 테스트 키와 가짜 `maps`·`marker` 라이브러리(`test/maps.ts`의 `fakeMapsApi`)를 넣고, 그린 것을 돌려준다: `maps`(만든 지도, `cameras`), `markers()`(지도에 있는 마커의 `[번호, title]`), `lines`(`path`). 단위 테스트는 `createRouteMap(div, fakeMapsApi().libraries)`. 로드 실패는 `vi.spyOn(google.maps, 'importLibrary').mockRejectedValueOnce(...)`(`app/mapFlows.test.tsx`).
  - 지도를 띄우는 테스트의 Google 장소는 `fetchedAt`을 실제 현재 시각으로 찍는다. 키가 있으면 여행 화면이 7일 지난 장소를 다시 받으려 하는데, 지도 스텁에는 장소 라이브러리가 없다.
  - happy-dom은 외부 스크립트를 받지 않는다(`vite.config.ts`의 `disableJavaScriptFileLoading`). 로더 테스트는 `document.head.append`를 가로챈다.
  - 검색은 입력이 멈추고 300ms 뒤에 하므로 `findBy*`로 기다린다. happy-dom에는 CSS가 없어 제안 버튼의 접근성 이름이 "오사카성일본 …"처럼 붙어서 나온다. 그래서 `/^오사카성/`처럼 앞부분으로 찾는다.
  - 오프라인은 `vi.spyOn(navigator, 'onLine', 'get')` + `fireEvent(window, new Event('online'|'offline'))`.
  - 장소 픽스처: `makePlace()`(Google 장소, `fetchedAt: T0`), `namedPlace()`(직접 입력), `typedCity()`(직접 입력한 도시).
  - 화면 흐름 테스트에서 저장소는 테스트 시계(2026-01-01부터)를 쓰고, 여행 화면의 갱신 판단은 실제 시계를 쓴다. 그래서 갱신되면 안 되는 Google 데이터는 실제 현재 시각으로 찍는다(`placeFlows.test.tsx`의 `OSAKA_CITY`). 30일 지난 데이터는 저장소 테스트에서 `db`에 직접 넣어 확인한다(저장소로 쓰면 바로 지워짐).
- 클립보드: `userEvent.setup()`이 `navigator.clipboard`를 메모리 스텁으로 바꾸므로 복사한 내용은 `navigator.clipboard.readText()`로 확인한다. 실패는 `vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(...)`. happy-dom에는 `navigator.share`가 없어서, 공유 테스트는 `Object.defineProperty`로 넣고 테스트 뒤에 지운다 (`app/settlementFlows.test.tsx`).
- 백업 파일: 다운로드는 `URL.createObjectURL`(넘긴 파일)과 `HTMLAnchorElement.prototype.click`(`download` 이름)을 가로채서 확인한다. 파일 고르기는 `user.upload(screen.getByLabelText('백업 파일'), file)`. user-event가 `accept`에 맞지 않는 파일을 버리므로 잘못된 파일 테스트도 `.json` 파일로 한다. 파일 공유는 `navigator.share`와 `navigator.canShare`를 넣는다 (`app/backupFlows.test.tsx`).
- 홈 화면 안내: iOS는 `vi.spyOn(navigator, 'userAgent', 'get')`, 홈 화면에서 연 상태는 `vi.spyOn(window, 'matchMedia')`로 흉내 낸다(`app/installFlows.test.tsx`). 서비스워커와 오프라인 시작은 happy-dom에 없으므로 빌드 결과를 실제 브라우저로 확인한다(`npm run build` → `vite preview --port 5174` → 오프라인으로 다시 열기).
- 저장한 뒤에 닫히는 시트(장소 추가 등)는 목록이 먼저 바뀌고 시트가 조금 뒤에 닫힌다. 닫힘도 `waitFor`로 기다린다(바로 검사하면 부하가 걸릴 때 가끔 실패함).
- 드래그는 happy-dom에서 테스트할 수 없다 (요소 크기가 모두 0). 이동 규칙은 `data/rules`와 스토어 테스트로 검증하고, 드래그 자체는 실제 브라우저에서 확인한다.
- 시작 화면은 `index.html`에 있어서 화면 흐름 테스트에는 없다(`hideSplash`는 아무것도 하지 않음). 사라지는 시간은 `app/splash.test.ts`(`wait` 주입)로, 보이고 사라지는 것과 새로고침·새 탭은 실제 브라우저로 확인한다.
- 표지 사진: happy-dom은 이미지를 디코드하거나 캔버스에 그리지 못한다. 그래서 화면 흐름 테스트는 `vi.mock('@/features/trips/coverPhoto', ...)`으로 `prepareCoverPhoto`를 바꾸고, `user.upload(screen.getByLabelText('표지 사진 파일'), file)`로 고른다(`app/coverFlows.test.tsx`). 저장된 사진은 픽스처 `makeCover(name)`로 만든다.
  - 줄이기 자체(크기, 회전 정보, 투명, 읽지 못하는 파일)는 실제 브라우저에서 확인한다.
  - 표지 사진은 장식(`alt=""`)이라 역할로 찾을 수 없어서 `img[src="…"]`로 찾는다. 폼의 미리보기만 이름("고른 표지 사진")이 있다.

## 로그인·친구 초대 계획 (15~19단계)

2026-11-04 사용자 요청으로 계획에 넣었다. 같은 날 16단계를 시작하며 아래 "방식"을 사용자와 확정했다(추천안 그대로). Supabase는 무료 플랜으로 시작한다.

- 목표: 구글·카카오로 로그인하고, 카톡으로 초대 링크를 보내면 친구가 그 링크로 여행에 참여해 같은 일정·가계부를 같이 보고 고친다.
- 큰 변경인 이유: 지금은 데이터가 각자 기기(IndexedDB)에만 있다. 같이 보려면 서버에 공용 저장소가 있어야 한다.
- 구성(추천)
  - Supabase: PostgreSQL + 로그인(Google·Kakao 기본 지원) + 권한 규칙(RLS: 여행 멤버만 읽고 쓰기) + 실시간 반영. 따로 서버 코드 없이 앱에서 쓴다. 데이터 모델은 이미 PostgreSQL에 맞춰져 있다(UUID, `null`, 문자열 날짜, 최소 단위 정수).
  - 배포: Vercel(무료). 로그인 후 돌아올 주소, 카카오 도메인 등록, 실제 아이폰 확인에 https 주소가 필요하다.
  - 화면·스토어는 지금처럼 저장소 인터페이스만 쓰고 기기 DB를 먼저 읽고 쓴다. 서버와 맞추는 층(동기화)을 그 아래에 더한다.
- 방식(2026-11-04 확정)
  - 로그인은 선택이다. 안 하면 지금처럼 기기에만 저장하고, 로그인하면 서버 저장·여러 기기·초대가 열린다. 처음 로그인할 때 기기의 여행을 계정으로 올린다.
  - 오프라인에서도 입력하고, 연결되면 서버와 맞춘다. 같은 항목을 동시에 고치면 나중에 고친 쪽(`updatedAt`)이 남는다(백업 병합과 같은 규칙). 삭제를 전하려면 삭제 기록(tombstone)이 필요하다.
  - 초대받은 사람도 일정·지출을 고칠 수 있다. 여행 삭제와 초대 관리는 만든 사람만.
  - 초대 링크는 7일 유효, 여러 명이 쓸 수 있고, 만든 사람이 끊을 수 있다. 카카오톡 공유(카카오 JavaScript SDK, "참여하기" 버튼이 있는 카드)로 보내고, 안 되면 링크 복사·공유 시트.
  - 참여하면 "이 여행에서 누가 나예요?"로 가계부 동행자와 계정을 잇는다(없으면 새로 추가). 그래서 "나"가 사람마다 다르다. 동행자에 계정 연결이 필요하고 지금의 `isMe`는 바뀐다.
  - 카카오 이메일은 앱에서 쓰지 않는다(닉네임·프로필 사진만).
    - 그런데 Supabase의 카카오 로그인은 `account_email`·`profile_image`·`profile_nickname`을 항상 요청한다. 2026-11-04 supabase/auth의 `internal/api/provider/kakao.go`에서 확인했다. 넘긴 scope는 이 목록에 덧붙을 뿐이다.
    - 이메일 동의 항목이 없는 카카오 앱이면 카카오가 KOE205로 막는다. 이메일 동의 항목은 비즈 앱만 쓸 수 있다.
    - 그래서 카카오 앱을 '개인 개발자 비즈 앱'으로 전환(본인인증, 무료)하고, 이메일을 '선택 동의'로 둔다. 동의하지 않은 사용자를 위해 Supabase의 Kakao 설정에서 "Allow users without an email"을 켠다.
- 조사한 제약(2026-11-04)
  - 카카오톡 안의 브라우저(UA에 `KAKAOTALK`)에서는 구글이 로그인을 막는다(403 `disallowed_useragent`). 카카오 로그인은 된다. 초대 화면은 카카오 로그인을 먼저 두고, 구글은 "다른 브라우저로 열기"로 안내한다(`kakaotalk://web/openExternal?url=`은 널리 쓰이지만 공식 문서는 없음).
  - 아이폰 홈 화면 앱: 소셜 로그인 뒤 앱이 아니라 Safari로 돌아가는 문제가 오래 보고됐다(쿠키·저장소가 Safari와 따로). 최신 iOS에서 고쳐졌다는 자료는 없다. 실제 아이폰으로 확인하고, 안 되면 로그인 결과를 서버를 거쳐 앱으로 넘겨준다.
    - 2026-11-05: 사용자의 아이폰 홈 화면 앱에서 카카오 로그인이 됐다(구글은 아직 안 해 봄).
  - Supabase 무료: DB 500MB, 파일 1GB, 월 사용자 5만 명. 일주일쯤 활동이 적으면 일시 정지된다(데이터는 남고, 미리 메일이 오고, 대시보드에서 다시 켬). 유료(월 25달러부터)는 정지되지 않는다. 기기 DB를 먼저 쓰므로 정지돼도 앱은 기기 데이터로 동작한다.
    - 오래 정지된 프로젝트는 대시보드에서 다시 켤 수 없고, 백업을 내려받아 새 프로젝트로 옮겨야 한다.
      - 그 기한이 공식 문서끼리 90일과 1년으로 엇갈렸다.
      - 2026-11-04 다시 보니 두 문서(정지·비용) 모두 "정지 후 1년까지 다시 켤 수 있다"이다.
    - 여행 사이에 몇 달씩 쓰지 않는 앱이지만, 무료로 시작하기로 했다(2026-11-04 사용자 선택, 언제든 유료로 바꿀 수 있다).
  - 표지 사진(`data:` URL, 장당 약 0.5MB)은 DB 용량을 많이 쓰므로, 서버에서는 파일 저장소(Storage)로 옮기는 것을 검토한다.
  - 구글 장소 데이터의 30일 규칙은 서버 사본에도 지킨다.
  - 브라우저에는 공개 키(anon)만 둔다. 서비스 롤 키는 절대 앱에 넣지 않는다.
  - 친구 말고 다른 사람에게도 열려면 개인정보 처리방침 페이지와 계정 삭제가 필요하다.
- 비용(2026-11-04 조사, 같은 날 공식 페이지로 다시 확인): 친구끼리 쓰는 정도면 모두 무료다. 주의할 것은 위의 Supabase 정지와 아래 지도 키다.
  - 넘었을 때 저절로 돈이 나갈 수 있는 것은 Google Maps뿐이다. 그것도 결제 계정을 유료로 바꾼 뒤에만 그렇다. 나머지는 무료 한도를 넘으면 막히거나 멈출 뿐 청구되지 않는다.
  - 환율 API(open.er-api.com): 키·계정이 없는 무료 서비스라 청구될 수 없다.
    - 1시간에 한 번 이하로 부르면 막히지 않는다. 더 자주 부르면 그 IP가 20분 동안 429를 받는다(사용자 기기마다 따로 센다).
    - "무료 플랜은 예고 없이 끝날 수 있다"고 적혀 있다. 응답의 `time_eol`이 종료 예고다. 끝나면 환율 자동 입력만 안 되고 직접 입력은 그대로다. 데이터를 다른 곳에 다시 배포하는 것은 금지다.
  - Vercel Hobby
    - 무료지만 개인·비상업 용도만이다. 광고·결제가 있으면 상업용이고, 기부 요청은 아니다.
    - 무료 한도는 한 달에 데이터 전송 100GB, CDN 요청(예전 이름 Edge Requests) 100만 건이다. 넘으면 청구 없이 30일 동안 그 기능을 못 쓴다.
    - Pro는 월 20달러다.
    - 주소는 `*.vercel.app`이 무료이고, 내 도메인은 선택이다(연 1~2만 원).
  - 구글 로그인: 요금 안내가 없다. 이름·이메일·프로필만 요청하므로 사용자 수 상한(100명)도 해당하지 않는다.
  - 카카오 로그인: 무료다. 앱의 모든 카카오 API를 합쳐 한 달 300만 건까지이고, 넘으면 오류(-10)가 날 뿐 청구는 없다. 유료 API 목록에는 카카오톡 공유와 카카오맵만 있다.
  - AeroDataBox(항공편, 2026-11-05): RapidAPI의 Basic이 무료다(한 달 400단위, 조회 약 200번). 넘으면 다음 달까지 막힐 뿐 청구는 없다. 유료는 월 8달러부터다(RapidAPI Pro).
  - 카카오톡 공유(18단계): 하루 3만 건까지 무료다. 그 이상은 비즈월렛을 만들어 유료 사용을 직접 켜야만 건당 50원이다(2026-02-02~2027-12-31은 10원). 켜지 않으면 오류만 난다.
  - GitHub: 공개 저장소는 무료다.
  - Google Maps는 2025년 3월부터 SKU마다 월 무료량이 있다(Essentials 1만, Pro 5천, Enterprise 1천). 무료량은 결제 계정마다 매달 1일 0시(미국 태평양 시간, 한국은 1일 오후 4~5시)에 다시 차고, 남은 양은 다음 달로 넘어가지 않는다. 한 번뿐인 것은 체험판 크레딧(300달러, 90일)이다.
    - 우리가 쓰는 것과 무료량을 넘었을 때의 첫 구간 가격(1,000건당)이다.
    - Dynamic Maps(지도 한 번 띄우기): 월 1만, 7달러.
    - Autocomplete Requests(검색 입력 요청): 월 1만, 2.83달러.
    - Place Details Essentials(고른 장소의 주소·좌표, 7일 갱신): 월 1만, 5달러.
    - Advanced Marker와 Map ID에는 따로 SKU가 없다.
    - 세션 요금: 세션을 Essentials 필드(`formattedAddress`, `location`)로 끝내면 그 세션의 자동완성 요청이 처음 12번까지 Autocomplete Requests로 청구되고, 13번째부터는 무료다. 상세 요청은 Place Details Essentials로 따로 청구된다.
    - 그래서 검색 한 번은 자동완성 몇 번과 상세 1번이다. 무료량으로 한 달에 대략 2천 번 검색할 수 있다.
    - Pro 필드(`displayName`)를 넣으면 자동완성은 모두 무료가 되지만, 상세가 Enterprise + Atmosphere(월 1천, 25달러)로 청구된다. 세션당 자동완성이 7번 이하면 지금 방식이 더 싸다.
  - 배포하면 지도 키가 공개 사이트에 실리고, 리퍼러 제한은 브라우저 밖에서 꾸밀 수 있다. 그래서 15단계에서 Cloud 콘솔의 API별 하루 할당량을 무료량 안으로 건다. 예산 알림은 알리기만 하고 막지 않는다.
    - 단, 결제 계정이 무료 체험판인 동안에는 할당량을 바꿀 수 없다. 2026-11-04에 확인했다: 수정 메뉴가 꺼져 있고 "무료 체험판에서는 할당량 상향이 허용되지 않습니다"가 뜬다.
    - 체험판은 크레딧만 쓰고 자동으로 청구하지 않는다. 그래서 체험이 끝나 유료 계정으로 바꿀 때 상한을 건다: Maps JavaScript API의 `Map loads per day`, Places API (New)의 `AutocompletePlaces…`·`GetPlace…` per day를 각각 300. 하루 할당량도 태평양 시간 0시(한국 오후 4~5시)에 다시 차므로, 한 달에 많아야 300 × 31 = 9,300번이라 월 무료량(1만) 안이다.
  - 앱스토어를 쓰지 않으므로(PWA) Apple 개발자 등록비(연 99달러)가 없다.
- 사용자가 준비할 것(단계마다 화면별로 안내한다): Supabase 프로젝트, Google Cloud OAuth 클라이언트(동의 화면), 카카오 디벨로퍼스 앱(카카오 로그인 켜기, Redirect URI, 사이트 도메인, JavaScript 키), Vercel(GitHub 저장소 연결), 구글 지도 API 키 리퍼러에 배포 주소 추가와 하루 할당량 상한.

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
| 11 | 지도 (번호 마커, 직선 경로, 구간별 길찾기 링크) | 완료 |
| 12 | 설정 + 백업 내보내기/가져오기 화면 (가계부 포함) | 완료 |
| 13 | PWA·오프라인·iOS 설치 안내 | 완료 |
| 14 | 다듬기 (번들 분할, 옛 조각 처리) | 완료 |
| 15 | 배포 (Vercel, https 주소) | 완료 |
| 16 | 로그인 (구글·카카오, Supabase), 계정 화면 | 완료 |
| 17 | 서버 저장·동기화: 여러 기기에서 같은 여행, 오프라인에서 고친 것은 연결되면 반영 | 완료 |
| 18 | 친구 초대·참여: 초대 링크, 카카오톡 공유, 동행자 연결, 멤버 관리, 실시간 반영 | 완료 |
| 19 | 다듬기: 실제 아이폰 로그인 확인, 계정 삭제, 개인정보 처리방침 | 예정 |

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
- 할 일 (마지막 다듬기 단계): 번들이 500KB(min)를 넘었다 (gzip 160KB). 라우트 단위 지연 로딩으로 나눈다. (14단계에서 함)
- 2026-11-02: 5단계(여행 수정 + 기간 축소) 완료. 수정은 별도 화면(`/trips/:id/edit`), 변경 없으면 저장 생략, 범위 밖 일정은 보관함/삭제/취소 시트. `OutOfRangeItemsError`에 날짜 목록 추가. 뒤로 가기 규칙은 `lib/useGoBack.ts`로 통일.
- 2026-11-02: MVP에 여행 가계부 + 동행자 정산 추가 (모델 `Companion`·`Expense`·`ExpenseShare`·`Settlement`, 금액은 최소 단위 정수, 환율 스냅샷, 나머지는 결제자, 최소 송금 정산안). 설계 초안과 단계 배치 제안 — 미정 항목은 "가계부·정산" 섹션 참고.
- 2026-11-02: 가계부 미정 항목을 추천안대로 확정 (연결된 동행자 삭제 규칙, 환율 open.er-api.com, 정산 통화 잠금, 여행 전체 예산, 기간 밖 지출 허용, 통화 13종, 6~9단계 배치).
- 2026-11-02: 6단계(가계부 데이터 레이어) 완료. 정산 통화 잠금은 지출뿐 아니라 송금 기록이 있어도 적용. 환율 `quote`가 정산 통화와 다른 지출은 `buildLedger`가 `unconvertible`로 따로 돌려준다. ESLint `no-unused-vars`에 `ignoreRestSiblings` (필드 제거용 구조 분해 허용).
- 2026-11-02: 7단계(동행자 + 지출 기록 화면) 완료. 일정/가계부 전환은 `?tab=expenses`, 지출 폼은 전체 화면 라우트. 정산 통화 설정을 7단계로 당김 (지출을 기록하면 잠기므로 지출 기록 전에 정할 수 있어야 함). 같은 통화의 마지막 환율 미리 채우기도 7단계에 넣음 (8단계는 API 환율과 여행 간 마지막 환율을 더함). 카테고리는 기본값 없이 필수 선택. 일정 쪽에서 지출을 보거나 추가하는 진입점은 아직 없음 (지출 폼의 "일정 연결"만). (2026-11-04에 일정 편집 시트에 넣음)
- 2026-11-03: 8단계(환율 자동 입력 + 예산·요약) 완료. 환율 API는 지출 통화를 기준으로 요청 (응답이 소수 6자리라 원화 정산에서 정밀). 응답은 기기에 두고 다음 갱신까지(최소 1시간) 다시 요청하지 않음 (약관). 우선순위는 API → 이 여행의 마지막 환율 → 다른 여행의 마지막 환율 → 직접 입력. 조회 중에 입력한 값은 덮어쓰지 않음. 저장된 지출을 수정할 때는 환율을 자동으로 바꾸지 않음. `fetchedAt` = API 발표 시각. 정산 통화를 바꾸면 예산을 지움 (저장소 규칙). 요약은 별도 화면(`/trips/:id/expenses/summary`). 잔액은 9단계에서 보여줌.
- 2026-11-03: 9단계(정산) 완료. 정산은 별도 화면(`/trips/:id/expenses/settlement`), 요약 카드에 남은 송금 건수 줄. 송금안 체크 = 그 금액 그대로 송금 기록 (일부 송금 기록은 범위 밖). 체크·해제 모두 되돌리기 안내로 처리하고 확인 시트는 쓰지 않음. 공유 텍스트에 "각자 쓴 돈"을 넣음 (송금 금액의 근거). 복사 실패 시 직접 복사 시트, 공유 버튼은 Web Share가 있을 때만. 송금 기록 쓰기는 지출 스토어에서 바로 반영 (다른 기록에 영향 없음).
- 2026-11-03: 10단계(장소 검색) 완료. Places API (New) 데이터 API(`AutocompleteSuggestion` + `fetchFields`)를 직접 쓰고 목록 UI는 앱에서 그린다. 상세 필드에서 `displayName`을 빼고 이름은 제안의 `mainText`를 쓴다(세션 청구가 Enterprise + Atmosphere → Essentials로 내려감). 여행 도시도 검색으로 고르고(`(regions)`), 장소 검색은 그 근처 30km를 우선한다. 직접 입력은 "그대로 추가"로 남긴다. 편집 시트에서 기존 일정에 장소를 연결할 수 있다(이름 유지 선택 가능). 출처는 "Google Maps" 텍스트. `@types/google.maps` 3.66.7(dev). `@vis.gl/react-google-maps`는 11단계에서 지도와 함께 넣는다. 실제 키로 확인했다. 검색 한 번은 자동완성 1회 + 상세 1회였고, 상세 요청도 `ko`와 같은 세션 토큰으로 갔다. 일본 주소는 한국어로 요청해도 "1-1 Ōsakajō, Chuo Ward, Osaka, 540-0002 일본"처럼 로마자가 섞여 온다(Google 데이터 그대로).
- 2026-11-03: Google 약관을 지키기로 함(사용자 결정). Google에서 받은 주소·좌표에 받은 시각을 두고, 7일이 지나면 온라인일 때 다시 받고, 30일이 지나면 지운다. 이름은 일정·여행 제목으로 보고 남긴다. Dexie v3, 백업 v3(이전 데이터의 받은 시각은 `createdAt`). 갱신·삭제는 `updatedAt`을 바꾸지 않는다. 실제 API로 확인함(8일 지난 장소를 열자 `GetPlace` 1회로 주소·좌표·받은 시각만 바뀜).
- 2026-11-03: 카테고리 이모지를 모두 뺌(사용자 요청). 지출 폼의 카테고리 선택은 동그라미 체크(`ChoiceGroup`의 `appearance="checks"`, 카테고리에만 씀). 가계부 목록은 왼쪽 이모지 칸을 없애고, 메모가 제목인 지출은 아랫줄 맨 앞에 카테고리 이름을 둔다(메모가 없으면 제목이 곧 카테고리라 반복하지 않음). 지출 요약의 카테고리별 줄은 이름만.
- 2026-11-03: 11단계(지도) 완료. 날짜 탭의 일정 목록 위에 지도 카드(번호 마커, 순서대로 직선, 구간별 "1 → 3 길찾기" 링크)를 둔다. 보관함에는 지도가 없다. 계획했던 `@vis.gl/react-google-maps`는 쓰지 않고 로더(`importMapsLibrary`)와 Maps JS API로 직접 그린다. 필요한 건 지도 하나와 마커·선뿐이고, @vis.gl의 로더는 실패한 로드를 다시 시도하지 않으며, 그 `<Map>`은 우리 로더가 먼저 넣은 `importLibrary`를 보면 로드가 끝난 것으로 본다. Map ID가 없으면 `DEMO_MAP_ID`. 길찾기 링크는 이름 + place ID로 만든다(좌표를 넣으면 Google 지도가 ID를 무시하고 근처 가게로 잡는 것을 실제로 확인함). 실제 키로 확인함(오류 없음, 검색 3번 = 자동완성 3 + 상세 3).
- 2026-11-03: 12단계(설정 + 백업) 완료. 설정 화면에 백업 내보내기(파일로 저장, Safari에서는 공유도)와 가져오기를 둔다. 가져오기 시트가 확인 단계를 겸하고(병합 기본, 미리보기 후 실행), 덮어쓰기에 확인 창을 한 번 더 두지 않는다. 마지막으로 내보낸 시각을 기기에 두고 보여준다(백업을 잊지 않게). 가져온 뒤에는 데이터 스토어를 비워 화면이 다시 읽게 한다. 기기 저장소 접근은 `lib/deviceStorage.ts`로 모음. "설치 안내 다시 보기"는 13단계에서 설정 화면에 넣는다. 실제 브라우저로 확인함(내려받은 파일을 다시 가져오면 "유지"만 나옴, 다른 기기의 백업 병합, 잘못된 파일 안내).
- 2026-11-03: 트리플 같은 여행 앱 느낌으로 화면을 바꿈(사용자 요청: 여행 목록, 여행 상세 위쪽, 일정, 가계부 모두, 사진 없이). 트리플의 로고·아이콘·사진·고유 색은 쓰지 않고 배치와 느낌만 참고했다. 도시별 그라데이션 표지, 큰 다음 여행 카드, 투명 → 흰 헤더, 밑줄 탭, 번호를 잇는 일정 타임라인, 장소 사이 직선 거리·길찾기(지도 아래 길찾기 칩은 없앰), 회색 가계부 요약 카드. 실제 브라우저에서 드래그 정렬이 그대로 되는 것을 확인함.
- 2026-11-03: 표지 사진을 넣음(사용자 결정: 폰 사진첩에서 직접 고른 사진. Google 장소 사진은 띄울 때마다 요금이 들고, 약관상 저장할 수 없어 오프라인에서 안 보여서 뺐다).
  - 사진은 기기에서 JPEG로 줄여(긴 변 1600px + 192px 썸네일) 여행 기록 안에 `data:` URL로 둔다. 별도 테이블보다 단순하고, 여행과 함께 병합·백업된다.
  - Dexie v4, 백업 v4. 사진이 없으면 지금처럼 도시 그라데이션이다.
  - 실제 브라우저(Chromium)로 확인함: 4032×3024 사진이 1600×1200으로 0.1초 안에 줄어듦, 회전 정보가 있는 사진이 똑바로 섬, 투명 PNG는 흰 바탕, 백업 파일에 사진이 들어감, 흰 사진 위 글씨 대비 5.1:1 이상.
- 2026-11-03: 13단계(PWA·오프라인·iOS 설치 안내) 완료.
  - `vite-plugin-pwa` 2.0.0(1.3.0과 차이는 에셋 생성기 2.x 허용뿐), generateSW, autoUpdate.
  - 업데이트는 강제 새로고침 없이 다음 실행에 적용한다(가상 모듈 없이 등록만 하는 스크립트).
  - 런타임 캐시는 두지 않는다(구글 약관, 환율은 앱이 직접 관리).
  - 아이콘은 파란 배경에 흰 지도 핀(`public/favicon.svg`)이다.
  - iOS 안내는 모달 대신 목록 위 배너로 했다(처음 연 사람의 화면을 막지 않게). 닫으면 끝이고, 설정에서 다시 볼 수 있다.
  - 실제 브라우저(Chromium, `vite preview`)로 확인함:
    - Chromium 기준 설치 가능 오류 없음, 오프라인으로 다시 열기·여행 주소로 바로 열기·일정 추가 됨.
    - 캐시에는 우리 주소의 파일만 있음.
    - 폼에 입력하는 중에 새 버전이 설치돼도 새로고침되지 않음.
    - iPhone UA에서 배너·안내·설정 구역이 보이고, 홈 화면 앱에서는 안 보임.
  - 실제 iPhone은 아직 확인하지 못함. (15단계에서 배포 주소로 확인함)
- 2026-11-04: 사진 없는 표지의 색을 도시 이름(도시가 비면 여행 이름) 대신 여행 id로 고름(사용자 요청: 새 여행 폼에서 한 글자 칠 때마다 색이 바뀌지 않게, 무작위로 하나 고정).
  - 새 여행 폼은 id를 미리 만들어 넘긴다(`trips.create(input, { id })`).
  - 같은 도시라도 여행마다 색이 다르다. 기존 여행의 색은 이 변경으로 한 번 바뀐다.
  - 저장 형식은 그대로다(Dexie·백업 버전 변경 없음).
- 2026-11-04: 로그인(구글·카카오)과 카톡 링크로 하는 친구 초대·참여를 계획에 넣음(사용자 요청).
  - 서버가 필요해서 MVP 다음 단계(15~19)로 둔다. "MVP 범위 밖"에서 로그인·동기화·공유·동행자 계정 연동을 뺐다.
  - Supabase + Vercel을 추천했다. 추천 방식은 15단계를 시작할 때 확정한다("로그인·친구 초대 계획").
  - 배포는 Vercel 가입이 필요해서 14단계(다듬기)와 나눠 15단계로 뒀다.
- 2026-11-04: 14단계(다듬기) 완료.
  - 여행 목록 말고는 화면을 처음 열 때 코드를 받는다. 첫 화면에 받는 파일이 625KB에서 468KB로 줄었고, 500KB 경고가 없어졌다.
  - 업데이트로 지워진 옛 조각을 부르면, 열려던 화면으로 한 번 새로고침한다. 계속 실패하면 오류 화면("다시 시도")을 띄운다.
  - 한글 설명이 음절 단위로 끊기지 않게 `EmptyState` 설명에 `break-keep`을 넣었다.
- 2026-11-04: 일정에서 지출 보기·추가(사용자 선택).
  - 일정 편집 시트에 그 일정의 지출과 합계, "지출 추가"를 둔다. 카드에는 아무것도 더하지 않았다(타임라인을 깔끔하게).
  - 시트에서 고친 내용은 지출 화면으로 넘어가기 전에 저장한다. 확인 창으로 묻는 대신 잃지 않는 쪽을 골랐다.
  - 실제 브라우저로 확인함: 시트 → "지출 추가"(일정·날짜가 채워짐) → 저장하면 그 날짜의 일정으로 돌아오고, 시트에 두 건과 합계가 보인다.
- 2026-11-04: 15단계(배포) 시작.
  - GitHub에 처음 올렸다(공개 저장소). 올리기 전에 기록 전체의 커밋 이메일을 GitHub가 주는 대신 쓰는 주소로 바꿨다(사용자 선택: GitHub에서 이메일을 숨겨 둠). 내용·날짜·메시지는 그대로다.
  - `vercel.json`: 화면 주소는 `index.html`로 열고, `/assets/`는 빼서 없는 조각은 404로 둔다. `/assets/`는 1년 캐시.
  - 배포 주소는 https://travel-go-lemon.vercel.app. 지도 키의 웹사이트 제한에 이 주소를 넣었다(localhost 두 개는 그대로).
  - 지도 키의 하루 사용량 상한은 결제 계정이 무료 체험판이라 걸 수 없었다. 체험판은 자동 청구가 없으니 유료로 바꿀 때 건다.
  - Map ID를 만들어 `DEMO_MAP_ID` 대신 쓴다(`.env.local`, Vercel 환경 변수 Config).
  - 사용자가 실제 아이폰에서 배포 주소를 홈 화면에 추가해 써 봤다(잘 됨). 15단계 완료.
- 2026-11-04: 로고와 시작 화면(사용자 요청).
  - 로고의 지도 핀을 비행기로 바꿨다. 파란 판과 가운데 동그란 구멍은 그대로다. 45° 기울여 이륙하는 모양이 똑바로 선 것(장난감 로켓처럼 보임)보다 나아서 골랐다.
  - 앱을 열면 아이콘과 "travel GO"가 약 1초 보이는 시작 화면을 넣었다. 새로고침에는 안 나온다.
  - 이미 홈 화면에 추가한 아이폰은 아이콘을 추가할 때 저장해 두므로, 새 아이콘을 보려면 지우고 다시 추가해야 한다.
- 2026-11-04: 16단계(로그인) 시작.
  - "로그인·친구 초대 계획"의 방식을 추천안 그대로 확정했다. Supabase는 무료 플랜으로 시작한다(사용자 선택).
  - 설정 맨 위에 계정 구역(카카오·구글 로그인, 로그아웃)을 만들었다. Supabase 코드는 설정 화면에서 처음 쓸 때 받는다.
  - Supabase의 카카오 로그인은 이메일을 늘 요청한다. 그래서 카카오 앱을 개인 개발자 비즈 앱으로 바꾸고 이메일을 선택 동의로 둔다(계획의 방식 참고).
- 2026-11-04: 로그인을 설정에서 빼서 계정 화면(`/account`)으로 옮겼다(사용자 요청).
  - 여행 목록의 톱니바퀴 옆에 사람 아이콘을 둔다.
  - 화면은 사용자가 보여 준 음악 앱처럼 만들었다. 프로필 줄에 "로그인해 주세요"와 알약 "로그인"이 있고, 알약을 누르면 카카오·구글을 고르는 시트가 열린다. 로그인하면 같은 줄에 사진·이름·로그아웃이 나온다.
  - 머리줄 아이콘은 로그인 여부와 상관없이 같은 사람 그림이다. 사진을 띄우려면 첫 화면에서 Supabase 코드를 받아야 해서 미뤘다(17단계 동기화에서 어차피 시작할 때 받게 되면 다시 본다).
  - Supabase 프로젝트를 만들고 구글 로그인을 켰다. 사용자가 실제 구글 계정으로 로그인해 봤다. 카카오는 다음 날 켰다.
- 2026-11-05: 카카오 로그인을 켰다.
  - 카카오 앱을 개인 개발자 비즈 앱으로 바꿨다. 동의항목은 닉네임 필수, 프로필 사진·이메일 선택이다.
  - 사용자가 개발 서버의 계정 화면에서 카카오와 구글로 로그인해 봤다(됨).
  - 16단계를 배포했다(Vercel 환경 변수에 Supabase 두 값을 넣고). 배포 주소에서 로그인 버튼이 카카오·구글 로그인 화면까지 가는 것을 확인했다.
  - 사용자가 실제 아이폰의 Safari와 홈 화면 앱에서 카카오로 로그인해 봤다(됨). 16단계 완료.
- 2026-11-05: 17단계(서버 저장·동기화)를 시작했다.
  - 로그아웃하면 이 기기의 여행을 지우고, 같은 계정으로 다시 로그인하면 서버에서 돌려받는다(사용자 선택).
  - 서버는 기록을 앱 JSON 그대로 두는 표(`records`)와 쓰기 함수 `sync_push`다. 모델이 바뀔 때마다 서버 표를 고치지 않으려는 것이다. 들어오는 기록은 기기가 백업과 같은 규칙으로 검사한다.
  - 서버 SQL은 PGlite(WASM Postgres)로 테스트한다. 사용자가 SQL을 실행하기 전에 규칙을 확인할 수 있다.
  - 사용자가 Supabase에 SQL을 실행했고, 개발 서버에서 창 두 개로 동기화를 확인했다. 배포했다.
  - 사용자가 배포 주소에서 실제 아이폰과 PC로 확인했다(됨). 17단계 완료.
- 2026-11-05: 18단계(친구 초대·참여)를 시작했다.
  - 15단계에 정한 방식 그대로다. 링크는 7일, 여러 명, 끊을 수 있음. 참여한 사람도 고칠 수 있고, 삭제와 초대 관리는 만든 사람만 한다.
  - 친구는 "나"를 자기로 보게 되므로, 처음 초대할 때 만든 사람의 "나"에 이름을 붙이고 계정을 잇는다. 동행자와 계정의 연결은 동행자 기록에 둔다(`accountId`). 서버 표를 따로 두지 않아 동기화 규칙을 그대로 쓴다.
  - 참여한 여행은 그 여행의 기록을 처음부터 받는다. 나가거나 내보내지면 그 사람의 기기에서 지운다.
  - 실시간 반영은 Postgres Changes로 "바뀌었다"는 알림만 받고 평소처럼 동기화한다. 열 명 남짓에는 충분하다(Supabase는 대규모에 Broadcast를 권함).
  - 카카오톡 공유는 SDK의 기본 템플릿(`sendDefault`)을 쓴다. 키가 없거나 실패해도 공유·링크 복사로 보낼 수 있다.
  - 사용자가 Supabase에 SQL을 실행하고 카카오 앱(JavaScript 키, 도메인)을 설정했다. 개발 서버에서 창 두 개로 확인한 뒤 배포했다.
  - 사용자가 배포 주소에서 실제 아이폰 홈 화면 앱으로 카카오톡 카드를 보내고 참여해 봤다(됨). 18단계 완료.
- 2026-11-05: 18단계 뒤 사용자 요청 8가지를 했다.
  - 환율: 앱이 채우는 값은 소수점 둘째 자리(1 미만은 유효숫자 4자리, 베트남 동 때문)로 보이고 그대로 쓴다. 직접 입력한 값은 그대로 둔다.
  - 환율 출처 표시: 무료 API의 조건이라 지우면 약관 위반이다. 작게 옮기기, 키 받는 요금제 중에서 사용자가 "지금처럼 두기"를 골랐다.
  - 옆으로 밀기: 아이폰에서 오른쪽 끝을 밀면 앞으로 가서 떠난 화면이 다시 열렸다. 앞으로 가기를 막고, 뒤로 가기만 둔다.
  - 항공편: 편명으로 출발·도착을 채우려면 정보 서비스가 필요하다. AeroDataBox 무료 요금제를 서버 함수로 연결했다(사용자 선택). 키는 사용자가 RapidAPI에서 받아 Vercel과 `.env.local`에 둔다.
  - 다녀온 나라: 앱에 넣은 세계 지도에서 체크하고, 계정에 저장한다(사용자 선택: 기기에만 두기 대신). 서버 SQL이 하나 더 생겼다.
  - 여행이 하나뿐이면 큰 카드 대신 목록 줄로 보여준다.
  - 가계부는 "나" 대신 이름으로 보여준다. 로그인하면 내 여행의 "나"가 로그인 이름이 되고, 동행자 시트의 "나" 표시를 없앴다.
  - 친구가 참여하면 따로 동행자를 추가하지 않아도 가계부에 들어간다. 같은 이름이 있으면 그 사람으로 잇고, 누군지 모를 사람이 있을 때만 묻는다(닫으면 새로 추가).
  - 백업은 6판(다녀온 나라)이 됐다. 동기화 기록의 `format`은 5 그대로라서, 아직 업데이트하지 않은 기기도 계속 동기화된다.
- 2026-11-05: 배포한 뒤 사용자가 아이폰 메인에서 오른쪽 끝을 밀면 떠난 화면(새 여행 폼)이 미끄러져 들어오는 것을 보여 줬다.
  - 앞으로 가기는 막았지만, 아이폰은 앞 기록이 있으면 밀기 그림을 보여 준다. 웹앱이 이 밀기를 끌 방법은 없다(WebKit 코드로 확인).
  - 그래서 뒤로 간 뒤 앞 기록을 지금 화면의 복사본으로 바꾼다. 홈 화면 앱의 메인은 앞 기록이 아예 없게 한다.
  - 대가로 메인에서 왼쪽 끝을 밀면 같은 메인이 한 번 보인다.

- 2026-11-05: 18단계 뒤 요청 3가지를 했다(사용자 선택 4가지).
  - 새 여행에서 가는 나라를 고른다(여러 개, 지나가는 나라도). 도시도 여러 개다(사용자 선택: 하나 그대로, 비워도 되게 중에서). 여행 기록 모양이 바뀌어 Dexie v8, 백업 7판, 동기화 형식 7이 됐다. 서버 SQL이 하나 더 있다.
  - 고른 나라는 여행이 시작되면 다녀온 나라에 자동으로 칠한다(사용자 선택). 직접 뺀 나라는 그대로 둔다.
  - 새 여행 폼에 항공편 칸을 넣었다(사용자 요청). 찾은 편의 도착 나라를 더하고, 만들 때 일정에 넣는다.
  - 기간은 하나의 달력에서 시작일과 종료일을 고른다. 달이 아래로 이어지는 모양이다(사용자 선택: 한 달씩 넘기기 대신).
  - 다녀온 나라는 나라마다 도·주·현 지도로도 칠한다(사용자 선택). 도시는 지도에서 점이라 면이 되는 다음 단위로 했고, 지도는 Natural Earth로 만들어 그 나라를 열 때 받는다.
  - 배포했다. 배포 주소에서 새 여행 만들기, 나라 저절로 칠하기, 지역 지도(오프라인 포함)를 확인했다.
- 2026-11-05: 배포한 뒤 사용자 요청 2가지를 했다.
  - 여행이 둘일 때 맨 위만 큰 카드인 것을 줄로 바꿔 달라고 했다. 셋 이상이어도 같은 모양일 것이라 큰 카드를 아예 없앴다(개수와 상관없이 모두 줄).
  - 베트남 지역에 나트랑·호이안, 호주에 시드니·멜버른이 없다고 했다. 지역은 도·주 단위 그대로 두고, 지역마다 이름난 곳을 붙여 보여 주고 그 이름으로 찾게 했다. 표기가 달라도 찾게 했다(호치민, 푸켓).
  - 지역 이름을 살펴보다가 Natural Earth의 틀린 이름(베트남 성 셋, 잘린 이름, 겹치는 이름)을 고쳤고, 싱가포르의 지역 지도를 뺐다.
- 2026-11-06: 도시 이름으로 찾아져야 한다고 했다(사용자 요청: 일본에 삿포로가 있는지, 프랑스 파리, 이탈리아 로마).
  - 손으로 고른 이름난 곳(약 60개 나라)만으로는 모자라서, Natural Earth의 도시 7,342곳(한국어 이름 포함)을 더했다.
  - 나라 찾기, 지역 찾기, 새 여행의 나라 고르기가 모두 도시 이름으로 찾는다. 다녀온 나라에서 찾은 도시의 "지역 ›"은 그 도시가 든 지역을 바로 보여 준다.
  - 칠하는 단위는 그대로 나라와 도·주다(도시는 지도에서 점이라서). 도시로 찾은 줄을 체크하면 다녀온 나라 화면에서는 그 나라, 지역 화면에서는 그 도시가 든 지역이 칠해진다.
  - 비슷한 소리 찾기(푸켓 → 푸껫)는 적힌 그대로 찾은 것이 없을 때만 한다. 처음부터 하면 파리가 바리를, 교토가 도쿄도를 찾았다.
- 2026-11-06: 편명만 들어간 일정을 제대로 된 항공편으로 바꾸는 방법을 물었다. 지우고 다시 넣으면 이어 둔 지출 연결이 풀려서, 일정 편집 시트에서 그 일정을 바로 채우게 했다(사용자 선택).
