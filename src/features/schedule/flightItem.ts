import type { LocalDate, LocalTime } from '@/data/models';
import { diffDays } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import type { FlightEnd, FlightLeg } from '@/lib/flights';

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

/** The schedule item's name: `KE723 인천 → 간사이`. */
export function flightTitle(leg: FlightLeg): string {
  return `${leg.number} ${airportName(leg.departure)} → ${airportName(leg.arrival)}`;
}

/** When it lands, against the day it leaves: `10:55`, `다음 날 06:30`, `12.3 (목) 06:30`. */
export function arrivalText(leg: FlightLeg): string {
  const { date, time } = leg.arrival;
  if (!time) return '';
  const from = leg.departure.date;
  if (!date || !from || date === from) return time;
  return diffDays(from as LocalDate, date as LocalDate) === 1
    ? `다음 날 ${time}`
    : `${formatDate(date as LocalDate)} ${time}`;
}

const at = (end: FlightEnd) =>
  end.terminal ? `${airportName(end)} T${end.terminal.replace(/^T/i, '')}` : airportName(end);

/** The item's memo: `대한항공 · 인천 T2 출발 → 간사이 T1 도착 10:55`. */
export function flightMemo(leg: FlightLeg): string {
  const arrival = arrivalText(leg);
  const route = `${at(leg.departure)} 출발 → ${at(leg.arrival)} 도착${arrival ? ` ${arrival}` : ''}`;
  return leg.airline ? `${leg.airline} · ${route}` : route;
}

/** The item a flight adds: on its day, at its departure time. */
export function flightItem(leg: FlightLeg): { name: string; time: LocalTime | null; memo: string } {
  return { name: flightTitle(leg), time: leg.departure.time, memo: flightMemo(leg) };
}
