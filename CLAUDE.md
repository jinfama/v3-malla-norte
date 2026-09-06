# web_spain_municipal — Atlas Histórico Municipal de España

> Protocolo comun de agentes: ver `../../AGENTS.md`. Plan de URLs beta: `../../docs/BETA_VISORS.md`.

## Descripción
Visor interactivo **exclusivamente a nivel municipal** para España. Time-lapse
de población 1900–2011 (12 censos decenales) con estética inspirada en
Opportunity Atlas (Harvard/Census). Diseñado para crecer hasta convertirse en
un Atlas Histórico Municipal con clima, transporte, usos del suelo, etc.

**Regla de oro: solo datos a nivel municipal.** Si una variable es provincial
(cultivos, energía, emisiones del proyecto CAHE), se descarta para este visor.

## Geometrías
- Fuente curada: `D:\data\spain\spain_municipal\_common\shapes\municipios.gpkg`
  (8.205 municipios, EPSG:4326, ya armonizada a límites actuales con
  `ine_code` de 5 dígitos, `area_km2` precomputada)
- Simplificación: Visvalingam-Whyatt @ 0.0008° (≈ 90 m), prequantize 1e6
- Igualando la calidad de [web_andalusia](../web_andalusia/)

## Conexión con el subproyecto de datos
Este visor lee de `D:\data\spain\spain_municipal\` — el subproyecto de
investigación que centraliza la base de datos histórica municipal nacional
(8.205 municipios). La regla del subproyecto es replicar el patrón ya
consolidado en `D:\data\andalusia\` a escala nacional.

Los build scripts de este visor (`build/convert_*.py`) son puramente
"adaptadores": leen datos curados del subproyecto y los compactan en JSON
para web. **NO se procesan datos crudos aquí.**

## Estructura
```
index.html              ← Entrada (carga progresiva con barra)
css/styles.css          ← UI estilo Opportunity Atlas
js/app.js               ← Controlador principal (D3 v7 + topojson-client)
data/                   ← Datos pre-generados (~5 MB total)
├── poblacion.json              ← 1.2 MB — Goerlich/Mas + área km² IGN
├── municipios.topojson         ← 2.0 MB — IGN simplificado VW (8205 mun)
├── provincias.topojson         ← 0.2 MB — disuelto desde municipios
├── calzadas_romanas.geojson    ← 175 KB — red romana en Hispania
├── ferrocarril_iberico.geojson ← 752 KB — vía ibérica histórica (2690 líneas)
├── ferrocarril_estrecho.geojson ← 459 KB — vía estrecha (1719 líneas)
└── ferrocarril_ave.geojson     ← 39 KB — alta velocidad (63 líneas)
build/                  ← Scripts Python (NO desplegar)
├── convert_poblacion.py    ← + área km² desde IGN reproyectado a EPSG:3035
├── convert_geo.py          ← Visvalingam-Whyatt + TopoJSON
├── convert_calzadas.py
├── convert_ferrocarril.py
└── test_render.py          ← test headless con playwright
```

## Stack
- HTML5 + CSS + JS vanilla (módulo ES6 nativo, sin bundler)
- D3.js v7 (**local**, en `vendor/`; no hay CDN)
- Tipografía: ver «Paleta y cromo». El visor **no pide ninguna hoja de fuentes**
  (ni Google Fonts ni `@font-face`): las familias viven solo en la pila CSS.
- Datos pre-generados con Python (geopandas, pandas)

## Paleta y cromo (2026-09)
El cromo del visor sigue la **portada aprobada** del propio visor:
`07_temp/portadas_visores_2026-09/spain_municipal/V1_espana-que-se-vacia.html`
— papel crema con grano, pigmento sepia y sanguina, titulares en EB Garamond.
(Antes seguía por error la portada de *Andalucía*; ya no.)

**Regla de oro del color: hay dos paletas y no se mezclan.**
1. *Cromo* (marco: fondos, paneles, reglas, texto, acento, botones, pestañas,
   tooltips, portada de entrada). Vive en `:root` de `css/styles.css` y se
   toca ahí, nunca con literales sueltos.
2. *Datos* (encodings de mapa y gráficos). Vive en `js/app.js`: `POP_COLORS`,
   `CAMBIO_COLORS`, `DISTANCE_COLORS`, `CLIMATE_*`, `LINE_COLORS`,
   `NO_DATA_COLOR` y los colores de las capas de transporte (calzada romana,
   ferrocarril ibérico, estrecho, AVE, también en `.legend-line.ov-*`).
   **No se tocan por estética.** Están elegidos por lectura de datos.

Tokens (`css/styles.css`, `:root`), con su origen en la portada:

| token | valor | portada |
|---|---|---|
| `--bg` | `#fbf6e9` | `--cal` (paneles, tooltips, barras) |
| `--bg-alt` | `#f1e9d7` | `--papel` (fondo de página, hover, paneles hundidos) |
| `--bg-map` | `#e9eff0` | **frío a propósito**, ver abajo |
| `--ink` | `#332a1e` | `--tinta` |
| `--ink-soft` | `#584735` | `--tinta2` |
| `--ink-mute` | `#75664f` | `--muted` asentado (el original da 3,8:1) |
| `--rule` | `#c9c0ad` | `--hair` (.22 de tinta) sobre papel |
| `--rule-soft` | `#e3dbc8` | filete suave |
| `--accent` | `#b04528` | `--sanguina` (#b4482a) asentada un 2 % de luminancia |
| `--accent-strong` | `#7c2c15` | `--sanguina-osc` (hover, texto sobre relleno claro) |
| `--accent-soft` | `#e4c8b4` | sanguina al 20 % sobre papel |
| `--accent-wash` | `rgba(176,69,40,.07)` | velo de sanguina para hover/activo |
| `--font-serif` | `'EB Garamond', 'Source Serif Pro', Garamond, Georgia, …` | titulares |
| `--font-sans` | `'Alegreya Sans', 'Inter', system-ui, …` | interfaz |

- **`--bg-map` se queda gris-ceniza, no crema.** El quintil bajo de
  `POP_COLORS` (`#fbe8c2`) se eligió para leerse sobre ese fondo frío: su
  luminancia y la del lienzo crema serían casi idénticas (1,04:1) y el mapa
  perdería el primer escalón de la escala. Es la única concesión del marco.
- **Fuentes**: EB Garamond y Alegreya Sans encabezan la pila pero **no se
  descargan** (no se añade ninguna petición nueva). Si no están instaladas,
  los titulares caen en Georgia y la interfaz en la sans del sistema. De la
  pila de la portada se deja fuera *Gill Sans MT*: su cifra `1` es un palo
  sin base y en las tablas de población se confunde con I/l.
- **Esquinas**: `border-radius: 0` en toda la interfaz. Excepciones vivas,
  declaradas en el comentario final de `css/styles.css`: `.selection-dot`
  (punto de dato) y `.timeline-handle` (asa de arrastre). Nada más; las
  píldoras de 999 px están cuadradas.
- **Foco de teclado**: anillo de 2 px en `--accent` con `outline-offset: 2px`,
  declarado al final de la hoja para ganar a los `outline: none` locales.
- **Contraste**: medido con la fórmula WCAG sobre estilos computados en
  escritorio 1440×900 y móvil 390×844. 281 pares texto/fondo, ninguno por
  debajo del mínimo; el más justo es `--ink-mute` sobre `--bg-alt` (4,61:1).
  Si se aclara `--ink-mute` o se oscurece `--bg-alt`, ese par cae: volver a
  medir antes de tocarlos.

## Fuentes de datos (todas vía subproyecto spain_municipal)
- **Población 1900–2011** (Goerlich/Mas BBVA-Ivie): censos decenales con
  fronteras armonizadas. En
  `D:\data\spain\spain_municipal\population\data\processed\04_goerlich_long.csv`
- **Población 1996–2025** (INE Padrón continuo, anual): extiende la serie
  hasta hoy. En
  `D:\data\spain\spain_municipal\population\data\processed\05_ine_padron_long.csv`
  Los años en overlap (1996, 2001, 2011) se resuelven con Padrón.
- **Geometrías municipales** (IGN curado): 8.205 mun en
  `D:\data\spain\spain_municipal\_common\shapes\municipios.gpkg`
- **Calzadas romanas**: dataset Hispania (depopulation_spain raw).
- **Ferrocarril histórico** (vía ibérica · estrecha · AVE): shapefiles
  de Tirado et al. (Ivie–Universidad de Valencia).

## Reglas para agentes
- **NO modificar `build/`** sin instrucción explícita
- **NO añadir frameworks ni npm** (ni CDNs ni hojas de fuentes)
- **NO tocar las escalas de color de datos** (ver «Paleta y cromo»)
- **Idioma**: español
- **Datos**: regenerar con scripts en `build/`, no editar JSON manualmente

## UI: tres categorías como tabs en el top bar
- **Población** (choropleth, radio): pob total · pob log · densidad · cambio %
- **Transporte** (overlays, checkbox): calzadas romanas · ferrocarril ibérico ·
  ferrocarril estrecho · AVE
- **Clima**: placeholder (Próximamente)

## Funcionalidad
- Time-lapse anual interpolado entre censos (1900–2011) con play/pause
- Hover tooltip + sidebar con line chart de evolución
- **Multi-selección**: click = uno; shift/ctrl+click = añadir al panel
- Carga progresiva con progress bar (paths SVG en chunks de 1500)
- Bottom-right: toggle Municipios / Provincias (nivel agregado)

## Variables disponibles para futuras integraciones (SOLO MUNICIPALES)
**Municipal directo** (ya en disco, fáciles de añadir):
- `05_projects/depopulation_spain/data/processed/analysis_dataset.csv`
  — distancias municipales a calzadas / ferrocarriles / costas (1900–2011)

**Geoespacial vectorial municipal**:
- Estaciones ferroviarias (HighSpeed, Iberian, Narrow) — puntos
- Líneas límite IGN autonómicas — para frontera CCAA si interesa

## Fuentes externas pendientes de descarga
- **HILDA+ (usos del suelo histórico, 1899–2018)** — no encontrado localmente.
  Descarga: https://luh.umd.edu o repositorio HILDA+ (Winkler et al. 2021).
  Es raster ~1km, habrá que agregar a polígonos municipales.
- **MOPREDAS / MOTEDAS (clima histórico nacional)** — usado en web_andalusia
  pero solo se procesó Andalucía. La fuente nacional es CSIC-IPE Zaragoza
  (Vicente-Serrano et al). Descargar y agregar a municipios.
- **Paper Nature Sci Data 2025** (s41597-025-05055-z) — el usuario lo mencionó
  como referencia; no se pudo abrir (303 redirect). Pendiente de revisar
  cuando esté disponible.

## DESCARTADO (no municipal):
Datos provinciales del proyecto CAHE (`05_projects/spain/all_indicators/`)
— cultivos, bosques, energía, emisiones, materiales — son a nivel provincial,
no encajan en el alcance estrictamente municipal de este visor.

## Pendiente / extensible
- [ ] Filtro temporal del ferrocarril por OPENING/CLOSURE (la geometría
      ya tiene los campos)
- [ ] Vista comparativa (1950 vs 2011, % desde el máximo histórico)
- [ ] Búsqueda de municipio (autocomplete sobre 8.116 nombres)
- [ ] Capa Clima cuando AEMET histórico esté procesado a nivel municipal
- [ ] Vías pecuarias y carreteras IGN como overlays adicionales

## Test local
```bash
python -m http.server 8765
# luego abrir http://localhost:8765/index.html
```

## Test headless
```bash
python build/test_render.py  # requiere playwright
```
