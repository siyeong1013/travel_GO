import type { LocalDate, LocalTime, PlaceSnapshot } from '@/data/models';
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

/**
 * The flight, as its memo starts: `KE723 인천 → 간사이` (a flight's item was named so before its
 * airports were items).
 */
export function flightTitle(leg: FlightLeg): string {
  return `${leg.number} ${airportName(leg.departure)} → ${airportName(leg.arrival)}`;
}

/**
 * When it lands, local, as airlines write it: `10:55`, and on another day than it leaves
 * `06:30(+1일)`; '' when the data doesn't say.
 */
function landingTime(leg: FlightLeg): string {
  const { date, time } = leg.arrival;
  if (!time) return '';
  const from = leg.departure.date;
  if (!date || !from || date === from) return time;
  const days = diffDays(from as LocalDate, date as LocalDate);
  // Over the date line eastward, it lands the day before.
  return `${time}(${days > 0 ? '+' : ''}${days}일)`;
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

/**
 * The memo of the airport a flight leaves from, two lines to fit its card: the flight
 * (`KE723 인천 → 간사이 · Korean Air`), then where it leaves and lands
 * (`인천 T2 출발 → 간사이 T1 도착 10:55`, `… 도착 06:30(+1일)` on another day).
 */
export function flightMemo(leg: FlightLeg): string {
  const title = leg.airline ? `${flightTitle(leg)} · ${leg.airline}` : flightTitle(leg);
  const landing = landingTime(leg);
  return `${title}\n${landing ? `${routeHead(leg)} ${landing}` : routeHead(leg)}`;
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
}

/**
 * An airport as an item's place: the flight data's, not Google's (no place ID, its point, nothing
 * to expire).
 */
function airportPlace(end: FlightEnd): PlaceSnapshot {
  const { location } = end;
  return { placeId: null, name: airportPlaceName(end), address: null, location, fetchedAt: null };
}

/**
 * The items a flight adds, one after the other on its day: the airport it leaves from, at its
 * departure time, with the flight in its memo (`flightMemo`); then the airport it lands at, at its
 * landing time.
 */
export function flightItems(leg: FlightLeg): [departure: FlightItem, arrival: FlightItem] {
  return [
    { place: airportPlace(leg.departure), time: leg.departure.time, memo: flightMemo(leg) },
    { place: airportPlace(leg.arrival), time: leg.arrival.time, memo: '' },
  ];
}

/** The item of a flight not looked up: its number alone, to fill in later from its edit sheet. */
export function flightNumberItem(number: string): FlightItem {
  return {
    place: { placeId: null, name: number, address: null, location: null, fetchedAt: null },
    time: null,
    memo: '',
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
 * An item's memo with a found flight's memo on top: what was written stays under it, but the same
 * flight's memo from before gives way to it: landing at another time, or the one line it was
 * before (`Korean Air · 인천 T2 출발 → 간사이 T1 도착 다음 날 06:30`).
 */
export function withFlightMemo(memo: string, leg: FlightLeg): string {
  const flight = flightMemo(leg);
  if (memo.includes(flight)) return memo;
  const title = flightTitle(leg);
  const route = routeHead(leg);
  const oneLine = leg.airline ? `${leg.airline} · ${route}` : route;
  const lines = memo.split('\n');
  const rest = lines
    .filter(
      (line, i) =>
        !line.startsWith(title) &&
        !line.startsWith(oneLine) &&
        // Where it leaves and lands, under its name.
        !(i > 0 && lines[i - 1]!.startsWith(title) && line.startsWith(route)),
    )
    .join('\n');
  return rest.trim() ? `${flight}\n${rest}` : flight;
}
