/* ───────────────────────────────────────────────
   Atlas Histórico Municipal de España — app.js
   D3 v7 + topojson-client + ES modules. Sin bundler.
   ─────────────────────────────────────────────── */

const state = {
    data: null,               // poblacion.json (kept for legacy population path)
    municipios: null,         // GeoJSON convertido desde topojson
    provincias: null,
    comunidades: null,
    overlays: {},             // overlays cargados (calzadas, etc.)
    sources: {                // each entry: null until lazy-loaded
        'historeco.json': null,
        'usos_suelo.json': null,
        'calzada.json': null,
        'clima_mensual_andalucia.json': null,
    },
    catalog: null,            // atlas_indicators.json — index of all 43 indicators
    categories: null,         // dict built from catalog (8 categories)
    yearIdx: 0,    // index into the active indicator's years array
    category: "poblacion",
    indicator: "pob",
    mainTab: "map",
    activeOverlays: new Set(),// overlays activos en transporte
    viewLevel: "mun",         // mun | prov | ccaa
    selectedInes: [],
    selectedTrendIndicators: [],
    trendLayout: "auto",      // auto | overlay | facet-muni | facet-indicator
    landMetric: "absolute",   // absolute | share, only for land-use area indicators
    trendSidebarOpen: true,
    trendOpenDropdown: null,
    climateMonthlyPromise: null,
    climateMonthlyError: null,
    climateTrendMode: "series", // series | stripes | decades | climogram
    hoveredIne: null,
    playing: false,
    playTimer: null,
    animFrameYear: null,
};

// Years array of the active indicator (poblacion's by default).
let CENSUS = [];
let YEAR_MIN = 1900, YEAR_MAX = 2025;

// Paleta secuencial estilo Opportunity Atlas:
// quintil bajo = beige tenue (visible sobre el azul-gris del mar),
// quintil alto = rojo profundo (las ciudades destacan).
const POP_COLORS = ["#fbe8c2", "#fbc887", "#f59055", "#d44e2a", "#7d1f0d"];
const CAMBIO_COLORS = ["#1f3a5f", "#5781a8", "#a8c6dd", "#f2efe9", "#e9b694", "#b35a32", "#5e1a0c"];
const LINE_COLORS = ["#c0392b", "#2b5797", "#2d8659", "#7d4ba0", "#c97f1c", "#475569", "#9b1d1d", "#0e7490"];
const NO_DATA_COLOR = "#e4e8ec";
const CLIMATE_MONTHLY_SOURCE = "clima_mensual_andalucia.json";
const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Order + display labels + icons for the 8 categories surfaced in the top tabs.
// Categories not listed here are dropped from the UI.
const CATEGORY_DEF = [
    { id: 'poblacion',  label: 'Población',  icon: '<path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' },
    { id: 'demografia', label: 'Demografía', icon: '<path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>' },
    { id: 'clima',      label: 'Clima',      icon: '<path fill="currentColor" d="M19.36 10.04C18.68 6.59 15.65 4 12 4c-2.9 0-5.41 1.65-6.65 4.06C2.34 8.43 0 10.97 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.65-2.06-4.79-4.64-4.96z"/>' },
    { id: 'usos_suelo', label: 'Usos del suelo', icon: '<path fill="currentColor" d="M3 17l4-3 3 2 4-4 4 2 3-2v6H3z"/><path fill="currentColor" opacity="0.4" d="M3 11l4-3 3 2 4-4 4 2 3-2v3l-3 2-4-2-4 4-3-2-4 3z"/>' },
    { id: 'hidrologia', label: 'Hidrología', icon: '<path fill="currentColor" d="M12 2C8 6 4 10 4 14a8 8 0 0016 0c0-4-4-8-8-12z"/>' },
    { id: 'geografia',  label: 'Geografía',  icon: '<path fill="currentColor" d="M14 6l-4.22 5.63 1.25 1.67L14 9.33 19 16H5.76l3.27-4.36L9.78 11 11 12.42 5 20h14l-5-8z"/>' },
    { id: 'transporte', label: 'Transporte', icon: '<path fill="currentColor" d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2zM18 14l4 3-4 3v-6z"/>' },
    { id: 'transporte_historico', label: 'Histórico', icon: '<path fill="currentColor" d="M3 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h12v2H3zm14 0h4v2h-4z"/>' },
];

// Categories with type='derived' have computed indicators (densidad, cambio etc.)
// derived from the population panel. The rest map to source files via the catalog.
const DERIVED_INDICATORS = {
    pob:     { name: 'Población total',   desc: 'Habitantes por municipio.', kind: 'pop' },
    pob_log: { name: 'Población (log)',   desc: 'Escala logarítmica: contraste rural-urbano.', kind: 'pop_log' },
    densidad:{ name: 'Densidad',          desc: 'Habitantes por km².', kind: 'densidad' },
    cambio:  { name: 'Cambio % desde 1900', desc: 'Variación porcentual respecto a 1900.', kind: 'cambio' },
};

// Geo overlays (lines, points). Belong to category 'transporte'.
const OVERLAY_INDICATORS = [
    { id: 'calzadas',    name: 'Calzadas romanas',     desc: 'Red viaria romana en Hispania (ss. I a.C. - V d.C.).', file: 'data/calzadas_romanas.geojson', style: 'ov-roman', temporal: false },
    { id: 'fc_iberico',  name: 'Ferrocarril iberico',  desc: 'Red de via iberica historica.',                         file: 'data/ferrocarril_iberico.geojson',  style: 'ov-rail-iberian', temporal: true, startYear: 1855 },
    { id: 'fc_estrecho', name: 'Ferrocarril estrecho', desc: 'Red de via estrecha historica.',                         file: 'data/ferrocarril_estrecho.geojson', style: 'ov-rail-narrow', temporal: true, startYear: 1880 },
    { id: 'fc_ave',      name: 'AVE / Alta velocidad', desc: 'Red ferroviaria de alta velocidad.',                     file: 'data/ferrocarril_ave.geojson',     style: 'ov-rail-hsr', temporal: true, startYear: 1992 },
];

let CATEGORIES = {};  // populated by buildCategoriesFromCatalog()

function catalogIndicator(indId) {
    return state.catalog?.indicators.find(i => i.id === indId) || null;
}

function isLandUseShareIndicatorId(indId) {
    const id = (indId || "").toLowerCase();
    return id.endsWith("_share_pct") || id.endsWith("_pct") || id.includes("_share_");
}

function isLandUseAreaIndicator(indId) {
    const ind = catalogIndicator(indId);
    if (!ind || ind.category !== "usos_suelo" || isLandUseShareIndicatorId(indId)) return false;
    const unit = (ind.unit || "").toLowerCase();
    return unit.includes("ha") || unit.includes("m²") || unit.includes("m2") || unit.includes("km²") || unit.includes("km2");
}

function usesLandShareMetric(indId) {
    return state.landMetric === "share" && isLandUseAreaIndicator(indId);
}

function landUseShareSourceId(indId) {
    const candidate = (indId || "").replace(/_ha$/i, "_share_pct");
    if (candidate !== indId && catalogIndicator(candidate)) return candidate;
    return null;
}

function municipalAreaHa(ine) {
    const areaKm2 = state.data?.municipios?.[ine]?.area_km2;
    return Number.isFinite(areaKm2) && areaKm2 > 0 ? areaKm2 * 100 : null;
}

function effectiveIndicatorUnit(indId, fallback = "") {
    return usesLandShareMetric(indId) ? "%" : fallback;
}

function isClimateCategoryActive() {
    return state.category === "clima";
}

function supportsClimateAnnualViews() {
    return isClimateCategoryActive();
}

function buildCategoriesFromCatalog() {
    const out = {};
    // Población = derived layers from poblacion.json + overlays
    out.poblacion = {
        label: 'Población',
        type: 'choropleth',
        indicators: Object.entries(DERIVED_INDICATORS).map(([id, m]) => ({ id, name: m.name, desc: m.desc })),
        default: 'pob',
    };
    // Transporte = overlay layers (lines, not choropleth) + 2 distance choropleths from historeco
    out.transporte = {
        label: 'Transporte',
        type: 'mixed', // overlays + indicator pills both available
        indicators: OVERLAY_INDICATORS.map(o => ({ ...o, kind: 'overlay' })),
        default: null,
        autoOverlays: OVERLAY_INDICATORS.map(o => o.id),
        // Plus distance-based choropleths from historeco
        choroplethExtras: [],
    };
    // The rest of the categories come straight from the catalog
    for (const ind of state.catalog.indicators) {
        let cat = ind.category;
        if (cat === 'poblacion') continue;       // already handled
        if (cat === 'demografia') cat = 'poblacion';
        if (cat === 'usos_suelo' && isLandUseShareIndicatorId(ind.id)) continue;
        if (!out[cat]) {
            out[cat] = {
                label: CATEGORY_DEF.find(d => d.id === cat)?.label || cat,
                type: 'choropleth',
                indicators: [],
                default: null,
            };
        }
        out[cat].indicators.push({
            id: ind.id,
            name: displayIndicatorName(ind.name),
            rawName: ind.name,
            desc: `${displayIndicatorName(ind.name)} (${ind.unit}). Fuente: ${ind.source_file.replace('.json', '')}.`,
            unit: ind.unit,
            sourceFile: ind.source_file,
            kind: cat === 'transporte' ? 'distance' : undefined,
        });
        if (!out[cat].default && cat !== 'transporte') out[cat].default = ind.id;
    }
    // Move transport indicators from catalog (highspeed, airport) into the transporte category
    if (out.transporte_historico) {
        // 'transporte_historico' = single calzada indicator. Merge with 'transporte'? Keep separate for now.
    }
    CATEGORIES = out;
}

const $ = (s) => document.querySelector(s);
const map = d3.select("#map");
const tooltip = $("#tooltip");

let projection, pathGen, pathGenMain, pathGenCanarias;
let mapSize = { w: 0, h: 0 };
let insetFrames = [];

function displayIndicatorName(name = "") {
    return String(name)
        .replace(/\s*\([^)]*\b(?:18|19|20)\d{2}\b[^)]*\)/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function normalizeSearchText(text = "") {
    return String(text)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

// ───────── Loading helpers ─────────
function setLoading(status, pct) {
    const el = $("#loading-status");
    if (el && status != null) el.textContent = status;
    const bar = $("#loading-bar-fill");
    if (bar && pct != null) bar.style.width = `${Math.round(pct * 100)}%`;
}
function hideLoading() {
    $("#loading").classList.add("hidden");
}

async function loadJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const text = await response.text();
    return JSON.parse(text.replace(/-?\bInfinity\b/g, "null"));
}

function rewindPolygonRings(geometry) {
    if (!geometry) return geometry;
    if (geometry.type === "Polygon") {
        geometry.coordinates.forEach(ring => ring.reverse());
    } else if (geometry.type === "MultiPolygon") {
        geometry.coordinates.forEach(poly => poly.forEach(ring => ring.reverse()));
    }
    return geometry;
}

function rewindFeatureCollection(collection) {
    collection.features.forEach(f => rewindPolygonRings(f.geometry));
    return collection;
}

// ───────── Data load ─────────
async function loadData() {
    setLoading("Cargando catálogo…", 0.03);
    state.catalog = await loadJson("data/atlas_indicators.json");

    setLoading("Cargando población…", 0.10);
    const pob = await loadJson("data/poblacion.json");
    state.data = pob;
    CENSUS = pob.years;
    YEAR_MIN = CENSUS[0];
    YEAR_MAX = CENSUS[CENSUS.length - 1];
    state.yearIdx = CENSUS.length - 1;

    setLoading("Cargando provincias…", 0.25);
    setLoading("Cargando municipios (2.1 MB)…", 0.5);
    const munTopo = await loadJson("data/municipios.topojson");
    setLoading("Procesando geometrías…", 0.85);
    state.municipios = rewindFeatureCollection(topojson.feature(munTopo, Object.values(munTopo.objects)[0]));

    state.municipios.features = state.municipios.features.filter(f => {
        const m = pob.municipios[f.properties.ine];
        const code = provinceCode(f);
        return m && code !== "51" && code !== "52";
    });

    state.municipios.features.forEach(f => {
        const m = pob.municipios[f.properties.ine];
        if (m) {
            if (!Number.isFinite(m.area_km2) || m.area_km2 <= 0) {
                const computedArea = geometryAreaKm2(f.geometry);
                if (computedArea > 0) m.area_km2 = computedArea;
            }
            f.properties.name = m.name;
            f.properties.prov = m.prov;
            f.properties.ccaa = m.ccaa_code;
            f.properties.area = m.area_km2;
        }
    });
    buildAdminLayersFromMunicipalTopo(munTopo, pob);

    buildCategoriesFromCatalog();
}

function buildAdminLayersFromMunicipalTopo(munTopo, pob) {
    const object = Object.values(munTopo.objects)[0];
    const provinceGroups = new Map();
    const ccaaGroups = new Map();
    const provinceToCcaa = new Map();

    object.geometries.forEach(g => {
        const m = pob.municipios[g.properties?.ine];
        if (!isMuniIncluded(m) || !m.prov || !m.ccaa_code) return;
        if (!provinceGroups.has(m.prov)) provinceGroups.set(m.prov, []);
        if (!ccaaGroups.has(m.ccaa_code)) ccaaGroups.set(m.ccaa_code, []);
        provinceGroups.get(m.prov).push(g);
        ccaaGroups.get(m.ccaa_code).push(g);
        if (!provinceToCcaa.has(m.prov)) provinceToCcaa.set(m.prov, m.ccaa_code);
    });

    state.provincias = {
        type: "FeatureCollection",
        features: Array.from(provinceGroups, ([code, geometries]) => ({
            type: "Feature",
            properties: {
                code,
                name: pob.provincias?.[code]?.name || code,
                ccaa: provinceToCcaa.get(code) || "",
            },
            geometry: stripInteriorRings(topojson.merge(munTopo, geometries)),
        })).sort((a, b) => a.properties.code.localeCompare(b.properties.code)),
    };

    state.comunidades = {
        type: "FeatureCollection",
        features: Array.from(ccaaGroups, ([code, geometries]) => ({
            type: "Feature",
            properties: {
                code,
                name: pob.ccaa?.[code]?.name || code,
                inset: code === "05" ? "canarias" : null,
            },
            geometry: stripInteriorRings(topojson.merge(munTopo, geometries)),
        })).sort((a, b) => a.properties.code.localeCompare(b.properties.code)),
    };
}

// Lazy-load a non-population source file (historeco, usos_suelo, calzada).
// Returns the parsed JSON (cached after first call). Invalidates the colour-
// scale cache for indicators that live in this file (their values were
// previously unknown, so any cached scale was nonsense).
async function loadSource(filename) {
    if (state.sources[filename]) return state.sources[filename];
    setLoading(`Cargando ${filename}…`, null);
    const data = await loadJson(`data/${filename}`);
    state.sources[filename] = data;
    _scaleCache.clear();
    _aggregateCache.clear();
    return data;
}

// Resolve which source file an indicator's data lives in.
function indicatorSourceFile(indId) {
    if (DERIVED_INDICATORS[indId]) return null; // population derived — uses state.data
    const meta = state.catalog?.indicators.find(i => i.id === indId);
    return meta?.source_file || null;
}

// Years array of a given indicator (or null if it has no time dimension).
function indicatorYears(indId) {
    if (DERIVED_INDICATORS[indId]) return state.data.years;
    const src = indicatorSourceFile(indId);
    if (!src) return null;
    const data = state.sources[src];
    if (!data) return null;       // not loaded yet
    return data.years || null;     // calzada has no years → null = single value
}

// Get the time series of an indicator at a given municipio. Returns array or null.
function indicatorSeriesAt(ine, indId) {
    if (DERIVED_INDICATORS[indId]) {
        return state.data.municipios[ine]?.pob || null;
    }
    const src = indicatorSourceFile(indId);
    if (!src) return null;
    const data = state.sources[src];
    if (!data) return null;
    const muni = data.data?.[ine];
    if (!muni) return null;
    const v = muni[indId];
    if (Array.isArray(v)) return v;
    if (v == null) return null;
    return [v]; // calzada: single scalar wrapped as length-1 array
}

// ───────── Map setup ─────────
function provinceCode(feature) {
    return feature?.properties?.ine?.slice(0, 2) || feature?.properties?.code || "";
}

function featureCollection(features) {
    return { type: "FeatureCollection", features };
}

function visitCoordinates(geometry, cb) {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") {
        geometry.geometries.forEach(g => visitCoordinates(g, cb));
        return;
    }
    const scan = (coords) => {
        if (!coords) return;
        if (typeof coords[0] === "number" && typeof coords[1] === "number") {
            cb(coords);
        } else {
            coords.forEach(scan);
        }
    };
    scan(geometry.coordinates);
}

function ringAreaKm2(ring) {
    const points = ring.filter(p => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
    if (points.length < 3) return 0;
    const lat0 = d3.mean(points, p => p[1]) * Math.PI / 180;
    const radiusKm = 6371.0088;
    const xy = points.map(([lon, lat]) => [
        radiusKm * lon * Math.PI / 180 * Math.cos(lat0),
        radiusKm * lat * Math.PI / 180,
    ]);
    let sum = 0;
    for (let i = 0; i < xy.length; i++) {
        const [x1, y1] = xy[i];
        const [x2, y2] = xy[(i + 1) % xy.length];
        sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
}

function geometryAreaKm2(geometry) {
    if (!geometry) return 0;
    if (geometry.type === "Polygon") {
        const rings = geometry.coordinates || [];
        if (!rings.length) return 0;
        const outer = ringAreaKm2(rings[0]);
        const holes = rings.slice(1).reduce((acc, ring) => acc + ringAreaKm2(ring), 0);
        return Math.max(0, outer - holes);
    }
    if (geometry.type === "MultiPolygon") {
        return (geometry.coordinates || []).reduce((acc, poly) => {
            const outer = ringAreaKm2(poly[0] || []);
            const holes = poly.slice(1).reduce((sum, ring) => sum + ringAreaKm2(ring), 0);
            return acc + Math.max(0, outer - holes);
        }, 0);
    }
    if (geometry.type === "GeometryCollection") {
        return geometry.geometries.reduce((acc, g) => acc + geometryAreaKm2(g), 0);
    }
    return 0;
}

function stripInteriorRings(geometry) {
    if (!geometry) return geometry;
    if (geometry.type === "Polygon") {
        return { ...geometry, coordinates: geometry.coordinates.slice(0, 1) };
    }
    if (geometry.type === "MultiPolygon") {
        return {
            ...geometry,
            coordinates: geometry.coordinates.map(poly => poly.slice(0, 1)),
        };
    }
    if (geometry.type === "GeometryCollection") {
        return { ...geometry, geometries: geometry.geometries.map(stripInteriorRings) };
    }
    return geometry;
}

function coordinateBounds(features) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    features.forEach(f => visitCoordinates(f.geometry, ([x, y]) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }));
    return [[minX, minY], [maxX, maxY]];
}

