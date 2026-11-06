// Makes the country maps of "다녀온 나라": one file a country in public/regions/ (fetched when its
// page opens; the service worker keeps it then) with its states, provinces or prefectures drawn
// under its cities, each city's built-up area where it has one. And
// src/features/countries/regionCountries.ts listing the countries that have one, with Korean names
// put right (NAMES). And src/features/countries/places.ts: the cities and sights people go to, by
// the region (or country) they are in, and each region's own name, to find those by (파리 → 프랑스,
// 일드프랑스).
//
// Data: Natural Earth 1:10m admin-1 states and provinces, populated places, and urban areas from
// LandScan (public domain), and PLACES below. To run it again:
//   curl -L -o admin1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
//   curl -L -o places.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places.geojson
//   curl -L -o urban.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_urban_areas_landscan.geojson
//   npm i --no-save --ignore-scripts topojson-server@3.0.1 topojson-client@3.1.0 \
//     topojson-simplify@3.0.3 d3-geo@3.1.1
//   node scripts/region-maps.mjs admin1.geojson places.geojson urban.geojson [folder holding those node_modules]
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const [source, townsSource, urbanSource, modulesArg] = process.argv.slice(2);
const require = createRequire(join(resolve(modulesArg ?? '.'), 'package.json'));
const { topology } = require('topojson-server');
const { feature, merge } = require('topojson-client');
const { presimplify, simplify, quantile } = require('topojson-simplify');
const { geoAlbersUsa, geoArea, geoCentroid, geoMercator, geoPath } = require('d3-geo');

/** The maps' size in their own units: fit in a square, then cut to what they cover. */
const SIZE = 1000;
/** About this many outline points a map keeps (fewer: smaller files, rougher shapes). */
const POINTS = 3500;
/** Regions smaller than this on their map (units²) also get a dot, to be seen and tapped. */
const DOT_AREA = 40;
/** Countries with more regions than this are left out: municipalities, not places to travel. */
const MAX_REGIONS = 100;
/**
 * Left out too: BA (Natural Earth's regions of it don't fit together) and SG (a city: its regions
 * are council districts, not places).
 */
const SKIP = new Set(['BA', 'SG']);
/** A place this far (degrees) off every region's outline is in none: coastal towns fall just out. */
const NEAR = 0.3;

const CODE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

// Countries whose admin-1 is too fine for a trip: their regions instead, with Korean names.
const GROUPS = {
  FR: [(p) => p.region_cod?.trim(), {
    'FR-ARA': '오베르뉴론알프', 'FR-BFC': '부르고뉴프랑슈콩테', 'FR-BRE': '브르타뉴',
    'FR-CVL': '상트르발드루아르', 'FR-COR': '코르시카', 'FR-GES': '그랑테스트',
    'FR-HDF': '오드프랑스', 'FR-IDF': '일드프랑스', 'FR-NOR': '노르망디', 'FR-NAQ': '누벨아키텐',
    'FR-OCC': '옥시타니', 'FR-PDL': '페이드라루아르', 'FR-PAC': '프로방스알프코트다쥐르',
    'FR-GUA': '과들루프', 'FR-GUF': '프랑스령 기아나', 'FR-MTQ': '마르티니크', 'FR-MAY': '마요트',
    'FR-LRE': '레위니옹',
  }],
  IT: [(p) => p.region_cod?.trim(), {
    'IT-21': '피에몬테', 'IT-23': '발레다오스타', 'IT-25': '롬바르디아',
    'IT-32': '트렌티노알토아디제', 'IT-34': '베네토', 'IT-36': '프리울리베네치아줄리아',
    'IT-42': '리구리아', 'IT-45': '에밀리아로마냐', 'IT-52': '토스카나', 'IT-55': '움브리아',
    'IT-57': '마르케', 'IT-62': '라치오', 'IT-65': '아브루초', 'IT-67': '몰리세', 'IT-72': '캄파니아',
    'IT-75': '풀리아', 'IT-77': '바실리카타', 'IT-78': '칼라브리아', 'IT-82': '시칠리아',
    'IT-88': '사르데냐',
  }],
  ES: [(p) => ({
    'Andalucía': 'ES-AN', 'Aragón': 'ES-AR', 'Asturias': 'ES-AS', 'Canary Is.': 'ES-CN',
    'Cantabria': 'ES-CB', 'Castilla y León': 'ES-CL', 'Castilla-La Mancha': 'ES-CM',
    'Cataluña': 'ES-CT', 'Ceuta': 'ES-CE', 'Extremadura': 'ES-EX', 'Foral de Navarra': 'ES-NC',
    'Galicia': 'ES-GA', 'Islas Baleares': 'ES-IB', 'La Rioja': 'ES-RI', 'Madrid': 'ES-MD',
    'Melilla': 'ES-ML', 'Murcia': 'ES-MC', 'País Vasco': 'ES-PV', 'Valenciana': 'ES-VC',
  })[p.region], {
    'ES-AN': '안달루시아', 'ES-AR': '아라곤', 'ES-AS': '아스투리아스', 'ES-CN': '카나리아 제도',
    'ES-CB': '칸타브리아', 'ES-CL': '카스티야이레온', 'ES-CM': '카스티야라만차',
    'ES-CT': '카탈루냐', 'ES-CE': '세우타', 'ES-EX': '에스트레마두라', 'ES-NC': '나바라',
    'ES-GA': '갈리시아', 'ES-IB': '발레아레스 제도', 'ES-RI': '라리오하', 'ES-MD': '마드리드',
    'ES-ML': '멜리야', 'ES-MC': '무르시아', 'ES-PV': '바스크', 'ES-VC': '발렌시아',
  }],
  GB: [(p) => ({ England: 'GB-ENG', Scotland: 'GB-SCT', Wales: 'GB-WLS', 'Northern Ireland': 'GB-NIR' })[p.geonunit], {
    'GB-ENG': '잉글랜드', 'GB-SCT': '스코틀랜드', 'GB-WLS': '웨일스', 'GB-NIR': '북아일랜드',
  }],
  PH: [(p) => p.region_cod?.trim(), {
    'PH-00': '마닐라 수도권', 'PH-01': '일로코스', 'PH-02': '카가얀밸리', 'PH-03': '중부 루손',
    'PH-40': '칼라바르손', 'PH-41': '미마로파', 'PH-05': '비콜', 'PH-06': '서부 비사야',
    'PH-07': '중부 비사야', 'PH-08': '동부 비사야', 'PH-09': '삼보앙가반도',
    'PH-10': '북부 민다나오', 'PH-11': '다바오', 'PH-12': '소크사르젠', 'PH-13': '카라가',
    'PH-14': '방사모로', 'PH-15': '코르딜레라',
  }],
};

