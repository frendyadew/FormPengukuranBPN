"use strict";

/* ================= KONFIGURASI ================= */
const API_URL = "https://script.google.com/macros/s/AKfycbxrDeysGfTaQfHTG2oH-42NoBbW_B_vOM0kkV0hvjQphz8Dz-7pT9237FmzvHRdUsAJEg/exec";

/* ================= STATE ================= */
const COLS = ["d", "m", "s", "jarak"];
const CHIP_KEY = "ukur.chips";
const STATION_KEY = "ukur.station";
const CHIP_DEFAULT = ["Patok", "Batas", "Sudut", "Tanah"];
let chipList = loadChips();

const $ = (id) => document.getElementById(id);
const inputs = { d: $("d"), m: $("m"), s: $("s"), jarak: $("jarak") };
const wheels = { d: $("dWheel"), m: $("mWheel") };
const WHEEL_ROW_HEIGHT = 36;
const wheelTimers = {};
let currentEditId = null;
let currentEntryStation = null;
let activeStation = null;
let stationReady = false;
let saving = false;
let processingQueue = false;
let submissionAttempted = false;

/* ================= CHIP CEPAT ================= */
function loadChips() {
  try {
    const raw = localStorage.getItem(CHIP_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch (e) { /* abaikan */ }
  return [...CHIP_DEFAULT];
}
function saveChips() {
  try { localStorage.setItem(CHIP_KEY, JSON.stringify(chipList)); } catch (e) { /* abaikan */ }
}
function renderChips() {
  const box = $("chips");
  box.innerHTML = "";
  chipList.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", () => { $("ket").value = c; });
    box.appendChild(b);
  });
  // Chip "+" untuk menambah daftar cepat
  const add = document.createElement("button");
  add.className = "chip";
  add.type = "button";
  add.textContent = "+ Tambah";
  add.addEventListener("click", () => {
    const v = prompt("Teks chip baru:", "");
    if (v && v.trim()) {
      chipList.push(v.trim().slice(0, 30));
      saveChips(); renderChips();
    }
  });
  box.appendChild(add);
}

