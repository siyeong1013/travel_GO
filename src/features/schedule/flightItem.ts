import type {
  FlightStop,
  LocalDate,
  LocalTime,
  PlaceSnapshot,
  ScheduleFlight,
  ScheduleItem,
} from '@/data/models';
import { AIRPORT_CODE } from '@/data/rules/validation';
import { diffDays } from '@/lib/dates';
import { type FlightEnd, type FlightLeg, parseFlightNumber } from '@/lib/flights';

// Korean names of airports people from Korea often fly through. Others go by the flight data's
// (English) short name.
const AIRPORTS: Record<string, string> = {
  ICN: '인천', GMP: '김포', PUS: '김해', CJU: '제주', TAE: '대구', CJJ: '청주', KWJ: '광주',
  MWX: '무안', YNY: '양양', USN: '울산', RSU: '여수', KUV: '군산', HIN: '사천', KPO: '포항',
  NRT: '나리타', HND: '하네다', KIX: '간사이', ITM: '이타미', NGO: '나고야', FUK: '후쿠오카',
  CTS: '삿포로', OKA: '오키나와', KOJ: '가고시마', KMJ: '구마모토', OIT: '오이타', NGS: '나가사키',
  HIJ: '히로시마', TAK: '다카마쓰', MYJ: '마쓰야마', KMQ: '고마쓰', SDJ: '센다이', AOJ: '아오모리',
  SHI: '미야코', ISG: '이시가키', UBJ: '야마구치', FSZ: '시즈오카', KKJ: '기타큐슈',
  PEK: '베이징', PKX: '베이징 다싱', PVG: '상하이 푸둥', SHA: '상하이 훙차오', CAN: '광저우',
  SZX: '선전', HKG: '홍콩', MFM: '마카오', TPE: '타이베이', TSA: '타이베이 쑹산', KHH: '가오슝',
  RMQ: '타이중', TAO: '칭다오', DLC: '다롄', SHE: '선양', YNJ: '옌지', CTU: '청두', XIY: '시안',
  ULN: '울란바토르', BKK: '방콕', DMK: '방콕 돈므앙', HKT: '푸껫', CNX: '치앙마이',
  SGN: '호찌민', HAN: '하노이', DAD: '다낭', CXR: '나트랑', PQC: '푸꾸옥', DLI: '달랏',
  MNL: '마닐라', CEB: '세부', KLO: '보라카이', CRK: '클라크', BOH: '보홀', SIN: '싱가포르',
  KUL: '쿠알라룸푸르', BKI: '코타키나발루', DPS: '발리', CGK: '자카르타', VTE: '비엔티안',
  PNH: '프놈펜', REP: '시엠레아프', RGN: '양곤', KTM: '카트만두', DEL: '델리', MLE: '몰디브',
  GUM: '괌', SPN: '사이판', ROR: '팔라우', HNL: '호놀룰루', OGG: '마우이', SYD: '시드니',
  MEL: '멜버른', BNE: '브리즈번', AKL: '오클랜드', LAX: '로스앤젤레스', SFO: '샌프란시스코',
  JFK: '뉴욕', EWR: '뉴어크', SEA: '시애틀', LAS: '라스베이거스', ORD: '시카고', ATL: '애틀랜타',
  IAD: '워싱턴', DFW: '댈러스', YVR: '밴쿠버', YYZ: '토론토', LHR: '런던', CDG: '파리',
  FCO: '로마', MXP: '밀라노', VCE: '베네치아', FRA: '프랑크푸르트', MUC: '뮌헨', AMS: '암스테르담',
  ZRH: '취리히', VIE: '빈', PRG: '프라하', BUD: '부다페스트', BCN: '바르셀로나', MAD: '마드리드',
  LIS: '리스본', IST: '이스탄불', ATH: '아테네', HEL: '헬싱키', CPH: '코펜하겐', DXB: '두바이',
  DOH: '도하', AUH: '아부다비',
};

/** `인천`, or the flight data's name (`Incheon`). */
export function airportName(end: FlightEnd): string {
  return (end.iata && AIRPORTS[end.iata]) || end.name;
}