// Korean names Natural Earth has wrong (its region's name for a province: VN-39 is Đồng Nai), cut
// short (AU-NT), the same for a city and the region around it, or out of date (KZ-AST). Its codes
// for Moscow are the other way round from ISO's: RU-MOS is the city.
const NAMES = {
  'VN-39': '동나이성', 'VN-53': '박깐성', 'VN-66': '흥옌성',
  'AU-NT': '노던 준주', 'AU-ACT': '오스트레일리아 수도 준주',
  'CA-NT': '노스웨스트 준주', 'CA-NU': '누나부트 준주', 'CA-YT': '유콘 준주',
  'TW-TXG': '타이중시', 'ID-JB': '서자와', 'GR-L': '남에게해', 'GR-K': '북에게해',
  'CL-RM': '산티아고 수도주', 'KZ-AST': '아스타나',
  'CN-SN': '산시성 (섬서)', 'CN-SX': '산시성 (산서)',
  'AR-B': '부에노스아이레스주', 'AR-C': '부에노스아이레스시',
  'BY-MI': '민스크주', 'BY-HM': '민스크시',
  'HR-01': '자그레브주', 'HR-21': '자그레브시',
  'HU-VE': '베스프렘주', 'HU-VM': '베스프렘시',
  'RU-MOW': '모스크바주', 'RU-MOS': '모스크바시', 'RU-ALT': '알타이 지방',
  'UA-32': '키이우주', 'UA-30': '키이우시',
  'UZ-TO': '타슈켄트주', 'UZ-TK': '타슈켄트시',
  'YE-SN': '사나주', 'YE-SA': '사나시',
  'SC-13': '그랑당스마에 구', 'TT-ETO': '동토바고', 'TT-WTO': '서토바고',
  'GY-ES': '에세퀴보제도·서데메라라',
};

