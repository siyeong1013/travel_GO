// Makes the region maps of "다녀온 나라" (a country's states, provinces, prefectures): one file a
// country in public/regions/ (fetched when its page opens; the service worker keeps it then), and
// src/features/countries/regionCountries.ts listing the countries that have one.
//
// Data: Natural Earth 1:10m admin-1 states and provinces (public domain). To run it again:
//   curl -L -o admin1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
//   npm i --no-save --ignore-scripts topojson-server@3.0.1 topojson-client@3.1.0 \
//     topojson-simplify@3.0.3 d3-geo@3.1.1
//   node scripts/region-maps.mjs admin1.geojson [folder holding those node_modules]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const [source, modulesArg] = process.argv.slice(2);
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
/** Left out too: Natural Earth's regions of it don't fit together. */
const SKIP = new Set(['BA']);

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
    const name = names?.[code] ?? f.properties.name_ko?.trim() ?? f.properties.name;
    if (!names && !f.properties.name_ko) warnings.push(`${country}: no Korean name for ${code} ${name}`);
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

const outDir = resolve('public/regions');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const counts = {};
let bytes = 0;

for (const [country, features] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
  if (SKIP.has(country)) continue;
  const regions = regionsOf(country, features);
  if (regions.length < 2 || regions.length > MAX_REGIONS) continue;

  const { centerLon, drawn, away } = mapParts(country, regions);
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
  for (const region of away) rows.push([region.properties.code, region.properties.name, '']);
  rows.sort((a, b) => a[1].localeCompare(b[1], 'ko'));

  const out = JSON.stringify({ width: Math.ceil(right - left), height: Math.ceil(bottom - top), regions: rows });
  writeFileSync(join(outDir, `${country}.json`), out);
  counts[country] = rows.length;
  bytes += out.length;
}

writeFileSync(
  resolve('src/features/countries/regionCountries.ts'),
  `// Generated by scripts/region-maps.mjs with public/regions/. Don't edit.

/** Countries with a map of their regions (public/regions/{code}.json), and how many regions. */
export const REGION_COUNTS: Readonly<Record<string, number>> = ${JSON.stringify(counts)};
`,
);
console.log(`${Object.keys(counts).length} countries, ${(bytes / 1024).toFixed(0)} KB in all`);
if (warnings.length) console.log(`warnings:\n  ${warnings.join('\n  ')}`);