/* ================= INPUT ANGKA & RODA GULIR ================= */
function updateWheelSelection(col, selectedIndex) {
  [...wheels[col].querySelectorAll(".wheel-option")].forEach((option, index) => {
    const selected = index === selectedIndex;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
}

function setWheelPosition(col, value) {
  const max = col === "d" ? 360 : 59;
  const numericValue = Number(value);
  const index = Number.isFinite(numericValue) ? Math.max(0, Math.min(max, Math.round(numericValue))) : 0;
  wheels[col].scrollTop = index * WHEEL_ROW_HEIGHT;
  updateWheelSelection(col, index);
}

function selectWheelValue(col) {
  const max = col === "d" ? 360 : 59;
  const index = Math.max(0, Math.min(max, Math.round(wheels[col].scrollTop / WHEEL_ROW_HEIGHT)));
  inputs[col].value = String(index);
  updateWheelSelection(col, index);
  validate();
}

function renderWheels() {
  Object.keys(wheels).forEach((col) => {
    const wheel = wheels[col];
    const max = col === "d" ? 360 : 59;
    const topSpace = document.createElement("div");
    topSpace.className = "wheel-spacer";
    topSpace.setAttribute("aria-hidden", "true");
    wheel.appendChild(topSpace);
    for (let value = 0; value <= max; value += 1) {
      const option = document.createElement("div");
      option.className = "wheel-option";
      option.setAttribute("role", "option");
      option.textContent = String(value);
      wheel.appendChild(option);
    }
    const bottomSpace = topSpace.cloneNode();
    wheel.appendChild(bottomSpace);
    wheel.addEventListener("scroll", () => {
      clearTimeout(wheelTimers[col]);
      wheelTimers[col] = setTimeout(() => selectWheelValue(col), 120);
    }, { passive: true });
    setWheelPosition(col, 0);
  });
}

COLS.forEach((col) => inputs[col].addEventListener("input", () => {
  if (wheels[col]) {
    const value = parseNum(inputs[col].value);
    setWheelPosition(col, Number.isNaN(value) ? 0 : value);
  }
  validate();
}));

/* ================= VALIDASI & PRATINJAU ================= */
function parseNum(v) { return v === "" ? NaN : Number(v); }

function validate() {
  const d = inputs.d.value, m = inputs.m.value, s = inputs.s.value, j = inputs.jarak.value;
  let msg = "";

  const dN = parseNum(d), mN = parseNum(m), sN = parseNum(s), jN = parseNum(j);

  if (d !== "" && (isNaN(dN) || dN < 0 || dN > 360)) msg = "Derajat harus 0–360.";
  else if (m !== "" && (isNaN(mN) || mN < 0 || mN > 59)) msg = "Menit harus 0–59.";
  else if (s !== "" && (isNaN(sN) || sN < 0 || sN > 59.99)) msg = "Detik harus 0–59,99.";
  else if (d !== "" && m !== "" && s !== "" && dN === 360 && (mN !== 0 || sN !== 0)) msg = "Untuk 360°, menit dan detik harus 0.";
  else if (j !== "" && (isNaN(jN) || jN < 0)) msg = "Jarak harus ≥ 0.";
  else if (submissionAttempted && !$("target").value.trim()) msg = "Nama titik bidik harus diisi.";
  else if (submissionAttempted && d === "") msg = "Derajat harus diisi.";
  else if (submissionAttempted && m === "") msg = "Menit harus diisi.";
  else if (submissionAttempted && s === "") msg = "Detik harus diisi.";
  else if (submissionAttempted && j === "") msg = "Jarak harus diisi.";

  // Tandai kolom tidak valid
  inputs.d.classList.toggle("invalid", (d !== "" && (isNaN(dN) || dN < 0 || dN > 360)) || (submissionAttempted && d === ""));
  inputs.m.classList.toggle("invalid", (m !== "" && (isNaN(mN) || mN < 0 || mN > 59)) || (submissionAttempted && m === ""));
  inputs.s.classList.toggle("invalid", (s !== "" && (isNaN(sN) || sN < 0 || sN > 59.99)) || (submissionAttempted && s === ""));
  inputs.jarak.classList.toggle("invalid", (j !== "" && (isNaN(jN) || jN < 0)) || (submissionAttempted && j === ""));
  $("target").classList.toggle("invalid", !$("target").value.trim() && (submissionAttempted || !!(d || m || s || j)));

  $("errMsg").textContent = msg;
  updatePreview();
  updateSaveButton();
  return msg === "";
}

function updateSaveButton() {
  const button = $("saveButton");
  button.textContent = saving ? "Menyimpan..." : currentEditId ? "Simpan Perubahan" : "Simpan Data";
  button.classList.toggle("is-saving", saving);
  button.disabled = saving || !stationReady;
}

function formValid() {
  const dN = parseNum(inputs.d.value), mN = parseNum(inputs.m.value),
        sN = parseNum(inputs.s.value), jN = parseNum(inputs.jarak.value);
  return inputs.d.value !== "" && !isNaN(dN) && dN >= 0 && dN <= 360 &&
         inputs.m.value !== "" && !isNaN(mN) && mN >= 0 && mN <= 59 &&
         inputs.s.value !== "" && !isNaN(sN) && sN >= 0 && sN <= 59.99 &&
      !(dN === 360 && (mN !== 0 || sN !== 0)) &&
      inputs.jarak.value !== "" && !isNaN(jN) && jN >= 0 &&
      $("target").value.trim() !== "";
}

function updatePreview() {
  const dN = parseNum(inputs.d.value), mN = parseNum(inputs.m.value), sN = parseNum(inputs.s.value);
  if (isNaN(dN) || isNaN(mN) || isNaN(sN)) {
    $("preview").innerHTML = "Azimut &nbsp;·&nbsp; <span class=\"dec\">0.000000°</span><br><span class=\"hint\">X akhir — &nbsp; Y akhir —</span>";
    return;
  }
  const dec = dN + mN / 60 + sN / 3600;
  const station = currentEditId && currentEntryStation ? currentEntryStation : activeStation;
  const distance = parseNum(inputs.jarak.value);
  const radians = dec * Math.PI / 180;
  const xEnd = station && !isNaN(distance) ? Number(station.x) + distance * Math.sin(radians) : NaN;
  const yEnd = station && !isNaN(distance) ? Number(station.y) + distance * Math.cos(radians) : NaN;
  $("preview").innerHTML =
    "Azimut &nbsp;·&nbsp; <span class=\"dec\">" + dec.toFixed(6) + "°</span><br>" +
    "<span class=\"hint\">X akhir " + (isNaN(xEnd) ? "—" : xEnd.toFixed(3)) +
    " &nbsp;·&nbsp; Y akhir " + (isNaN(yEnd) ? "—" : yEnd.toFixed(3)) + "</span>";
}

/* ================= ANTREAN & PENGIRIMAN ================= */
const QUEUE_KEY = "ukur.antrean";
const HIST_KEY = "ukur.riwayat";
const POLYGON_KEY = "ukur.titik-polygon";
const POLYGON_SELECTION_KEY = "ukur.pilihan-polygon";
const storedPolygonSelection = loadJSON(POLYGON_SELECTION_KEY, []);
let selectedPolygonIds = Array.isArray(storedPolygonSelection) ? storedPolygonSelection : [];
let leafletMap = null;
let leafletGeometry = null;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const v = JSON.parse(raw); if (v !== null) return v; }
  } catch (e) { /* abaikan */ }
  return fallback;
}
function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) { /* abaikan */ } }
function saveHistory(history) {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(0, 5))); } catch (e) { /* abaikan */ }
}