// Places people go, by the region they are in (a city isn't a region: 나트랑 is in 카인호아성),
// before Natural Earth's cities: the sights and towns it doesn't have, and names as people say them
// (나트랑, which it writes 냐짱). [name, latitude, longitude]: the region is the one the point is
// in; [name, latitude, longitude, region code] where Natural Earth's outlines miss the place (small
// islands) or are too rough there.
const PLACES = {
  AR: [['이구아수 폭포', -25.6, -54.575], ['엘칼라파테', -50.338, -72.265],
    ['페리토모레노 빙하', -50.497, -73.138], ['엘찰텐', -49.332, -72.886], ['우수아이아', -54.802, -68.303],
    ['바릴로체', -41.134, -71.31]],
  AT: [['비엔나', 48.208, 16.373], ['할슈타트', 47.562, 13.649], ['인스브루크', 47.269, 11.404],
    ['그라츠', 47.071, 15.44], ['첼암제', 47.325, 12.795], ['린츠', 48.307, 14.286], ['멜크', 48.227, 15.333]],
  AU: [['시드니', -33.869, 151.209], ['멜버른', -37.814, 144.963], ['브리즈번', -27.47, 153.025],
    ['골드코스트', -28.017, 153.4], ['케언스', -16.919, 145.778], ['퍼스', -31.951, 115.861],
    ['애들레이드', -34.929, 138.601], ['울루루', -25.344, 131.037], ['다윈', -12.463, 130.846],
    ['호바트', -42.882, 147.327], ['캔버라', -35.281, 149.13], ['블루마운틴', -33.715, 150.311],
    ['바이런베이', -28.647, 153.602], ['포트스테판', -32.719, 152.144], ['휘트선데이', -20.269, 148.718]],
  BE: [['브뤼헤', 51.209, 3.225], ['겐트', 51.054, 3.717], ['디낭', 50.261, 4.912]],
  BR: [['이구아수 폭포', -25.547, -54.588], ['살바도르', -12.978, -38.502], ['브라질리아', -15.794, -47.883],
    ['마나우스', -3.119, -60.022], ['렌소이스', -2.486, -43.128]],
  CA: [['밴쿠버', 49.283, -123.121], ['빅토리아', 48.428, -123.366], ['휘슬러', 50.116, -122.957],
    ['토론토', 43.653, -79.383], ['나이아가라 폭포', 43.09, -79.09], ['오타와', 45.422, -75.697],
    ['몬트리올', 45.502, -73.567], ['밴프', 51.178, -115.571], ['레이크루이스', 51.425, -116.177],
    ['재스퍼', 52.874, -118.081], ['캘거리', 51.045, -114.072], ['옐로나이프', 62.454, -114.372],
    ['화이트호스', 60.721, -135.057], ['핼리팩스', 44.649, -63.575]],
  CH: [['인터라켄', 46.686, 7.863], ['융프라우', 46.605, 7.921], ['그린델발트', 46.624, 8.041],
    ['라우터브루넨', 46.594, 7.909], ['이젤트발트', 46.711, 7.964], ['체르마트', 46.021, 7.749],
    ['마터호른', 46.021, 7.749], ['몽트뢰', 46.431, 6.911], ['로잔', 46.52, 6.632], ['루가노', 46.004, 8.951],
    ['생모리츠', 46.491, 9.836]],
  CL: [['토레스델파이네', -50.942, -73.407], ['푸에르토나탈레스', -51.724, -72.488],
    ['산페드로데아타카마', -22.909, -68.2], ['이스터섬', -27.113, -109.35]],
  CN: [['칭다오', 36.067, 120.383], ['웨이하이', 37.513, 122.12], ['옌타이', 37.464, 121.448],
    ['장자제', 29.117, 110.479], ['하얼빈', 45.804, 126.535], ['시안', 34.342, 108.94], ['청두', 30.573, 104.067],
    ['주자이거우', 33.26, 103.918], ['구이린', 25.274, 110.29], ['양숴', 24.778, 110.497], ['싼야', 18.253, 109.512],
    ['하이커우', 20.044, 110.2], ['백두산', 42.07, 128.1], ['옌지', 42.905, 129.514], ['다롄', 38.914, 121.615],
    ['선양', 41.806, 123.432], ['단둥', 40.129, 124.395], ['항저우', 30.274, 120.155], ['쑤저우', 31.299, 120.585],
    ['난징', 32.06, 118.797], ['광저우', 23.129, 113.264], ['선전', 22.543, 114.058], ['쿤밍', 25.039, 102.718],
    ['리장', 26.855, 100.227], ['다리', 25.607, 100.268], ['샤먼', 24.48, 118.089], ['황산', 30.129, 118.17],
    ['라싸', 29.65, 91.1], ['우루무치', 43.826, 87.617], ['우한', 30.593, 114.306], ['정저우', 34.747, 113.625],
    ['뤄양', 34.62, 112.454], ['핑야오', 37.201, 112.177], ['타이위안', 37.871, 112.549], ['둔황', 40.142, 94.662],
    ['구이양', 26.647, 106.63]],
  CU: [['바라데로', 23.139, -81.286], ['트리니다드', 21.802, -79.985], ['비냘레스', 22.617, -83.706]],
  CZ: [['체스키크룸로프', 48.813, 14.318], ['브르노', 49.195, 16.607], ['쿠트나호라', 49.948, 15.268]],
  DE: [['뮌헨', 48.135, 11.582], ['노이슈반슈타인', 47.558, 10.75], ['퓌센', 47.57, 10.7],
    ['뉘른베르크', 49.452, 11.077], ['로텐부르크', 49.378, 10.187], ['프랑크푸르트', 50.111, 8.682],
    ['하이델베르크', 49.399, 8.672], ['슈투트가르트', 48.776, 9.183], ['프라이부르크', 47.999, 7.842],
    ['쾰른', 50.938, 6.96], ['뒤셀도르프', 51.228, 6.774], ['드레스덴', 51.05, 13.737], ['라이프치히', 51.34, 12.373],
    ['포츠담', 52.391, 13.065], ['하노버', 52.376, 9.732], ['뤼베크', 53.866, 10.687], ['바이마르', 50.98, 11.324]],
  DK: [['코펜하겐', 55.676, 12.568], ['오덴세', 55.404, 10.402], ['빌룬', 55.736, 9.127], ['오르후스', 56.163, 10.204]],
  EG: [['피라미드', 29.979, 31.134], ['아부심벨', 22.337, 31.626], ['후르가다', 27.258, 33.812],
    ['다합', 28.5, 34.517], ['샤름엘셰이크', 27.916, 34.33], ['시와', 29.203, 25.52]],
  ES: [['바르셀로나', 41.385, 2.173], ['몬세라트', 41.593, 1.838], ['세비야', 37.389, -5.984],
    ['그라나다', 37.177, -3.599], ['말라가', 36.721, -4.421], ['론다', 36.742, -5.167], ['코르도바', 37.888, -4.779],
    ['톨레도', 39.863, -4.027], ['세고비아', 40.943, -4.109], ['살라망카', 40.97, -5.664], ['빌바오', 43.263, -2.935],
    ['산세바스티안', 43.318, -1.981], ['산티아고데콤포스텔라', 42.878, -8.545], ['마요르카', 39.695, 3.018],
    ['이비사', 38.907, 1.421], ['테네리페', 28.292, -16.629], ['사라고사', 41.649, -0.889], ['팜플로나', 42.813, -1.646]],
  FI: [['헬싱키', 60.17, 24.938], ['로바니에미', 66.504, 25.729], ['투르쿠', 60.452, 22.267]],
  FJ: [['난디', -17.777, 177.436], ['수바', -18.125, 178.45]],
  FR: [['파리', 48.857, 2.352], ['베르사유', 48.805, 2.12], ['몽생미셸', 48.625, -1.47], ['에트르타', 49.707, 0.203],
    ['지베르니', 49.076, 1.534], ['루앙', 49.443, 1.1], ['니스', 43.71, 7.262], ['칸', 43.553, 7.017],
    ['마르세유', 43.297, 5.37], ['아비뇽', 43.949, 4.806], ['엑상프로방스', 43.53, 5.447], ['리옹', 45.764, 4.836],
    ['샤모니', 45.924, 6.869], ['안시', 45.899, 6.129], ['보르도', 44.838, -0.579], ['스트라스부르', 48.573, 7.752],
    ['콜마르', 48.079, 7.358], ['랭스', 49.258, 4.032], ['툴루즈', 43.605, 1.444], ['카르카손', 43.213, 2.349],
    ['몽펠리에', 43.611, 3.877], ['루르드', 43.095, -0.046], ['샹보르', 47.616, 1.517], ['투르', 47.394, 0.685],
    ['낭트', 47.218, -1.554], ['릴', 50.629, 3.057], ['디종', 47.322, 5.042], ['렌', 48.117, -1.678],
    ['생말로', 48.649, -2.026]],
  GB: [['런던', 51.507, -0.128], ['옥스퍼드', 51.752, -1.258], ['케임브리지', 52.205, 0.122], ['바스', 51.381, -2.359],
    ['코츠월드', 51.833, -1.8], ['스톤헨지', 51.179, -1.826], ['맨체스터', 53.481, -2.243], ['리버풀', 53.408, -2.992],
    ['요크', 53.96, -1.087], ['레이크디스트릭트', 54.461, -3.089], ['브라이턴', 50.823, -0.137],
    ['에든버러', 55.953, -3.188], ['글래스고', 55.864, -4.252], ['인버네스', 57.478, -4.225], ['스카이섬', 57.274, -6.216],
    ['카디프', 51.482, -3.179], ['벨파스트', 54.597, -5.93], ['자이언트 코즈웨이', 55.241, -6.512]],
  GE: [['바투미', 41.617, 41.637], ['카즈베기', 42.657, 44.642], ['시그나기', 41.62, 45.922], ['쿠타이시', 42.268, 42.695]],
  GR: [['산토리니', 36.393, 25.462], ['미코노스', 37.447, 25.329], ['로도스', 36.434, 28.218], ['아테네', 37.984, 23.728],
    ['메테오라', 39.722, 21.631], ['테살로니키', 40.64, 22.944], ['델포이', 38.482, 22.501], ['올림피아', 37.638, 21.63],
    ['코르푸', 39.624, 19.922], ['자킨토스', 37.787, 20.9]],
  HR: [['흐바르', 43.173, 16.441], ['트로기르', 43.517, 16.25], ['플리트비체', 44.865, 15.582, 'HR-09'], ['로비니', 45.081, 13.639],
    ['풀라', 44.867, 13.85], ['크르카', 43.804, 15.972], ['리예카', 45.327, 14.442]],
  HU: [['센텐드레', 47.669, 19.076]],
  ID: [['우붓', -8.507, 115.263], ['꾸따', -8.718, 115.17], ['스미냑', -8.691, 115.168], ['누사두아', -8.8, 115.23],
    ['짐바란', -8.79, 115.16], ['롬복', -8.65, 116.325], ['길리', -8.35, 116.04], ['족자카르타', -7.796, 110.37],
    ['보로부두르', -7.608, 110.204], ['반둥', -6.918, 107.619], ['빈탄', 1.07, 104.46], ['바탐', 1.046, 104.031],
    ['라부안바조', -8.496, 119.888], ['코모도', -8.55, 119.45], ['브로모', -7.943, 112.953], ['수라바야', -7.258, 112.752],
    ['마나도', 1.475, 124.842], ['메단', 3.595, 98.672]],
  IE: [['모허 절벽', 52.972, -9.431]],
  IN: [['타지마할', 27.175, 78.042], ['아그라', 27.177, 78.008], ['바라나시', 25.318, 82.974], ['자이푸르', 26.912, 75.787],
    ['조드푸르', 26.239, 73.024], ['우다이푸르', 24.585, 73.712], ['뭄바이', 19.076, 72.878], ['콜카타', 22.573, 88.364],
    ['첸나이', 13.083, 80.271], ['벵갈루루', 12.972, 77.595], ['함피', 15.335, 76.46], ['다르질링', 27.041, 88.266],
    ['리시케시', 30.087, 78.268]],
  IS: [['블루라군', 63.88, -22.45], ['게이시르', 64.31, -20.302], ['굴포스', 64.327, -20.12], ['비크', 63.419, -19.006],
    ['아퀴레이리', 65.689, -18.126], ['미바튼', 65.604, -16.996]],
  IT: [['로마', 41.903, 12.496], ['밀라노', 45.464, 9.19], ['코모', 45.808, 9.085], ['베네치아', 45.441, 12.316],
    ['베니스', 45.441, 12.316], ['베로나', 45.438, 10.992], ['코르티나담페초', 46.541, 12.136], ['돌로미티', 46.575, 11.671],
    ['피렌체', 43.77, 11.256], ['피사', 43.723, 10.402], ['시에나', 43.319, 11.331], ['친퀘테레', 44.135, 9.684],
    ['제노바', 44.406, 8.946], ['나폴리', 40.852, 14.268], ['아말피', 40.634, 14.603], ['포지타노', 40.628, 14.485],
    ['소렌토', 40.626, 14.376], ['카프리', 40.553, 14.222], ['폼페이', 40.746, 14.499], ['팔레르모', 38.116, 13.362],
    ['타오르미나', 37.852, 15.285], ['볼로냐', 44.495, 11.343], ['토리노', 45.07, 7.687], ['바리', 41.117, 16.872],
    ['알베로벨로', 40.785, 17.238], ['마테라', 40.666, 16.604], ['아시시', 43.071, 12.62], ['오르비에토', 42.719, 12.111]],
  JO: [['페트라', 30.329, 35.444], ['와디럼', 29.583, 35.417]],
  JP: [['삿포로', 43.062, 141.354], ['오타루', 43.191, 140.995], ['하코다테', 41.769, 140.729], ['후라노', 43.342, 142.383],
    ['비에이', 43.588, 142.467], ['나하', 26.212, 127.681], ['이시가키', 24.345, 124.157], ['미야코지마', 24.806, 125.281],
    ['고베', 34.69, 135.196], ['히메지', 34.815, 134.685], ['요코하마', 35.444, 139.638], ['하코네', 35.232, 139.107],
    ['가마쿠라', 35.319, 139.547], ['나고야', 35.182, 136.907], ['벳푸', 33.285, 131.491], ['유후인', 33.265, 131.355],
    ['기타큐슈', 33.884, 130.875], ['다카마쓰', 34.343, 134.047], ['나오시마', 34.46, 133.995, 'JP-37'], ['가나자와', 36.561, 136.656],
    ['센다이', 38.268, 140.869], ['닛코', 36.72, 139.698], ['다카야마', 36.146, 137.252], ['시라카와고', 36.258, 136.906],
    ['마쓰야마', 33.839, 132.766], ['가와구치코', 35.499, 138.769], ['가루이자와', 36.348, 138.597],
    ['하쿠바', 36.698, 137.862], ['마쓰모토', 36.238, 137.972], ['이세', 34.488, 136.709], ['구사쓰', 36.621, 138.596],
    ['나리타', 35.777, 140.318], ['디즈니랜드', 35.65, 139.9], ['미야지마', 34.296, 132.32], ['구라시키', 34.585, 133.772],
    ['시라하마', 33.678, 135.348], ['고야산', 34.213, 135.585], ['아타미', 35.096, 139.072], ['이즈모', 35.367, 132.755],
    ['사세보', 33.18, 129.715], ['하우스텐보스', 33.085, 129.788], ['아소', 32.952, 131.121], ['이부스키', 31.253, 130.633],
    ['야쿠시마', 30.35, 130.53]],
  KE: [['마사이마라', -1.406, 35.012]],
  KH: [['앙코르와트', 13.412, 103.867], ['시엠립', 13.363, 103.856]],
  KR: [['경주', 35.856, 129.225], ['안동', 36.568, 128.729], ['포항', 36.019, 129.343], ['울릉도', 37.484, 130.906],
    ['강릉', 37.752, 128.876], ['속초', 38.207, 128.592], ['양양', 38.075, 128.619], ['춘천', 37.881, 127.73],
    ['평창', 37.37, 128.39], ['전주', 35.824, 127.148], ['군산', 35.968, 126.737], ['여수', 34.76, 127.662],
    ['순천', 34.951, 127.487], ['목포', 34.812, 126.392], ['담양', 35.321, 126.988], ['통영', 34.854, 128.433],
    ['거제', 34.881, 128.621], ['남해', 34.838, 127.892], ['창원', 35.228, 128.681], ['가평', 37.832, 127.511],
    ['수원', 37.264, 127.029], ['파주', 37.76, 126.78], ['공주', 36.446, 127.119, 'KR-44'], ['부여', 36.276, 126.91],
    ['태안', 36.746, 126.298], ['단양', 36.985, 128.366], ['서귀포', 33.254, 126.56]],
  LA: [['방비엥', 18.923, 102.448], ['팍세', 15.12, 105.799]],
  LK: [['캔디', 7.291, 80.634], ['시기리야', 7.957, 80.76], ['담불라', 7.874, 80.651], ['갈레', 6.054, 80.221],
    ['엘라', 6.867, 81.047], ['미리사', 5.948, 80.472]],
  MA: [['셰프샤우엔', 35.169, -5.264], ['메르주가', 31.08, -4.013], ['에사우이라', 31.509, -9.76],
    ['와르자자트', 30.919, -6.893]],
  MM: [['바간', 21.172, 94.859], ['인레 호수', 20.55, 96.917]],
  MN: [['테를지', 47.98, 107.45], ['홉스골', 50.44, 100.16]],
  MV: [['말레', 4.175, 73.509, 'MV-26']],
  MX: [['칸쿤', 21.162, -86.852], ['툴룸', 20.211, -87.465], ['플라야델카르멘', 20.63, -87.074],
    ['치첸이차', 20.684, -88.568], ['메리다', 20.967, -89.593], ['로스카보스', 22.891, -109.917],
    ['과달라하라', 20.66, -103.35], ['푸에르토바야르타', 20.653, -105.225], ['테오티우아칸', 19.693, -98.844],
    ['오악사카', 17.073, -96.726]],
  MY: [['코타키나발루', 5.98, 116.074], ['페낭', 5.414, 100.329], ['랑카위', 6.35, 99.8], ['말라카', 2.19, 102.25],
    ['조호르바루', 1.493, 103.741], ['쿠칭', 1.554, 110.359], ['겐팅하이랜드', 3.424, 101.793],
    ['카메론하이랜드', 4.472, 101.377], ['이포', 4.598, 101.09]],
  NL: [['암스테르담', 52.368, 4.904], ['잔세스칸스', 52.474, 4.817], ['헤이그', 52.071, 4.301], ['로테르담', 51.924, 4.478],
    ['킨더다이크', 51.884, 4.639], ['히트호른', 52.74, 6.079], ['마스트리흐트', 50.851, 5.691]],
  NO: [['트롬쇠', 69.649, 18.955], ['베르겐', 60.391, 5.322], ['플롬', 60.863, 7.114], ['게이랑에르', 62.102, 7.206],
    ['올레순', 62.472, 6.15], ['프레이케스톨렌', 58.986, 6.19], ['스타방에르', 58.97, 5.733], ['로포텐', 68.234, 14.568]],
  NP: [['카트만두', 27.717, 85.324], ['포카라', 28.21, 83.986], ['치트완', 27.529, 84.354], ['에베레스트', 27.807, 86.714]],
  NZ: [['퀸스타운', -45.031, 168.663], ['와나카', -44.703, 169.132], ['더니든', -45.879, 170.503],
    ['밀퍼드사운드', -44.641, 167.897], ['테아나우', -45.414, 167.718], ['크라이스트처치', -43.532, 172.636],
    ['테카포', -44.005, 170.477], ['마운트쿡', -43.734, 170.096], ['로토루아', -38.137, 176.25], ['타우포', -38.686, 176.07],
    ['호비튼', -37.872, 175.683]],
  PE: [['마추픽추', -13.163, -72.545], ['레인보우 마운틴', -13.869, -71.303], ['와카치나', -14.088, -75.763],
    ['나스카', -14.835, -74.93]],
  PH: [['세부', 10.316, 123.885], ['막탄', 10.31, 123.98], ['보홀', 9.85, 124.144], ['두마게티', 9.307, 123.305],
    ['보라카이', 11.967, 121.925], ['일로일로', 10.72, 122.562], ['팔라완', 9.739, 118.735], ['엘니도', 11.196, 119.408],
    ['코론', 12.005, 120.204], ['클락', 15.186, 120.56], ['앙헬레스', 15.145, 120.589], ['수빅', 14.825, 120.283],
    ['바기오', 16.402, 120.596], ['따가이따이', 14.115, 120.962], ['팍상한', 14.273, 121.455], ['레가스피', 13.139, 123.744],
    ['시아르가오', 9.848, 126.046]],
  PL: [['바르샤바', 52.23, 21.012], ['크라쿠프', 50.065, 19.945], ['아우슈비츠', 50.034, 19.21], ['자코파네', 49.299, 19.95],
    ['그단스크', 54.352, 18.647], ['브로츠와프', 51.108, 17.039]],
  PT: [['리스본', 38.722, -9.139], ['신트라', 38.803, -9.382], ['카스카이스', 38.698, -9.422], ['알가르브', 37.019, -7.93],
    ['라구스', 37.102, -8.673], ['파티마', 39.617, -8.652], ['오비두스', 39.361, -9.157], ['나자레', 39.601, -9.07]],
  RU: [['블라디보스토크', 43.116, 131.886], ['바이칼 호수', 51.854, 104.87], ['알혼섬', 53.15, 107.35],
    ['카잔', 55.796, 49.106], ['소치', 43.603, 39.734], ['예카테린부르크', 56.839, 60.606]],
  SE: [['예테보리', 57.709, 11.975], ['말뫼', 55.605, 13.004], ['키루나', 67.856, 20.225]],
  TH: [['파타야', 12.924, 100.883], ['코사무이', 9.512, 100.014], ['코팡안', 9.738, 100.014],
    ['후아힌', 12.568, 99.958], ['코창', 12.056, 102.325], ['코사멧', 12.569, 101.455], ['피피섬', 7.74, 98.778, 'TH-81'],
    ['아오낭', 8.033, 98.823], ['코란타', 7.625, 99.079], ['카오락', 8.646, 98.25], ['빠이', 19.358, 98.44],
    ['담넌사두억', 13.517, 99.958], ['매끌렁', 13.407, 100]],
  TR: [['카파도키아', 38.643, 34.829], ['괴레메', 38.643, 34.829], ['파묵칼레', 37.92, 29.119], ['에페스', 37.94, 27.342],
    ['쿠사다시', 37.858, 27.261], ['보드룸', 37.034, 27.431], ['페티예', 36.622, 29.116], ['사프란볼루', 41.245, 32.69]],
  TW: [['지우펀', 25.109, 121.845], ['스펀', 25.044, 121.777], ['예류', 25.207, 121.69], ['단수이', 25.168, 121.446],
    ['컨딩', 21.945, 120.798], ['일월담', 23.867, 120.917], ['아리산', 23.51, 120.805], ['타이루거', 24.158, 121.621]],
  TZ: [['세렝게티', -2.333, 34.833]],
  US: [['로스앤젤레스', 34.052, -118.244], ['샌프란시스코', 37.775, -122.419], ['샌디에이고', 32.716, -117.161],
    ['요세미티', 37.865, -119.538], ['나파밸리', 38.298, -122.287], ['라스베이거스', 36.17, -115.14],
    ['그랜드캐니언', 36.054, -112.14], ['앤털로프캐니언', 36.862, -111.374], ['세도나', 34.87, -111.761],
    ['나이아가라 폭포', 43.096, -79.038], ['시애틀', 47.606, -122.332], ['포틀랜드', 45.515, -122.678],
    ['시카고', 41.878, -87.63], ['보스턴', 42.36, -71.059], ['필라델피아', 39.953, -75.165], ['마이애미', 25.762, -80.192],
    ['올랜도', 28.538, -81.379], ['키웨스트', 24.555, -81.78], ['애틀랜타', 33.749, -84.388], ['댈러스', 32.777, -96.797],
    ['휴스턴', 29.76, -95.37], ['오스틴', 30.267, -97.743], ['뉴올리언스', 29.951, -90.072], ['내슈빌', 36.163, -86.782],
    ['멤피스', 35.15, -90.049], ['덴버', 39.739, -104.99], ['옐로스톤', 44.428, -110.589],
    ['솔트레이크시티', 40.761, -111.891], ['자이언 캐니언', 37.298, -113.026], ['브라이스캐니언', 37.593, -112.187],
    ['디트로이트', 42.331, -83.046], ['앵커리지', 61.218, -149.9], ['호놀룰루', 21.307, -157.858],
    ['와이키키', 21.279, -157.829], ['마우이', 20.798, -156.332], ['빅아일랜드', 19.543, -155.666],
    ['카우아이', 22.096, -159.526]],
  UZ: [['히바', 41.378, 60.364]],
  VN: [['나트랑', 12.239, 109.197], ['호이안', 15.88, 108.338], ['푸꾸옥', 10.227, 103.964], ['하롱베이', 20.952, 107.08],
    ['사파', 22.336, 103.844], ['달랏', 11.94, 108.458], ['무이네', 10.945, 108.286], ['후에', 16.464, 107.591],
    ['퀴논', 13.782, 109.219], ['깟바', 20.727, 107.048, 'VN-HP'], ['짱안', 20.256, 105.896]],
  ZA: [['케이프타운', -33.925, 18.424], ['희망봉', -34.357, 18.474], ['요하네스버그', -26.204, 28.047],
    ['프리토리아', -25.748, 28.229], ['크루거 국립공원', -24.996, 31.592], ['더반', -29.859, 31.022]],
};