// Korean names of airlines people from Korea often fly, by the code their flight numbers start
// with. Others go by the flight data's (English) name.
const AIRLINES: Record<string, string> = {
  KE: '대한항공', OZ: '아시아나항공', '7C': '제주항공', LJ: '진에어', TW: '티웨이항공',
  BX: '에어부산', RS: '에어서울', ZE: '이스타항공', YP: '에어프레미아', RF: '에어로케이',
  JL: '일본항공', NH: '전일본공수', MM: '피치항공', GK: '젯스타 재팬', CA: '중국국제항공',
  MU: '중국동방항공', CZ: '중국남방항공', FM: '상하이항공', SC: '산둥항공', CX: '캐세이퍼시픽',
  UO: '홍콩익스프레스', HX: '홍콩항공', NX: '마카오항공', CI: '중화항공', BR: '에바항공',
  JX: '스타럭스항공', IT: '타이거에어 타이완', SQ: '싱가포르항공', TR: '스쿠트', TG: '타이항공',
  VZ: '타이 비엣젯', FD: '타이 에어아시아', VN: '베트남항공', VJ: '비엣젯항공', QH: '뱀부항공',
  PR: '필리핀항공', '5J': '세부퍼시픽', MH: '말레이시아항공', AK: '에어아시아',
  D7: '에어아시아 X', GA: '가루다인도네시아', OM: '몽골항공', TK: '터키항공', PC: '페가수스항공',
  EK: '에미레이트항공', QR: '카타르항공', EY: '에티하드항공', LH: '루프트한자',
  AF: '에어프랑스', KL: 'KLM 네덜란드항공', BA: '영국항공', AY: '핀에어', LO: 'LOT 폴란드항공',
  LX: '스위스항공', OS: '오스트리아항공', AZ: 'ITA 항공', DL: '델타항공', UA: '유나이티드항공',
  AA: '아메리칸항공', AC: '에어캐나다', HA: '하와이안항공', QF: '콴타스항공', JQ: '젯스타',
  NZ: '에어뉴질랜드', ET: '에티오피아항공',
};

/** `대한항공` for KE723, or the flight data's name (`Korean Air`); null when there is none. */
export function airlineName({
  number,
  airline,
}: Pick<FlightLeg, 'number' | 'airline'>): string | null {
  const code = /^([A-Z\d]{2})\d/.exec(number)?.[1];
  return (code && AIRLINES[code]) || airline;
}

/**
 * The flight by name, as its item is named: `KE723 인천 → 간사이` (it was the name of a flight's
 * item before its airports were items, then the top of the memo of the one it left from).
 */
export function flightTitle(leg: FlightLeg): string {
  return `${leg.number} ${airportName(leg.departure)} → ${airportName(leg.arrival)}`;
}

/** The days after it leaves (local dates) that a flight lands; 0 when the data doesn't say. */
function landingDays({ departure, arrival }: FlightLeg): number {
  return departure.date && arrival.date
    ? diffDays(departure.date as LocalDate, arrival.date as LocalDate)
    : 0;
}

/**
 * A landing time as airlines write it: `10:55`, and on another day than it leaves `06:30(+1일)`
 * (over the date line eastward, the day before: `(-1일)`).
 */
const withDays = (time: string, days: number) =>
  days === 0 ? time : `${time}(${days > 0 ? '+' : ''}${days}일)`;

/** When it lands, local, as airlines write it (`withDays`); '' when the data doesn't say. */
function landingTime(leg: FlightLeg): string {
  const { time } = leg.arrival;
  return time ? withDays(time, landingDays(leg)) : '';
}

/**
 * Where a flight leaves from and lands, with the local times, as airlines write it:
 * `이스탄불(IST) 21:55`, `인천(ICN) 13:55(+1일)`.
 */
export function flightRoute(leg: FlightLeg): [departure: string, arrival: string] {
  const airport = (end: FlightEnd) => (end.iata ? `${airportName(end)}(${end.iata})` : airportName(end));
  const { departure } = leg;
  return [
    [airport(departure), departure.time].filter(Boolean).join(' '),
    [airport(leg.arrival), landingTime(leg)].filter(Boolean).join(' '),
  ];
}

const at = (end: FlightEnd) =>
  end.terminal ? `${airportName(end)} T${end.terminal.replace(/^T/i, '')}` : airportName(end);

/** Where it leaves from and lands, up to the landing time: `인천 T2 출발 → 간사이 T1 도착`. */
function routeHead(leg: FlightLeg): string {
  return `${at(leg.departure)} 출발 → ${at(leg.arrival)} 도착`;
}

/** The airport as its item's place shows it: `간사이 공항 (KIX)`. */
export function airportPlaceName(end: FlightEnd): string {
  const name = `${airportName(end)} 공항`;
  return end.iata ? `${name} (${end.iata})` : name;
}

/** What goes in the schedule for a flight. */
export interface FlightItem {
  place: PlaceSnapshot;
  time: LocalTime | null;
  memo: string;
  flight: ScheduleFlight | null;
}

/**
 * An airport as an item's place: the flight data's, not Google's (no place ID, its point, nothing
 * to expire).
 */
function airportPlace(end: FlightEnd): PlaceSnapshot {
  const { location } = end;
  return { placeId: null, name: airportPlaceName(end), address: null, location, fetchedAt: null };
}