function getQueue() { return loadJSON(QUEUE_KEY, []); }

function getPolygonPoints() {
  const stored = loadJSON(POLYGON_KEY, null);
  if (Array.isArray(stored)) return stored;
  const recent = loadJSON(HIST_KEY, []);
  savePolygonPoints(recent);
  return recent;
}

function savePolygonPoints(points) {
  try { localStorage.setItem(POLYGON_KEY, JSON.stringify(points)); } catch (e) { /* abaikan */ }
}

function upsertPolygonPoint(point) {
  const points = getPolygonPoints();
  const index = points.findIndex((item) => item.id === point.id);
  if (index === -1) points.unshift(point);
  else points[index] = point;
  savePolygonPoints(points);
  renderPolygon();
}

function removePolygonPoint(id) {
  savePolygonPoints(getPolygonPoints().filter((point) => point.id !== id));
  selectedPolygonIds = selectedPolygonIds.filter((selectedId) => selectedId !== id);
  try { localStorage.setItem(POLYGON_SELECTION_KEY, JSON.stringify(selectedPolygonIds)); } catch (e) { /* abaikan */ }
  renderPolygon();
}

function coordinatesForPoint(point) {
  const xEnd = Number(point.xAkhir), yEnd = Number(point.yAkhir);
  if (point.xAkhir !== "" && point.xAkhir != null && point.yAkhir !== "" && point.yAkhir != null &&
      Number.isFinite(xEnd) && Number.isFinite(yEnd)) return { x: xEnd, y: yEnd };

  const xStart = Number(point.xAwal), yStart = Number(point.yAwal);
  const distance = Number(point.jarak);
  const azimuth = point.azimutDesimal != null
    ? Number(point.azimutDesimal)
    : Number(point.derajat) + Number(point.menit) / 60 + Number(point.detik) / 3600;
  if ([xStart, yStart, distance, azimuth].every(Number.isFinite)) {
    const radians = azimuth * Math.PI / 180;
    return { x: xStart + distance * Math.sin(radians), y: yStart + distance * Math.cos(radians) };
  }
  return null;
}

function availablePolygonPoints() {
  return getPolygonPoints().map((point) => ({ ...point, coordinates: coordinatesForPoint(point) }))
    .filter((point) => point.coordinates);
}

function selectPolygonPoint(id, selected) {
  if (selected && !selectedPolygonIds.includes(id)) selectedPolygonIds.push(id);
  if (!selected) selectedPolygonIds = selectedPolygonIds.filter((selectedId) => selectedId !== id);
  try { localStorage.setItem(POLYGON_SELECTION_KEY, JSON.stringify(selectedPolygonIds)); } catch (e) { /* abaikan */ }
  renderPolygon();
}

function movePolygonPoint(id, direction) {
  const index = selectedPolygonIds.indexOf(id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= selectedPolygonIds.length) return;
  [selectedPolygonIds[index], selectedPolygonIds[targetIndex]] =
    [selectedPolygonIds[targetIndex], selectedPolygonIds[index]];
  try { localStorage.setItem(POLYGON_SELECTION_KEY, JSON.stringify(selectedPolygonIds)); } catch (e) { /* abaikan */ }
  renderPolygon();
}

function svgElement(name, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes || {}).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function orientation(a, b, c) {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(cross) < 1e-9 ? 0 : cross > 0 ? 1 : 2;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  const onSegment = (start, point, end) =>
    point.x >= Math.min(start.x, end.x) - 1e-9 && point.x <= Math.max(start.x, end.x) + 1e-9 &&
    point.y >= Math.min(start.y, end.y) - 1e-9 && point.y <= Math.max(start.y, end.y) + 1e-9;
  return (o1 === 0 && onSegment(a, c, b)) || (o2 === 0 && onSegment(a, d, b)) ||
    (o3 === 0 && onSegment(c, a, d)) || (o4 === 0 && onSegment(c, b, d));
}

function polygonSelfIntersects(points) {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) return true;
    }
  }
  return false;
}