const warnings = [];
const all = JSON.parse(readFileSync(resolve(source), 'utf8')).features;

/** Each country's regions: one feature a code, its parts merged. */
function regionsOf(country, features) {
  const [codeOf, names] = GROUPS[country] ?? [(p) => p.iso_3166_2, null];
  const byCode = new Map();
  for (const f of features) {
    const code = codeOf(f.properties);
    if (!CODE.test(code ?? '') || !code.startsWith(`${country}-`)) {
      warnings.push(`${country}: no code for ${f.properties.name} (${code})`);
      continue;
    }
    const name = NAMES[code] ?? names?.[code] ?? f.properties.name_ko?.trim() ?? f.properties.name;
    if (!NAMES[code] && !names && !f.properties.name_ko) {
      warnings.push(`${country}: no Korean name for ${code} ${name}`);
    }
    const group = byCode.get(code) ?? { code, name, parts: [] };
    group.parts.push(f);
    byCode.set(code, group);
  }
  // Parts of a region (or of one given twice) merged: their shared borders go.
  return [...byCode.values()].map(({ code, name, parts }) => {
    if (parts.length === 1) return { type: 'Feature', properties: { code, name }, geometry: parts[0].geometry };
    const t = topology({ parts: { type: 'FeatureCollection', features: parts } });
    return { type: 'Feature', properties: { code, name }, geometry: merge(t, t.objects.parts.geometries) };
  });
}