function fitMercatorByBounds(features, extent) {
    if (!features.length) return null;
    const [[minX, minY], [maxX, maxY]] = coordinateBounds(features);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    const center = [(minX + maxX) / 2, (minY + maxY) / 2];
    const proj = d3.geoMercator().center(center).scale(1).translate([0, 0]);
    const p1 = proj([minX, maxY]);
    const p2 = proj([maxX, minY]);
    const scale = Math.min(
        (extent[1][0] - extent[0][0]) / Math.max(1e-9, p2[0] - p1[0]),
        (extent[1][1] - extent[0][1]) / Math.max(1e-9, p2[1] - p1[1])
    );
    const targetCx = (extent[0][0] + extent[1][0]) / 2;
    const targetCy = (extent[0][1] + extent[1][1]) / 2;
    const sourceCx = (p1[0] + p2[0]) / 2;
    const sourceCy = (p1[1] + p2[1]) / 2;
    proj.scale(scale).translate([targetCx - scale * sourceCx, targetCy - scale * sourceCy]);
    return proj;
}

function fmtCoord(value) {
    return Math.round(value * 1000) / 1000;
}

function pointPath(point, proj) {
    const p = proj(point);
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1])
        ? `${fmtCoord(p[0])},${fmtCoord(p[1])}`
        : null;
}

function ringPath(ring, proj) {
    const points = ring.map(pt => pointPath(pt, proj)).filter(Boolean);
    return points.length ? `M${points.join("L")}Z` : "";
}

function linePath(line, proj) {
    const points = line.map(pt => pointPath(pt, proj)).filter(Boolean);
    return points.length ? `M${points.join("L")}` : "";
}

function geometryPath(geometry, proj) {
    if (!geometry || !proj) return "";
    if (geometry.type === "Polygon") {
        return geometry.coordinates.map(ring => ringPath(ring, proj)).join("");
    }
    if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.flatMap(poly => poly.map(ring => ringPath(ring, proj))).join("");
    }
    if (geometry.type === "LineString") {
        return linePath(geometry.coordinates, proj);
    }
    if (geometry.type === "MultiLineString") {
        return geometry.coordinates.map(line => linePath(line, proj)).join("");
    }
    if (geometry.type === "GeometryCollection") {
        return geometry.geometries.map(g => geometryPath(g, proj)).join("");
    }
    return "";
}

function featurePath(feature, proj) {
    return geometryPath(feature.geometry, proj);
}

function fitPath(features, extent) {
    if (!features.length) return null;
    const proj = fitMercatorByBounds(features, extent);
    return proj ? (feature) => featurePath(feature, proj) : null;
}

function setupProjection() {
    const svg = map.node();
    const rect = svg.getBoundingClientRect();
    const w = Math.max(rect.width, 100);
    const h = Math.max(rect.height, 100);
    mapSize = { w, h };
    map.attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMid meet");

    const insetCodes = new Set(["35", "38"]);
    const mainFeatures = state.municipios.features.filter(f => !insetCodes.has(provinceCode(f)));
    const canarias = state.municipios.features.filter(f => ["35", "38"].includes(provinceCode(f)));

    const pad = Math.min(26, Math.max(12, w * 0.02));
    const canaryW = Math.min(250, Math.max(150, w * 0.22));
    const canaryH = Math.min(110, Math.max(76, h * 0.18));
    const canaryX = pad;
    const canaryY = h - pad - canaryH;
    const reservedBottom = canarias.length ? Math.min(canaryH * 0.75, h * 0.16) : 0;
    const mainBottom = Math.max(pad + 90, h - pad - reservedBottom);
    projection = fitMercatorByBounds(mainFeatures, [[pad, pad], [w - pad, mainBottom]]);
    pathGenMain = (feature) => featurePath(feature, projection);

    pathGenCanarias = fitPath(canarias, [[canaryX + 10, canaryY + 18], [canaryX + canaryW - 10, canaryY + canaryH - 10]]);

    insetFrames = [
        pathGenCanarias && { label: "Canarias", x: canaryX, y: canaryY, w: canaryW, h: canaryH },
    ].filter(Boolean);

    pathGen = (feature) => {
        const code = provinceCode(feature);
        if ((feature.properties?.inset === "canarias" || code === "35" || code === "38") && pathGenCanarias) {
            return pathGenCanarias(feature);
        }
        return pathGenMain(feature);
    };
}

function renderInsetFrames() {
    const g = map.append("g").attr("class", "layer-insets");
    g.selectAll("rect")
        .data(insetFrames)
        .enter().append("rect")
        .attr("class", "inset-frame")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("width", d => d.w)
        .attr("height", d => d.h);
    g.selectAll("text")
        .data(insetFrames)
        .enter().append("text")
        .attr("class", "inset-label")
        .attr("x", d => d.x + 8)
        .attr("y", d => d.y + 13)
        .text(d => d.label);
}

function setupIntro() {
    const intro = $("#intro-view");
    if (!intro) return;
    const enter = $("#intro-enter");
    let introMotionFrame = null;
    let introPointer = { x: 0, y: 0 };

    const moveIntroCompass = () => {
        introMotionFrame = null;
        const orbit = intro.querySelector(".intro-compass-orbit");
        if (!orbit) return;
        const strength = Math.min(intro.clientWidth, intro.clientHeight) < 700 ? 10 : 18;
        orbit.setAttribute("transform", `translate(${introPointer.x * strength},${introPointer.y * strength})`);
    };

    const queueIntroCompassMove = (event) => {
        const rect = intro.getBoundingClientRect();
        introPointer = {
            x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
            y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
        };
        if (!introMotionFrame) introMotionFrame = requestAnimationFrame(moveIntroCompass);
    };

    const resetIntroCompass = () => {
        introPointer = { x: 0, y: 0 };
        if (!introMotionFrame) introMotionFrame = requestAnimationFrame(moveIntroCompass);
    };

    const closeIntro = () => {
        intro.classList.add("hidden");
        document.body.classList.add("intro-dismissed");
    };
    enter?.addEventListener("click", closeIntro);
    intro.addEventListener("pointermove", queueIntroCompassMove);
    intro.addEventListener("pointerleave", resetIntroCompass);
}

function renderIntroMap() {
    const introSvg = d3.select("#intro-map");
    if (introSvg.empty() || !state.municipios || !state.provincias || !state.comunidades) return;
    const node = introSvg.node();
    const rect = node.getBoundingClientRect();
    const w = Math.max(rect.width, 640);
    const h = Math.max(rect.height, 420);
    introSvg.attr("viewBox", `0 0 ${w} ${h}`).selectAll("*").remove();

    const isCanariasFeature = (feature) => feature.properties?.inset === "canarias" || ["35", "38"].includes(provinceCode(feature)) || feature.properties?.code === "05";
    const introMunicipios = state.municipios.features.filter(f => !isCanariasFeature(f));
    const introProvincias = state.provincias.features.filter(f => !isCanariasFeature(f));
    const introComunidades = state.comunidades.features.filter(f => !isCanariasFeature(f));
    const compactIntro = rect.width < 760 || rect.height < 620;
    const mapBounds = compactIntro
        ? [[w * 0.1, h * 0.08], [w * 0.9, h * 0.6]]
        : [[w * 0.22, h * 0.05], [w * 0.78, h * 0.68]];
    const projMain = fitMercatorByBounds(introMunicipios, mapBounds);
    const introPath = (feature) => featurePath(feature, projMain);

    const defs = introSvg.append("defs");
    const glow = defs.append("filter")
        .attr("id", "intro-glow")
        .attr("x", "-40%")
        .attr("y", "-40%")
        .attr("width", "180%")
        .attr("height", "180%");
    glow.append("feGaussianBlur").attr("stdDeviation", 2.4).attr("result", "blur");
    glow.append("feColorMatrix")
        .attr("in", "blur")
        .attr("type", "matrix")
        .attr("values", "1 0 0 0 0.96  0 1 0 0 0.62  0 0 1 0 0.18  0 0 0 0.9 0")
        .attr("result", "glow");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "glow");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    introSvg.append("rect")
        .attr("class", "intro-sea")
        .attr("width", w)
        .attr("height", h);

    const scan = introSvg.append("g").attr("class", "intro-scan");
    for (let x = -w; x < w * 2; x += 34) {
        scan.append("line")
            .attr("x1", x)
            .attr("x2", x + h * 0.45)
            .attr("y1", 0)
            .attr("y2", h)
            .attr("stroke", "rgba(255,248,234,0.055)")
            .attr("stroke-width", 1);
    }

    const old1 = introSvg.append("g").attr("class", "intro-plate intro-plate-1");
    old1.selectAll("path")
        .data(introComunidades)
        .enter().append("path")
        .attr("class", "intro-old-fill")
        .attr("d", introPath);

    const old2 = introSvg.append("g").attr("class", "intro-plate intro-plate-2");
    old2.selectAll("path")
        .data(introProvincias)
        .enter().append("path")
        .attr("class", "intro-old-line")
        .attr("d", introPath);

    const modern = introSvg.append("g").attr("class", "intro-modern");
    modern.selectAll("path.intro-modern-fill")
        .data(introMunicipios)
        .enter().append("path")
        .attr("class", "intro-modern-fill")
        .attr("d", introPath);
    modern.selectAll("path.intro-modern-border")
        .data(introComunidades)
        .enter().append("path")
        .attr("class", "intro-modern-border")
        .attr("d", introPath);
    modern.selectAll("path.intro-coast")
        .data(introComunidades)
        .enter().append("path")
        .attr("class", "intro-coast")
        .attr("d", introPath);

    renderIntroCompass(introSvg, w, h, mapBounds);
}

function renderIntroCompass(svg, w, h, mapBounds) {
    const [[x0, y0], [x1, y1]] = mapBounds;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const r = Math.min(x1 - x0, y1 - y0, Math.min(w, h) * 0.52) * 0.43;
    const compass = svg.append("g")
        .attr("class", "intro-time-compass")
        .attr("transform", `translate(${cx},${cy})`);
    const orbit = compass.append("g").attr("class", "intro-compass-orbit");
    orbit.append("circle").attr("class", "intro-compass-ring").attr("r", r);
    orbit.append("circle").attr("class", "intro-compass-ring inner").attr("r", r * 0.72);
    orbit.append("circle").attr("class", "intro-compass-ring inner").attr("r", r * 0.43);

    const rotor = compass.append("g").attr("class", "intro-compass-rotor");
    rotor.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "rotate")
        .attr("from", "0")
        .attr("to", "360")
        .attr("dur", "10s")
        .attr("repeatCount", "indefinite");
    rotor.append("path")
        .attr("class", "intro-compass-sweep")
        .attr("d", d3.arc()
            .innerRadius(r * 0.1)
            .outerRadius(r * 0.92)
            .startAngle(-0.2)
            .endAngle(0.2)());
    rotor.append("line").attr("class", "intro-compass-hand").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", -r * 0.92);
    rotor.append("line").attr("class", "intro-compass-hand alt").attr("x1", 0).attr("y1", 0).attr("x2", r * 0.6).attr("y2", 0);
    rotor.append("circle").attr("r", 5).attr("fill", "#f7d46f");

    const eras = [
        { year: "1570", a: -120 },
        { year: "1788", a: -52 },
        { year: "1857", a: 14 },
        { year: "1900", a: 82 },
        { year: "2025", a: 148 },
    ];
    eras.forEach((era, i) => {
        const a = era.a * Math.PI / 180;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const g = orbit.append("g").attr("class", "intro-era-mark").attr("transform", `translate(${x},${y})`);
        g.append("circle")
            .attr("r", 3)
            .style("animation-delay", `${i * 1.4}s`);
        g.append("text")
            .attr("y", y < 0 ? -16 : 16)
            .text(era.year);
    });
}

// Render municipios en chunks para no bloquear el hilo principal
async function renderMapProgressive() {
    setupProjection();
    map.selectAll("*").remove();
    applyViewLevelClass();
    map.append("rect")
        .attr("class", "map-background")
        .attr("width", mapSize.w)
        .attr("height", mapSize.h);
    map.append("g").attr("class", "layer-municipios");
    map.append("g").attr("class", "layer-provincias-fill");
    map.append("g").attr("class", "layer-ccaa-fill");
    map.append("g").attr("class", "layer-boundaries");
    map.append("g").attr("class", "layer-overlays");

    const feats = state.municipios.features;
    const total = feats.length;
    const CHUNK = 1500;
    const useChoropleth = isPaintableIndicator(state.indicator);
    const colorFn = useChoropleth ? colorScaleFor(state.indicator) : null;
    const layer = state.indicator;
    const groupedValues = useChoropleth ? aggregateValuesForLevel(state.viewLevel, layer, currentYear()) : null;

    const gMun = map.select("g.layer-municipios");
    for (let i = 0; i < total; i += CHUNK) {
        const slice = feats.slice(i, i + CHUNK);
        gMun.selectAll(null)
            .data(slice)
            .enter().append("path")
            .attr("class", "municipio")
            .attr("d", pathGen)
            .attr("data-ine", d => d.properties.ine)
            .attr("fill", d => {
                if (!useChoropleth) return NO_DATA_COLOR;
                const v = valueForFeature(d, layer, currentYear(), groupedValues);
                return v == null ? NO_DATA_COLOR : colorFn(v);
            })
            .on("mouseover", onMuniHover)
            .on("mouseleave", onMuniLeave)
            .on("click", onMuniClick);

        const pct = 0.85 + 0.13 * Math.min(1, (i + CHUNK) / total);
        setLoading(`Renderizando ${Math.min(i + CHUNK, total)} / ${total} municipios…`, pct);
        await new Promise(r => setTimeout(r, 0));
    }

    // Provincias (líneas)
    const gProvFill = map.select("g.layer-provincias-fill");
    gProvFill.selectAll("path.provincia-fill")
        .data(state.provincias.features)
        .enter().append("path")
        .attr("class", "provincia-fill")
        .attr("d", pathGen)
        .attr("data-code", d => d.properties.code)
        .attr("fill", NO_DATA_COLOR)
        .on("mouseover", onMuniHover)
        .on("mouseleave", onMuniLeave);

    const gCcaaFill = map.select("g.layer-ccaa-fill");
    gCcaaFill.selectAll("path.ccaa-fill")
        .data(state.comunidades.features)
        .enter().append("path")
        .attr("class", "ccaa-fill")
        .attr("d", pathGen)
        .attr("data-code", d => d.properties.code)
        .attr("fill", NO_DATA_COLOR)
        .on("mouseover", onMuniHover)
        .on("mouseleave", onMuniLeave);

    const gBoundary = map.select("g.layer-boundaries");
    gBoundary.selectAll("path.provincia-line")
        .data(state.provincias.features)
        .enter().append("path")
        .attr("class", "provincia-line")
        .attr("d", pathGen);
    gBoundary.selectAll("path.ccaa-line")
        .data(state.comunidades.features)
        .enter().append("path")
        .attr("class", "ccaa-line")
        .attr("d", pathGen);

    await renderActiveOverlays();
    renderInsetFrames();
    paintMunicipios();

    refreshSelectionStyles();
    setLoading("Listo", 1);
    setTimeout(hideLoading, 250);
}

// ───────── Value computation ─────────
function currentYear() {
    return state.animFrameYear ?? CENSUS[state.yearIdx];
}

// Linearly interpolate a value from a series along a years grid.
function interpSeries(series, years, year) {
    if (!series || !years || years.length === 0) return null;
    if (series.length === 1) return series[0]; // static (no time dimension)
    const n = Math.min(series.length, years.length);
    const valid = (v) => v != null && Number.isFinite(v);
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < n; i++) {
        if (years[i] <= year && valid(series[i])) lo = i;
        if (years[i] >= year && valid(series[i])) {
            hi = i;
            break;
        }
    }
    if (lo < 0 && hi < 0) return null;
    if (lo < 0) return series[hi];
    if (hi < 0) return series[lo];
    if (lo === hi) return series[lo];
    const v0 = series[lo], v1 = series[hi];
    const span = years[hi] - years[lo];
    if (span === 0) return v0;
    const t = (year - years[lo]) / span;
    return v0 + t * (v1 - v0);
}

function getMuniValueAnim(ine, year) {
    return interpSeries(state.data.municipios[ine]?.pob, state.data.years, year);
}

// Generic raw value getter for ANY indicator (derived from population, or from
// historeco / usos_suelo / calzada). Returns null when data is not loaded yet.
function indicatorRawValue(ine, indId, year) {
    if (indId === 'cambio') {
        const m = state.data.municipios[ine];
        if (!m) return null;
        const v0 = m.pob?.[0];
        const vN = getMuniValueAnim(ine, year);
        if (v0 == null || vN == null || v0 === 0) return null;
        return ((vN - v0) / v0) * 100;
    }
    if (indId === 'densidad') {
        const m = state.data.municipios[ine];
        if (!m) return null;
        const v = getMuniValueAnim(ine, year);
        const area = m.area_km2;
        if (v == null || !area || area <= 0) return null;
        return v / area;
    }
    if (indId === 'pob' || indId === 'pob_log') {
        return getMuniValueAnim(ine, year);
    }
    // Generic catalog indicator
    const series = indicatorSeriesAt(ine, indId);
    if (!series) return null;
    const years = indicatorYears(indId);
    if (!years) return series[0]; // static (calzada-style)
    return interpSeries(series, years, year);
}