/** A flight found, as its item keeps it (`ScheduleItem.flight`). */
export function scheduleFlight(leg: FlightLeg): ScheduleFlight {
  const stop = (end: FlightEnd): FlightStop => ({
    code: end.iata && AIRPORT_CODE.test(end.iata) ? end.iata : null,
    name: airportName(end),
    time: end.time,
    terminal: end.terminal,
  });
  return {
    number: leg.number,
    airline: leg.airline,
    departure: stop(leg.departure),
    arrival: { ...stop(leg.arrival), dayOffset: landingDays(leg) },
  };
}

/** The flight's own item, between its airports: named by it, at its departure time. */
export function flightItem(leg: FlightLeg): FlightItem {
  const name = flightTitle(leg);
  return {
    place: { placeId: null, name, address: null, location: null, fetchedAt: null },
    time: leg.departure.time,
    memo: '',
    flight: scheduleFlight(leg),
  };
}

/**
 * The items a flight adds, one after the other on its day: the airport it leaves from, at its
 * departure time; the flight (`flightItem`); then the airport it lands at, at its landing time.
 */
export function flightItems(
  leg: FlightLeg,
): [departure: FlightItem, flight: FlightItem, arrival: FlightItem] {
  return [
    { place: airportPlace(leg.departure), time: leg.departure.time, memo: '', flight: null },
    flightItem(leg),
    { place: airportPlace(leg.arrival), time: leg.arrival.time, memo: '', flight: null },
  ];
}

/** The item of a flight not looked up: its number alone, to fill in later from its edit sheet. */
export function flightNumberItem(number: string): FlightItem {
  return {
    place: { placeId: null, name: number, address: null, location: null, fetchedAt: null },
    time: null,
    memo: '',
    flight: null,
  };
}

/**
 * The flight an item is named for: by its number alone (`KE723`, as typed), or as a found flight
 * names it (`KE723 인천 → 간사이`); null for other names.
 */
export function flightNumberOf(name: string): string | null {
  const title = /^(\S+) .+ → .+$/.exec(name.trim());
  return parseFlightNumber(title ? title[1]! : name);
}

/**
 * Whether an item is a flight rather than a place: one looked up (`flight`), or named by its
 * flight alone (`KE723`, `KE723 인천 → 간사이`) with no place found for it. The list shows a plane
 * for it instead of a number.
 */
export function isFlightItem({ place, flight }: Pick<ScheduleItem, 'place' | 'flight'>): boolean {
  return (
    flight !== null || (!place.placeId && !place.location && flightNumberOf(place.name) !== null)
  );
}

/**
 * The flight as its card heads it, with the time it leaves (the item's, which can be edited):
 * `ICN 09:00 → KIX 10:55`, `… ICN 00:40(+1일)`. Airports without a code go by name.
 */
export function flightHeading(flight: ScheduleFlight, time: LocalTime | null): string {
  const end = (stop: FlightStop, at: string | null) =>
    [stop.code ?? stop.name, at].filter(Boolean).join(' ');
  const { arrival } = flight;
  const landing = arrival.time && withDays(arrival.time, arrival.dayOffset);
  return `${end(flight.departure, time)} → ${end(arrival, landing)}`;
}

/** Under the heading: the airline, the number, and where to go: `대한항공 · KE723 · T2 출발`. */
export function flightDetails(flight: ScheduleFlight): string {
  const terminal = flight.departure.terminal;
  return [airlineName(flight), flight.number, terminal && `${terminalText(terminal)} 출발`]
    .filter(Boolean)
    .join(' · ');
}

/** `T2` for the data's `2` or `T2`. */
const terminalText = (terminal: string) => `T${terminal.replace(/^T/i, '')}`;

/** Where it leaves from and lands, with the terminals: `인천 T2 출발 → 간사이 T1 도착`. */
export function flightWay({ departure, arrival }: ScheduleFlight): string {
  const at = (stop: FlightStop) =>
    stop.terminal ? `${stop.name} ${terminalText(stop.terminal)}` : stop.name;
  return `${at(departure)} 출발 → ${at(arrival)} 도착`;
}

/**
 * An item's memo without what the app wrote in it about this flight before the flight was an item
 * of its own: the memo of the airport it left from (`KE723 인천 → 간사이 · Korean Air` and the line
 * under it), or the one line before that (`Korean Air · 인천 T2 출발 → 간사이 T1 도착 다음 날 06:30`).
 * What else was written stays.
 */
export function withoutFlightMemo(memo: string, leg: FlightLeg): string {
  const title = flightTitle(leg);
  const route = routeHead(leg);
  const oneLine = leg.airline ? `${leg.airline} · ${route}` : route;
  const lines = memo.split('\n');
  const rest = lines.filter(
    (line, i) =>
      !line.startsWith(title) &&
      !line.startsWith(oneLine) &&
      // Where it leaves and lands, under its name.
      !(i > 0 && lines[i - 1]!.startsWith(title) && line.startsWith(route)),
  );
  return rest.length === lines.length ? memo : rest.join('\n').trim();
}