const polygonsOf = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];

/** Whether a region's outline holds [lon, lat]: crossings of its rings, on the plane. */
function covers(geometry, [x, y]) {
  let inside = false;
  for (const ring of polygonsOf(geometry).flat()) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** The region a place is in, else the nearest within NEAR (its point fell in the sea). */
function regionOfPlace(regions, point) {
  const inside = regions.find((region) => covers(region.geometry, point));
  if (inside) return inside;
  const across = Math.cos((point[1] * Math.PI) / 180);
  let nearest = null;
  let distance = NEAR;
  for (const region of regions) {
    for (const [x, y] of polygonsOf(region.geometry).flat(2)) {
      const d = Math.hypot((x - point[0]) * across, y - point[1]);
      if (d < distance) [nearest, distance] = [region, d];
    }
  }
  return nearest;
}

// Natural Earth's places in countries the map has as part of another (France's overseas regions,
// Svalbard), or without an ISO code of their own (by Natural Earth's codes for those).
const TOWN_COUNTRY = { GF: 'FR', GP: 'FR', MQ: 'FR', RE: 'FR', YT: 'FR', SJ: 'NO', SOL: 'SO', CYN: 'CY', KOS: 'XK' };

// The word for a city or district that Korean writes after a name in these countries (삿포로시,
// 서울특별시, 타오위안 시), left off as people say them; elsewhere only one set apart (쿠웨이트 시).
// Kept where it would leave one letter: 쓰시 is Tsu, 진시 Jinxi.
const CITY_WORD = {
  JP: /(시|도)$/, KR: /(특별자치시|특별시|광역시|시|군)$/, KP: /(특별시|직할시|시|군)$/,
  CN: /\s?(지구|시|현|구)$/, TW: /\s?(시|구)$/, VN: /(시|성|현)$/,
};

function townName(country, name) {
  const short = name.replace(CITY_WORD[country] ?? /\s시$/, '').trim();
  return [...short.replace(/\s/g, '')].length >= 2 ? short : name;
}

const nameKey = (name) => name.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

// Far parts left off a map, so the rest isn't shrunk to fit them: overseas regions (listed under
// the map only), and remote islands of a region drawn on the mainland. The US has its own
// projection with Alaska and Hawaii set in.
const AWAY = new Set([
  'FR-GUA', 'FR-GUF', 'FR-MTQ', 'FR-MAY', 'FR-LRE', 'ES-CN', 'PT-20', 'PT-30', 'EC-W', 'CO-SAP',
  'NL-BQ1', 'NL-BQ2', 'NL-BQ3', 'NO-21', 'NZ-CIT',
]);
const KEEP_LAND = {
  CL: ([lon]) => lon > -100, // not Easter Island
  ZA: ([, lat]) => lat > -40, // not the Prince Edward Islands
  JP: ([lon, lat]) => lon < 150 && lat > 24, // not Minami-Tori-shima, Okino-Tori-shima
};

/** What a country's map draws, and the regions it only lists. */
function mapParts(country, regions) {
  const keep = KEEP_LAND[country] ?? (() => true);
  const drawn = [];
  const away = [];
  for (const region of regions) {
    const polygons = AWAY.has(region.properties.code)
      ? []
      : polygonsOf(region.geometry).filter((coordinates) => keep(geoCentroid({ type: 'Polygon', coordinates })));
    if (polygons.length === 0) away.push(region);
    else drawn.push({ ...region, geometry: { type: 'MultiPolygon', coordinates: polygons } });
  }
  // Centered on its biggest land, so countries across the date line (Russia, Fiji) hold together.
  const biggest = drawn
    .flatMap((region) => region.geometry.coordinates)
    .map((coordinates) => ({ type: 'Polygon', coordinates }))
    .reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  return { centerLon: geoCentroid(biggest)[0], drawn, away };
}

/**
 * Turns back polygons whose rings came out of simplifying the wrong way round: on a sphere they
 * would be all the world but themselves.
 */
function rewind(shape) {
  const { geometry } = shape;
  if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') return;
  const polygons = polygonsOf(geometry).map((rings) =>
    geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI
      ? rings.map((ring) => [...ring].reverse())
      : rings,
  );
  shape.geometry =
    geometry.type === 'Polygon'
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons };
}

