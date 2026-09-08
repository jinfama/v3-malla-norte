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
index.html              ← Portada V7 «palimpsesto» (Canvas 2D, sin fetch; CTA → visor.html)
visor.html              ← La app (carga progresiva con barra)
portada/                ← Kits de la portada (solo lectura, generados desde data/)
├── spain.js                    ← contorno y provincias
├── spain-muni.js               ← kit V5: rutas (calzadas, ferrocarriles con año)
├── spain-muni-v6*.js           ← kit V6: centroides, nombres, series de población
└── spain-muni-v7.js            ← kit V7: altitud, cultivos 1900/2020, embalses por década
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
├── portada_kit_v6.py       ← kit V6 de la portada (centroides + series exactas)
├── portada_kit_v7.py       ← kit V7 de la portada (altitud, cultivos, embalses)
└── test_render.py          ← test headless con playwright
```

## Stack
- HTML5 + CSS + JS vanilla (módulo ES6 nativo, sin bundler)
- D3.js v7 (**local**, en `vendor/`; no hay CDN)
- Tipografía: ver «Paleta y cromo». El visor **no pide ninguna hoja de fuentes**
  (ni Google Fonts ni `@font-face`): las familias viven solo en la pila CSS.
- Datos pre-generados con Python (geopandas, pandas)

## Paleta y cromo (2026-09; escalas de mapa rehechas el 2026-09-06)
**Regla (portadas V7, 2026-09-08): la paleta del interior es la de la
portada.** Los tokens de `:root` de `index.html` (papel `#F1E9D7`, cal
`#FBF6E9`, tinta `#332A1E`, sanguina `#B4482A`/`#7C2C15`, teal de agua
`#114855`) son los de `css/styles.css`; al pulsar «Entrar al visor» no se
cambia de mundo. La portada vigente es la V7 «palimpsesto» (`index.html`,
kits `portada/spain-muni-v6*.js`, `spain-muni-v7.js` y `spain-muni.js`,
generados con `build/portada_kit_v6.py` y `build/portada_kit_v7.py`), heredera
de la V1/V5 aprobada
(`07_temp/portadas_visores_2026-09/spain_municipal/V1_espana-que-se-vacia.html`)
— papel crema con grano, pigmento sepia y sanguina, titulares en EB Garamond.
(Antes seguía por error la portada de *Andalucía*; ya no.)

Lo que se llevó al interior el 2026-09-08 (backups `*.20260908-v7.bak` en
`C:/Work/scratch/checkpoint/visores_2026-09/web_spain_municipal_backup/`):
- `--bg-map` pasa de gris-azul `#e9eff0` a gris de papel `#eceae8` (ver abajo).
- Tokens nuevos `--teal #114855`, `--teal-soft #2f6570`, `--teal-wash`.
- Redes de transporte en las cuatro tintas de la portada: calzadas =
  `--accent-strong` a trazos, vía ibérica = `--ink`, vía estrecha = `--teal`
  a trazos, AVE = minio `#c4562b` (antes `#8f3b1f / #22384a / #4f8b99 /
  #7c5c9c`). Pares ≥ 18,6 dE (≥ 10,9 en protanopia, y se separan por el
  trazo); el más claro da 3,69:1 sobre la tierra base.
- Hidrología: `Reservoir_*`, `Usable_reservoir_*` y `Vol_*` pintan con
  `SEQ_COOL` (crema → teal), como las distancias a ríos, la lluvia y las
  heladas: son agua (`isWaterLayer()` en `js/app.js`). Misma rampa de 7
  clases, mismas medidas.
- `LINE_COLORS`: los dos azules ajenos (`#1d3b79`, `#4491e0`) son ahora teal
  `#114855` y verde de agua `#3f6f5c`. Remedido: mínimo mutuo 12,0 dE
  (8,7 en deuteranopia y protanopia; antes 15,1 / 14,1 / 15,0), todos
  ≥ 3,05:1 sobre `--bg`.
- Climograma: lluvia en `--teal-soft`, temperatura en `--accent` (antes
  `#1d91c0` / `#c44e10`). Filetes fríos del mapa (`rgba(43,58,66…)`,
  `rgba(35,45,52…)`, `rgba(75,92,105…)`, `rgba(88,99,106…)`) en tinta.
- Móvil: `.topbar` con 72 px de reserva a la derecha, que las pestañas de
  categoría pasaban por debajo del botón «i».