function renderPolygon() {
  const allPoints = availablePolygonPoints();
  const pointById = new Map(allPoints.map((point) => [point.id, point]));
  selectedPolygonIds = selectedPolygonIds.filter((id) => pointById.has(id));
  const selected = selectedPolygonIds.map((id) => pointById.get(id));
  const unselected = allPoints.filter((point) => !selectedPolygonIds.includes(point.id));
  const list = $("sketchPointList");
  list.replaceChildren();
  $("sketchEmpty").hidden = allPoints.length > 0;
  $("sketchPointCount").textContent = allPoints.length ? "· " + allPoints.length + " titik" : "";

  [...selected, ...unselected].forEach((point) => {
    const selectedIndex = selectedPolygonIds.indexOf(point.id);
    const item = document.createElement("li");
    const label = document.createElement("label");
    label.className = "sketch-point-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedIndex >= 0;
    checkbox.setAttribute("aria-label", "Pilih " + (point.titikBidik || point.keterangan || "titik ukur"));
    checkbox.addEventListener("change", () => selectPolygonPoint(point.id, checkbox.checked));
    const text = document.createElement("span");
    text.className = "sketch-point-name";
    const name = point.titikBidik || point.keterangan || "Titik ukur";
    text.append(document.createTextNode(name));
    const coords = document.createElement("span");
    coords.className = "sketch-point-coords";
    coords.textContent = "X " + point.coordinates.x.toFixed(3) + " · Y " + point.coordinates.y.toFixed(3);
    text.appendChild(coords);
    label.append(checkbox, text);
    item.appendChild(label);

    if (selectedIndex >= 0) {
      const order = document.createElement("div");
      order.className = "sketch-order";
      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "Naik";
      up.setAttribute("aria-label", "Pindahkan " + name + " ke urutan sebelumnya");
      up.disabled = selectedIndex === 0;
      up.addEventListener("click", () => movePolygonPoint(point.id, -1));
      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "Turun";
      down.setAttribute("aria-label", "Pindahkan " + name + " ke urutan berikutnya");
      down.disabled = selectedIndex === selectedPolygonIds.length - 1;
      down.addEventListener("click", () => movePolygonPoint(point.id, 1));
      order.append(up, down);
      item.appendChild(order);
    }
    list.appendChild(item);
  });

  const svg = $("polygonSvg");
  svg.replaceChildren();
  const grid = svgElement("g", { class: "sketch-grid" });
  for (let x = 30; x < 900; x += 36) grid.appendChild(svgElement("line", { x1: x, y1: 0, x2: x, y2: 520 }));
  for (let y = 16; y < 520; y += 36) grid.appendChild(svgElement("line", { x1: 0, y1: y, x2: 900, y2: y }));
  svg.appendChild(grid);

  if (selected.length) {
    const width = 900, height = 520, padding = 70;
    const xs = selected.map((point) => point.coordinates.x);
    const ys = selected.map((point) => point.coordinates.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = maxX - minX, spanY = maxY - minY;
    const innerWidth = width - padding * 2, innerHeight = height - padding * 2;
    const scale = Math.min(innerWidth / Math.max(spanX, 1), innerHeight / Math.max(spanY, 1));
    const offsetX = padding + (innerWidth - spanX * scale) / 2;
    const offsetY = padding + (innerHeight - spanY * scale) / 2;
    const screenPoints = selected.map((point) => ({
      x: offsetX + (point.coordinates.x - minX) * scale,
      y: offsetY + (maxY - point.coordinates.y) * scale,
    }));
    if (selected.length >= 3) {
      const polygon = svgElement("polygon", {
        class: "poly-shape",
        points: screenPoints.map((point) => point.x + "," + point.y).join(" "),
      });
      svg.appendChild(polygon);
    } else if (selected.length === 2) {
      svg.appendChild(svgElement("polyline", {
        class: "poly-line",
        points: screenPoints.map((point) => point.x + "," + point.y).join(" "),
      }));
    }
    screenPoints.forEach((screenPoint, index) => {
      const marker = svgElement("circle", { class: "poly-point", cx: screenPoint.x, cy: screenPoint.y, r: 8 });
      const title = svgElement("title");
      title.textContent = selected[index].titikBidik || selected[index].keterangan || "Titik " + (index + 1);
      marker.appendChild(title);
      svg.appendChild(marker);
      const label = svgElement("text", { class: "poly-label", x: screenPoint.x + 12, y: screenPoint.y - 12 });
      label.textContent = (index + 1) + ". " + (selected[index].titikBidik || selected[index].keterangan || "Titik").slice(0, 16);
      svg.appendChild(label);
    });
  } else {
    const emptyLabel = svgElement("text", { class: "empty-label", x: 450, y: 260 });
    emptyLabel.textContent = "Pilih titik ukur untuk mulai membuat sketsa";
    svg.appendChild(emptyLabel);
  }

  const completePolygon = selected.length >= 3;
  if (completePolygon) {
    const intersects = polygonSelfIntersects(selected.map((point) => point.coordinates));
    let twiceArea = 0, perimeter = 0;
    const origin = selected[0].coordinates;
    selected.forEach((point, index) => {
      const next = selected[(index + 1) % selected.length];
      const pointX = point.coordinates.x - origin.x, pointY = point.coordinates.y - origin.y;
      const nextX = next.coordinates.x - origin.x, nextY = next.coordinates.y - origin.y;
      twiceArea += pointX * nextY - nextX * pointY;
      perimeter += Math.hypot(next.coordinates.x - point.coordinates.x, next.coordinates.y - point.coordinates.y);
    });
    $("sketchSummary").classList.toggle("error", intersects);
    if (intersects) {
      $("polygonArea").textContent = "—";
      $("polygonPerimeter").textContent = "—";
      $("sketchSummary").textContent = "Urutan titik menyilang. Atur ulang vertex agar polygon tidak berpotongan.";
    } else {
      $("polygonArea").textContent = (Math.abs(twiceArea) / 2).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m²";
      $("polygonPerimeter").textContent = perimeter.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m";
      $("sketchSummary").textContent = selected.length + " vertex · luas dihitung pada bidang koordinat X/Y.";
    }
  } else {
    $("polygonArea").textContent = "—";
    $("polygonPerimeter").textContent = "—";
    $("sketchSummary").classList.remove("error");
    $("sketchSummary").textContent = selected.length ? "Pilih minimal 3 titik untuk menghitung polygon." : "Urutan pilihan menjadi urutan vertex polygon.";
  }
  $("resetMapZoom").disabled = selected.length === 0;
  if (leafletMap && !$("leafletMap").hidden) renderLeafletLayers(selected);
}

function initializeLeaflet() {
  if (leafletMap) return true;
  if (typeof L === "undefined") {
    toast("Leaflet tidak berhasil dimuat", true);
    $("leafletToggle").checked = false;
    return false;
  }
  leafletMap = L.map("leafletMap", {
    crs: L.CRS.Simple,
    minZoom: -10,
    maxZoom: 12,
    zoomSnap: 0.25,
    attributionControl: true,
  });
  L.control.scale({ imperial: false, metric: true }).addTo(leafletMap);
  leafletGeometry = L.featureGroup().addTo(leafletMap);
  leafletMap.setView([0, 0], 0);
  return true;
}

function renderLeafletLayers(points) {
  if (!leafletGeometry) return;
  leafletGeometry.clearLayers();
  const latLngs = points.map((point) => [point.coordinates.y, point.coordinates.x]);
  if (latLngs.length >= 2) {
    const linePoints = latLngs.length >= 3 ? [...latLngs, latLngs[0]] : latLngs;
    L.polyline(linePoints, { color: "#176b5b", weight: 3, opacity: 0.9 }).addTo(leafletGeometry);
  }
  points.forEach((point, index) => {
    const name = point.titikBidik || point.keterangan || "Titik " + (index + 1);
    L.circleMarker(latLngs[index], {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#d66a2c",
      fillOpacity: 1,
    }).bindTooltip((index + 1) + ". " + name, { permanent: true, direction: "top", offset: [0, -5] })
      .addTo(leafletGeometry);
  });
}

function fitLeafletToPoints() {
  if (!leafletMap) return;
  const pointsById = new Map(availablePolygonPoints().map((point) => [point.id, point]));
  const points = selectedPolygonIds.map((id) => pointsById.get(id)).filter(Boolean);
  if (!points.length) return;
  if (points.length === 1) {
    leafletMap.setView([points[0].coordinates.y, points[0].coordinates.x], 2, { animate: false });
    return;
  }
  const xs = points.map((point) => point.coordinates.x);
  const ys = points.map((point) => point.coordinates.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padding = Math.max(maxX - minX, maxY - minY, 1) * 0.15;
  const bounds = L.latLngBounds([minY - padding, minX - padding], [maxY + padding, maxX + padding]);
  leafletMap.fitBounds(bounds, { animate: false, maxZoom: 12 });
}

function setLeafletVisibility(showLeaflet) {
  if (showLeaflet && !initializeLeaflet()) return;
  $("sketchSvgWrap").hidden = showLeaflet;
  $("leafletMap").hidden = !showLeaflet;
  $("leafletNote").hidden = !showLeaflet;
  if (showLeaflet) {
    leafletMap.invalidateSize({ pan: false });
    renderPolygon();
    fitLeafletToPoints();
  }
}

function switchPage(page) {
  const showingSketch = page === "sketch";
  $("surveyPage").hidden = showingSketch;
  $("sketchPage").hidden = !showingSketch;
  $("surveyTab").setAttribute("aria-selected", String(!showingSketch));
  $("sketchTab").setAttribute("aria-selected", String(showingSketch));
  if (showingSketch) {
    renderPolygon();
    if (leafletMap && $("leafletToggle").checked) leafletMap.invalidateSize({ pan: false });
  }
}

function isValidStation(station) {
  return !!station && typeof station.name === "string" && station.name.trim() !== "" &&
    Number.isFinite(Number(station.x)) && Number.isFinite(Number(station.y));
}

function initStationSetup() {
  activeStation = loadJSON(STATION_KEY, null);
  if (isValidStation(activeStation)) {
    $("stationName").value = activeStation.name;
    $("stationX").value = String(activeStation.x);
    $("stationY").value = String(activeStation.y);
    stationReady = true;
    $("stationState").textContent = "Aktif: " + activeStation.name;
    $("stationState").classList.add("ready");
  }
  $("entryFields").disabled = !stationReady;
}

function saveStationSetup() {
  const station = {
    name: $("stationName").value.trim(),
    x: parseNum($("stationX").value),
    y: parseNum($("stationY").value),
  };
  const invalid = !isValidStation(station);
  $("stationName").classList.toggle("invalid", !station.name);
  $("stationX").classList.toggle("invalid", !Number.isFinite(station.x));
  $("stationY").classList.toggle("invalid", !Number.isFinite(station.y));
  if (invalid) {
    $("stationState").textContent = "Isi nama titik dan koordinat X/Y dengan angka yang valid.";
    $("stationState").classList.remove("ready");
    return;
  }
  activeStation = station;
  stationReady = true;
  try { localStorage.setItem(STATION_KEY, JSON.stringify(station)); } catch (e) { /* abaikan */ }
  $("entryFields").disabled = false;
  $("stationState").textContent = "Aktif: " + station.name;
  $("stationState").classList.add("ready");
  $("stationName").classList.remove("invalid");
  $("stationX").classList.remove("invalid");
  $("stationY").classList.remove("invalid");
  validate();
  toast("Pengaturan alat tersimpan");
}

function measurementValues() {
  const station = currentEditId && currentEntryStation ? currentEntryStation : activeStation;
  const d = parseNum(inputs.d.value), m = parseNum(inputs.m.value);
  const s = parseNum(inputs.s.value), distance = parseNum(inputs.jarak.value);
  const azimuth = d + m / 60 + s / 3600;
  const radians = azimuth * Math.PI / 180;
  return {
    titikBerdiri: station.name,
    titikBidik: $("target").value.trim(),
    keterangan: $("ket").value.trim(),
    xAwal: Number(station.x),
    yAwal: Number(station.y),
    derajat: d,
    menit: m,
    detik: s,
    azimutDesimal: +azimuth.toFixed(6),
    jarak: distance,
    xAkhir: Number(station.x) + distance * Math.sin(radians),
    yAkhir: Number(station.y) + distance * Math.cos(radians),
  };
}

function updateNetBadge() {
  const badge = $("netBadge");
  const q = getQueue();
  if (!navigator.onLine) {
    badge.textContent = q.length ? "Offline · " + q.length + " menunggu" : "Offline";
    badge.classList.add("off");
  } else if (q.length) {
    badge.textContent = q.length + " menunggu terkirim";
    badge.classList.add("off");
  } else {
    badge.textContent = "Daring";
    badge.classList.remove("off");
  }
}

async function kirim(entry) {
  const payload = entry.action === "delete"
    ? { action: "delete", id: entry.id }
    : {
        ...entry,
        action: "upsert",
        ...(entry.titikBerdiri ? {} : {
          titikBerdiri: activeStation && activeStation.name,
          titikBidik: entry.titikBidik || entry.keterangan || "(target lama)",
          xAwal: activeStation && Number(activeStation.x),
          yAwal: activeStation && Number(activeStation.y),
        }),
      };
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  let data;
  try { data = await res.json(); } catch (e) { throw new Error("Respons bukan JSON"); }
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.error) || ("HTTP " + res.status));
  }
}