const byCountry = new Map();
for (const f of all) {
  const country = f.properties.iso_a2;
  if (!/^[A-Z]{2}$/.test(country ?? '')) continue;
  byCountry.set(country, [...(byCountry.get(country) ?? []), f]);
}

const seen = new Set();
/** The regions of each country with a map, as Natural Earth draws them: for where places are. */
const mapped = new Map();
for (const [country, features] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
  if (SKIP.has(country)) continue;
  const regions = regionsOf(country, features);
  if (regions.length < 2 || regions.length > MAX_REGIONS) continue;
  for (const region of regions) seen.add(region.properties.code);
  mapped.set(country, regions);
}
for (const code of Object.keys(NAMES)) if (!seen.has(code)) warnings.push(`NAMES: no region ${code}`);

// Places, by the code of where they are: the region of the country's map, else the country.
const countries = new Set(
  readFileSync(resolve('src/features/countries/countryCodes.ts'), 'utf8')
    .match(/"[A-Z]{2}"/g)
    .map((code) => code.slice(1, -1)),
);
const regionName = new Map([...mapped.values()].flat().map((r) => [r.properties.code, r.properties.name]));
const places = {};
/** Puts a place in a region's (or country's) list, unless one there has its name. */
function addPlace(code, name) {
  const list = (places[code] ??= []);
  if (!list.some((other) => nameKey(other) === nameKey(name))) list.push(name);
}
function whereIs(country, point) {
  const regions = mapped.get(country);
  return (regions && regionOfPlace(regions, point)?.properties.code) ?? country;
}

for (const [country, list] of Object.entries(PLACES)) {
  if (!countries.has(country)) warnings.push(`PLACES: no country ${country}`);
  const shown = [];
  for (const [name, lat, lon, forced] of list) {
    let code = forced ?? whereIs(country, [lon, lat]);
    if (code !== country && !regionName.has(code)) {
      warnings.push(`PLACES: no region ${code} for ${name}`);
      code = country;
    }
    if (code === country && mapped.has(country)) warnings.push(`PLACES: ${name} is in no region of ${country}`);
    shown.push(`${name}→${regionName.get(code) ?? code}`);
    addPlace(code, name);
  }
  console.log(`${country}: ${shown.join(', ')}`);
}

// Natural Earth's cities, the biggest first.
const towns = JSON.parse(readFileSync(resolve(townsSource), 'utf8'))
  .features.map((f) => f.properties)
  .sort((a, b) => b.POP_MAX - a.POP_MAX);