**Regla de oro del color: hay dos paletas y no se mezclan.**
1. *Cromo* (marco: fondos, paneles, reglas, texto, acento, botones, pestañas,
   tooltips, portada de entrada). Vive en `:root` de `css/styles.css` y se
   toca ahí, nunca con literales sueltos.
2. *Datos* (encodings de mapa y gráficos). Vive en `js/app.js`: `SEQ_WARM`,
   `SEQ_COOL`, `DIVERGING_COLORS` y sus alias (`POP_COLORS`, `CAMBIO_COLORS`,
   `DISTANCE_COLORS`, `CLIMATE_*`), más `LINE_COLORS`, `NO_DATA_COLOR`,
   `ZERO_COLOR`, `LAND_BASE_COLOR` y los colores de las capas de transporte
   (calzada romana, ferrocarril ibérico, estrecho, AVE, también en
   `.legend-line.ov-*`).

### Las escalas de mapa: revisadas el 6 de septiembre de 2026

**La regla vieja ya no vale.** Hasta el 6 de septiembre de 2026 aquí ponía
«NO tocar las escalas de color de datos: están elegidas por lectura». El autor
levantó esa regla ese día para las escalas de mapa, y se rehicieron enteras.
No se rehicieron por decoración: se rehicieron porque **no leían**. Lo medido
antes de tocar nada, sobre los 8.122 municipios que se pintan de verdad:

- `pob` y `densidad` metían el **53 %** y el **55 %** del país en un solo color.
- `Vol_Irrigation` pintaba **el mapa entero del color más oscuro**: con el 98 %
  de los valores a cero, los cuatro cortes (q50/q75/q90/q97) empataban en 0 y
  toda unidad caía en la última clase. Lo mismo `Vol_Electricity` y `Vol_Supply`.
  `Reservoir_volume` daba 2 tonos; `forest_ha`, 3.
- `altitude` se pintaba con la rampa **divergente** porque 26 lecturas de −0,6 m
  sobre 105.573 la hacían «cruzar el cero»: toda España en la mitad pálida.
- La leyenda de `cambio` prometía **siete escalones rotulados** sobre un relleno
  **continuo**; y el 20 % de los municipios estaba saturado en los dos extremos.
- `CLIMATE_PRECIP_COLORS` tenía un par a **1,92 dE en protanopia**: para un
  protanópico, dos de sus seis anclas eran el mismo color.
- `NO_DATA_COLOR` (`#e4e8ec`) estaba a **2,46 dE** del lienzo del mapa: «sin
  dato» era invisible. «Cero» no existía como categoría.

**Criterio con el que se rehicieron.** El aire común sale de la portada
aprobada (papel crema, pigmento sombra/sanguina, ceniza), pero manda la
codificación: si discriminar y parecerse a la portada chocan, gana discriminar.
Tres familias y no más, para que el atlas entero se lea como un solo mapa:

| familia | uso | rampa |
|---|---|---|
| `SEQ_WARM` | cantidades (población, densidad, superficies, volúmenes, altitud, rugosidad) | `#f4e8c6 → #653524` crema → ocre → tostado → sombra → umbría |
| `SEQ_COOL` | distancias, agua, frío (precipitación, heladas) | `#f7e6c6 → #114855` crema → ceniza → ceniza oscura |
| `DIVERGING_COLORS` | bipolares (cambio, temperatura, SPEI invertida) | las dos anteriores encontrándose sobre el papel `#ebdec9` |

Las tres llevan **escalera de L\* pareja**: 92 → 28 en pasos de ≈11. La
polaridad de `cambio` sigue a la portada: **pérdida = ceniza, ganancia =
sanguina**. Antes era al revés y contradecía a la propia rampa secuencial, en
la que el rojo oscuro significa «mucha gente».

**Medidas que hay que respetar** (dE = CIEDE2000; separables = umbral dE ≥ 5):

- Distancia mínima **entre clases contiguas**: 9,35 dE (`SEQ_WARM`),
  8,87 (`SEQ_COOL`), 18,36 (`DIVERGING`). En deuteranopia y protanopia las
  siete clases de cada familia siguen separándose (mínimos 7,87 / 8,59 / 16,56).
- Ninguna clase se acerca al **acento del cromo** `--accent #b04528` a menos de
  8,7 dE: un dato no se puede confundir con un botón.