function landUseShareValue(ine, indId, year, rawAreaValue = null) {
    const shareId = landUseShareSourceId(indId);
    if (shareId) {
        const suppliedShare = indicatorRawValue(ine, shareId, year);
        if (suppliedShare != null && Number.isFinite(suppliedShare)) return suppliedShare;
    }
    const areaHa = municipalAreaHa(ine);
    const v = rawAreaValue ?? indicatorRawValue(ine, indId, year);
    if (v == null || !Number.isFinite(v) || !areaHa) return null;
    return (v / areaHa) * 100;
}

function indicatorValue(ine, indId, year) {
    const raw = indicatorRawValue(ine, indId, year);
    if (usesLandShareMetric(indId)) return landUseShareValue(ine, indId, year, raw);
    return raw;
}

// Backwards-compatible alias used by older code paths in this file.
function layerValue(ine, year, layer) { return indicatorValue(ine, layer, year); }

function isMuniIncluded(m) {
    return m && m.prov !== "51" && m.prov !== "52" && m.ccaa_code !== "18" && m.ccaa_code !== "19";
}

function featureGroupKey(feature, level = state.viewLevel) {
    const ine = feature?.properties?.ine;
    const m = state.data?.municipios?.[ine];
    if (level === "prov") return m?.prov || feature?.properties?.prov || feature?.properties?.code || provinceCode(feature);
    if (level === "ccaa") return m?.ccaa_code || feature?.properties?.ccaa || feature?.properties?.code || "";
    return ine;
}

function aggregationMode(indId) {
    if (usesLandShareMetric(indId)) return "area_share";
    if (indId === "densidad") return "density";
    if (indId === "cambio") return "change";
    if (indId === "pob" || indId === "pob_log") return "sum";

    const meta = indicatorMeta(indId);
    const id = (indId || "").toLowerCase();
    const name = (meta.name || "").toLowerCase();
    const unit = (meta.unit || "").toLowerCase();
    if (unit.includes("%") || id.includes("share")) return "mean";
    if (id.includes("distance") || id.startsWith("dist_") || id.startsWith("to_")) return "mean";
    if (
        unit.includes("ha") ||
        unit.includes("hm") ||
        id.includes("_ha") ||
        id.includes("area") ||
        name.includes("area") ||
        name.includes("superficie") ||
        name.includes("volumen")
    ) {
        return "sum";
    }
    return "mean";
}

function aggregateValuesForLevel(level, indId, year) {
    if (level === "mun") return null;
    const metricKey = usesLandShareMetric(indId) ? "share" : "absolute";
    const cacheKey = `${level}|${indId}|${metricKey}|${Math.round(year * 1000) / 1000}`;
    if (_aggregateCache.has(cacheKey)) return _aggregateCache.get(cacheKey);

    const mode = aggregationMode(indId);
    const groups = new Map();
    const bucketFor = (key) => {
        if (!groups.has(key)) {
            groups.set(key, { sum: 0, count: 0, pop: 0, basePop: 0, area: 0 });
        }
        return groups.get(key);
    };

    for (const [ine, m] of Object.entries(state.data?.municipios || {})) {
        if (!isMuniIncluded(m)) continue;
        const key = level === "prov" ? m.prov : m.ccaa_code;
        if (!key) continue;
        const bucket = bucketFor(key);

        if (mode === "density") {
            const pop = getMuniValueAnim(ine, year);
            if (pop != null && Number.isFinite(pop)) bucket.pop += pop;
            if (m.area_km2 > 0) bucket.area += m.area_km2;
            continue;
        }

        if (mode === "change") {
            const base = m.pob?.[0];
            const pop = getMuniValueAnim(ine, year);
            if (base != null && Number.isFinite(base)) bucket.basePop += base;
            if (pop != null && Number.isFinite(pop)) bucket.pop += pop;
            continue;
        }

        if (mode === "area_share") {
            const v = indicatorRawValue(ine, indId, year);
            const areaHa = municipalAreaHa(ine);
            if (v != null && Number.isFinite(v)) {
                bucket.sum += v;
                bucket.count += 1;
            }
            if (areaHa) bucket.area += areaHa;
            continue;
        }

        const v = indicatorValue(ine, indId, year);
        if (v == null || !Number.isFinite(v)) continue;
        bucket.sum += v;
        bucket.count += 1;
    }

    const values = new Map();
    groups.forEach((bucket, key) => {
        let value = null;
        if (mode === "density") {
            value = bucket.area > 0 ? bucket.pop / bucket.area : null;
        } else if (mode === "change") {
            value = bucket.basePop > 0 ? ((bucket.pop - bucket.basePop) / bucket.basePop) * 100 : null;
        } else if (mode === "area_share") {
            value = bucket.count > 0 && bucket.area > 0 ? (bucket.sum / bucket.area) * 100 : null;
        } else if (mode === "sum") {
            value = bucket.count > 0 ? bucket.sum : null;
        } else {
            value = bucket.count > 0 ? bucket.sum / bucket.count : null;
        }
        if (value != null && Number.isFinite(value)) values.set(key, value);
    });
    _aggregateCache.set(cacheKey, values);
    return values;
}

function valueForFeature(feature, indId, year, groupedValues = null) {
    if (state.viewLevel === "mun") return indicatorValue(feature.properties.ine, indId, year);
    const values = groupedValues || aggregateValuesForLevel(state.viewLevel, indId, year);
    return values?.get(featureGroupKey(feature, state.viewLevel)) ?? null;
}

function groupNameForFeature(feature) {
    const ine = feature?.properties?.ine;
    const m = state.data?.municipios?.[ine];
    if (!m) {
        if (state.viewLevel === "prov") return state.data.provincias[feature?.properties?.code]?.name || feature?.properties?.name || "";
        if (state.viewLevel === "ccaa") return state.data.ccaa[feature?.properties?.code]?.name || feature?.properties?.name || "";
        return feature?.properties?.name || "";
    }
    if (state.viewLevel === "prov") return state.data.provincias[m.prov]?.name || m.name;
    if (state.viewLevel === "ccaa") return state.data.ccaa[m.ccaa_code]?.name || m.name;
    return m.name;
}

function groupMetaForFeature(feature, year) {
    const ine = feature?.properties?.ine;
    const m = state.data?.municipios?.[ine];
    if (!m) {
        if (state.viewLevel === "prov") return `Provincia · ${Math.round(year)}`;
        if (state.viewLevel === "ccaa") return `CCAA · ${Math.round(year)}`;
        return `${Math.round(year)}`;
    }
    if (state.viewLevel === "prov") return `Provincia · ${Math.round(year)}`;
    if (state.viewLevel === "ccaa") return `CCAA · ${Math.round(year)}`;
    return `${state.data.provincias[m.prov]?.name ?? ""} · ${Math.round(year)}`;
}

// True if the current indicator is a paintable (choropleth) indicator,
// vs an overlay layer like calzadas / ferrocarril.
function isPaintableIndicator(indId) {
    if (!indId) return false;
    if (DERIVED_INDICATORS[indId]) return true;
    if (OVERLAY_INDICATORS.some(o => o.id === indId)) return false;
    return !!state.catalog?.indicators.find(i => i.id === indId);
}

function activeMapSelector() {
    if (state.viewLevel === "prov") return "path.provincia-fill";
    if (state.viewLevel === "ccaa") return "path.ccaa-fill";
    return "path.municipio";
}

function paintMunicipios() {
    const cat = CATEGORIES[state.category];
    const year = currentYear();
    const routeMode = state.category === "transporte" && !isPaintableIndicator(state.indicator);
    map.classed("route-mode", routeMode);
    map.selectAll("path.municipio,path.provincia-fill,path.ccaa-fill").attr("fill", NO_DATA_COLOR);

    if (isPaintableIndicator(state.indicator) && cat?.type !== 'placeholder') {
        const colorFn = colorScaleFor(state.indicator);
        const groupedValues = aggregateValuesForLevel(state.viewLevel, state.indicator, year);
        map.selectAll(activeMapSelector())
            .attr("fill", d => {
                const v = valueForFeature(d, state.indicator, year, groupedValues);
                return v == null ? NO_DATA_COLOR : colorFn(v);
            });
        renderLegend(state.indicator);
    } else if (cat?.type === 'mixed' || cat?.type === 'overlay') {
        renderOverlayLegend();
    } else {
        $("#legend").innerHTML = '';
    }
    updateOverlayVisibility(year);
    $("#timebar-year").textContent = Math.round(year);
    $("#legend-year").textContent = Math.round(year);
    updateSourceFooter();
    renderDataView();
}

// Look up an indicator's metadata (for unit, name) regardless of whether it's
// derived from population or from the catalog.
function indicatorMeta(indId) {
    if (DERIVED_INDICATORS[indId]) {
        const m = DERIVED_INDICATORS[indId];
        const unitMap = { pop: 'hab.', pop_log: 'hab. (log)', densidad: 'hab/km²', cambio: '%' };
        return { name: m.name, rawName: m.name, unit: unitMap[m.kind] || '', desc: m.desc };
    }
    const ind = state.catalog?.indicators.find(i => i.id === indId);
    if (!ind) return { name: indId, unit: '', desc: '' };
    const unit = effectiveIndicatorUnit(indId, ind.unit);
    return { name: displayIndicatorName(ind.name), rawName: ind.name, unit, desc: `${displayIndicatorName(ind.name)} (${unit})` };
}

function sourceDetailsForIndicator(indId = state.indicator) {
    const meta = indicatorMeta(indId);
    const name = meta.name || CATEGORIES[state.category]?.label || "Indicador";
    if ((state.category === "transporte" && !isPaintableIndicator(indId)) || OVERLAY_INDICATORS.some(o => o.id === indId)) {
        return {
            title: name,
            source: "Trazados locales: calzadas_romanas.geojson; ferrocarril_iberico.geojson; ferrocarril_estrecho.geojson; ferrocarril_ave.geojson.",
            method: "Las rutas se dibujan como capas vectoriales. Los ferrocarriles usan OPENING, CLOSURE y REOPENING para adaptar el avance temporal; las distancias a redes son indicadores separados.",
            citation: "Citar el Atlas Historico Municipal de Espana y la fuente original de cada trazado cuando se use la capa.",
        };
    }
    if (DERIVED_INDICATORS[indId]) {
        return {
            title: name,
            source: "Goerlich & Mas / BBVA-Ivie para series homogeneas 1900-2011; INE Padron continuo para 1996-2025; area municipal desde geometria IGN curada.",
            method: "Series armonizadas a limites municipales actuales. La densidad se recalcula como poblacion/area; el cambio compara cada ano con 1900.",
            citation: "Infante-Amate, J. (2026), Atlas Historico Municipal de Espana. Citar tambien Goerlich & Mas / BBVA-Ivie e INE.",
        };
    }
    const src = indicatorSourceFile(indId);
    const id = (indId || "").toLowerCase();
    const rawName = meta.rawName || meta.name || "";
    const isColonization = id.includes("coloniz") || rawName.toLowerCase().includes("coloniz");
    if (isColonization) {
        return {
            title: name,
            source: "Fuente pendiente de verificacion. En el catalogo local figura como indicador de pueblos de colonizacion dentro de historeco.json; no hay metadato suficiente aqui para atribuirlo con seguridad a Albertus.",
            method: "Variable discreta que identifica la decada asociada a pueblos de colonizacion. Conviene interpretarla como capa historica de localizacion, no como serie continua.",
            citation: "No citar como Albertus hasta verificar la fuente original. Citar provisionalmente el Atlas Historico Municipal de Espana como visor/elaboracion y revisar la fuente primaria antes de usar la variable.",
        };
    }
    if (src === "historeco.json") {
        return {
            title: name,
            source: "HistoReCo y elaboraciones municipales asociadas.",
            method: "Variables climaticas, geograficas, hidrologicas, agrarias y de distancia agregadas o asignadas a la malla municipal actual.",
            citation: "Citar la fuente original del indicador y el Atlas Historico Municipal de Espana como visor/elaboracion.",
        };
    }
    if (src === "usos_suelo.json") {
        return {
            title: name,
            source: "HYDE + LUH2, agregadas a municipio.",
            method: "Superficies historicas de cultivos, pastos, urbano, bosque y otros usos. Al pasar a provincia o CCAA se suman superficies.",
            citation: "Citar HYDE/LUH2 y el Atlas Historico Municipal de Espana como visor/elaboracion.",
        };
    }
    if (src === "calzada.json") {
        return {
            title: name,
            source: "DARMC Roman Roads of Hispania y calculos municipales de distancia.",
            method: "Indicador de distancia municipal a la red de calzadas. La ruta visible se activa como trazado en Transporte.",
            citation: "Citar DARMC / fuente original de calzadas y el Atlas Historico Municipal de Espana.",
        };
    }
    return {
        title: name,
        source: "Compilacion local del atlas municipal.",
        method: "Indicador armonizado para visualizacion municipal y agregacion territorial.",
        citation: "Citar el Atlas Historico Municipal de Espana y la fuente original del indicador.",
    };
}

function sourceInfoForIndicator(indId = state.indicator) {
    const d = sourceDetailsForIndicator(indId);
    return `<strong>${d.title}</strong>
        <div class="detail-kicker">Fuente</div>
        <div>${d.source}</div>
        <div class="detail-kicker">Metodo</div>
        <div>${d.method}</div>
        <div class="detail-kicker">Referencia para citar</div>
        <div>${d.citation}</div>
        <button class="source-about-link" type="button" id="map-source-about">Metodos y fuentes</button>`;
}

function updateSourceFooter() {
    const panel = $("#map-source-panel");
    if (panel) {
        panel.innerHTML = sourceInfoForIndicator();
        $("#map-source-about")?.addEventListener("click", (event) => {
            event.stopPropagation();
            document.querySelector('[data-tab="about"]')?.click();
        });
    }
}

// Per-indicator scale cache: keys = `${indicator}|<scale-version>`.
// We compute the scale ONCE using values pooled across the full time series
// so the legend stays constant when the user scrubs the timeline.
const _scaleCache = new Map();
const _aggregateCache = new Map();

function _computeScaleForLayer(layer) {
    if (layer === "cambio") {
        const fn = d3.scaleLinear()
            .domain([-80, -40, -10, 0, 50, 200, 500])
            .range(CAMBIO_COLORS)
            .clamp(true);
        return { kind: 'cambio', fn, breaks: null, signed: true, values: null };
    }

    // Pool values across all years × all munis → robust quantile breaks
    // that don't shift as the user moves through time.
    const yrs = indicatorYears(layer) || (state.data?.years || []);
    const sampleYears = yrs.length <= 4 ? yrs
        : [yrs[0], yrs[Math.floor(yrs.length / 3)], yrs[Math.floor(2 * yrs.length / 3)], yrs[yrs.length - 1]];
    const values = [];
    if (state.viewLevel === "mun") {
        const munIds = state.data ? Object.keys(state.data.municipios) : [];
        for (const ine of munIds) {
            const m = state.data.municipios[ine];
            if (!isMuniIncluded(m)) continue;
            for (const y of sampleYears) {
                const v = indicatorValue(ine, layer, y);
                if (v != null && Number.isFinite(v)) values.push(v);
            }
        }
    } else {
        for (const y of sampleYears) {
            const grouped = aggregateValuesForLevel(state.viewLevel, layer, y);
            for (const v of grouped.values()) {
                if (v != null && Number.isFinite(v)) values.push(v);
            }
        }
    }
    if (values.length === 0) {
        return { kind: 'empty', fn: () => NO_DATA_COLOR, breaks: null, signed: false, values };
    }

    // Diverging when the indicator naturally crosses zero (SPEI, balances…)
    const hasNeg = values.some(v => v < 0);
    const hasPos = values.some(v => v > 0);
    if (hasNeg && hasPos) {
        const absMax = Math.max(Math.abs(d3.min(values)), d3.max(values));
        const fn = d3.scaleLinear()
            .domain([-absMax, -absMax / 2, 0, absMax / 2, absMax])
            .range([CAMBIO_COLORS[0], CAMBIO_COLORS[2], CAMBIO_COLORS[3], CAMBIO_COLORS[4], CAMBIO_COLORS[6]])
            .clamp(true);
        return { kind: 'diverging', fn, breaks: { absMax }, signed: true, values };
    }

    values.sort((a, b) => a - b);
    if (layer === "pob_log") {
        const positive = values.filter(v => v > 0);
        if (!positive.length) {
            return { kind: 'empty', fn: () => POP_COLORS[0], breaks: null, signed: false, values };
        }
        const ext = [Math.log10(positive[0]), Math.log10(positive[positive.length - 1])];
        const sc = d3.scaleLinear()
            .domain([ext[0], (ext[0] + ext[1]) * 0.6, ext[1]])
            .range([POP_COLORS[0], POP_COLORS[2], POP_COLORS[4]]);
        const fn = v => v > 0 ? sc(Math.log10(v)) : POP_COLORS[0];
        return { kind: 'log', fn, breaks: { ext }, signed: false, values };
    }

    const breaks = {
        q50: d3.quantile(values, 0.5),
        q75: d3.quantile(values, 0.75),
        q90: d3.quantile(values, 0.9),
        q97: d3.quantile(values, 0.97),
    };
    const fn = v => {
        if (v == null || !Number.isFinite(v)) return NO_DATA_COLOR;
        if (v < breaks.q50) return POP_COLORS[0];
        if (v < breaks.q75) return POP_COLORS[1];
        if (v < breaks.q90) return POP_COLORS[2];
        if (v < breaks.q97) return POP_COLORS[3];
        return POP_COLORS[4];
    };
    return { kind: 'quantile', fn, breaks, signed: false, values };
}