const unplaced = [];
const away = {};
/** Each town's country (as the map has it), or none for one the map has no country for. */
const townCountry = (town) => {
  const country = TOWN_COUNTRY[town.ISO_A2] ?? TOWN_COUNTRY[town.ADM0_A3] ?? town.ISO_A2;
  return countries.has(country) ? country : null;
};
for (const town of towns) {
  const country = townCountry(town);
  if (!country) {
    const code = TOWN_COUNTRY[town.ISO_A2] ?? TOWN_COUNTRY[town.ADM0_A3] ?? town.ISO_A2;
    away[code] = (away[code] ?? 0) + 1;
    continue;
  }
  const code = whereIs(country, [town.LONGITUDE, town.LATITUDE]);
  if (code === country && mapped.has(country)) unplaced.push(`${town.NAME_KO}(${country})`);
  addPlace(code, townName(country, town.NAME_KO));
}
if (unplaced.length) console.log(`towns in no region, so in their country: ${unplaced.join(', ')}`);
// Antarctica's stations, and the few places the map has no country for (Gibraltar, Tuvalu).
console.log(`towns left out: ${JSON.stringify(away)}`);

// Names of Natural Earth's towns that PLACES has by the name people use: the same town, called so
// on its page (나트랑), its own name kept to find it by (냐짱). Not a sight by a town (타지마할 at
// 아그라), which is a place of its own.
const SAME = {
  AR: { '바릴로체': '산카를로스데바릴로체' },
  AT: { '비엔나': '빈' },
  BE: { '브뤼헤': '브뤼허', '겐트': '헨트' },
  BR: { '살바도르': '사우바도르' },
  GR: { '코르푸': '케르키라' },
  ID: { '족자카르타': '욕야카르타' },
  IS: { '아퀴레이리': '아쿠레이리' },
  IT: { '베니스': '베네치아' },
  KH: { '시엠립': '시엠레아프' },
  LA: { '팍세': '빡세' },
  LK: { '갈레': '갈' },
  MX: { '칸쿤': '캉쿤', '로스카보스': '카보산루카스', '오악사카': '오아하카' },
  MY: { '페낭': '조지타운', '말라카': '믈라카' },
  NZ: { '더니든': '더니딘' },
  TH: { '매끌렁': '사뭇송크람' },
  US: { '그랜드캐니언': '그랜드 캐년', '나이아가라 폭포': '나이아가라폴스' },
  VN: { '나트랑': '냐짱', '하롱베이': '할롱', '퀴논': '꾸이년' },
};

/** Kilometres between two [lon, lat] points. */
function km([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
/** A name in Latin letters to match by: no accents (Ōsaka), letters only, lowercase. */
const latinKey = (name) =>
  (name ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}]/gu, '').toLowerCase();

// Each mapped country's cities, for its page: Natural Earth's towns (one of a name in a region),
// then PLACES that aren't one of them: a sight, or a town it lacks.
const citiesOf = new Map();
for (const town of towns) {
  const country = townCountry(town);
  if (!mapped.has(country)) continue;
  const point = [town.LONGITUDE, town.LATITUDE];
  const city = { name: townName(country, town.NAME_KO), code: whereIs(country, point), point, aliases: [] };
  const list = citiesOf.get(country) ?? [];
  if (list.some((other) => other.code === city.code && nameKey(other.name) === nameKey(city.name))) continue;
  city.latin = [town.NAME, town.NAMEASCII, town.NAME_EN].map(latinKey).filter(Boolean);
  city.population = town.POP_MAX;
  list.push(city);
  citiesOf.set(country, list);
}
for (const [country, list] of Object.entries(PLACES)) {
  const cities = citiesOf.get(country);
  if (!cities) continue;
  for (const [name, lat, lon, forced] of list) {
    const point = [lon, lat];
    const named = (other, wanted) => [other.name, ...other.aliases].some((n) => nameKey(n) === nameKey(wanted));
    const same = SAME[country]?.[name];
    if (same) {
      const town = cities.filter((other) => named(other, same)).sort((a, b) => km(a.point, point) - km(b.point, point))[0];
      if (town) {
        town.aliases.push(town.name);
        town.name = name;
        continue;
      }
      warnings.push(`SAME: no town ${same} for ${name}`);
    }
    if (cities.some((other) => named(other, name) && km(other.point, point) < 30)) continue;
    const code = regionName.has(forced) ? forced : whereIs(country, point);
    cities.push({ name, code, point, aliases: [], latin: [], population: 0 });
  }
}

/** [west, south, east, north] of a geometry's points. */
function boundsOf(geometry) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of polygonsOf(geometry).flat(2)) {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  return box;
}
const within = ([x, y], [west, south, east, north]) => x >= west && x <= east && y >= south && y <= north;

// Built-up areas (LandScan's) for the cities: each area to the city it is named for, else the
// biggest town in it, else a place of PLACES in it. Areas of the same name elsewhere carry a number
// (Sydney1).
const urban = JSON.parse(readFileSync(resolve(urbanSource), 'utf8')).features;
const countryBounds = [...mapped].map(([country, regions]) => [
  country,
  regions.map((region) => boundsOf(region.geometry)).reduce((a, b) => [
    Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3]),
  ]),
]);
/** Each city's area, and whether it was named for the city. */
const areaOf = new Map();
let areasUsed = 0;
for (const area of urban) {
  const center = [area.properties.mean_bb_xc, area.properties.mean_bb_yc];
  const country = countryBounds.find(
    ([code, bounds]) => within(center, bounds) && regionOfPlace(mapped.get(code), center),
  )?.[0];
  const cities = citiesOf.get(country) ?? [];
  const bounds = boundsOf(area.geometry);
  const inside = cities.filter((city) => within(city.point, bounds) && covers(area.geometry, city.point));
  const wanted = latinKey(area.properties.name_conve.replace(/\d+$/, ''));
  const named = cities
    .filter((city) => city.latin.includes(wanted) && (inside.includes(city) || km(city.point, center) < 25))
    .sort((a, b) => km(a.point, center) - km(b.point, center));
  const city =
    named[0] ?? inside.filter((c) => c.population > 0).sort((a, b) => b.population - a.population)[0] ?? inside[0];
  if (!city) continue;
  const had = areaOf.get(city);
  if (had && (had.named || named.length === 0)) continue;
  if (!had) areasUsed += 1;
  areaOf.set(city, { area, named: named.length > 0 });
}
console.log(`built-up areas: ${areasUsed} of ${urban.length} on a city`);

/** Distance from p to the segment a–b, on the plane. */
function toSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Douglas–Peucker: the points of a line that keep it within `tolerance` of itself. */
function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop();
    let farthest = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = toSegment(points[i], points[a], points[b]);
      if (d > farthest) [farthest, at] = [d, i];
    }
    if (farthest > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
const ringArea = (ring) => ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + x * ny - nx * y;
}, 0) / 2;
const round = (value) => Math.round(value * 10) / 10;
/**
 * City outlines keep this much detail (map units: a map is about 1000 wide, a phone shows it about
 * 350 pixels wide), and leave out holes and bits smaller than CITY_BITS units²: neither can be seen.
 */
const CITY_DETAIL = 1.2;
const CITY_BITS = 4;
/** About the most points a city's outline keeps: a sprawling one (Dhaka) is made rougher. */
const CITY_POINTS = 400;