async function processQueue() {
  if (!navigator.onLine || processingQueue) return;
  const queue = getQueue();
  if (!queue.length) return;
  processingQueue = true;
  const terkirim = new Set();
  const upsertTerkirim = new Set();
  try {
    for (const entry of queue) {
      try {
        await kirim(entry);
        terkirim.add(entry.id);
        if (entry.action !== "delete") upsertTerkirim.add(entry.id);
      } catch (e) {
        // Tetap di antrean untuk percobaan berikutnya.
      }
    }
    saveQueue(getQueue().filter((entry) => !terkirim.has(entry.id)));
    if (upsertTerkirim.size) {
      const history = loadJSON(HIST_KEY, []);
      history.forEach((entry) => {
        if (upsertTerkirim.has(entry.id)) entry.serverSynced = true;
      });
      saveHistory(history);
    }
    updateNetBadge();
    renderHistory();
    return { sent: terkirim.size, pending: getQueue().length };
  } finally {
    processingQueue = false;
  }
}

async function saveEntry() {
  if (saving) return;
  if (!formValid()) { submissionAttempted = true; validate(); return; }
  saving = true;
  updateSaveButton();
  const dN = parseNum(inputs.d.value), mN = parseNum(inputs.m.value),
        sN = parseNum(inputs.s.value), jN = parseNum(inputs.jarak.value);
  const values = measurementValues();
  let saveFeedback = null;
  try {
    const history = loadJSON(HIST_KEY, []);
    if (currentEditId) {
      const index = history.findIndex((entry) => entry.id === currentEditId);
      if (index === -1) {
        toast("Data tidak ditemukan", true);
        cancelEditing();
        return;
      }
      const queue = getQueue();
      const queueIndex = queue.findIndex((entry) => entry.id === currentEditId);
      const updated = {
        ...history[index],
        ...values,
        waktu: new Date().toISOString(),
        serverSynced: history[index].serverSynced === true || queueIndex < 0,
      };
      if (queueIndex >= 0) queue[queueIndex] = updated;
      else queue.push(updated);
      saveQueue(queue);
      history[index] = updated;
      saveHistory(history);
      upsertPolygonPoint(updated);
      cancelEditing();
      resetForm();
      renderHistory();
      if (navigator.onLine) await processQueue();
      const stillPending = getQueue().some((entry) => entry.id === updated.id);
      saveFeedback = stillPending
        ? { title: "Perubahan tersimpan", message: "Menunggu koneksi. Statusnya dapat dicek pada riwayat di bawah.", pending: true }
        : { title: "Perubahan terkirim", message: "Perubahan terkirim, cek di bawah untuk status.", pending: false };
    } else {
      const entry = { id: crypto.randomUUID(), waktu: new Date().toISOString(), ...values };
      history.unshift(entry);
      saveHistory(history);
      upsertPolygonPoint(entry);
      const queue = getQueue();
      queue.push(entry);
      saveQueue(queue);
      resetForm();
      renderHistory();
      if (navigator.onLine) await processQueue();
      const stillPending = getQueue().some((queued) => queued.id === entry.id);
      saveFeedback = stillPending
        ? { title: "Data tersimpan", message: "Menunggu koneksi. Statusnya dapat dicek pada riwayat di bawah.", pending: true }
        : { title: "Data terkirim", message: "Terkirim, cek di bawah untuk status.", pending: false };
    }
  } finally {
    saving = false;
    validate();
  }
  navigator.vibrate && navigator.vibrate(50);
  updateNetBadge();
  if (saveFeedback) showSaveDialog(saveFeedback);
}