- Categorías que no son valores: `NO_DATA_COLOR #bfbbb2` (13,36 dE del lienzo,
  13,56 de `ZERO_COLOR`, ≥ 10,20 de cualquier rampa) y `ZERO_COLOR #faf5e6`
  (8,08 del lienzo, 6,99 de la clase más clara). Se mantienen en deuteranopia
  y protanopia (13,56 / 13,45 entre sí).
- `LAND_BASE_COLOR #f1e9d7` es la tierra **sin indicador** (modo redes), no
  «sin dato»: son cosas distintas y antes compartían color. 9,45 dE del lienzo.
- **Aviso medido en la verificación (2026-09-06).** `ZERO_COLOR #faf5e6` se
  midió contra el lienzo del mapa, pero la casilla «Cero» de la leyenda no vive
  sobre el lienzo: vive sobre el papel del panel `--bg #fbf6e9`, y ahí está a
  **0,87 dE** — el mismo color. Por eso `.legend-swatch` lleva su borde en
  `var(--rule)` (#c9c0ad: 12,5 dE del papel, 12,2 del relleno) y no en el
  `rgba(0,0,0,.06)` de antes, que dejaba la clave invisible. Si alguien aclara
  `ZERO_COLOR` o afloja ese borde, la fila «Cero» y la fila «No» de las capas
  binarias de Köppen desaparecen de la leyenda. Lo mismo vale para
  `LAND_BASE_COLOR`, que es idéntico a `--bg-alt`.
- Series de gráficos `LINE_COLORS`: 8 colores, mínimo mutuo 15,06 dE (14,13 en
  deuteranopia, 15,02 en protanopia) y ≥ 3,05:1 WCAG sobre `--bg`. El juego
  anterior tenía dos series a **1,59 dE en protanopia**.

**Qué cambió en el algoritmo, no solo en los hexadecimales** (todo en
`_computeScaleForLayer` y `buildClassedScale`):

1. **Escala clasificada genérica** con cortes en los cuantiles
   `CLASS_QUANTILES = [.15 .32 .49 .64 .78 .91]` → hasta 7 clases, en vez de
   q50/q75/q90/q97, que dejaba media España de un color.
2. **Clase «cero» propia** cuando el cero significa «nada de esto aquí» (sin
   negativos y ≥ 4 % de las unidades exactamente en cero). La rampa se calcula
   solo sobre los positivos y arranca en t = 0,14 para no rozar el cero.
3. **Colapso de empates**: si dos cortes coinciden se pierde una clase y los
   colores se remuestrean con `rampColors()`. Es lo que arregla los embalses.
4. **Puerta de la divergente**: hace falta ≥ 5 % de valores a cada lado del
   cero. Y el `absMax` es robusto (p2/p98), no el mínimo y el máximo crudos.
5. **`cambio` se pinta sobre `log10(P_t / P_1900)`**, no sobre el porcentaje.
   El porcentaje es un cociente: −100 % está acotado y +infinito no. Con
   ±log10(20) satura el 1,6 % de los municipios (2011) frente al 20 % de antes.
   El tooltip y la tabla siguen dando el porcentaje; solo cambia el color.
6. **`pob_log`**: extremos robustos (p0,5/p99,5) y siete anclas repartidas.
   Antes el punto medio era `(lo+hi)*0.6`, que ni siquiera cae siempre entre
   `lo` y `hi`.
7. **La leyenda dice la verdad**: casillas cuando la escala está clasificada
   (con sus cortes reales y su fila «Sin dato» si la hay), y **barra continua**
   `.legend-ramp` cuando el relleno es continuo (`cambio`, `pob_log`,
   divergentes y continuas de clima). Ya no hay escalones rotulados sobre un
   degradado.

**Resultado medido sobre los 45 indicadores pintables** (año 2011, o 2010 en
usos del suelo), contando los tonos perceptualmente distintos que salen al
colorear los 8.122 municipios:

| | antes | después |
|---|---|---|
| tonos separables (media) | 5,8 | 7,9 |
| grumo indistinguible (media) | 51,6 % | 38,4 % |
| indicadores con ≤ 2 tonos | 10 | 4 (los 4 son capas binarias de Köppen) |
| indicadores con grumo > 50 % | 22 | 14 |

«Grumo» = porcentaje de municipios cuyo color está a menos de 5 dE del color
modal: el mayor grupo que el ojo **no** puede separar. Casos: `pob` 53,3 →
19,2 %; `altitude` 61,7 → 17,0 %; `cambio` 30,6 → 1,9 %; `Vol_Irrigation`
1 → 8 tonos.

**Lo que empeoró y por qué se aceptó.** `pp` baja de 15 a 11 tonos y
`grow_period_pp` de 15 a 9: la rampa vieja ganaba tonos cruzando de verde a
azul, que es justo el cruce que un dicrómata no puede seguir (par a 1,92 dE en
protanopia). Su grumo ya era pequeño (7,8 % y 15,3 %), o sea que ahí no había
problema de lectura que resolver. `altitude` baja de 10 a 8 tonos, pero los 10
de antes vivían todos en la mitad pálida de una divergente equivocada.

**Si vuelves a tocar estas escalas, remide.** No se aprueba a ojo. Hay que dar
las cifras de antes y después: tonos separables con dE2000 ≥ 5 sobre los 8.122
municipios en al menos dos indicadores, lo mismo simulando deuteranopia y
protanopia, la distancia de «sin dato» y «cero» al lienzo y entre sí, y el
contraste del texto sobre píxeles reales con
`06_dev/docs/visores_2026-09/tools/contraste_pixel.py`. El banco de medida que
se usó el 6 de septiembre quedó en
`C:/Work/scratch/checkpoint/visores_2026-09/paletas/web_spain_municipal/`
(`colorlab.py`, `measure.py`, `run_before.py`, `run_after.py`, `compare.py`).

Tokens (`css/styles.css`, `:root`), con su origen en la portada:

| token | valor | portada |
|---|---|---|
| `--bg` | `#fbf6e9` | `--cal` (paneles, tooltips, barras) |
| `--bg-alt` | `#f1e9d7` | `--papel` (fondo de página, hover, paneles hundidos) |
| `--bg-map` | `#eceae8` | gris de papel (2026-09-08; antes `#e9eff0` frío), ver abajo |
| `--teal` | `#114855` | `--teal` (agua: embalses, ríos, lluvia; extremo de `SEQ_COOL`) |
| `--teal-soft` | `#2f6570` | teal asentado para trazos y texto (6,05:1) |
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

- **`--bg-map` es gris de papel (`#eceae8`), no crema y ya no gris-azul.**
  El 6-9-2026 se dejó frío (`#e9eff0`) porque separaba mejor el primer escalón
  de las rampas: la clase más clara daba **14,18 dE** sobre él, **7,75** sobre
  `--bg #fbf6e9` y **5,22** sobre `--bg-alt #f1e9d7` (WCAG no vale para dos
  rellenos contiguos; la vara es dE2000). El 8-9-2026, con la regla «la paleta
  del interior es la de la portada», se buscó por barrido el gris más cercano
  al papel que siguiera separando **todo**: las 21 clases de las tres rampas,
  «cero», «sin dato» y la tierra base, en visión normal, deuteranopia y
  protanopia. `#eceae8` da un mínimo de **6,07 dE** (el gris frío daba 7,73;
  el papel `--bg-alt`, 0 con la tierra base y 2,9 con «cero»: descartado). Es
  la concesión que queda: gris, pero de papel. Si se toca, remedir con
  `C:/Work/scratch/checkpoint/visores_2026-09/paletas/web_spain_municipal/colorlab.py`.
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
- **Escalas de color de datos**: revisadas el 6-9-2026 por encargo del autor.
  Ya no rige el antiguo «no se tocan», pero **no se tocan a ojo**: quien las
  cambie tiene que remedir y dejar las cifras (ver «Paleta y cromo»)
- **Idioma**: español
- **Datos**: regenerar con scripts en `build/`, no editar JSON manualmente

## UI: tres categorías como tabs en el top bar
> **Un total absoluto en un coropleto dibuja sobre todo el tamaño del municipio.**
> `pob` (habitantes) y las superficies y volúmenes en ha/hm³ lo son: el mapa que
> pintan está correlacionado con `area_km2`. El visor ya ofrece las tres salidas
> honestas y ninguna se ha cambiado de sitio: `densidad` (hab/km²), el conmutador
> Superficie/% de los usos del suelo, y el modo **Bolas**, que saca la cantidad
> del polígono. Si algún día se decide un indicador por defecto distinto de
> `pob`, el candidato es `densidad`; no se tocó el 6-9-2026 porque es una
> decisión editorial, no de color.

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
# luego abrir http://localhost:8765/index.html (portada) o visor.html (app)
```

## Test headless
```bash
python build/test_render.py  # requiere playwright
```