/** A built-up area's rings on a map, as much simplified as `tolerance` allows. */
function cityRings(geometry, projection, tolerance) {
  const rings = polygonsOf(geometry).flatMap((polygon) =>
    polygon.map((ring, i) => {
      const points = simplifyLine(ring.map((p) => projection(p)).filter(Boolean), tolerance);
      return { outer: i === 0, points, area: points.length < 4 ? 0 : Math.abs(ringArea(points)) };
    }),
  );
  // The biggest part stays however small: the city is there.
  const biggest = Math.max(0, ...rings.map((ring) => ring.area));
  return rings.filter(({ area }) => area > 0 && (area >= CITY_BITS || area === biggest));
}

/** A built-up area as an SVG path on a map, and how big it is there; none if it comes to nothing. */
function cityShape(geometry, projection) {
  let tolerance = CITY_DETAIL;
  let rings = cityRings(geometry, projection, tolerance);
  while (rings.reduce((sum, ring) => sum + ring.points.length, 0) > CITY_POINTS) {
    tolerance *= 1.5;
    rings = cityRings(geometry, projection, tolerance);
  }
  let d = '';
  let size = 0;
  for (const { outer, points, area } of rings) {
    if (outer) size += area;
    // Whole units are close enough but on a small shape.
    const [xs, ys] = [points.map(([x]) => x), points.map(([, y]) => y)];
    const fine = Math.max(...xs) - Math.min(...xs) < 20 && Math.max(...ys) - Math.min(...ys) < 20;
    const at = (value) => (fine ? round(value) : Math.round(value));
    d += `M${points.slice(0, -1).map(([x, y]) => `${at(x)},${at(y)}`).join('L')}Z`;
  }
  return d ? { d, size } : null;
}

// The files are replaced, not the folder: after the folder was deleted and made again, a running
// dev server answered index.html for its maps until it restarted.
const outDir = resolve('public/regions');
mkdirSync(outDir, { recursive: true });
const counts = {};
let bytes = 0;
let cityCount = 0;
let shapeCount = 0;

for (const [country, regions] of mapped) {
  const { centerLon, drawn, away: farRegions } = mapParts(country, regions);
  // Simplified together, so neighbours keep sharing their border.
  const t = topology({ regions: { type: 'FeatureCollection', features: drawn } }, 1e5);
  const pre = presimplify(t);
  const points = t.arcs.reduce((sum, arc) => sum + arc.length, 0);
  const simple = simplify(pre, quantile(pre, Math.min(1, POINTS / points)));
  const shapes = feature(simple, simple.objects.regions);
  shapes.features.forEach(rewind);

  const projection = country === 'US' ? geoAlbersUsa() : geoMercator().rotate([-centerLon, 0]);
  projection.fitSize([SIZE, SIZE], shapes);
  const path = geoPath(projection).digits(0);
  const [[left, top], [right, bottom]] = path.bounds(shapes);
  projection.translate([projection.translate()[0] - left, projection.translate()[1] - top]);

  const rows = shapes.features.map((shape) => {
    const { code, name } = shape.properties;
    const row = [code, name, path(shape) ?? ''];
    if (path.area(shape) < DOT_AREA) {
      const [x, y] = path.centroid(shape);
      if (Number.isFinite(x)) row.push(Math.round(x), Math.round(y));
    }
    return row;
  });
  for (const region of farRegions) rows.push([region.properties.code, region.properties.name, '']);
  rows.sort((a, b) => a[1].localeCompare(b[1], 'ko'));

  // Its cities: where each is, and its built-up area; none on the map in a region drawn only in
  // the list, or on land left off it. The biggest areas first, so smaller ones are drawn over them.
  const offMap = new Set(farRegions.map((region) => region.properties.code));
  const keep = KEEP_LAND[country] ?? (() => true);
  const cities = (citiesOf.get(country) ?? []).map((city) => {
    const at = offMap.has(city.code) || !keep(city.point) ? null : projection(city.point);
    const shape = at && areaOf.has(city) ? cityShape(areaOf.get(city).area.geometry, projection) : null;
    const row = [city.name, city.code, at ? round(at[0]) : null, at ? round(at[1]) : null, shape?.d ?? ''];
    if (city.aliases.length > 0) row.push(city.aliases);
    return { row, size: shape?.size ?? 0 };
  });
  cities.sort((a, b) => b.size - a.size);
  cityCount += cities.length;
  shapeCount += cities.filter((city) => city.size > 0).length;

  const out = JSON.stringify({
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
    regions: rows,
    cities: cities.map((city) => city.row),
  });
  writeFileSync(join(outDir, `${country}.json`), out);
  counts[country] = rows.length;
  bytes += out.length;
}
// Countries that no longer have a map.
for (const name of readdirSync(outDir)) {
  if (name.endsWith('.json') && !(name.slice(0, -5) in counts)) rmSync(join(outDir, name));
}

writeFileSync(
  resolve('src/features/countries/regionCountries.ts'),
  `// Generated by scripts/region-maps.mjs with public/regions/. Don't edit.

/** Countries with a map of their regions (public/regions/{code}.json), and how many regions. */
export const REGION_COUNTS: Readonly<Record<string, number>> = ${JSON.stringify(counts)};
`,
);
console.log(
  `${Object.keys(counts).length} countries, ${cityCount} cities (${shapeCount} with a built-up area), ` +
    `${(bytes / 1024).toFixed(0)} KB in all`,
);

// Each region's own name last, to find its country by (홋카이도 → 일본), unless a place there has
// it without the word for a province (제주 for 제주특별자치도), as the app's search reads it.
const ADMIN_WORD = /(특별자치시|특별자치도|특별시|광역시|시|도|군|현|성|주|부|구)$/;
const shortKey = (name) => {
  const short = name.trim().replace(ADMIN_WORD, '');
  return nameKey([...nameKey(short)].length >= 2 ? short : name);
};
let regionNames = 0;
for (const [code, name] of regionName) {
  const list = (places[code] ??= []);
  if (list.some((other) => shortKey(other) === shortKey(name))) continue;
  list.push(name);
  regionNames += 1;
}
console.log(`region names added: ${regionNames} of ${regionName.size}`);

const index = JSON.stringify(Object.fromEntries(Object.entries(places).sort(([a], [b]) => a.localeCompare(b))));
writeFileSync(
  resolve('src/features/countries/places.ts'),
  `// Generated by scripts/region-maps.mjs. Don't edit.

/**
 * Places people go, to find where they are by (파리 → 프랑스, 일드프랑스): the script's PLACES (sights
 * too), then Natural Earth's cities by size, then the region's own name unless a place has it
 * already (홋카이도; not 제주특별자치도, which has 제주). By the code of where each is: the region of
 * its country's map (\`FR-IDF\`), or the country (\`SG\`) without a map or a region for the place.
 */
export const PLACES: Readonly<Record<string, readonly string[]>> = ${index};
`,
);
const count = Object.values(places).reduce((sum, list) => sum + list.length, 0);
console.log(`${count} places, ${(Buffer.byteLength(index) / 1024).toFixed(0)} KB`);
if (warnings.length) console.log(`warnings:\n  ${warnings.join('\n  ')}`);