function colorScaleFor(layer /*, year ignored — scale is constant */) {
    const key = `${state.viewLevel}|${layer}|${usesLandShareMetric(layer) ? "share" : "absolute"}`;
    if (!_scaleCache.has(key)) {
        _scaleCache.set(key, _computeScaleForLayer(layer));
    }
    return _scaleCache.get(key).fn;
}

function getScaleInfo(layer) {
    const key = `${state.viewLevel}|${layer}|${usesLandShareMetric(layer) ? "share" : "absolute"}`;
    if (!_scaleCache.has(key)) {
        _scaleCache.set(key, _computeScaleForLayer(layer));
    }
    return _scaleCache.get(key);
}

// ───────── Legend ─────────
// The legend is derived from the cached scale info — same breaks across
// every year, so it doesn't shift while the timeline plays.
function renderLegend(layer) {
    const legend = $("#legend");
    legend.innerHTML = "";
    let rows = [];

    if (layer === "cambio") {
        rows = [
            ["Pierde > 80%", CAMBIO_COLORS[0]],
            ["Pierde 40–80%", CAMBIO_COLORS[1]],
            ["Pierde 10–40%", CAMBIO_COLORS[2]],
            ["Estable (±10%)", CAMBIO_COLORS[3]],
            ["Crece +50–200%", CAMBIO_COLORS[4]],
            ["Crece +200–500%", CAMBIO_COLORS[5]],
            ["Crece > +500%", CAMBIO_COLORS[6]],
        ];
    } else if (layer === "pob_log") {
        rows = [
            ["10 hab.", POP_COLORS[0]],
            ["1.000 hab.", POP_COLORS[2]],
            ["100.000+ hab.", POP_COLORS[4]],
        ];
    } else {
        const info = getScaleInfo(layer);
        if (info.kind === 'empty' || !info.breaks) {
            legend.innerHTML = `<div style="font-size:11px;color:var(--ink-mute);font-style:italic">Sin datos para este indicador.</div>`;
            return;
        }
        const meta = indicatorMeta(layer);
        const unit = meta.unit ? ` ${meta.unit}` : '';
        const pickFmt = (m) => m >= 1000 ? d3.format(",.0f")
                          : m >= 10     ? d3.format(",.1f")
                                        : d3.format(",.2f");
        if (info.kind === 'diverging') {
            const m = info.breaks.absMax;
            const fmt = pickFmt(m);
            rows = [
                [`< -${fmt(m / 2)}${unit}`, CAMBIO_COLORS[0]],
                [`±${fmt(m / 4)}${unit}`,    CAMBIO_COLORS[3]],
                [`> +${fmt(m / 2)}${unit}`,  CAMBIO_COLORS[6]],
            ];
        } else {
            const b = info.breaks;
            const fmt = pickFmt(b.q97);
            rows = [
                [`< ${fmt(b.q50)}${unit}`,             POP_COLORS[0]],
                [`${fmt(b.q50)} – ${fmt(b.q75)}`,      POP_COLORS[1]],
                [`${fmt(b.q75)} – ${fmt(b.q90)}`,      POP_COLORS[2]],
                [`${fmt(b.q90)} – ${fmt(b.q97)}`,      POP_COLORS[3]],
                [`> ${fmt(b.q97)}${unit}`,              POP_COLORS[4]],
            ];
        }
    }
    rows.forEach(([label, color]) => {
        const row = document.createElement("div");
        row.className = "legend-row";
        row.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${label}</span>`;
        legend.appendChild(row);
    });
}

function renderOverlayLegend() {
    const legend = $("#legend");
    legend.innerHTML = "";
    if (state.activeOverlays.size === 0) {
        legend.innerHTML = `<div style="font-size:11px;color:var(--ink-mute);font-style:italic">Activa una capa para verla en el mapa.</div>`;
        return;
    }
    state.activeOverlays.forEach(id => {
        const ind = OVERLAY_INDICATORS.find(i => i.id === id);
        if (!ind) return;
        const row = document.createElement("div");
        row.className = "legend-row";
        row.innerHTML = `<span class="legend-line ${ind.style}"></span><span>${ind.name}</span>`;
        legend.appendChild(row);
    });
}

// ───────── Tooltip & selection ─────────
function onMuniHover(ev, d) {
    if (state.category === "transporte" && !isPaintableIndicator(state.indicator)) return;
    const ine = d.properties.ine;
    state.hoveredIne = ine || featureGroupKey(d, state.viewLevel);
    const year = currentYear();
    if (!groupNameForFeature(d)) return;
    const fmt = d3.format(",.0f");
    const fmtPct = d3.format("+,.1f");
    const fmtDens = d3.format(",.1f");

    let valueLine = "";
    const indId = state.indicator;
    const showChoropleth = isPaintableIndicator(indId);
    if (showChoropleth) {
        const v = valueForFeature(d, indId, year);
        const meta = indicatorMeta(indId);
        let valStr;
        if (v == null || !Number.isFinite(v)) {
            valStr = '—';
        } else if (indId === 'cambio') {
            valStr = fmtPct(v) + '%';
        } else if (Math.abs(v) >= 1000) {
            valStr = fmt(v) + (meta.unit ? ' ' + meta.unit : '');
        } else if (Math.abs(v) >= 10) {
            valStr = fmtDens(v) + (meta.unit ? ' ' + meta.unit : '');
        } else {
            valStr = d3.format(",.2f")(v) + (meta.unit ? ' ' + meta.unit : '');
        }
        valueLine = `<span>${meta.name.toLowerCase()}</span><strong>${valStr}</strong>`;
    } else {
        const pop = state.viewLevel === "mun"
            ? getMuniValueAnim(ine, year)
            : valueForFeature(d, "pob", year, aggregateValuesForLevel(state.viewLevel, "pob", year));
        valueLine = `<span>habitantes</span><strong>${pop == null ? "—" : fmt(pop)}</strong>`;
    }

    tooltip.innerHTML = `
        <div class="tooltip-name">${groupNameForFeature(d)}</div>
        <div class="tooltip-meta">${groupMetaForFeature(d, year)}</div>
        <div class="tooltip-value">${valueLine}</div>
    `;
    tooltip.classList.add("visible");
    moveTooltip(ev);
}
function onMuniLeave() {
    state.hoveredIne = null;
    tooltip.classList.remove("visible");
}
function onMuniClick(ev, d) {
    const ine = d.properties.ine;
    const additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;
    if (additive) {
        const idx = state.selectedInes.indexOf(ine);
        if (idx >= 0) state.selectedInes.splice(idx, 1);
        else state.selectedInes.push(ine);
    } else {
        state.selectedInes = (state.selectedInes.length === 1 && state.selectedInes[0] === ine) ? [] : [ine];
    }
    refreshSelectionStyles();
    renderSelectionSidebar();
    renderDataView();
}
function moveTooltip(ev) {
    const mapEl = $(".map-area").getBoundingClientRect();
    tooltip.style.left = (ev.clientX - mapEl.left) + "px";
    tooltip.style.top = (ev.clientY - mapEl.top) + "px";
}
function refreshSelectionStyles() {
    map.selectAll("path.municipio").classed("selected", false);
    state.selectedInes.forEach(ine => {
        map.select(`path.municipio[data-ine="${ine}"]`).classed("selected", true);
    });
}

// ───────── Selection sidebar ─────────
function renderSelectionSidebar() {
    const list = $("#selection-list");
    const help = $("#selection-help");
    const clearBtn = $("#clear-btn");
    const count = $("#selection-count");

    count.textContent = state.selectedInes.length;
    list.innerHTML = "";
    if (state.selectedInes.length === 0) {
        help.style.display = "block";
        clearBtn.style.display = "none";
        d3.select("#sel-chart").selectAll("*").remove();
        return;
    }
    help.style.display = "none";
    clearBtn.style.display = "inline-block";

    const year = currentYear();
    const inChoropleth = isPaintableIndicator(state.indicator);
    state.selectedInes.forEach((ine, i) => {
        const m = state.data.municipios[ine];
        if (!m) return;
        const v = inChoropleth ? indicatorValue(ine, state.indicator, year) : getMuniValueAnim(ine, year);
        const fmt = state.indicator === 'cambio'   ? d3.format("+,.1f")
                  : state.indicator === 'densidad' ? d3.format(",.1f")
                  : (Math.abs(v ?? 0) >= 1000 ? d3.format(",.0f") : d3.format(",.2f"));
        const suffix = state.indicator === 'cambio' ? '%' : '';
        const item = document.createElement("div");
        item.className = "selection-item";
        item.innerHTML = `
            <span class="selection-dot" style="background:${LINE_COLORS[i % LINE_COLORS.length]}"></span>
            <span class="selection-name" title="${m.name}">${m.name}</span>
            <span class="selection-value">${v == null ? "—" : fmt(v) + suffix}</span>
            <span class="selection-remove" data-ine="${ine}">×</span>
        `;
        list.appendChild(item);
    });
    list.querySelectorAll(".selection-remove").forEach(el => {
        el.addEventListener("click", (e) => {
            const ine = e.target.dataset.ine;
            state.selectedInes = state.selectedInes.filter(i => i !== ine);
            refreshSelectionStyles();
            renderSelectionSidebar();
            renderDataView();
        });
    });

    drawMultiChart();
}

function drawMultiChart() {
    const svg = d3.select("#sel-chart");
    svg.selectAll("*").remove();
    if (state.selectedInes.length === 0) return;

    const w = svg.node().clientWidth || 280;
    const h = 130;
    const margin = { top: 10, right: 12, bottom: 18, left: 42 };
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    const layer = isPaintableIndicator(state.indicator) ? state.indicator : 'pob';
    const yrs = indicatorYears(layer) || state.data.years;
    const series = state.selectedInes.map((ine, i) => {
        const m = state.data.municipios[ine];
        if (!m) return null;
        const points = yrs.map((y) => {
            const v = indicatorValue(ine, layer, y);
            return { year: y, v };
        }).filter(d => d.v != null && Number.isFinite(d.v));
        if (!points.length) return null;
        return { ine, name: m.name, color: LINE_COLORS[i % LINE_COLORS.length], points };
    }).filter(Boolean);
    if (series.length === 0) return;

    const yearExtent = d3.extent(yrs);
    const x = d3.scaleLinear().domain(yearExtent).range([0, iw]);
    const allValues = series.flatMap(s => s.points.map(p => p.v));
    const rawMin = d3.min(allValues) ?? 0;
    const rawMax = d3.max(allValues) ?? 1;
    const yBaseMin = layer === "cambio" ? Math.min(0, rawMin) : 0;
    const yBaseMax = layer === "cambio" ? Math.max(0, rawMax) : Math.max(rawMax, 1);
    const yPad = Math.max((yBaseMax - yBaseMin) * 0.05, 1e-9);
    const yMin = layer === "cambio" ? yBaseMin - yPad : yBaseMin;
    const yMax = yBaseMax + yPad;
    const y = d3.scaleLinear().domain([yMin, yMax]).range([ih, 0]);
    const fmtY = indicatorFormat(layer);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    y.ticks(3).forEach(t => {
        g.append("line").attr("class", "axis-grid")
            .attr("x1", 0).attr("x2", iw).attr("y1", y(t)).attr("y2", y(t));
        g.append("text").attr("class", "axis-label")
            .attr("x", -6).attr("y", y(t) + 3).attr("text-anchor", "end").text(fmtY(t));
    });
    g.append("line").attr("class", "axis-domain")
        .attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", ih);
    g.append("line").attr("class", "axis-domain")
        .attr("x1", 0).attr("x2", iw).attr("y1", ih).attr("y2", ih);
    if (layer === "cambio") {
        g.append("line").attr("class", "axis-line")
            .attr("x1", 0).attr("x2", iw)
            .attr("y1", y(0)).attr("y2", y(0));
    }
    const lineGen = d3.line().x(d => x(d.year)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    series.forEach(s => {
        g.append("path").datum(s.points)
            .attr("class", "data-line").attr("stroke", s.color).attr("d", lineGen);
        g.selectAll(`circle.dot-${s.ine}`).data(s.points).enter().append("circle")
            .attr("class", "data-dot").attr("fill", s.color)
            .attr("cx", d => x(d.year)).attr("cy", d => y(d.v));
    });
    const cy = currentYear();
    if (cy >= yearExtent[0] && cy <= yearExtent[1]) {
        g.append("line").attr("class", "year-marker")
            .attr("x1", x(cy)).attr("x2", x(cy)).attr("y1", 0).attr("y2", ih);
    }
    [yearExtent[0], 1950, 2000, yearExtent[1]].forEach(yr => {
        if (yr == null || yr < yearExtent[0] || yr > yearExtent[1]) return;
        g.append("text").attr("class", "axis-label")
            .attr("x", x(yr)).attr("y", ih + 12).attr("text-anchor", "middle").text(yr);
    });
    const hoverLine = g.append("line").attr("class", "chart-hover-line")
        .attr("y1", 0).attr("y2", ih).style("display", "none");
    g.append("rect")
        .attr("class", "chart-hit-area")
        .attr("x", 0).attr("y", 0).attr("width", iw).attr("height", ih)
        .on("mousemove", (event) => {
            const [mx] = d3.pointer(event, g.node());
            const targetYear = x.invert(Math.max(0, Math.min(iw, mx)));
            const nearestYear = nearestYearFrom(yrs, targetYear);
            hoverLine.attr("x1", x(nearestYear)).attr("x2", x(nearestYear)).style("display", null);
            showChartTooltip(event, chartTooltipHtml(nearestYear, series, fmtY));
        })
        .on("mouseleave", () => {
            hoverLine.style("display", "none");
            hideChartTooltip();
        });
}

// ───────── Categories & indicators ─────────
function analysisLayer() {
    return isPaintableIndicator(state.indicator) ? state.indicator : "pob";
}

function analysisYears(layer = analysisLayer()) {
    return indicatorYears(layer) || state.data?.years || [];
}

function selectedMunicipios() {
    return state.selectedInes
        .map((ine, i) => {
            const m = state.data?.municipios?.[ine];
            return m ? { ine, index: i, ...m } : null;
        })
        .filter(Boolean);
}

function indicatorFormat(layer = analysisLayer()) {
    const meta = indicatorMeta(layer);
    const unit = meta.unit || "";
    const lower = unit.toLowerCase();
    const suffix = unit === "%" ? "%" : "";
    const fmt = layer === "cambio"
        ? d3.format("+,.1f")
        : unit === "%"
            ? d3.format(",.1f")
        : lower.includes("km") || lower.includes("mm") || lower.includes("c")
            ? d3.format(",.2f")
            : d3.format(",.0f");
    return (v) => v == null || !Number.isFinite(v) ? "—" : `${fmt(v)}${suffix}`;
}

function nearestYearFrom(years, target) {
    if (!years?.length) return target;
    return years.reduce((best, year) => (
        Math.abs(year - target) < Math.abs(best - target) ? year : best
    ), years[0]);
}

function nearestPoint(points, year) {
    if (!points?.length) return null;
    return points.reduce((best, point) => (
        Math.abs(point.year - year) < Math.abs(best.year - year) ? point : best
    ), points[0]);
}

function selectableTrendIndicators() {
    const cat = CATEGORIES[state.category];
    return (cat?.indicators || []).filter(ind => isPaintableIndicator(ind.id));
}

function arraysEqual(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

function activeTrendIndicators() {
    const options = selectableTrendIndicators().map(ind => ind.id);
    let selected = state.selectedTrendIndicators.filter(id => options.includes(id));
    const layer = analysisLayer();
    if (!selected.length && options.includes(layer)) selected = [layer];
    if (!selected.length && options.length) selected = [options[0]];
    if (!arraysEqual(state.selectedTrendIndicators, selected)) {
        state.selectedTrendIndicators = selected;
    }
    return selected;
}

async function setTrendIndicatorSelection(nextIds, primaryId = null) {
    const options = new Set(selectableTrendIndicators().map(ind => ind.id));
    const next = [...new Set(nextIds.filter(id => options.has(id)))];
    if (!next.length && primaryId && options.has(primaryId)) next.push(primaryId);
    if (!next.length) return;
    state.selectedTrendIndicators = next;
    const primary = primaryId && next.includes(primaryId) ? primaryId : next[0];
    if (primary) state.indicator = primary;
    for (const id of next) await ensureIndicatorLoaded(id);
    syncCensusToIndicator();
    setupTimeline();
    renderIndicatorList();
    paintMunicipios();
    renderSelectionSidebar();
    renderDataView();
}

async function toggleTrendIndicator(indId) {
    const current = activeTrendIndicators();
    let next;
    if (current.includes(indId)) {
        next = current.length > 1 ? current.filter(id => id !== indId) : current;
    } else {
        next = [...current, indId];
    }
    const primary = next.includes(indId) ? indId : next[0];
    await setTrendIndicatorSelection(next, primary);
}

function setLandMetric(metric) {
    if (!["absolute", "share"].includes(metric) || state.landMetric === metric) return;
    state.landMetric = metric;
    _scaleCache.clear();
    _aggregateCache.clear();
    renderIndicatorList();
    paintMunicipios();
    renderSelectionSidebar();
    renderDataView();
}

function trendValueFormatter(unit = "", signed = false) {
    const lower = unit.toLowerCase();
    const suffix = unit === "%" ? "%" : (unit ? ` ${unit}` : "");
    const fmt = signed
        ? d3.format("+,.1f")
        : unit === "%"
            ? d3.format(",.1f")
            : lower.includes("km") || lower.includes("mm") || lower.includes("c")
                ? d3.format(",.2f")
                : d3.format(",.0f");
    return (v) => v == null || !Number.isFinite(v) ? "â€”" : `${fmt(v)}${suffix}`;
}

function buildTrendSeries(selected, indicators) {
    const out = [];
    selected.forEach((muni, muniIndex) => {
        indicators.forEach((indId, indicatorIndex) => {
            const years = indicatorYears(indId) || [];
            const meta = indicatorMeta(indId);
            const points = years.map(y => ({ year: y, v: indicatorValue(muni.ine, indId, y) }))
                .filter(d => d.v != null && Number.isFinite(d.v));
            if (!points.length) return;
            out.push({
                ine: muni.ine,
                municipality: muni.name,
                indicator: indId,
                indicatorName: meta.name,
                unit: meta.unit || "",
                muniIndex,
                indicatorIndex,
                points,
            });
        });
    });
    return out;
}

function resolveTrendLayout(selected, indicators, series) {
    const forced = state.trendLayout || "auto";
    if (forced === "overlay") return "overlay";
    if (forced === "facet-muni" && selected.length > 1) return "facet-muni";
    if (forced === "facet-indicator" && indicators.length > 1) return "facet-indicator";

    const unitCount = new Set(series.map(s => s.unit)).size;
    if (indicators.length > 1 && selected.length > 1) {
        return unitCount > 1 ? "facet-indicator" : "facet-muni";
    }
    if (indicators.length > 1 && unitCount > 1) return "facet-indicator";
    return "overlay";
}

function resolvedClimatePanels(selected, indicators, series) {
    if (selected.length > 1) return buildTrendPanels(selected, indicators, series, "facet-muni");
    if (indicators.length > 1) return buildTrendPanels(selected, indicators, series, "facet-indicator");
    return [{ title: selected[0]?.name || "", subtitle: indicators.map(id => indicatorMeta(id).name).join(", "), series }];
}

function applyTrendColors(series, selected, indicators, layout) {
    const muniColors = new Map(selected.map((m, i) => [m.ine, LINE_COLORS[i % LINE_COLORS.length]]));
    const indicatorColors = new Map(indicators.map((id, i) => [id, LINE_COLORS[i % LINE_COLORS.length]]));
    series.forEach((s, i) => {
        if (layout === "facet-muni" || (indicators.length > 1 && selected.length === 1)) {
            s.color = indicatorColors.get(s.indicator);
            s.name = indicators.length > 1 ? s.indicatorName : s.municipality;
        } else if (layout === "facet-indicator" || indicators.length === 1) {
            s.color = muniColors.get(s.ine);
            s.name = selected.length > 1 ? s.municipality : s.indicatorName;
        } else {
            s.color = LINE_COLORS[i % LINE_COLORS.length];
            s.name = `${s.municipality} - ${s.indicatorName}`;
        }
    });
}

function trendXDomain(series) {
    const years = series.flatMap(s => s.points.map(p => p.year));
    return years.length ? d3.extent(years) : [YEAR_MIN, YEAR_MAX];
}

function trendYDomain(series) {
    const values = series.flatMap(s => s.points.map(p => p.v)).filter(Number.isFinite);
    if (!values.length) return [0, 1];
    const rawMin = d3.min(values);
    const rawMax = d3.max(values);
    const yBaseMin = rawMin < 0 ? rawMin : 0;
    const yBaseMax = rawMax > 0 ? rawMax : 0;
    const pad = Math.max((yBaseMax - yBaseMin) * 0.06, 1e-9);
    return [yBaseMin < 0 ? yBaseMin - pad : yBaseMin, yBaseMax + pad];
}

function buildTrendPanels(selected, indicators, series, layout) {
    if (layout === "facet-muni") {
        return selected.map(m => ({
            title: m.name,
            subtitle: `${series.filter(s => s.ine === m.ine).length} series`,
            series: series.filter(s => s.ine === m.ine),
        })).filter(p => p.series.length);
    }
    if (layout === "facet-indicator") {
        return indicators.map(id => {
            const meta = indicatorMeta(id);
            return {
                title: meta.name,
                subtitle: meta.unit || "",
                series: series.filter(s => s.indicator === id),
            };
        }).filter(p => p.series.length);
    }
    return [{ title: "", subtitle: "", series }];
}

function drawTrendPanel(svg, panel, x0, y0, panelW, panelH, xDomain, yDomain, opts = {}) {
    const margin = opts.facet
        ? { top: 30, right: 16, bottom: 34, left: 64 }
        : { top: 20, right: opts.showLabels ? 130 : 22, bottom: 42, left: 74 };
    const iw = Math.max(80, panelW - margin.left - margin.right);
    const ih = Math.max(80, panelH - margin.top - margin.bottom);
    const panelG = svg.append("g").attr("transform", `translate(${x0},${y0})`);

    if (panel.title) {
        panelG.append("text").attr("class", "facet-title")
            .attr("x", 0).attr("y", 12).text(panel.title);
        if (panel.subtitle) {
            panelG.append("text").attr("class", "facet-subtitle")
                .attr("x", 0).attr("y", 26).text(panel.subtitle);
        }
    }

    const g = panelG.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain(xDomain).range([0, iw]);
    const y = d3.scaleLinear().domain(yDomain).range([ih, 0]);
    const units = [...new Set(panel.series.map(s => s.unit))];
    const signed = panel.series.some(s => s.indicator === "cambio");
    const fmtY = trendValueFormatter(units.length === 1 ? units[0] : "", signed);
    const fmtTip = (v, s) => trendValueFormatter(s.unit, s.indicator === "cambio")(v);

    y.ticks(opts.facet ? 4 : 5).forEach(t => {
        g.append("line").attr("class", "axis-grid")
            .attr("x1", 0).attr("x2", iw).attr("y1", y(t)).attr("y2", y(t));
        g.append("text").attr("class", "axis-label")
            .attr("x", -8).attr("y", y(t) + 3).attr("text-anchor", "end").text(fmtY(t));
    });
    g.append("line").attr("class", "axis-domain")
        .attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", ih);
    g.append("line").attr("class", "axis-domain")
        .attr("x1", 0).attr("x2", iw).attr("y1", ih).attr("y2", ih);
    if (yDomain[0] < 0 && yDomain[1] > 0) {
        g.append("line").attr("class", "axis-line")
            .attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0));
    }

    const lineGen = d3.line().x(d => x(d.year)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    panel.series.forEach(s => {
        g.append("path").datum(s.points)
            .attr("class", "data-line").attr("stroke", s.color).attr("d", lineGen);
        g.selectAll(null).data(s.points).enter().append("circle")
            .attr("class", "data-dot").attr("fill", s.color)
            .attr("r", opts.facet ? 1.8 : 2.4)
            .attr("cx", d => x(d.year)).attr("cy", d => y(d.v));
        if (opts.showLabels) {
            const last = s.points[s.points.length - 1];
            if (last) {
                g.append("text").attr("class", "series-label")
                    .attr("x", x(last.year) + 6)
                    .attr("y", y(last.v) + 3)
                    .attr("fill", s.color)
                    .text(s.name);
            }
        }
    });

    const cy = currentYear();
    if (cy >= xDomain[0] && cy <= xDomain[1]) {
        g.append("line").attr("class", "year-marker")
            .attr("x1", x(cy)).attr("x2", x(cy)).attr("y1", 0).attr("y2", ih);
    }
    const tickYears = [xDomain[0], ...d3.ticks(xDomain[0], xDomain[1], opts.facet ? 3 : 4), xDomain[1]]
        .filter((yr, i, arr) => Number.isFinite(yr) && arr.indexOf(yr) === i);
    tickYears.forEach(yr => {
        g.append("text").attr("class", "axis-label")
            .attr("x", x(yr)).attr("y", ih + 18).attr("text-anchor", "middle").text(Math.round(yr));
    });

    const hoverLine = g.append("line").attr("class", "chart-hover-line")
        .attr("y1", 0).attr("y2", ih).style("display", "none");
    g.append("rect")
        .attr("class", "chart-hit-area")
        .attr("x", 0).attr("y", 0).attr("width", iw).attr("height", ih)
        .on("mousemove", (event) => {
            const [mx] = d3.pointer(event, g.node());
            const targetYear = x.invert(Math.max(0, Math.min(iw, mx)));
            hoverLine.attr("x1", x(targetYear)).attr("x2", x(targetYear)).style("display", null);
            showChartTooltip(event, chartTooltipHtml(targetYear, panel.series, fmtTip));
        })
        .on("mouseleave", () => {
            hoverLine.style("display", "none");
            hideChartTooltip();
        });
}

function anomalyColorScale(values) {
    const clean = values.filter(Number.isFinite);
    const extent = d3.max(clean.map(v => Math.abs(v))) || 1;
    return d3.scaleLinear()
        .domain([-extent, 0, extent])
        .range(["#2b5797", "#f2efe9", "#c0392b"])
        .clamp(true);
}

function renderClimateStripesChart(selector, chartHeight = 430) {
    const svg = d3.select(selector);
    svg.selectAll("*").remove();
    const selected = selectedMunicipios();
    const indicators = activeTrendIndicators();
    if (!selected.length || !indicators.length) return false;

    const series = buildTrendSeries(selected, indicators);
    if (!series.length) return false;
    const panels = resolvedClimatePanels(selected, indicators, series);
    const w = svg.node().clientWidth || 720;
    const panelH = 84;
    const gapY = 14;
    const h = Math.max(chartHeight, panels.length * panelH + (panels.length - 1) * gapY);
    svg.attr("viewBox", `0 0 ${w} ${h}`).style("height", `${h}px`);

    const margin = { top: 26, right: 20, bottom: 20, left: 150 };
    panels.forEach((panel, i) => {
        const y0 = i * (panelH + gapY);
        const g = svg.append("g").attr("transform", `translate(0,${y0})`);
        g.append("text").attr("class", "facet-title")
            .attr("x", 0).attr("y", 14).text(panel.title || panel.series[0]?.municipality || "");
        g.append("text").attr("class", "facet-subtitle")
            .attr("x", 0).attr("y", 29).text(panel.subtitle || panel.series.map(s => s.indicatorName).join(", "));

        const rowH = Math.max(14, Math.min(28, (panelH - margin.top - margin.bottom) / Math.max(1, panel.series.length)));
        panel.series.forEach((s, row) => {
            const y = margin.top + row * rowH;
            const mean = d3.mean(s.points, p => p.v);
            const deviations = s.points.map(p => p.v - mean);
            const color = anomalyColorScale(deviations);
            const x = d3.scaleBand()
                .domain(s.points.map(p => p.year))
                .range([margin.left, w - margin.right])
                .paddingInner(0.02);
            g.append("text").attr("class", "axis-label")
                .attr("x", margin.left - 8)
                .attr("y", y + rowH * 0.72)
                .attr("text-anchor", "end")
                .text(s.indicatorName);
            g.selectAll(null).data(s.points).enter().append("rect")
                .attr("class", "stripe-cell")
                .attr("x", d => x(d.year))
                .attr("y", y)
                .attr("width", Math.max(1, x.bandwidth()))
                .attr("height", rowH - 2)
                .attr("fill", d => color(d.v - mean));
            const first = s.points[0]?.year;
            const last = s.points[s.points.length - 1]?.year;
            if (row === panel.series.length - 1) {
                [first, last].forEach((yr, k) => {
                    if (yr == null) return;
                    g.append("text").attr("class", "axis-label")
                        .attr("x", k === 0 ? margin.left : w - margin.right)
                        .attr("y", panelH - 4)
                        .attr("text-anchor", k === 0 ? "start" : "end")
                        .text(yr);
                });
            }
        });
    });
    return true;
}

function renderClimateDecadeChart(selector, chartHeight = 430) {
    const svg = d3.select(selector);
    svg.selectAll("*").remove();
    const selected = selectedMunicipios();
    const indicators = activeTrendIndicators();
    if (!selected.length || !indicators.length) return false;

    const series = buildTrendSeries(selected, indicators);
    if (!series.length) return false;
    const panels = resolvedClimatePanels(selected, indicators, series);
    const w = svg.node().clientWidth || 720;
    const cols = w >= 940 && panels.length > 1 ? 2 : 1;
    const gapX = 28;
    const gapY = 24;
    const panelW = (w - gapX * (cols - 1)) / cols;
    const panelH = 250;
    const rows = Math.ceil(panels.length / cols);
    const h = Math.max(chartHeight, rows * panelH + (rows - 1) * gapY);
    svg.attr("viewBox", `0 0 ${w} ${h}`).style("height", `${h}px`);

    panels.forEach((panel, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x0 = col * (panelW + gapX);
        const y0 = row * (panelH + gapY);
        const g0 = svg.append("g").attr("transform", `translate(${x0},${y0})`);
        g0.append("text").attr("class", "facet-title")
            .attr("x", 0).attr("y", 14).text(panel.title || panel.series[0]?.municipality || "");
        g0.append("text").attr("class", "facet-subtitle")
            .attr("x", 0).attr("y", 29).text(panel.subtitle || panel.series.map(s => s.indicatorName).join(", "));

        const margin = { top: 42, right: 16, bottom: 34, left: 58 };
        const iw = panelW - margin.left - margin.right;
        const ih = panelH - margin.top - margin.bottom;
        const g = g0.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const allYears = [...new Set(panel.series.flatMap(s => s.points.map(p => p.year)))].sort((a, b) => a - b);
        const x = d3.scaleBand().domain(allYears).range([0, iw]).padding(0.24);
        const baselines = new Map(panel.series.map(s => [s, d3.mean(s.points, p => p.v)]));
        const deltas = panel.series.flatMap(s => s.points.map(p => p.v - baselines.get(s)));
        const yDomain = trendYDomain([{ points: deltas.map((v, j) => ({ year: j, v })) }]);
        const y = d3.scaleLinear().domain(yDomain).range([ih, 0]);
        const color = anomalyColorScale(deltas);
        const line = d3.line()
            .x(d => x(d.year) + x.bandwidth() / 2)
            .y(d => y(d.delta))
            .curve(d3.curveMonotoneX);

        y.ticks(4).forEach(t => {
            g.append("line").attr("class", "axis-grid")
                .attr("x1", 0).attr("x2", iw).attr("y1", y(t)).attr("y2", y(t));
            g.append("text").attr("class", "axis-label")
                .attr("x", -8).attr("y", y(t) + 3).attr("text-anchor", "end")
                .text(Math.abs(t) >= 10 ? d3.format("+,.0f")(t) : d3.format("+,.1f")(t));
        });
        g.append("line").attr("class", "stripe-baseline")
            .attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0));
        panel.series.forEach((s, si) => {
            const baseline = baselines.get(s);
            const barW = Math.max(2, x.bandwidth() / panel.series.length);
            const offset = (si - (panel.series.length - 1) / 2) * barW;
            const points = s.points.map(p => ({ ...p, delta: p.v - baseline }));
            g.selectAll(null).data(points).enter().append("rect")
                .attr("class", "climate-bar")
                .attr("x", d => x(d.year) + x.bandwidth() / 2 + offset - barW / 2)
                .attr("y", d => d.delta >= 0 ? y(d.delta) : y(0))
                .attr("width", barW)
                .attr("height", d => Math.abs(y(d.delta) - y(0)))
                .attr("fill", d => color(d.delta))
                .attr("opacity", panel.series.length > 1 ? 0.78 : 0.92);
            if (panel.series.length === 1) {
                g.append("path").datum(points)
                    .attr("class", "data-line")
                    .attr("stroke", "#1a1a1a")
                    .attr("stroke-width", 1.4)
                    .attr("fill", "none")
                    .attr("d", line);
            }
        });
        allYears.forEach((yr, j) => {
            if (j % Math.ceil(allYears.length / 5) !== 0 && j !== allYears.length - 1) return;
            g.append("text").attr("class", "axis-label")
                .attr("x", x(yr) + x.bandwidth() / 2)
                .attr("y", ih + 18)
                .attr("text-anchor", "middle")
                .text(yr);
        });
    });
    return true;
}

function requestClimateMonthlyLoad() {
    if (state.sources[CLIMATE_MONTHLY_SOURCE] || state.climateMonthlyPromise) return;
    state.climateMonthlyError = null;
    state.climateMonthlyPromise = loadSource(CLIMATE_MONTHLY_SOURCE)
        .then(() => {
            state.climateMonthlyPromise = null;
            if (document.body.classList.contains("show-data") && state.mainTab === "trends" && state.climateTrendMode === "climogram") {
                renderDataView();
            }
        })
        .catch(err => {
            state.climateMonthlyPromise = null;
            state.climateMonthlyError = err;
            console.warn("No se pudieron cargar datos mensuales de clima", err);
            if (document.body.classList.contains("show-data") && state.mainTab === "trends" && state.climateTrendMode === "climogram") {
                renderDataView();
            }
        });
}

function climateMonthlyStore() {
    const raw = state.sources[CLIMATE_MONTHLY_SOURCE];
    if (!raw) return null;
    if (!raw._index) {
        raw._index = {};
        (raw.territories || []).forEach(t => {
            if (t.code) raw._index[t.code] = t;
        });
    }
    return { years: raw.years || [], index: raw._index };
}

function extractClimateMonthly(ine) {
    const store = climateMonthlyStore();
    const rec = store?.index?.[ine];
    const years = store?.years || [];
    if (!rec || !years.length) return null;

    const reshape = (arr) => years.map((_, yi) => MONTH_LABELS.map((__, month) => {
        const value = arr?.[yi * 12 + month];
        return value == null || !Number.isFinite(value) ? null : value;
    }));
    const tmeanByYear = reshape(rec.tmean || []);
    const precByYear = reshape(rec.prec || []);
    const monthlyAverage = (rows, month) => {
        const values = rows.map(row => row[month]).filter(Number.isFinite);
        return values.length ? d3.mean(values) : null;
    };
    return {
        years,
        tmeanByYear,
        precByYear,
        tmeanAvg: MONTH_LABELS.map((_, month) => monthlyAverage(tmeanByYear, month)),
        precAvg: MONTH_LABELS.map((_, month) => monthlyAverage(precByYear, month)),
    };
}

function climateMonthlyCurrent(data) {
    const target = Math.round(currentYear());
    const minYear = data.years[0];
    const maxYear = data.years[data.years.length - 1];
    let idx = data.years.indexOf(target);
    let label = `${target}`;
    if (idx < 0 && target >= minYear && target <= maxYear) {
        const nearest = nearestYearFrom(data.years, target);
        idx = data.years.indexOf(nearest);
        label = `${nearest}`;
    }
    if (idx < 0) {
        return {
            label: "media",
            tmean: data.tmeanAvg,
            prec: data.precAvg,
        };
    }
    return {
        label,
        tmean: data.tmeanByYear[idx],
        prec: data.precByYear[idx],
    };
}

function renderClimateClimogramChart(selector, chartHeight = 430) {
    const svg = d3.select(selector);
    svg.selectAll("*").remove();
    const selected = selectedMunicipios();
    if (!selected.length) return false;

    if (state.climateMonthlyError) {
        return renderClimateStatus(selector, chartHeight, "No se pudo cargar el climograma", "Revisa el archivo mensual de clima.");
    }
    if (!climateMonthlyStore()) {
        requestClimateMonthlyLoad();
        return renderClimateStatus(selector, chartHeight, "Cargando climogramas", "Datos mensuales disponibles para municipios de Andalucia.");
    }

    if (!selected.some(muni => extractClimateMonthly(muni.ine))) {
        return renderClimateStatus(
            selector,
            chartHeight,
            "Sin datos mensuales para estos municipios",
            "Por ahora los climogramas usan el archivo mensual de Andalucia. Selecciona un municipio andaluz o incorpora una fuente mensual nacional."
        );
    }

    const w = svg.node().clientWidth || 720;
    const cols = w >= 980 && selected.length > 1 ? 2 : 1;
    const gapX = 26;
    const gapY = 22;
    const panelW = (w - gapX * (cols - 1)) / cols;
    const panelH = selected.length > 1 ? 286 : Math.max(430, chartHeight);
    const rows = Math.ceil(selected.length / cols);
    const h = Math.max(chartHeight, rows * panelH + (rows - 1) * gapY);
    svg.attr("viewBox", `0 0 ${w} ${h}`).style("height", `${h}px`);

    selected.forEach((muni, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        drawClimateClimogramPanel(svg, {
            muni,
            data: extractClimateMonthly(muni.ine),
            color: LINE_COLORS[i % LINE_COLORS.length],
        }, col * (panelW + gapX), row * (panelH + gapY), panelW, panelH, selected.length > 1);
    });
    return true;
}

function drawClimateClimogramPanel(svg, panel, x0, y0, panelW, panelH, isFacet) {
    const root = svg.append("g").attr("transform", `translate(${x0},${y0})`);
    root.append("text").attr("class", "facet-title")
        .attr("x", 0).attr("y", 14).text(panel.muni.name);

    if (!panel.data) {
        root.append("text").attr("class", "facet-subtitle")
            .attr("x", 0).attr("y", 30)
            .text("Sin datos mensuales; la fuente mensual actual cubre Andalucia.");
        root.append("text").attr("class", "axis-label")
            .attr("x", panelW / 2).attr("y", panelH / 2)
            .attr("text-anchor", "middle")
            .text("Selecciona un municipio andaluz para ver el climograma.");
        return;
    }

    const current = climateMonthlyCurrent(panel.data);
    root.append("text").attr("class", "facet-subtitle")
        .attr("x", 0).attr("y", 30)
        .text(`Temperatura y precipitacion mensual - ${current.label}`);

    const margin = isFacet
        ? { top: 44, right: 42, bottom: 30, left: 46 }
        : { top: 52, right: 58, bottom: 44, left: 58 };
    const iw = Math.max(120, panelW - margin.left - margin.right);
    const ih = Math.max(150, panelH - margin.top - margin.bottom);
    const g = root.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const precValues = [...panel.data.precAvg, ...current.prec].filter(Number.isFinite);
    const tempValues = [...panel.data.tmeanAvg, ...current.tmean].filter(Number.isFinite);
    if (!precValues.length || !tempValues.length) {
        root.append("text").attr("class", "axis-label")
            .attr("x", panelW / 2).attr("y", panelH / 2)
            .attr("text-anchor", "middle")
            .text("Sin valores mensuales suficientes.");
        return;
    }

    const x = d3.scaleBand().domain(d3.range(12)).range([0, iw]).padding(0.15);
    const yPrec = d3.scaleLinear().domain([0, (d3.max(precValues) || 1) * 1.16]).range([ih, 0]).nice();
    const tempPad = Math.max(1, ((d3.max(tempValues) || 0) - (d3.min(tempValues) || 0)) * 0.08);
    const yTemp = d3.scaleLinear()
        .domain([(d3.min(tempValues) || 0) - tempPad, (d3.max(tempValues) || 1) + tempPad])
        .range([ih, 0]).nice();

    yPrec.ticks(isFacet ? 3 : 5).forEach(t => {
        g.append("line").attr("class", "axis-grid")
            .attr("x1", 0).attr("x2", iw).attr("y1", yPrec(t)).attr("y2", yPrec(t));
        g.append("text").attr("class", "axis-label")
            .attr("x", -8).attr("y", yPrec(t) + 3).attr("text-anchor", "end")
            .text(Math.round(t));
    });
    yTemp.ticks(isFacet ? 3 : 5).forEach(t => {
        g.append("text").attr("class", "axis-label temp-axis-label")
            .attr("x", iw + 8).attr("y", yTemp(t) + 3)
            .text(`${Math.round(t)} C`);
    });

    g.selectAll(null).data(panel.data.precAvg).enter().append("rect")
        .attr("class", "climogram-prec-avg")
        .attr("x", (_, i) => x(i))
        .attr("y", d => d == null ? ih : yPrec(d))
        .attr("width", x.bandwidth())
        .attr("height", d => d == null ? 0 : ih - yPrec(d));

    g.selectAll(null).data(current.prec).enter().append("rect")
        .attr("class", "climogram-prec-current")
        .attr("x", (_, i) => x(i) + x.bandwidth() * 0.15)
        .attr("y", d => d == null ? ih : yPrec(d))
        .attr("width", x.bandwidth() * 0.7)
        .attr("height", d => d == null ? 0 : ih - yPrec(d));

    const line = d3.line()
        .defined(d => d.value != null && Number.isFinite(d.value))
        .x(d => x(d.month) + x.bandwidth() / 2)
        .y(d => yTemp(d.value))
        .curve(d3.curveMonotoneX);
    const avgTemp = panel.data.tmeanAvg.map((value, month) => ({ month, value }));
    const curTemp = current.tmean.map((value, month) => ({ month, value }));
    g.append("path").datum(avgTemp)
        .attr("class", "climogram-temp-avg")
        .attr("d", line);
    g.append("path").datum(curTemp)
        .attr("class", "climogram-temp-current")
        .attr("d", line);
    g.selectAll(null).data(curTemp.filter(d => d.value != null && Number.isFinite(d.value))).enter().append("circle")
        .attr("class", "climogram-temp-dot")
        .attr("cx", d => x(d.month) + x.bandwidth() / 2)
        .attr("cy", d => yTemp(d.value))
        .attr("r", isFacet ? 2.3 : 3.2);

    MONTH_LABELS.forEach((label, i) => {
        g.append("text").attr("class", "axis-label")
            .attr("x", x(i) + x.bandwidth() / 2)
            .attr("y", ih + 18)
            .attr("text-anchor", "middle")
            .text(label);
    });
    if (!isFacet) {
        g.append("text").attr("class", "climogram-axis-title climogram-prec-title")
            .attr("x", 0).attr("y", -12).text("Precip. (mm)");
        g.append("text").attr("class", "climogram-axis-title climogram-temp-title")
            .attr("x", iw).attr("y", -12).attr("text-anchor", "end").text("Temp. (C)");
        g.append("line").attr("class", "climogram-temp-avg climogram-legend-line")
            .attr("x1", iw * 0.32).attr("x2", iw * 0.32 + 22).attr("y1", ih + 34).attr("y2", ih + 34);
        g.append("text").attr("class", "axis-label")
            .attr("x", iw * 0.32 + 28).attr("y", ih + 37).text("Media periodo");
        g.append("rect").attr("class", "climogram-prec-avg")
            .attr("x", iw * 0.62).attr("y", ih + 27).attr("width", 14).attr("height", 10);
        g.append("text").attr("class", "axis-label")
            .attr("x", iw * 0.62 + 20).attr("y", ih + 37).text("Precip. media");
    }

    g.append("rect")
        .attr("class", "chart-hit-area")
        .attr("x", 0).attr("y", 0).attr("width", iw).attr("height", ih)
        .on("mousemove", (event) => {
            const [mx] = d3.pointer(event, g.node());
            const month = Math.min(11, Math.max(0, Math.floor(mx / Math.max(1, iw / 12))));
            showChartTooltip(event, climateClimogramTooltip(panel, current, month));
        })
        .on("mouseleave", hideChartTooltip);
}

function climateClimogramTooltip(panel, current, month) {
    const temp = current.tmean[month];
    const prec = current.prec[month];
    const avgTemp = panel.data.tmeanAvg[month];
    const avgPrec = panel.data.precAvg[month];
    const fmtTemp = v => v == null || !Number.isFinite(v) ? "-" : `${d3.format(".1f")(v)} C`;
    const fmtPrec = v => v == null || !Number.isFinite(v) ? "-" : `${d3.format(".1f")(v)} mm`;
    return `
        <strong>${panel.muni.name} - ${MONTH_LABELS[month]} ${current.label}</strong>
        <div class="chart-tip-row"><span class="chart-tip-name" style="border-left:3px solid #c44e10;padding-left:6px">Temperatura</span><span>${fmtTemp(temp)}</span></div>
        <div class="chart-tip-row"><span class="chart-tip-name" style="border-left:3px solid #1d91c0;padding-left:6px">Precipitacion</span><span>${fmtPrec(prec)}</span></div>
        <div class="chart-tip-row"><span>Media temp.</span><span>${fmtTemp(avgTemp)}</span></div>
        <div class="chart-tip-row"><span>Media precip.</span><span>${fmtPrec(avgPrec)}</span></div>
    `;
}

function renderClimateStatus(selector, chartHeight, title, subtitle) {
    const svg = d3.select(selector);
    svg.selectAll("*").remove();
    const w = svg.node().clientWidth || 720;
    const h = chartHeight;
    svg.attr("viewBox", `0 0 ${w} ${h}`).style("height", `${h}px`);
    const g = svg.append("g").attr("transform", `translate(${w / 2},${h / 2})`);
    g.append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#555")
        .attr("font-size", 14)
        .attr("font-weight", 700)
        .text(title);
    g.append("text")
        .attr("text-anchor", "middle")
        .attr("y", 24)
        .attr("fill", "#8a8a8a")
        .attr("font-size", 12)
        .text(subtitle);
    return true;
}

function renderClimateNoMonthly(selector, chartHeight = 430) {
    const svg = d3.select(selector);
    svg.selectAll("*").remove();
    const w = svg.node().clientWidth || 720;
    const h = chartHeight;
    svg.attr("viewBox", `0 0 ${w} ${h}`).style("height", `${h}px`);
    const g = svg.append("g").attr("transform", `translate(${w / 2},${h / 2})`);
    g.append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#555")
        .attr("font-size", 14)
        .attr("font-weight", 700)
        .text("Climograma pendiente");
    g.append("text")
        .attr("text-anchor", "middle")
        .attr("y", 24)
        .attr("fill", "#8a8a8a")
        .attr("font-size", 12)
        .text("El paquete nacional actual solo incluye series climáticas anuales.");
    return true;
}

function chartTooltipHtml(year, series, fmt) {
    const rows = series.map(s => {
        const point = nearestPoint(s.points, year);
        if (!point) return "";
        return `
            <div class="chart-tip-row">
                <span class="chart-tip-name" style="border-left:3px solid ${s.color};padding-left:6px">${s.name}</span>
                <span>${fmt(point.v, s)}</span>
            </div>
        `;
    }).join("");
    return `<strong>${Math.round(year)}</strong>${rows}`;
}

function chartTooltipNode() {
    let el = $("#chart-tooltip");
    if (!el) {
        el = document.createElement("div");
        el.id = "chart-tooltip";
        el.className = "chart-tooltip";
        document.body.appendChild(el);
    }
    return el;
}

function showChartTooltip(event, html) {
    const el = chartTooltipNode();
    el.innerHTML = html;
    el.classList.add("visible");
    const pad = 14;
    const rect = el.getBoundingClientRect();
    let left = event.clientX + pad;
    let top = event.clientY + pad;
    if (left + rect.width > window.innerWidth - pad) left = event.clientX - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = event.clientY - rect.height - pad;
    el.style.left = `${Math.max(pad, left)}px`;
    el.style.top = `${Math.max(pad, top)}px`;
}

function hideChartTooltip() {
    $("#chart-tooltip")?.classList.remove("visible");
}

function drawTrendChart(selector, chartHeight = 430) {
    const svg = d3.select(selector);
    svg.selectAll("*").remove();
    const selected = selectedMunicipios();
    const indicators = activeTrendIndicators();
    if (!selected.length || !indicators.length) return false;

    if (supportsClimateAnnualViews() && state.climateTrendMode === "stripes") {
        return renderClimateStripesChart(selector, chartHeight);
    }
    if (supportsClimateAnnualViews() && state.climateTrendMode === "decades") {
        return renderClimateDecadeChart(selector, chartHeight);
    }
    if (supportsClimateAnnualViews() && state.climateTrendMode === "climogram") {
        return renderClimateClimogramChart(selector, chartHeight);
    }

    const series = buildTrendSeries(selected, indicators);
    if (!series.length) return false;

    const layout = resolveTrendLayout(selected, indicators, series);
    applyTrendColors(series, selected, indicators, layout);
    const panels = buildTrendPanels(selected, indicators, series, layout);
    if (!panels.length) return false;

    const w = svg.node().clientWidth || 720;
    const xDomain = trendXDomain(series);
    if (layout === "overlay") {
        const h = chartHeight;
        svg.attr("viewBox", `0 0 ${w} ${h}`).style("height", `${h}px`);
        drawTrendPanel(svg, panels[0], 0, 0, w, h, xDomain, trendYDomain(series), {
            facet: false,
            showLabels: series.length <= 8 && w > 650,
        });
        return true;
    }

    const cols = w >= 940 && panels.length > 1 ? 2 : 1;
    const gapX = 28;
    const gapY = 24;
    const panelW = (w - gapX * (cols - 1)) / cols;
    const panelH = 260;
    const rows = Math.ceil(panels.length / cols);
    const h = rows * panelH + (rows - 1) * gapY;
    svg.attr("viewBox", `0 0 ${w} ${h}`).style("height", `${h}px`);
    const sharedY = layout === "facet-muni" && new Set(series.map(s => s.unit)).size === 1
        ? trendYDomain(series)
        : null;
    panels.forEach((panel, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const px = col * (panelW + gapX);
        const py = row * (panelH + gapY);
        drawTrendPanel(svg, panel, px, py, panelW, panelH, xDomain, sharedY || trendYDomain(panel.series), {
            facet: true,
            showLabels: false,
        });
    });
    return true;
}

function renderTrendControls() {
    if (!$("#trend-controls")) return;
    renderTrendSidebarState();
    renderTrendSelectedMunis();
    renderTrendIndicatorChips();
    renderTrendClimateControls();
    renderTrendLandMetricControls();
    renderTrendLayoutControls();
}

function renderTrendSidebarState() {
    const workspace = $("#trend-workspace");
    const toggle = $("#trend-sidebar-toggle");
    if (!workspace || !toggle) return;
    workspace.classList.toggle("controls-collapsed", !state.trendSidebarOpen);
    toggle.setAttribute("aria-label", state.trendSidebarOpen ? "Ocultar controles" : "Mostrar controles");
    toggle.title = state.trendSidebarOpen ? "Ocultar controles" : "Mostrar controles";
}

function renderTrendSelectedMunis() {
    const wrap = $("#trend-selected-munis");
    if (!wrap) return;
    const selected = selectedMunicipios();
    wrap.innerHTML = "";
    if (!selected.length) {
        const empty = document.createElement("span");
        empty.className = "trend-selected-empty";
        empty.textContent = "Sin municipios seleccionados";
        wrap.appendChild(empty);
        return;
    }
    selected.forEach((m, i) => {
        const chip = document.createElement("span");
        chip.className = "trend-selected-chip";
        chip.innerHTML = `
            <span class="selection-dot" style="background:${LINE_COLORS[i % LINE_COLORS.length]}"></span>
            <span>${m.name}</span>
            <button type="button" aria-label="Quitar ${m.name}" data-ine="${m.ine}">&times;</button>
        `;
        wrap.appendChild(chip);
    });
    wrap.querySelectorAll("button[data-ine]").forEach(btn => {
        btn.addEventListener("click", () => {
            state.selectedInes = state.selectedInes.filter(ine => ine !== btn.dataset.ine);
            refreshSelectionStyles();
            renderSelectionSidebar();
            renderDataView();
        });
    });
}

function renderTrendIndicatorChips() {
    const wrap = $("#trend-indicator-chips");
    if (!wrap) return;
    const selected = activeTrendIndicators();
    wrap.innerHTML = "";
    const options = selectableTrendIndicators().map(ind => {
        const meta = indicatorMeta(ind.id);
        return {
            id: ind.id,
            label: meta.name,
            detail: effectiveIndicatorUnit(ind.id, meta.unit || ""),
            title: meta.desc || meta.name,
        };
    });
    wrap.appendChild(multiDropdownControl(
        "",
        options,
        selected,
        toggleTrendIndicator,
        "trend-indicators",
        trendIndicatorSummary(selected)
    ));
}

function renderTrendLandMetricControls() {
    const wrap = $("#trend-land-metric");
    if (!wrap) return;
    const hasLandAreas = activeTrendIndicators().some(isLandUseAreaIndicator);
    wrap.hidden = !hasLandAreas;
    wrap.innerHTML = "";
    if (!hasLandAreas) return;
    wrap.appendChild(dropdownControl("Metrica", [
        { id: "absolute", label: "Superficie" },
        { id: "share", label: "Porcentaje" },
    ], state.landMetric, setLandMetric, "trend-land-metric-select"));
}

function renderTrendClimateControls() {
    const wrap = $("#trend-climate-controls");
    if (!wrap) return;
    wrap.hidden = !supportsClimateAnnualViews();
    wrap.innerHTML = "";
    if (!supportsClimateAnnualViews()) return;
    wrap.appendChild(dropdownControl("Visualizacion", [
        { id: "series", label: "Serie" },
        { id: "stripes", label: "Anomalias" },
        { id: "decades", label: "Decadas" },
        { id: "climogram", label: "Climograma" },
    ], state.climateTrendMode, (id) => {
        state.climateTrendMode = id;
        renderDataView();
    }, "trend-climate-mode"));
}

function renderTrendLayoutControls() {
    const wrap = $("#trend-layout-controls");
    if (!wrap) return;
    const selected = selectedMunicipios();
    const indicators = activeTrendIndicators();
    wrap.hidden = supportsClimateAnnualViews() && state.climateTrendMode !== "series";
    if (wrap.hidden) {
        wrap.innerHTML = "";
        return;
    }
    const options = [
        { id: "auto", label: "Auto" },
        { id: "overlay", label: "Superpuesto" },
    ];
    if (selected.length > 1) options.push({ id: "facet-muni", label: "Por municipio" });
    if (indicators.length > 1) options.push({ id: "facet-indicator", label: "Por indicador" });
    wrap.innerHTML = "";
    wrap.appendChild(dropdownControl("Facetas", options, state.trendLayout, (id) => {
        state.trendLayout = id;
        renderDataView();
    }, "trend-layout-mode"));
}

function trendIndicatorSummary(selectedIds) {
    if (selectedIds.length === 1) return indicatorMeta(selectedIds[0]).name;
    return `${selectedIds.length} indicadores`;
}

function closeTrendDropdown() {
    if (!state.trendOpenDropdown) return false;
    state.trendOpenDropdown = null;
    renderTrendControls();
    return true;
}

function toggleTrendDropdown(dropdownId) {
    state.trendOpenDropdown = state.trendOpenDropdown === dropdownId ? null : dropdownId;
    renderTrendControls();
}

function dropdownControl(title, options, activeId, onSelect, dropdownId) {
    const root = document.createElement("div");
    root.className = "trend-dropdown";
    root.dataset.dropdownId = dropdownId;

    if (title) {
        const label = document.createElement("div");
        label.className = "trend-control-title";
        label.textContent = title;
        root.appendChild(label);
    }

    const active = options.find(opt => opt.id === activeId) || options[0];
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "trend-dropdown-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", String(state.trendOpenDropdown === dropdownId));
    const current = document.createElement("span");
    current.className = "trend-dropdown-current";
    current.textContent = active?.label || "Seleccionar";
    trigger.appendChild(current);
    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleTrendDropdown(dropdownId);
    });
    root.appendChild(trigger);

    if (state.trendOpenDropdown === dropdownId) {
        const menu = document.createElement("div");
        menu.className = "trend-dropdown-menu";
        menu.setAttribute("role", "listbox");
        options.forEach(opt => {
            const btn = dropdownOptionButton(opt, opt.id === activeId);
            btn.setAttribute("role", "option");
            btn.setAttribute("aria-selected", String(opt.id === activeId));
            btn.addEventListener("click", (event) => {
                event.stopPropagation();
                state.trendOpenDropdown = null;
                if (opt.id !== activeId) {
                    onSelect(opt.id);
                } else {
                    renderTrendControls();
                }
            });
            menu.appendChild(btn);
        });
        root.appendChild(menu);
    }

    return root;
}

function multiDropdownControl(title, options, activeIds, onToggle, dropdownId, summaryText) {
    const root = document.createElement("div");
    root.className = "trend-dropdown trend-dropdown-multi";
    root.dataset.dropdownId = dropdownId;

    if (title) {
        const label = document.createElement("div");
        label.className = "trend-control-title";
        label.textContent = title;
        root.appendChild(label);
    }

    const activeSet = new Set(activeIds);
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "trend-dropdown-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", String(state.trendOpenDropdown === dropdownId));
    const current = document.createElement("span");
    current.className = "trend-dropdown-current";
    current.textContent = summaryText || "Seleccionar";
    trigger.appendChild(current);
    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleTrendDropdown(dropdownId);
    });
    root.appendChild(trigger);

    if (state.trendOpenDropdown === dropdownId) {
        const menu = document.createElement("div");
        menu.className = "trend-dropdown-menu";
        menu.setAttribute("role", "listbox");
        menu.setAttribute("aria-multiselectable", "true");
        options.forEach(opt => {
            const active = activeSet.has(opt.id);
            const btn = dropdownOptionButton(opt, active);
            btn.title = opt.title || opt.label;
            btn.setAttribute("role", "option");
            btn.setAttribute("aria-selected", String(active));
            btn.addEventListener("click", async (event) => {
                event.stopPropagation();
                state.trendOpenDropdown = dropdownId;
                await onToggle(opt.id);
                state.trendOpenDropdown = dropdownId;
            });
            menu.appendChild(btn);
        });
        root.appendChild(menu);
    }

    return root;
}

function dropdownOptionButton(opt, active) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "trend-dropdown-option" + (active ? " active" : "");
    const text = document.createElement("span");
    text.className = "trend-dropdown-option-label";
    text.textContent = opt.label;
    btn.appendChild(text);
    if (opt.detail) {
        const detail = document.createElement("span");
        detail.className = "trend-dropdown-option-detail";
        detail.textContent = opt.detail;
        btn.appendChild(detail);
    }
    return btn;
}

function segmentedControl(title, options, activeId, onSelect) {
    const root = document.createElement("div");
    const label = document.createElement("div");
    label.className = "trend-control-title";
    label.textContent = title;
    const row = document.createElement("div");
    row.className = "trend-segmented";
    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "trend-segment" + (opt.id === activeId ? " active" : "");
        btn.textContent = opt.label;
        btn.addEventListener("click", () => onSelect(opt.id));
        row.appendChild(btn);
    });
    root.appendChild(label);
    root.appendChild(row);
    return root;
}

function appendLandMetricControl(container) {
    if (!container || !isLandUseAreaIndicator(state.indicator)) return;
    const wrap = document.createElement("div");
    wrap.className = "land-metric-inline";
    wrap.appendChild(segmentedControl("Metrica", [
        { id: "absolute", label: "Superficie" },
        { id: "share", label: "%" },
    ], state.landMetric, setLandMetric));
    container.appendChild(wrap);
}

function selectMunicipio(ine, additive = true) {
    if (!ine || !state.data?.municipios?.[ine]) return;
    if (additive) {
        if (!state.selectedInes.includes(ine)) state.selectedInes.push(ine);
    } else {
        state.selectedInes = [ine];
    }
    refreshSelectionStyles();
    renderSelectionSidebar();
    renderDataView();
}

function setupMunicipioSearch() {
    setupMunicipioSearchBox("#muni-search", "#muni-search-results", "#muni-search-clear", 8);
    setupMunicipioSearchBox("#trend-muni-search", "#trend-muni-results", "#trend-muni-search-clear", 10);
}

function setupMunicipioSearchBox(inputSelector, resultsSelector, clearSelector, limit = 8) {
    const input = $(inputSelector);
    const clear = $(clearSelector);
    if (!input) return;
    input.addEventListener("input", () => renderMuniSearchResults(inputSelector, resultsSelector, limit));
    clear?.addEventListener("click", () => {
        input.value = "";
        const out = $(resultsSelector);
        if (out) out.innerHTML = "";
        input.focus();
    });
}

function renderMuniSearchResults(inputSelector = "#muni-search", resultsSelector = "#muni-search-results", limit = 8) {
    const input = $(inputSelector);
    const out = $(resultsSelector);
    if (!input || !out || !state.data?.municipios) return;
    const q = normalizeSearchText(input.value.trim());
    out.innerHTML = "";
    if (q.length < 2) return;
    const selectedSet = new Set(state.selectedInes);
    const rows = Object.entries(state.data.municipios)
        .map(([ine, m]) => {
            const nameNorm = normalizeSearchText(m.name);
            return { ine, m, nameNorm };
        })
        .filter(({ m, nameNorm }) => isMuniIncluded(m) && nameNorm.includes(q))
        .sort((a, b) => {
            const score = (d) => d.nameNorm === q ? 0
                : d.nameNorm.startsWith(q) ? 1
                : d.nameNorm.split(/\s+/).some(part => part.startsWith(q)) ? 2
                : 3;
            return score(a) - score(b)
                || a.nameNorm.length - b.nameNorm.length
                || a.nameNorm.localeCompare(b.nameNorm);
        })
        .slice(0, limit);
    rows.forEach(({ ine, m }) => {
        const prov = state.data.provincias?.[m.prov]?.name || "";
        const btn = document.createElement("button");
        btn.className = "muni-search-result" + (selectedSet.has(ine) ? " active" : "");
        btn.type = "button";
        btn.innerHTML = `<strong>${m.name}</strong><span>${prov}${selectedSet.has(ine) ? " - seleccionado" : ""}</span>`;
        btn.addEventListener("click", () => {
            selectMunicipio(ine, true);
            input.value = "";
            out.innerHTML = "";
        });
        out.appendChild(btn);
    });
}

function lowerIsBetter(layer) {
    const id = (layer || "").toLowerCase();
    const name = (indicatorMeta(layer).name || "").toLowerCase();
    return id.includes("dist") || id.startsWith("to_") || name.includes("distancia");
}

function currentMunicipioRows(layer = analysisLayer()) {
    const year = currentYear();
    const fmt = indicatorFormat(layer);
    const rows = Object.entries(state.data?.municipios || {})
        .filter(([, m]) => isMuniIncluded(m))
        .map(([ine, m]) => {
            const value = indicatorValue(ine, layer, year);
            return { ine, name: m.name, prov: state.data.provincias?.[m.prov]?.name || "", value, formatted: fmt(value) };
        })
        .filter(d => d.value != null && Number.isFinite(d.value));
    rows.sort((a, b) => lowerIsBetter(layer) ? a.value - b.value : b.value - a.value);
    rows.forEach((d, i) => d.rank = i + 1);
    return rows;
}

function renderDataView() {
    if (!document.body.classList.contains("show-data")) return;
    const tab = state.mainTab;
    document.querySelectorAll(".data-panel").forEach(panel => panel.classList.remove("active"));
    $(`#panel-${tab}`)?.classList.add("active");
    renderDataHeadControls(tab);
    const selected = selectedMunicipios();
    const trendIndicators = tab === "trends" ? activeTrendIndicators() : [];
    const selectionText = selected.length ? selected.map(m => m.name).join(", ") : "Sin municipios seleccionados";
    const indicatorText = trendIndicators.length > 1 ? ` · ${trendIndicators.length} indicadores` : "";
    $("#data-selection-summary").textContent = `${selectionText}${indicatorText}`;
    if (tab === "trends") renderTrendsView();
    if (tab === "ranking") renderRankingView();
    if (tab === "table") renderSeriesTableView();
}

function renderDataHeadControls(tab) {
    if (tab !== "trends") {
        state.trendOpenDropdown = null;
    }
}

function renderTrendsView() {
    renderTrendControls();
    const indicators = activeTrendIndicators();
    const meta = indicators.length === 1 ? indicatorMeta(indicators[0]) : null;
    $("#data-view-kicker").textContent = "Evolucion historica";
    const isClimogram = supportsClimateAnnualViews() && state.climateTrendMode === "climogram";
    $("#data-view-title").textContent = isClimogram ? "Climograma" : (meta ? meta.name : `${indicators.length} indicadores`);
    const modeLabel = supportsClimateAnnualViews()
        ? {
            series: "Series historicas",
            stripes: "Anomalias",
            decades: "Decadas",
            climogram: "Climograma mensual"
        }[state.climateTrendMode]
        : "Series historicas";
    $("#data-view-desc").textContent = isClimogram
        ? "Temperatura y precipitacion mensual"
        : (meta?.unit ? `${modeLabel} - ${meta.unit}` : modeLabel);
    const hasChart = drawTrendChart("#trend-chart", trendChartHeight());
    $("#trend-empty").classList.toggle("visible", !hasChart);
}

function trendChartHeight() {
    if ((window.innerWidth || 0) <= 880) return 340;
    const viewport = window.innerHeight || 760;
    return Math.max(430, Math.min(560, viewport - 245));
}

function renderRankingView() {
    const layer = analysisLayer();
    const meta = indicatorMeta(layer);
    $("#data-view-kicker").textContent = `Ranking ${Math.round(currentYear())}`;
    $("#data-view-title").textContent = "Ranking municipal";
    $("#data-view-desc").textContent = `${meta.name}. ${lowerIsBetter(layer) ? "Menor valor aparece primero." : "Mayor valor aparece primero."}`;
    const selectedSet = new Set(state.selectedInes);
    const rows = currentMunicipioRows(layer).slice(0, 100);
    $("#ranking-table").innerHTML = `
        <table class="analysis-table">
            <thead><tr><th>#</th><th>Municipio</th><th>Provincia</th><th class="num">${meta.unit || "Valor"}</th></tr></thead>
            <tbody>${rows.map(d => `
                <tr class="${selectedSet.has(d.ine) ? "selected-row" : ""}">
                    <td class="rank">${d.rank}</td>
                    <td>${d.name}</td>
                    <td>${d.prov}</td>
                    <td class="num">${d.formatted}</td>
                </tr>`).join("")}</tbody>
        </table>`;
}

function renderSeriesTableView() {
    const layer = analysisLayer();
    const meta = indicatorMeta(layer);
    const fmt = indicatorFormat(layer);
    const selected = selectedMunicipios();
    $("#data-view-kicker").textContent = "Serie historica";
    $("#data-view-title").textContent = "Tabla";
    $("#data-view-desc").textContent = selected.length
        ? `Valores historicos de ${meta.name} para los municipios seleccionados.`
        : `Top municipal en ${Math.round(currentYear())}. Selecciona municipios para ver una tabla historica por anio.`;
    if (!selected.length) {
        const rows = currentMunicipioRows(layer).slice(0, 100);
        $("#series-table").innerHTML = `
            <table class="analysis-table">
                <thead><tr><th>#</th><th>Municipio</th><th>Provincia</th><th class="num">${meta.unit || "Valor"}</th></tr></thead>
                <tbody>${rows.map(d => `
                    <tr><td class="rank">${d.rank}</td><td>${d.name}</td><td>${d.prov}</td><td class="num">${d.formatted}</td></tr>`).join("")}</tbody>
            </table>`;
        return;
    }
    const yrs = analysisYears(layer);
    $("#series-table").innerHTML = `
        <table class="analysis-table">
            <thead><tr><th>Anio</th>${selected.map(m => `<th class="num">${m.name}</th>`).join("")}</tr></thead>
            <tbody>${yrs.map(y => `
                <tr>
                    <td class="rank">${y}</td>
                    ${selected.map(m => `<td class="num">${fmt(indicatorValue(m.ine, layer, y))}</td>`).join("")}
                </tr>`).join("")}</tbody>
        </table>`;
}

function renderAboutIndicatorCards() {
    const grid = $("#about-indicator-grid");
    if (!grid || !CATEGORIES) return;
    grid.innerHTML = "";
    const entries = [];
    for (const [catId, cat] of Object.entries(CATEGORIES)) {
        for (const ind of cat.indicators || []) {
            entries.push({ ...ind, catId, catLabel: cat.label || catId });
        }
    }
    entries.forEach(ind => {
        const d = sourceDetailsForIndicator(ind.id);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "about-indicator-card";
        card.innerHTML = `
            <div class="card-kicker">${ind.catLabel}</div>
            <h3>${ind.name}</h3>
            <p>${d.source}</p>
            <div class="card-more">
                <p><strong>Metodo.</strong> ${d.method}</p>
                <p><strong>Cita.</strong> ${d.citation}</p>
            </div>
        `;
        card.addEventListener("click", () => card.classList.toggle("open"));
        grid.appendChild(card);
    });
}

function buildCategoryTabs() {
    const wrap = $("#cat-tabs");
    if (!wrap) return;
    wrap.innerHTML = '';
    CATEGORY_DEF.forEach(c => {
        if (!CATEGORIES[c.id]) return; // skip categories with no indicators
        const btn = document.createElement('button');
        btn.className = 'cat-tab' + (c.id === state.category ? ' active' : '');
        btn.dataset.cat = c.id;
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="cat-icon">${c.icon}</svg><span>${c.label}</span>`;
        btn.addEventListener('click', () => switchCategory(c.id));
        wrap.appendChild(btn);
    });
}

async function switchCategory(catId) {
    if (!CATEGORIES[catId]) return;
    state.category = catId;
    document.querySelectorAll('.cat-tab').forEach(c => c.classList.toggle('active', c.dataset.cat === catId));
    // Clear overlays from previous category
    state.activeOverlays.clear();
    map.select("g.layer-overlays").selectAll("*").remove();

    // Pick the default indicator for this category
    const def = CATEGORIES[catId].default;
    state.indicator = def || null;
    state.selectedTrendIndicators = state.indicator ? [state.indicator] : [];
    if (catId === "transporte") {
        state.activeOverlays = new Set(CATEGORIES[catId].autoOverlays || []);
        await renderActiveOverlays();
    }
    renderIndicatorList();
    paintMunicipios();
    renderSelectionSidebar();

    // Lazy-load any source file the new indicator depends on
    try {
        await ensureIndicatorLoaded(state.indicator);
    } catch (e) {
        console.warn("No se pudo cargar indicador", state.indicator, e);
        $("#legend").innerHTML = `<div style="font-size:11px;color:var(--ink-mute);font-style:italic">No se pudo cargar este indicador.</div>`;
        return;
    }

    // Sync timeline/year array to the new indicator's grid
    syncCensusToIndicator();
    setupTimeline();
    renderIndicatorList();
    paintMunicipios();
    renderSelectionSidebar();
}

async function ensureIndicatorLoaded(indId) {
    const src = indicatorSourceFile(indId);
    if (!src) return; // derived (population), already loaded
    if (state.sources[src]) return;
    setLoading(`Cargando ${src} (puede tardar)…`, null);
    $("#loading").classList.remove('hidden');
    try {
        await loadSource(src);
    } finally {
        setTimeout(() => $("#loading").classList.add('hidden'), 100);
    }
}

function setTimelineYears(years, preferredYear = currentYear()) {
    CENSUS = years && years.length ? years : [2025];
    YEAR_MIN = CENSUS[0];
    YEAR_MAX = CENSUS[CENSUS.length - 1];
    let bestI = 0;
    let bestD = Infinity;
    CENSUS.forEach((y, i) => {
        const d = Math.abs(y - preferredYear);
        if (d < bestD) {
            bestD = d;
            bestI = i;
        }
    });
    state.yearIdx = bestI;
    state.animFrameYear = null;
}

// Re-aim CENSUS / YEAR_MIN / YEAR_MAX at the active indicator's years.
function syncCensusToIndicator() {
    const preferredYear = currentYear();
    const overlayYears = overlayTimelineYears();
    if (overlayYears && overlayYears.length > 0) {
        setTimelineYears(overlayYears, preferredYear);
        return;
    }
    const yrs = indicatorYears(state.indicator);
    if (yrs && yrs.length > 0) {
        setTimelineYears(yrs, preferredYear);
    } else {
        setTimelineYears([2025], preferredYear);
    }
}

function renderIndicatorList() {
    const list = $("#indicator-list");
    list.innerHTML = "";
    const cat = CATEGORIES[state.category];
    if (!cat) {
        $("#indicator-name").textContent = '—';
        $("#indicator-desc").textContent = '';
        return;
    }
    if (cat.type === "placeholder") {
        $("#indicator-name").textContent = cat.label;
        $("#indicator-desc").textContent = "Próximamente. En desarrollo.";
        return;
    }

    const indList = cat.indicators;
    const select = document.createElement("select");
    select.className = "indicator-select";
    if (state.category === "transporte" && indList.some(i => i.kind === "overlay")) {
        const allOpt = document.createElement("option");
        allOpt.value = "__all_routes";
        allOpt.textContent = "Todos los trazados";
        select.appendChild(allOpt);
    }
    indList.forEach(ind => {
        const opt = document.createElement("option");
        opt.value = ind.id;
        opt.textContent = ind.name;
        select.appendChild(opt);
    });
    if (state.category === "transporte" && state.activeOverlays.size > 1) {
        select.value = "__all_routes";
    } else if (state.category === "transporte" && state.activeOverlays.size === 1) {
        select.value = [...state.activeOverlays][0];
    } else {
        select.value = state.indicator || indList[0]?.id || "";
    }
    select.addEventListener("change", () => selectIndicatorFromDropdown(select.value));
    list.appendChild(select);
    appendLandMetricControl(list);

    const cur = indList.find(i => i.id === select.value) || indList.find(i => i.kind !== 'overlay' && i.id === state.indicator);
    if (cur) {
        $("#indicator-name").textContent = cur.name;
        $("#indicator-desc").textContent = usesLandShareMetric(cur.id)
            ? `${cur.name} como porcentaje de la superficie municipal.`
            : cur.desc;
    } else if (select.value === "__all_routes" || state.category === 'transporte' || indList.every(i => i.kind === 'overlay')) {
        $("#indicator-name").textContent = cat.label;
        $("#indicator-desc").textContent = "Trazados historicos superpuestos sobre el mapa base.";
    }
}

async function selectIndicatorFromDropdown(value) {
    const cat = CATEGORIES[state.category];
    const ind = cat?.indicators.find(i => i.id === value);
    if (value === "__all_routes") {
        state.indicator = null;
        state.selectedTrendIndicators = [];
        state.activeOverlays = new Set(OVERLAY_INDICATORS.map(o => o.id));
        await renderActiveOverlays();
        syncCensusToIndicator();
        setupTimeline();
        renderIndicatorList();
        paintMunicipios();
        renderSelectionSidebar();
        return;
    }
    if (!ind) return;
    if (ind.kind === "overlay") {
        state.indicator = ind.id;
        state.selectedTrendIndicators = [];
        state.activeOverlays = new Set([ind.id]);
        await renderActiveOverlays();
        syncCensusToIndicator();
        setupTimeline();
        renderIndicatorList();
        paintMunicipios();
        renderSelectionSidebar();
        return;
    }
    state.indicator = ind.id;
    state.selectedTrendIndicators = [ind.id];
    $("#indicator-name").textContent = ind.name;
    $("#indicator-desc").textContent = ind.desc;
    try {
        await ensureIndicatorLoaded(ind.id);
    } catch (e) {
        console.warn("No se pudo cargar indicador", ind.id, e);
        $("#legend").innerHTML = `<div style="font-size:11px;color:var(--ink-mute);font-style:italic">No se pudo cargar este indicador.</div>`;
        return;
    }
    syncCensusToIndicator();
    setupTimeline();
    renderIndicatorList();
    paintMunicipios();
    renderSelectionSidebar();
}

async function renderActiveOverlays() {
    const layer = map.select("g.layer-overlays");
    if (layer.empty()) return;
    layer.selectAll("*").remove();
    for (const id of state.activeOverlays) {
        const ind = OVERLAY_INDICATORS.find(o => o.id === id);
        if (ind) await addOverlay(ind);
    }
}

function overlayFeatureVisibleAtYear(ind, feature, year) {
    if (!ind?.temporal) return true;
    const p = feature.properties || {};
    const opening = Number(p.OPENING) || ind.startYear || YEAR_MIN;
    const closure = Number(p.CLOSURE) || 0;
    const reopening = Number(p.REOPENING) || 0;
    if (year < opening) return false;
    if (closure > 0 && year >= closure && (!reopening || year < reopening)) return false;
    return true;
}

function updateOverlayVisibility(year = currentYear()) {
    for (const id of state.activeOverlays) {
        const ind = OVERLAY_INDICATORS.find(o => o.id === id);
        if (!ind) continue;
        map.select(`g.overlay-${id}`).selectAll("path")
            .style("display", d => overlayFeatureVisibleAtYear(ind, d, year) ? null : "none");
    }
}

function overlayTimelineYears() {
    if (state.category !== "transporte" || isPaintableIndicator(state.indicator)) return null;
    const starts = [];
    for (const id of state.activeOverlays) {
        const ind = OVERLAY_INDICATORS.find(o => o.id === id);
        if (!ind?.temporal) continue;
        const data = state.overlays[ind.id];
        const years = data?.features
            ?.map(f => Number(f.properties?.OPENING))
            .filter(y => Number.isFinite(y) && y > 0);
        starts.push(...(years?.length ? years : [ind.startYear || 1850]));
    }
    if (!starts.length) return null;
    const minYear = Math.min(...starts);
    const maxYear = 2025;
    return d3.range(minYear, maxYear + 1);
}

function overlayLabel(ind, feature) {
    const p = feature.properties || {};
    if (!ind?.temporal) {
        const meta = [p.clase, p.certeza].filter(Boolean).join(" · ");
        return {
            title: ind.name,
            meta: meta || "Trazado historico",
            value: Number.isFinite(+p.longitud_km) ? `${d3.format(",.1f")(+p.longitud_km)} km` : "",
        };
    }
    const opening = Number(p.OPENING) || null;
    const closure = Number(p.CLOSURE) || 0;
    const reopening = Number(p.REOPENING) || 0;
    const parts = [];
    if (opening) parts.push(`apertura ${opening}`);
    if (closure) parts.push(`cierre ${closure}`);
    if (reopening) parts.push(`reapertura ${reopening}`);
    return {
        title: ind.name,
        meta: parts.join(" · ") || "Trazado ferroviario",
        value: overlayFeatureVisibleAtYear(ind, feature, currentYear()) ? "visible en este ano" : "fuera del ano activo",
    };
}

function onOverlayHover(ev, d, ind) {
    const info = overlayLabel(ind, d);
    tooltip.innerHTML = `
        <div class="tooltip-name">${info.title}</div>
        <div class="tooltip-meta">${info.meta}</div>
        ${info.value ? `<div class="tooltip-value"><span>trazado</span><strong>${info.value}</strong></div>` : ""}
    `;
    tooltip.classList.add("visible");
    moveTooltip(ev);
}

async function addOverlay(ind) {
    if (!state.overlays[ind.id]) {
        try {
            state.overlays[ind.id] = await loadJson(ind.file);
        } catch (e) {
            console.warn("No se pudo cargar overlay", ind.id, e);
            state.activeOverlays.delete(ind.id);
            return;
        }
    }
    const data = state.overlays[ind.id];
    const g = map.select("g.layer-overlays").append("g")
        .attr("class", `overlay-${ind.id}`);
    g.selectAll(`path.${ind.style}`)
        .data(data.features)
        .enter().append("path")
        .attr("class", ind.style)
        .attr("d", pathGen)
        .style("display", d => overlayFeatureVisibleAtYear(ind, d, currentYear()) ? null : "none")
        .on("mouseover", (ev, d) => onOverlayHover(ev, d, ind))
        .on("mouseleave", onMuniLeave);
}
function removeOverlay(id) {
    map.select(`g.layer-overlays > g.overlay-${id}`).remove();
}

// ───────── Time slider ─────────
let _timelineHandlersBound = false;
function setupTimeline() {
    const ticks = $("#timeline-ticks");
    ticks.innerHTML = "";
    const tl = $("#timeline");
    const timebar = $(".timebar");
    const isStatic = CENSUS.length <= 1 || YEAR_MAX === YEAR_MIN;
    timebar?.classList.toggle("disabled", isStatic);
    if (isStatic) {
        const tick = document.createElement("div");
        tick.className = "timeline-tick";
        tick.style.left = "100%";
        ticks.appendChild(tick);
        const lbl = document.createElement("div");
        lbl.className = "timeline-tick-label";
        lbl.style.left = "100%";
        lbl.textContent = CENSUS[0] ?? "";
        ticks.appendChild(lbl);
        updateTimelineHandle();
        return;
    }
    // Etiquetas en años clave (cada ~25 años, ajustado al rango disponible)
    const labelYears = new Set();
    const span = YEAR_MAX - YEAR_MIN;
    const step = span > 200 ? 50 : span > 100 ? 25 : 10;
    for (let y = Math.ceil(YEAR_MIN / step) * step; y <= YEAR_MAX; y += step) labelYears.add(y);
    labelYears.add(YEAR_MIN);
    labelYears.add(YEAR_MAX);

    CENSUS.forEach((y) => {
        const pct = ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
        const tick = document.createElement("div");
        tick.className = "timeline-tick";
        tick.style.left = pct + "%";
        ticks.appendChild(tick);
        if (labelYears.has(y)) {
            const lbl = document.createElement("div");
            lbl.className = "timeline-tick-label";
            lbl.style.left = pct + "%";
            lbl.textContent = y;
            ticks.appendChild(lbl);
        }
    });
    updateTimelineHandle();
    if (_timelineHandlersBound) return;  // attach drag handlers only once
    _timelineHandlersBound = true;
    let dragging = false;
    tl.addEventListener("mousedown", (e) => { dragging = true; onTimelineClick(e); });
    window.addEventListener("mouseup", () => dragging = false);
    window.addEventListener("mousemove", e => { if (dragging) onTimelineClick(e); });
}

function onTimelineClick(ev) {
    if (CENSUS.length <= 1 || YEAR_MAX === YEAR_MIN) return;
    const tl = $("#timeline").getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (ev.clientX - tl.left) / tl.width));
    const year = YEAR_MIN + t * (YEAR_MAX - YEAR_MIN);
    let bestI = 0, bestD = Infinity;
    CENSUS.forEach((y, i) => { if (Math.abs(y - year) < bestD) { bestD = Math.abs(y - year); bestI = i; } });
    state.yearIdx = bestI;
    state.animFrameYear = null;
    stopPlay();
    paintMunicipios();
    renderSelectionSidebar();
    updateTimelineHandle();
}
function updateTimelineHandle() {
    let pct;
    if (YEAR_MAX === YEAR_MIN) pct = 1;
    else if (state.animFrameYear != null) pct = (state.animFrameYear - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
    else pct = (CENSUS[state.yearIdx] - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
    $("#timeline-handle").style.left = (pct * 100) + "%";
    $("#timeline-fill").style.width = (pct * 100) + "%";
}

// ───────── Play / pause ─────────
function startPlay() {
    if (CENSUS.length <= 1 || YEAR_MAX === YEAR_MIN) return;
    state.playing = true;
    $("#play-btn").innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>';
    let startY = state.animFrameYear ?? CENSUS[state.yearIdx];
    if (startY >= YEAR_MAX) startY = YEAR_MIN;
    state.animFrameYear = startY;
    state.playTimer = setInterval(() => {
        let y = state.animFrameYear + 1;
        if (y > YEAR_MAX) { stopPlay(); state.animFrameYear = null; return; }
        state.animFrameYear = y;
        for (let i = CENSUS.length - 1; i >= 0; i--) {
            if (CENSUS[i] <= y) { state.yearIdx = i; break; }
        }
        paintMunicipios();
        renderSelectionSidebar();
        updateTimelineHandle();
    }, 80);
}
function stopPlay() {
    state.playing = false;
    if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
    $("#play-btn").innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
}

// ───────── Map level (mun/prov) ─────────
function applyViewLevelClass() {
    map
        .classed("view-mun", state.viewLevel === "mun")
        .classed("view-prov", state.viewLevel === "prov")
        .classed("view-ccaa", state.viewLevel === "ccaa");
}

function setViewLevel(level) {
    if (!["mun", "prov", "ccaa"].includes(level)) return;
    state.viewLevel = level;
    ["mun", "prov", "ccaa"].forEach(id => {
        const btn = $(`#btn-${id}`);
        if (btn) btn.classList.toggle("active", id === level);
    });
    applyViewLevelClass();
    paintMunicipios();
    renderSelectionSidebar();
}

function clampSidebarWidth(value) {
    const max = Math.max(260, Math.min(560, window.innerWidth - 420));
    return Math.round(Math.max(240, Math.min(max, value)));
}

function setSidebarWidth(width, persist = false) {
    const next = clampSidebarWidth(width);
    document.documentElement.style.setProperty("--sidebar-w", `${next}px`);
    if (persist) localStorage.setItem("atlasSidebarWidth", String(next));
}

function setupSidebarResize() {
    const handle = $("#sidebar-resizer");
    if (!handle) return;
    const saved = Number(localStorage.getItem("atlasSidebarWidth"));
    if (Number.isFinite(saved) && saved > 0) setSidebarWidth(saved);

    let dragging = false;
    const stopDragging = () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove("resizing-sidebar");
        const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-w"));
        if (Number.isFinite(current)) setSidebarWidth(current, true);
        if (state.municipios) renderMapProgressive();
    };

    handle.addEventListener("pointerdown", (e) => {
        dragging = true;
        handle.setPointerCapture?.(e.pointerId);
        document.body.classList.add("resizing-sidebar");
        e.preventDefault();
    });
    window.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        setSidebarWidth(e.clientX);
    });
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
}

