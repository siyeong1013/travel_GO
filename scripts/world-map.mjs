// Makes src/features/countries/worldMap.ts: the world's countries as SVG paths for the "다녀온 나라"
// map, so the app draws it without map data or libraries at run time (works offline, no fees).
//
// The map zooms in (16 times), so outlines keep a tenth of a unit of the old 1000-wide map, as
// integers ten times bigger, each point written from the one before (small numbers). Countries
// too small to see keep every point of their outline, and of the borders they share: zoomed in,
// they are drawn as they are (Singapore, Hong Kong), not as dots.
//
// Data: Natural Earth 1:50m admin-0 countries (public domain) through world-atlas. To run it again:
//   npm i --no-save --ignore-scripts world-atlas@2.0.2 topojson-client@3.1.0 \
//     topojson-simplify@3.0.3 d3-geo@3.1.1 i18n-iso-countries@7.14.0
//   node scripts/world-map.mjs [folder holding those node_modules]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const modules = resolve(process.argv[2] ?? '.');
const require = createRequire(join(modules, 'package.json'));
const { feature } = require('topojson-client');
const { presimplify, simplify, quantile } = require('topojson-simplify');
const { geoNaturalEarth1, geoPath } = require('d3-geo');
const isoCountries = require('i18n-iso-countries');

const WIDTH = 10000;
/** Share of the outline points kept when simplifying (less: smaller file, rougher shapes). */
const KEEP = 0.2;
/**
 * Countries smaller than this on the map (units², 6 px² on a phone's whole world) keep their whole
 * outline and say how big they are, to be drawn at least a speck big while too small to see.
 */
const SMALL_AREA = 600;

// Shapes Natural Earth keeps apart from the country they belong to, and ones without an ISO number.
const BY_NAME = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' };

const topology = JSON.parse(
  readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'),
);
const codeOf = (shape) => BY_NAME[shape.properties.name] ?? isoCountries.numericToAlpha2(shape.id);
const skipped = new Set();

/** The countries' shapes by code, without Antarctica (not a trip, and half the height). */
function byCountry(shapes) {
  const byCode = new Map();
  for (const shape of shapes) {
    const code = codeOf(shape);
    if (!code) {
      skipped.add(`${shape.id ?? '?'} ${shape.properties.name}`);
      continue;
    }
    if (code !== 'AQ') byCode.set(code, [...(byCode.get(code) ?? []), shape]);
  }
  return byCode;
}
const collectionOf = (byCode) => ({
  type: 'FeatureCollection',
  features: [...byCode.values()].flat(),
});

// The small countries, by their whole outlines on the map.
const whole = byCountry(feature(topology, topology.objects.countries).features);
const wholePath = geoPath(geoNaturalEarth1().fitWidth(WIDTH, collectionOf(whole)));
const areaOf = (parts) => wholePath.area({ type: 'FeatureCollection', features: parts });
const small = new Set(
  [...whole].filter(([, parts]) => areaOf(parts) < SMALL_AREA).map(([code]) => code),
);

// Their arcs (the lines between two countries' borders, or a coast) keep every point.
const weighted = presimplify(topology);
const keepAll = (arcs) => {
  if (typeof arcs[0] !== 'number') return arcs.forEach(keepAll);
  for (const arc of arcs) for (const point of weighted.arcs[arc < 0 ? ~arc : arc]) point[2] = Infinity;
};
for (const geometry of topology.objects.countries.geometries) {
  if (geometry.arcs && small.has(codeOf(geometry))) keepAll(geometry.arcs);
}
const simplified = simplify(weighted, quantile(presimplify(topology), KEEP));
const byCode = byCountry(feature(simplified, simplified.objects.countries).features);

const collection = collectionOf(byCode);
const projection = geoNaturalEarth1().fitWidth(WIDTH, collection);
const path = geoPath(projection).digits(0);
const [[, top], [, bottom]] = path.bounds(collection);
const height = Math.ceil(bottom - top);
projection.translate([projection.translate()[0], projection.translate()[1] - top]);

/**
 * d3's path (`M1,2L3,4Z`, whole numbers) shorter: each point after a ring's first one from the one
 * before (`M1,2l2,2z`), the same point twice once, and rings that are a single point left out. A
 * country that is only such points (the Vatican) is its first one, a line of no length: drawn with
 * a round end, it is a dot.
 */
function compact(d) {
  let out = '';
  for (const ring of d.split('Z')) {
    const points = [...ring.matchAll(/(-?\d+),(-?\d+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
    let [lastX, lastY] = points[0] ?? [];
    let moves = '';
    for (const [x, y] of points.slice(1)) {
      if (x === lastX && y === lastY) continue;
      const [dx, dy] = [x - lastX, y - lastY];
      moves += `${moves && dx >= 0 ? ' ' : ''}${dx}${dy >= 0 ? ',' : ''}${dy}`;
      [lastX, lastY] = [x, y];
    }
    if (moves) out += `M${points[0][0]},${points[0][1]}l${moves}z`;
  }
  const [, x, y] = d.match(/(-?\d+),(-?\d+)/) ?? [];
  return out || (x ? `M${x},${y}l0,0` : '');
}

const rows = [];
for (const [code, parts] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
  const country = { type: 'FeatureCollection', features: parts };
  const d = compact(path(country) ?? '');
  if (!d) {
    skipped.add(`${code} (no outline left)`);
    continue;
  }
  const row = [code, d];
  if (small.has(code)) row.push(Math.max(1, Math.round(Math.sqrt(path.area(country)))));
  rows.push(row);
}

const out = `// Generated by scripts/world-map.mjs from Natural Earth 1:50m (public domain). Don't edit.

/** The map's size in its own units (Natural Earth projection, without Antarctica). */
export const WORLD_WIDTH = ${WIDTH};
export const WORLD_HEIGHT = ${height};

/**
 * Each country: its ISO 3166-1 alpha-2 code, its outline as an SVG path, and for one too small to
 * see on the whole world, about how big it is (the side of a square as big, in the map's units).
 */
export const WORLD_COUNTRIES: readonly (
  | readonly [code: string, path: string]
  | readonly [code: string, path: string, size: number]
)[] = ${JSON.stringify(rows)};
`;
const target = resolve('src/features/countries/worldMap.ts');
writeFileSync(target, out);
console.log(`${rows.length} countries, ${height}px high, ${out.length} bytes -> ${target}`);

// The codes alone, for screens that name countries without drawing the map.
writeFileSync(
  resolve('src/features/countries/countryCodes.ts'),
  `// Generated by scripts/world-map.mjs along with worldMap.ts. Don't edit.

/**
 * Every country on the map, by ISO 3166-1 alpha-2 code (XK: Kosovo); apart from the map's shapes,
 * so screens that only name countries don't load the map.
 */
export const COUNTRY_CODES: readonly string[] = ${JSON.stringify(rows.map(([code]) => code))};
`,
);
console.log(`small: ${rows.filter((r) => r.length > 2).map((r) => `${r[0]} ${r[2]}`).join(', ')}`);
if (skipped.size) console.log(`skipped: ${[...skipped].join('; ')}`);