function resetForm() {
  submissionAttempted = false;
  $("target").value = "";
  $("ket").value = "";
  COLS.forEach((col) => { inputs[col].value = ""; inputs[col].classList.remove("invalid"); });
  $("target").classList.remove("invalid");
  Object.keys(wheels).forEach((col) => setWheelPosition(col, 0));
  $("errMsg").textContent = "";
  updatePreview();
}

function cancelEditing() {
  currentEditId = null;
  currentEntryStation = null;
  $("formCard").classList.remove("editing");
  $("formMode").hidden = true;
  updateSaveButton();
}

function editEntry(entry) {
  currentEditId = entry.id;
  currentEntryStation = isValidStation({ name: entry.titikBerdiri, x: entry.xAwal, y: entry.yAwal })
    ? { name: entry.titikBerdiri, x: entry.xAwal, y: entry.yAwal }
    : activeStation;
  $("formCard").classList.add("editing");
  $("formMode").hidden = false;
  $("formModeText").textContent = "Edit target: " + (entry.titikBidik || "(target lama)") +
    " · berdiri di " + (currentEntryStation ? currentEntryStation.name : "(setup aktif)");
  $("target").value = entry.titikBidik || "";
  $("ket").value = entry.keterangan || "";
  inputs.d.value = String(entry.derajat);
  inputs.m.value = String(entry.menit);
  inputs.s.value = String(entry.detik);
  inputs.jarak.value = String(entry.jarak);
  setWheelPosition("d", entry.derajat);
  setWheelPosition("m", entry.menit);
  validate();
  $("formCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteEntry(entry) {
  const queue = getQueue();
  if (!confirm("Hapus data ini dari riwayat perangkat dan spreadsheet?")) return;
  saveHistory(loadJSON(HIST_KEY, []).filter((item) => item.id !== entry.id));
  removePolygonPoint(entry.id);
  const remainingQueue = queue.filter((item) => item.id !== entry.id);
  remainingQueue.push({ id: entry.id, action: "delete" });
  saveQueue(remainingQueue);
  if (currentEditId === entry.id) {
    cancelEditing();
    resetForm();
  }
  renderHistory();
  updateNetBadge();
  if (navigator.onLine) await processQueue();
  const deletePending = getQueue().some((item) => item.id === entry.id && item.action === "delete");
  toast(deletePending ? "Hapus menunggu koneksi" : "Data dihapus");
}

/* ================= RIWAYAT ================= */
function renderHistory() {
  const hist = loadJSON(HIST_KEY, []);
  const ul = $("historyList");
  ul.innerHTML = "";
  $("historyEmpty").style.display = hist.length ? "none" : "block";
  hist.forEach((h) => {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "info";
    const az = h.azimutDesimal ?? (h.derajat + h.menit / 60 + h.detik / 3600);
    info.innerHTML =
      "<div class=\"ket\"></div>" +
      "<div class=\"sub\">" + (h.titikBidik || "(target lama)") + " · " + az.toFixed(3) + "° · " + h.jarak + " m · " +
      new Date(h.waktu).toLocaleString("id-ID") + "</div>";
    info.querySelector(".ket").textContent = (h.titikBerdiri || "") + " → " + (h.titikBidik || "(target lama)") +
      (h.keterangan ? " · " + h.keterangan : "");
    const pending = getQueue().some((entry) => entry.id === h.id);
    const status = document.createElement("span");
    status.className = "status " + (pending ? "pending" : "sent");
    status.textContent = pending ? "Pending" : "Terkirim";
    info.appendChild(status);
    const actions = document.createElement("div");
    actions.className = "actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-action";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => editEntry(h));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-action";
    deleteButton.textContent = "Hapus";
    deleteButton.addEventListener("click", () => deleteEntry(h));
    actions.append(editButton, deleteButton);
    li.appendChild(info);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}

/* ================= TOAST ================= */
let toastTimer = null;
function toast(text, isError) {
  const t = $("toast");
  t.textContent = text;
  t.classList.toggle("error", !!isError);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function showSaveDialog(feedback) {
  $("saveDialogTitle").textContent = feedback.title;
  $("saveDialogMessage").textContent = feedback.message;
  $("saveDialogMark").textContent = feedback.pending ? "…" : "✓";
  $("saveDialog").classList.toggle("pending", feedback.pending);
  $("saveDialog").hidden = false;
  $("saveDialogClose").focus();
}

function closeSaveDialog(showHistory) {
  $("saveDialog").hidden = true;
  if (showHistory) {
    switchPage("survey");
    $("historyList").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ================= EVENT ================= */
window.addEventListener("online", () => { updateNetBadge(); processQueue(); });
window.addEventListener("offline", updateNetBadge);
window.addEventListener("load", () => { updateNetBadge(); processQueue(); });

/* ================= SERVICE WORKER & WAKE LOCK ================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* abaikan */ });
  });
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (e) { /* opsional — lanjut tanpa galat */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") requestWakeLock();
});
requestWakeLock();

/* ================= INIT ================= */
renderChips();
renderWheels();
initStationSetup();
renderHistory();
validate();
updateNetBadge();
$("saveButton").addEventListener("click", saveEntry);
$("saveStation").addEventListener("click", saveStationSetup);
$("surveyTab").addEventListener("click", () => switchPage("survey"));
$("sketchTab").addEventListener("click", () => switchPage("sketch"));
$("leafletToggle").addEventListener("change", () => setLeafletVisibility($("leafletToggle").checked));
$("resetMapZoom").addEventListener("click", fitLeafletToPoints);
$("saveDialogClose").addEventListener("click", () => closeSaveDialog(true));
$("saveDialog").addEventListener("click", (event) => {
  if (event.target === $("saveDialog")) closeSaveDialog(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("saveDialog").hidden) closeSaveDialog(false);
});
$("target").addEventListener("input", validate);
inputs.jarak.addEventListener("input", updatePreview);
$("cancelEdit").addEventListener("click", () => { cancelEditing(); resetForm(); validate(); });
renderPolygon();