function setupNavTabs() {
    const setMainTab = (tab) => {
        state.mainTab = tab;
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        document.querySelectorAll(".info-btn").forEach(b => b.classList.toggle("active", tab === "about"));
        document.body.classList.toggle("show-about", tab === "about");
        document.body.classList.toggle("show-data", ["trends", "ranking", "table"].includes(tab));
        if (tab === "map" && state.municipios) {
            setTimeout(() => renderMapProgressive(), 60);
        }
        if (["trends", "ranking", "table"].includes(tab)) {
            setTimeout(renderDataView, 0);
        }
    };

    document.querySelectorAll("[data-tab]").forEach(btn => {
        btn.addEventListener("click", () => {
            setMainTab(btn.dataset.tab);
        });
    });
}

// ───────── Init ─────────
async function init() {
    setupIntro();
    setupNavTabs();
    setupSidebarResize();
    await loadData();
    setupMunicipioSearch();
    $("#trend-sidebar-toggle")?.addEventListener("click", () => {
        state.trendSidebarOpen = !state.trendSidebarOpen;
        state.trendOpenDropdown = null;
        renderTrendControls();
        setTimeout(() => {
            if (document.body.classList.contains("show-data") && state.mainTab === "trends") {
                drawTrendChart("#trend-chart", trendChartHeight());
            }
        }, 80);
    });
    document.addEventListener("click", (event) => {
        if (!state.trendOpenDropdown) return;
        if (event.target instanceof Element && event.target.closest(".trend-dropdown")) return;
        closeTrendDropdown();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeTrendDropdown();
    });
    syncCensusToIndicator();
    await renderMapProgressive();
    renderIntroMap();
    setupTimeline();
    buildCategoryTabs();
    renderAboutIndicatorCards();
    renderIndicatorList();
    paintMunicipios();
    renderSelectionSidebar();

    $("#play-btn").addEventListener("click", () => state.playing ? stopPlay() : startPlay());
    $("#btn-mun").addEventListener("click", () => setViewLevel("mun"));
    $("#btn-prov").addEventListener("click", () => setViewLevel("prov"));
    $("#btn-ccaa").addEventListener("click", () => setViewLevel("ccaa"));
    $("#clear-btn").addEventListener("click", () => {
        state.selectedInes = [];
        refreshSelectionStyles();
        renderSelectionSidebar();
        renderDataView();
    });
    $(".map-area").addEventListener("mousemove", e => {
        if (tooltip.classList.contains("visible")) moveTooltip(e);
    });
    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            renderMapProgressive();
            renderIntroMap();
            if (document.body.classList.contains("show-data") && state.mainTab === "trends") {
                renderDataView();
            }
        }, 200);
    });
}

init().catch(e => {
    console.error(e);
    setLoading("Error cargando datos: " + e.message, 1);
});
