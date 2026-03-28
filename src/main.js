import '../styles/main.css';

// ── Color palettes ────────────────────────────────────────────────────────────
const PALETTES = [
  { zone_bg:"#E3F5F4", zone_stroke:"#2DC4B8", hdr_bg:"#2DC4B8", hdr_text:"#FFFFFF",
    cluster_bg:"#EAF8F7", cluster_stroke:"#2DC4B8", host_bg:"#FFFFFF", host_stroke:"#7DD4CE", host_text:"#0D4A45" },
  { zone_bg:"#E8F0FB", zone_stroke:"#1A5DAD", hdr_bg:"#1A5DAD", hdr_text:"#FFFFFF",
    cluster_bg:"#EDF3FD", cluster_stroke:"#1A5DAD", host_bg:"#FFFFFF", host_stroke:"#5B9BD5", host_text:"#0D3B78" },
  { zone_bg:"#E8F5EE", zone_stroke:"#1E8449", hdr_bg:"#1E8449", hdr_text:"#FFFFFF",
    cluster_bg:"#EDF7F1", cluster_stroke:"#1E8449", host_bg:"#FFFFFF", host_stroke:"#52BE80", host_text:"#145A32" },
  { zone_bg:"#EDE8F7", zone_stroke:"#5B3DAB", hdr_bg:"#5B3DAB", hdr_text:"#FFFFFF",
    cluster_bg:"#F3F0FB", cluster_stroke:"#5B3DAB", host_bg:"#FFFFFF", host_stroke:"#9B7DD4", host_text:"#3D2580" },
  { zone_bg:"#EAF0F0", zone_stroke:"#2E7D8C", hdr_bg:"#2E7D8C", hdr_text:"#FFFFFF",
    cluster_bg:"#EEF4F5", cluster_stroke:"#2E7D8C", host_bg:"#FFFFFF", host_stroke:"#6BB8C4", host_text:"#1A4D56" },
  { zone_bg:"#FAE8E8", zone_stroke:"#C0392B", hdr_bg:"#C0392B", hdr_text:"#FFFFFF",
    cluster_bg:"#FDF0F0", cluster_stroke:"#C0392B", host_bg:"#FFFFFF", host_stroke:"#E57373", host_text:"#7B241C" },
];

// ── Layout constants ──────────────────────────────────────────────────────────
const ZONE_W    = 780;
const COLS      = 3;
const HOST_W    = 230;
const HOST_H    = 135;
const CLUSTER_H = 28;
const HEADER_H  = 65;
const PAD       = 12;
const COL_GAP   = 10;
const ROW_GAP   = 8;
const ZONE_GAP  = 30;
const CANVAS_X  = 60;
const CANVAS_Y  = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return crypto.randomUUID(); }

function findCol(headers, candidates) {
  const map = {};
  headers.forEach(h => map[h.toLowerCase()] = h);
  for (const c of candidates) {
    if (c.toLowerCase() in map) return map[c.toLowerCase()];
  }
  return null;
}

function safe(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function fmtPct(v) {
  const f = parseFloat(v);
  if (!isNaN(f)) return `${Math.round(f)}%`;
  return (v && String(v).trim()) ? String(v).trim() : '\u2014';
}

// ── VCF 9 Compatibility (Broadcom Compatibility Guide) ──────────────────────
let _hclCache = null;

async function fetchHcl() {
  if (_hclCache) return _hclCache;
  const res = await fetch('vcf9_hcl.json');
  if (!res.ok) throw new Error('Failed to load VCF 9 compatibility data');
  _hclCache = await res.json();
  return _hclCache;
}

function buildVcf9Lookup(hclData) {
  const models = new Map();
  for (const entry of hclData) {
    models.set(entry.m.trim().toLowerCase(), entry.r);
  }
  return models;
}

function normalizeModel(model) {
  return model.replace(/^(Dell\s+(Inc\.?\s*)?|HPE?\s+|Lenovo\s+|Cisco\s+|Fujitsu\s+)/i, '').trim();
}

function vcf9Label(releases) {
  const versions = releases.map(r => r.replace(/^ESXi\s*/i, '')).sort();
  return '\u2705 VCF ' + versions.join(' + ') + ' Ready';
}

function checkVcf9Compat(model, lookup) {
  if (!model) return { status: 'unknown', label: '\u26A0\uFE0F VCF9 ?' };
  const norm = normalizeModel(model).toLowerCase();
  if (lookup.has(norm)) return { status: 'compatible', label: vcf9Label(lookup.get(norm)) };
  for (const [hclModel, releases] of lookup) {
    if (norm.includes(hclModel) || hclModel.includes(norm))
      return { status: 'compatible', label: vcf9Label(releases) };
  }
  return { status: 'incompatible', label: '\u274C Not VCF9 Ready' };
}

// ── CPU Deprecation Check (KB 318697) ──────────────────────────────────────
let _cpuRulesCache = null;

async function fetchCpuRules() {
  if (_cpuRulesCache) return _cpuRulesCache;
  const res = await fetch('vcf9_cpu.json');
  if (!res.ok) throw new Error('Failed to load CPU deprecation data');
  _cpuRulesCache = await res.json();
  return _cpuRulesCache;
}

function checkCpuCompat(cpuType, cpuRules) {
  if (!cpuType) return { status: 'unknown', family: '' };
  for (const entry of (cpuRules.discontinued || [])) {
    if (new RegExp(entry.pattern, 'i').test(cpuType))
      return { status: 'discontinued', family: entry.family };
  }
  for (const entry of (cpuRules.deprecated || [])) {
    if (new RegExp(entry.pattern, 'i').test(cpuType))
      return { status: 'deprecated', family: entry.family };
  }
  return { status: 'ok', family: '' };
}

function enrichVcf9WithCpu(host) {
  const vcf9 = host.vcf9 || {};
  const cpuInfo = host.cpu_compat || {};
  const cpuStatus = cpuInfo.status || 'ok';
  const cpuFamily = cpuInfo.family || '';

  if (vcf9.status === 'compatible') {
    if (cpuStatus === 'discontinued') {
      vcf9.status = 'incompatible';
      vcf9.label = '\u274C CPU Discontinued';
      vcf9.cpu_status = 'discontinued';
      vcf9.cpu_family = cpuFamily;
    } else if (cpuStatus === 'deprecated') {
      vcf9.label += '\n\u26A0\uFE0F CPU Deprecated';
      vcf9.cpu_status = 'deprecated';
      vcf9.cpu_family = cpuFamily;
    } else {
      vcf9.cpu_status = 'ok';
      vcf9.cpu_family = '';
    }
  } else {
    vcf9.cpu_status = cpuStatus;
    vcf9.cpu_family = cpuFamily;
  }

  host.vcf9 = vcf9;
}

let xlsxLoadPromise = null;

function ensureXlsxLoaded() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out loading XLSX parser \u2014 check your network connection'));
    }, 15000);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js';
    script.async = true;
    script.onload = () => { clearTimeout(timeout); resolve(window.XLSX); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load XLSX parser')); };
    document.head.appendChild(script);
  });
  return xlsxLoadPromise;
}

// ── RVTools parser ────────────────────────────────────────────────────────────
function parseRvtools(wb, siteName) {
  const sheetMap = {};
  wb.SheetNames.forEach(s => sheetMap[s.toLowerCase()] = s);

  const vhostKey = sheetMap['vhost'];
  if (!vhostKey) throw new Error(`No vHost sheet found in "${siteName}"`);

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[vhostKey], { defval: '' });
  if (!rows.length) throw new Error(`vHost sheet is empty in "${siteName}"`);

  const headers = Object.keys(rows[0]);
  const colHost    = findCol(headers, ['VM Host', 'Host', 'DNS Name', 'Name']);
  const colCluster = findCol(headers, ['Cluster', 'Cluster Name']);
  const colModel   = findCol(headers, ['Model', 'Hardware Model']);
  const colEsxi    = findCol(headers, ['ESX Version', 'ESXi Version', 'Version']);
  const colVms     = findCol(headers, ['# VMs', 'VMs', 'Number of VMs', '#VMs']);
  const colCpu     = findCol(headers, ['CPU usage %', 'CPU %', 'CPU Usage %', 'CPU%']);
  const colMem     = findCol(headers, ['Memory usage %', 'Mem %', 'Memory %', 'Mem%']);
  const colSvc     = findCol(headers, ['Service Tag', 'Serial Number', 'SN']);
  const colSockets     = findCol(headers, ['# CPU', 'CPUs', 'CPU Sockets', 'Sockets', 'Num CPU']);
  const colCoresPerCpu = findCol(headers, ['Cores per CPU', '# Cores per CPU', 'Cores Per Socket']);
  const colCpuType     = findCol(headers, ['CPU Type', 'Processor Type', 'CPU Model']);

  const hosts = [];
  for (const row of rows) {
    const hostname = colHost ? safe(row[colHost]) : '';
    if (!hostname) continue;

    let esxi = colEsxi ? safe(row[colEsxi]) : '';
    const m = esxi.match(/(\d+\.\d+\.\d+)/);
    if (m) esxi = m[1];

    hosts.push({
      hostname,
      cluster:  colCluster ? (safe(row[colCluster]) || 'Default') : 'Default',
      model:    colModel   ? safe(row[colModel])  : '',
      esxi,
      vms:      colVms     ? (safe(row[colVms])   || '0') : '0',
      cpu:      fmtPct(colCpu ? safe(row[colCpu]) : ''),
      mem:      fmtPct(colMem ? safe(row[colMem]) : ''),
      svc:      colSvc     ? safe(row[colSvc])    : '',
      sockets:        colSockets     ? (parseInt(safe(row[colSockets]))     || 0) : 0,
      cores_per_socket: colCoresPerCpu ? (parseInt(safe(row[colCoresPerCpu])) || 0) : 0,
      cpu_type:       colCpuType     ? safe(row[colCpuType])              : '',
    });
  }

  // vInfo -> per-VM vCPU data
  const vcpuByHost = {};
  const viKey = sheetMap['vinfo'];
  if (viKey) {
    const viRows = XLSX.utils.sheet_to_json(wb.Sheets[viKey], { defval: '' });
    if (viRows.length) {
      const viHeaders = Object.keys(viRows[0]);
      const colViHost = findCol(viHeaders, ['Host', 'VM Host']);
      const colViCpus = findCol(viHeaders, ['CPUs', 'Num CPUs', '# CPUs', 'vCPUs']);
      if (colViHost && colViCpus) {
        for (const row of viRows) {
          const vhName = safe(row[colViHost]);
          if (!vhName) continue;
          const vcpus = parseInt(safe(row[colViCpus])) || 0;
          vcpuByHost[vhName] = (vcpuByHost[vhName] || 0) + vcpus;
        }
      }
    }
  }
  for (const h of hosts) {
    h.total_vcpus = vcpuByHost[h.hostname] || 0;
  }

  // vSource -> vCenter version
  let vcenterVersion = '';
  const vsKey = sheetMap['vsource'];
  if (vsKey) {
    const vsRows = XLSX.utils.sheet_to_json(wb.Sheets[vsKey], { defval: '' });
    if (vsRows.length) {
      const vsHeaders = Object.keys(vsRows[0]);
      const colFn = findCol(vsHeaders, ['Fullname', 'Full Name', 'Version', 'Name']);
      if (colFn) {
        for (const row of vsRows) {
          const s = safe(row[colFn]);
          let mv = s.match(/vCenter Server\s+(\d+\.\d+\.\d+)/i);
          if (!mv) mv = s.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (mv) { vcenterVersion = mv[1]; break; }
        }
      }
    }
  }

  const clusters = {};
  for (const h of hosts) {
    (clusters[h.cluster] ||= []).push(h);
  }

  return {
    site_name: siteName,
    clusters,
    vcenter_version: vcenterVersion,
    total_hosts: hosts.length,
    total_vms: hosts.reduce((s, h) => s + (parseInt(h.vms) || 0), 0),
  };
}

// ── LiveOptics parser ─────────────────────────────────────────────────────────
function parseLiveOptics(wb, siteName) {
  const sheetMap = {};
  wb.SheetNames.forEach(s => sheetMap[s.toLowerCase()] = s);

  const hostsKey = sheetMap['esx hosts'];
  if (!hostsKey) throw new Error(`No "ESX Hosts" sheet found in "${siteName}"`);

  const hostsRows = XLSX.utils.sheet_to_json(wb.Sheets[hostsKey], { defval: '' });
  if (!hostsRows.length) throw new Error(`"ESX Hosts" sheet is empty in "${siteName}"`);

  const loHeaders = Object.keys(hostsRows[0]);
  const loColSockets     = findCol(loHeaders, ['CPU Sockets', 'Sockets']);
  const loColCoresPerCpu = findCol(loHeaders, ['Cores Per Socket', 'Cores per CPU']);
  const loColVcpus       = findCol(loHeaders, ['Total vCPUs', 'Virtual CPUs', 'vCPUs']);
  const loColCpuType     = findCol(loHeaders, ['CPU Model', 'Processor', 'CPU Type']);

  const perfMap = {};
  const perfKey = sheetMap['esx performance'];
  if (perfKey) {
    for (const row of XLSX.utils.sheet_to_json(wb.Sheets[perfKey], { defval: '' })) {
      const h = safe(row['Host']);
      if (h) perfMap[h] = row;
    }
  }

  let vcenterVersion = '';
  const vcStr = safe(hostsRows[0]['vCenter']);
  const vcMatch = vcStr.match(/(\d+\.\d+\.\d+)/);
  if (vcMatch) vcenterVersion = vcMatch[1];

  const hosts = [];
  for (const row of hostsRows) {
    const hostname = safe(row['Host Name']);
    if (!hostname) continue;

    let esxi = '';
    const osMatch = safe(row['OS']).match(/(\d+\.\d+\.\d+)/);
    if (osMatch) esxi = osMatch[1];

    const perf = perfMap[hostname] || {};
    hosts.push({
      hostname,
      cluster:  safe(row['Cluster'])       || 'Default',
      model:    safe(row['Model']),
      esxi,
      vms:      safe(row['Guest VM Count']) || '0',
      cpu:      fmtPct(safe(perf['Average CPU %'])),
      mem:      fmtPct(safe(perf['Average Memory %'])),
      svc:      safe(row['Serial No']),
      sockets:        loColSockets     ? (parseInt(safe(row[loColSockets]))     || 0) : 0,
      cores_per_socket: loColCoresPerCpu ? (parseInt(safe(row[loColCoresPerCpu])) || 0) : 0,
      total_vcpus:    loColVcpus       ? (parseInt(safe(row[loColVcpus]))       || 0) : 0,
      cpu_type:       loColCpuType     ? safe(row[loColCpuType])              : '',
    });
  }

  const clusters = {};
  for (const h of hosts) (clusters[h.cluster] ||= []).push(h);

  return {
    site_name: siteName,
    clusters,
    vcenter_version: vcenterVersion,
    total_hosts: hosts.length,
    total_vms: hosts.reduce((s, h) => s + (parseInt(h.vms) || 0), 0),
  };
}

// ── Auto-detect format and parse ──────────────────────────────────────────────
function parseFile(arrayBuffer, siteName) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const lower = wb.SheetNames.map(s => s.toLowerCase());
  if (lower.includes('vhost'))     return parseRvtools(wb, siteName);
  if (lower.includes('esx hosts')) return parseLiveOptics(wb, siteName);
  throw new Error(`"${siteName}" is not a recognised RVTools or LiveOptics export`);
}

// ── Excalidraw element builder ────────────────────────────────────────────────
function randomSeed() { return (Math.random() * 0xFFFFFF) >>> 0; }

function makeRect(id, x, y, w, h, bg, stroke, text = '', fontSize = 12,
                  bold = false, textColor = '#1A1A2E', vAlign = 'middle', rounded = 8) {
  const el = {
    id, type: 'rectangle', x, y, width: w, height: h, angle: 0,
    strokeColor: stroke, backgroundColor: bg, fillStyle: 'solid',
    strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100,
    groupIds: [], roundness: { type: 3, value: rounded },
    seed: randomSeed(), version: 1, versionNonce: 0, isDeleted: false,
    boundElements: [], updated: 1, link: null, locked: false,
  };
  const elements = [el];
  if (text) {
    const txtId = uid();
    el.boundElements.push({ type: 'text', id: txtId });
    elements.push({
      id: txtId, type: 'text', x, y, width: w, height: h, angle: 0,
      strokeColor: textColor, backgroundColor: 'transparent',
      fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid',
      roughness: 0, opacity: 100, groupIds: [], seed: randomSeed(),
      version: 1, versionNonce: 0, isDeleted: false,
      boundElements: [], updated: 1, link: null, locked: false,
      text,
      fontSize: bold ? fontSize + 1 : fontSize,
      fontFamily: bold ? 1 : 3,
      textAlign: 'center', verticalAlign: vAlign,
      containerId: id, originalText: text, autoResize: true, lineHeight: 1.25,
    });
  }
  return elements;
}

// ── Excalidraw diagram generator ──────────────────────────────────────────────
function generateExcalidraw(sites, vcf9Enabled) {
  const elements = [];
  let xCursor = CANVAS_X;
  const hostH = vcf9Enabled ? 155 : HOST_H;

  for (let idx = 0; idx < sites.length; idx++) {
    const { site_name, clusters, vcenter_version, total_hosts, total_vms } = sites[idx];
    const p = PALETTES[idx % PALETTES.length];

    let innerH = HEADER_H + PAD;
    for (const chosts of Object.values(clusters)) {
      innerH += CLUSTER_H + PAD + Math.ceil(chosts.length / COLS) * (hostH + ROW_GAP);
    }
    const zoneH = innerH + PAD;
    const y0 = CANVAS_Y;

    elements.push(...makeRect(uid(), xCursor, y0, ZONE_W, zoneH,
      p.zone_bg, p.zone_stroke, '', 12, false, '#1A1A2E', 'middle', 12));

    let hdrText = `${site_name}  \u00B7  ${total_hosts} hosts  \u00B7  ${total_vms} VMs`;
    if (vcenter_version) hdrText += `\nvCenter ${vcenter_version}`;
    elements.push(...makeRect(uid(), xCursor, y0, ZONE_W, HEADER_H,
      p.hdr_bg, p.hdr_bg, hdrText, 14, true, p.hdr_text, 'middle', 10));

    let cy = y0 + HEADER_H + PAD;
    for (const [cname, chosts] of Object.entries(clusters)) {
      const clVcpus = chosts.reduce((s, h) => s + (h.total_vcpus || 0), 0);
      const clCores = chosts.reduce((s, h) => s + h.sockets * h.cores_per_socket, 0);
      const clLabel = (clCores > 0 && clVcpus > 0)
        ? `${cname}  \u00B7  vCPU/pCPU: ${(clVcpus / clCores).toFixed(1)}:1`
        : `${cname}  \u00B7  vCPU/pCPU: \u2014`;

      elements.push(...makeRect(uid(), xCursor + PAD, cy, ZONE_W - 2*PAD, CLUSTER_H,
        p.cluster_bg, p.cluster_stroke, clLabel, 11, true, p.zone_stroke, 'middle', 4));
      cy += CLUSTER_H + PAD;

      const rows = Math.ceil(chosts.length / COLS);
      chosts.forEach((h, i) => {
        const hx = xCursor + PAD + (i % COLS) * (HOST_W + COL_GAP);
        const hy = cy + Math.floor(i / COLS) * (hostH + ROW_GAP);
        const totalCores = h.sockets * h.cores_per_socket;
        const ratioStr = (totalCores > 0 && (h.total_vcpus || 0) > 0)
          ? `vCPU/pCPU: ${(h.total_vcpus / totalCores).toFixed(1)}:1`
          : 'vCPU/pCPU: \u2014';
        const lines = [
          h.hostname,
          h.model || '\u2014',
          h.svc ? `SVC: ${h.svc}` : 'SVC: \u2014',
          h.esxi ? `ESXi ${h.esxi}` : 'ESXi \u2014',
          `VMs:${h.vms}  CPU:${h.cpu}  Mem:${h.mem}`,
          ratioStr,
        ];
        if (vcf9Enabled && h.vcf9) lines.push(h.vcf9.label);
        const label = lines.join('\n');

        let stroke = p.host_stroke;
        if (vcf9Enabled && h.vcf9) {
          if (h.vcf9.status === 'incompatible') stroke = '#E57373';
          else if (h.vcf9.cpu_status === 'deprecated') stroke = '#F0AD4E';
        }
        elements.push(...makeRect(uid(), hx, hy, HOST_W, hostH,
          p.host_bg, stroke, label, 9, false, p.host_text, 'middle', 6));
      });

      cy += rows * (hostH + ROW_GAP) + PAD;
    }

    xCursor += ZONE_W + ZONE_GAP;
  }

  if (vcf9Enabled) {
    const legendX = xCursor;
    const legendY = CANVAS_Y;
    const legendW = 260;
    const legendH = 105;
    const legendText = 'VCF 9 Compatibility\n\u2705 VCF x.x Ready\n\u26A0\uFE0F CPU Deprecated (supported 9.x)\n\u274C Not VCF9 Ready / CPU Discontinued\n\u26A0\uFE0F VCF9 ? \u2014 model unknown';
    elements.push(...makeRect(uid(), legendX, legendY, legendW, legendH,
      '#FFF9E6', '#D4A017', legendText, 9, false, '#4A4A00', 'middle', 8));
  }

  return { type: 'excalidraw', version: 2, source: 'https://excalidraw.com',
           elements, appState: { gridSize: null, viewBackgroundColor: '#F4F5F7' }, files: {} };
}

// ── UI logic ──────────────────────────────────────────────────────────────────
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList  = document.getElementById('file-list');
const genBtn    = document.getElementById('generate-btn');
const statusEl  = document.getElementById('status');

let files = [];

function setStatus(text, type) {
  statusEl.innerHTML = '';
  if (type === 'loading') {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    statusEl.appendChild(spinner);
    statusEl.appendChild(document.createTextNode(' ' + text));
  } else if (type) {
    const span = document.createElement('span');
    span.className = type;
    span.textContent = text;
    statusEl.appendChild(span);
  } else {
    statusEl.textContent = text;
  }
}

function guessName(filename) {
  return filename.replace(/\.xlsx$/i, '').replace(/[_-]/g, ' ').trim();
}

function renderList() {
  fileList.innerHTML = '';
  files.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'file-row';

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = '\uD83D\uDCC4';

    const name = document.createElement('span');
    name.className = 'file-name';
    name.title = item.file.name;
    name.textContent = item.file.name;

    const input = document.createElement('input');
    input.className = 'site-input';
    input.type = 'text';
    input.value = item.name;
    input.placeholder = 'Site name';
    input.addEventListener('input', () => { files[i].name = input.value; });

    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.title = 'Remove';
    btn.textContent = '\u2715';
    btn.addEventListener('click', () => removeFile(i));

    row.append(icon, name, input, btn);
    fileList.appendChild(row);
  });
  genBtn.disabled = files.length === 0;
}

function addFiles(newFiles) {
  for (const f of newFiles) {
    if (f.name.endsWith('.xlsx') && !files.find(x => x.file.name === f.name))
      files.push({ file: f, name: guessName(f.name) });
  }
  renderList();
  statusEl.textContent = '';
}

function removeFile(i) { files.splice(i, 1); renderList(); }

fileInput.addEventListener('change', () => addFiles(fileInput.files));
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over'); addFiles(e.dataTransfer.files);
});

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

// ── Theme toggle ──────────────────────────────────────────────────────────────
(function () {
  const root    = document.documentElement;
  const btn     = document.getElementById('theme-toggle');
  const mq      = window.matchMedia('(prefers-color-scheme: dark)');

  function activeTheme() {
    const explicit = root.getAttribute('data-theme');
    if (explicit) return explicit;
    return mq.matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
    document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
  }

  const saved = localStorage.getItem('dmi-theme');
  if (saved) {
    applyTheme(saved);
  } else {
    btn.textContent = mq.matches ? '\u2600\uFE0F' : '\uD83C\uDF19';
  }

  btn.addEventListener('click', () => {
    const next = activeTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dmi-theme', next);
    applyTheme(next);
  });

  mq.addEventListener('change', () => {
    if (!localStorage.getItem('dmi-theme')) {
      btn.textContent = mq.matches ? '\u2600\uFE0F' : '\uD83C\uDF19';
      document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: activeTheme() } }));
    }
  });
})();

// ── License Calculator ─────────────────────────────────────────────────────
function calculateLicensing(sites, deploymentType) {
  const tibPerCore = deploymentType === 'VCF' ? 1 : 0.25;
  const rows = [];
  let totalCores = 0, totalTib = 0, missingCount = 0;

  for (const site of sites) {
    for (const [cluster, hosts] of Object.entries(site.clusters)) {
      for (const h of hosts) {
        const sockets = h.sockets || 0;
        const coresPerSocket = h.cores_per_socket || 0;

        if (sockets === 0 || coresPerSocket === 0) {
          missingCount++;
          rows.push({
            site: site.site_name, cluster, hostname: h.hostname,
            sockets, coresPerSocket,
            foundationCores: 0, entitledTib: 0, missing: true,
          });
          continue;
        }

        const effectiveCores = Math.max(coresPerSocket, 16);
        const foundationCores = sockets * effectiveCores;
        const entitledTib = foundationCores * tibPerCore;

        totalCores += foundationCores;
        totalTib += entitledTib;

        rows.push({
          site: site.site_name, cluster, hostname: h.hostname,
          sockets, coresPerSocket,
          foundationCores, entitledTib, missing: false,
        });
      }
    }
  }

  return { rows, totalCores, totalTib, missingCount, deploymentType, tibPerCore };
}

function renderLicenseReport() {
  const report = window.__licenseReport;
  if (!report) return;

  const summary = document.getElementById('license-summary');
  let warningHtml = '';
  if (report.missingCount > 0) {
    warningHtml = `<div class="summary-item"><span class="summary-label">Missing Data</span><span class="summary-value" style="color:#e53e3e">${report.missingCount} host(s)</span></div>`;
  }
  summary.innerHTML = `<div class="license-summary-box">
    <div class="summary-item"><span class="summary-label">Deployment</span><span class="summary-value">${report.deploymentType}</span></div>
    <div class="summary-item"><span class="summary-label">Total Foundation Cores</span><span class="summary-value">${report.totalCores.toLocaleString()}</span></div>
    <div class="summary-item"><span class="summary-label">vSAN Entitled TiB</span><span class="summary-value">${report.totalTib.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
    <div class="summary-item"><span class="summary-label">TiB per Core</span><span class="summary-value">${report.tibPerCore}</span></div>
    ${warningHtml}
  </div>`;

  const container = document.getElementById('license-table-container');
  let html = `<table class="license-table">
    <thead><tr>
      <th>Site</th><th>Cluster</th><th>Hostname</th>
      <th>Sockets</th><th>Cores/Socket</th>
      <th>Foundation Cores</th><th>Entitled TiB</th>
    </tr></thead><tbody>`;

  for (const r of report.rows) {
    const cls = r.missing ? ' style="color:#e53e3e;font-style:italic"' : '';
    html += `<tr${cls}>
      <td>${r.site}</td><td>${r.cluster}</td><td>${r.hostname}</td>
      <td class="num">${r.sockets || '\u2014'}</td>
      <td class="num">${r.coresPerSocket || '\u2014'}</td>
      <td class="num">${r.missing ? '\u2014' : r.foundationCores}</td>
      <td class="num">${r.missing ? '\u2014' : r.entitledTib.toFixed(2)}</td>
    </tr>`;
  }

  html += `<tr class="totals-row">
    <td colspan="5"><strong>Total</strong></td>
    <td class="num">${report.totalCores.toLocaleString()}</td>
    <td class="num">${report.totalTib.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
  </tr></tbody></table>`;
  container.innerHTML = html;
}

// ── VCF 9 Readiness Report ────────────────────────────────────────────────
function buildVcf9Report(sites) {
  const rows = [];
  let compatible = 0, incompatible = 0, unknown = 0;
  let compatibleOk = 0, compatibleDeprecated = 0;

  for (const site of sites) {
    for (const [cluster, hosts] of Object.entries(site.clusters)) {
      for (const h of hosts) {
        const vcf9 = h.vcf9 || { status: 'unknown', label: 'N/A' };
        rows.push({
          site: site.site_name, cluster, hostname: h.hostname,
          model: h.model || '', esxi: h.esxi || '',
          status: vcf9.status, label: vcf9.label,
          cpu_type: h.cpu_type || '',
          cpu_status: vcf9.cpu_status || '',
          cpu_family: vcf9.cpu_family || '',
        });
        if (vcf9.status === 'compatible') {
          compatible++;
          if (vcf9.cpu_status === 'deprecated') compatibleDeprecated++;
          else compatibleOk++;
        }
        else if (vcf9.status === 'incompatible') incompatible++;
        else unknown++;
      }
    }
  }

  return { rows, compatible, compatible_ok: compatibleOk, compatible_deprecated: compatibleDeprecated,
           incompatible, unknown, total: rows.length };
}

function renderVcf9Report() {
  const report = window.__vcf9Report;
  if (!report) return;

  const summary = document.getElementById('vcf9-summary');
  const compatDetail = report.compatible_deprecated > 0
    ? ` <span style="font-size:0.7em;font-weight:normal;color:#666">(${report.compatible_ok} OK \u00B7 ${report.compatible_deprecated} CPU Deprecated)</span>`
    : '';
  summary.innerHTML = `<div class="license-summary-box">
    <div class="summary-item"><span class="summary-label">Total Hosts</span><span class="summary-value">${report.total}</span></div>
    <div class="summary-item"><span class="summary-label">Compatible</span><span class="summary-value vcf9-compatible">${report.compatible}${compatDetail}</span></div>
    <div class="summary-item"><span class="summary-label">Not Compatible</span><span class="summary-value vcf9-incompatible">${report.incompatible}</span></div>
    <div class="summary-item"><span class="summary-label">Unknown</span><span class="summary-value vcf9-unknown">${report.unknown}</span></div>
  </div>`;

  const container = document.getElementById('vcf9-table-container');
  const colDefs = [
    { key: 'site',       label: 'Site' },
    { key: 'cluster',    label: 'Cluster' },
    { key: 'hostname',   label: 'Hostname' },
    { key: 'model',      label: 'Model' },
    { key: 'esxi',       label: 'ESXi' },
    { key: 'label',      label: 'VCF 9 Status' },
    { key: 'cpu_type',   label: 'CPU Type' },
    { key: '_cpu_display', label: 'CPU Status' },
  ];

  const enriched = report.rows.map(r => ({
    ...r,
    _cpu_display: r.cpu_family || r.cpu_status || '\u2014',
    _cls: r.status === 'compatible' ? 'vcf9-compatible'
        : r.status === 'incompatible' ? 'vcf9-incompatible' : 'vcf9-unknown',
    _cpuCls: r.cpu_status === 'discontinued' ? 'vcf9-incompatible'
           : r.cpu_status === 'deprecated' ? 'vcf9-unknown' : '',
  }));

  let sortCol = null, sortAsc = true;
  const filters = {};

  function renderTable() {
    let rows = enriched.filter(r => {
      for (const [key, val] of Object.entries(filters)) {
        if (val && !(r[key] || '').toLowerCase().includes(val.toLowerCase())) return false;
      }
      return true;
    });
    if (sortCol) {
      rows.sort((a, b) => {
        const va = (a[sortCol] || '').toLowerCase();
        const vb = (b[sortCol] || '').toLowerCase();
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    let html = `<table class="license-table">
      <thead>
        <tr>${colDefs.map(c => {
          const arrow = sortCol === c.key ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';
          return `<th class="vcf9-sortable" data-col="${c.key}">${c.label}${arrow}</th>`;
        }).join('')}</tr>
        <tr>${colDefs.map(c =>
          `<th style="padding:4px 6px;background:var(--primary)"><input type="text" data-filter="${c.key}" placeholder="Filter\u2026" style="width:100%;padding:3px 6px;font-size:0.78rem;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;" value="${filters[c.key] || ''}"></th>`
        ).join('')}</tr>
      </thead><tbody>`;

    for (const r of rows) {
      html += `<tr>
        <td>${r.site}</td><td>${r.cluster}</td><td>${r.hostname}</td>
        <td>${r.model || '\u2014'}</td><td>${r.esxi || '\u2014'}</td>
        <td class="${r._cls}">${r.label}</td>
        <td>${r.cpu_type || '\u2014'}</td>
        <td class="${r._cpuCls}">${r._cpu_display}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    container.innerHTML = html;

    container.querySelectorAll('.vcf9-sortable').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortAsc = !sortAsc;
        else { sortCol = col; sortAsc = true; }
        renderTable();
      });
    });
    container.querySelectorAll('input[data-filter]').forEach(input => {
      input.addEventListener('input', () => {
        filters[input.dataset.filter] = input.value;
        renderTable();
      });
      if (document.activeElement === input) input.focus();
    });
    const active = container.querySelector(`input[data-filter="${Object.keys(filters).find(k => filters[k])}"]`);
    if (active) { active.focus(); active.selectionStart = active.selectionEnd = active.value.length; }
  }

  renderTable();
}

function generateVcf9Txt(report) {
  const hdrs = ['SITE', 'CLUSTER', 'HOSTNAME', 'MODEL', 'ESXI_VERSION', 'VCF9_STATUS', 'CPU_TYPE', 'CPU_STATUS'];
  const cols = hdrs.map(h => h.length);
  for (const r of report.rows) {
    cols[0] = Math.max(cols[0], r.site.length);
    cols[1] = Math.max(cols[1], r.cluster.length);
    cols[2] = Math.max(cols[2], r.hostname.length);
    cols[3] = Math.max(cols[3], (r.model || '').length);
    cols[4] = Math.max(cols[4], (r.esxi || '').length);
    cols[5] = Math.max(cols[5], r.label.length);
    const cpuCol = r.cpu_family || r.cpu_status || '';
    cols[6] = Math.max(cols[6], (r.cpu_type || '').length);
    cols[7] = Math.max(cols[7], cpuCol.length);
  }

  const pad = (s, w) => String(s).padEnd(w);
  const hdrLine = hdrs.map((h, i) => pad(h, cols[i])).join(' ');
  const sep = cols.map(w => '-'.repeat(w)).join(' ');

  const lines = [
    'VCF 9 Readiness Report',
    '',
    `Total: ${report.total}  |  Compatible: ${report.compatible} (${report.compatible_ok} OK \u00B7 ${report.compatible_deprecated} CPU Deprecated)  |  Not Compatible: ${report.incompatible}  |  Unknown: ${report.unknown}`,
    '',
    hdrLine,
    sep,
  ];

  for (const r of report.rows) {
    const cpuCol = r.cpu_family || r.cpu_status || '';
    lines.push([
      pad(r.site, cols[0]),
      pad(r.cluster, cols[1]),
      pad(r.hostname, cols[2]),
      pad(r.model || '', cols[3]),
      pad(r.esxi || '', cols[4]),
      pad(r.label, cols[5]),
      pad(r.cpu_type || '', cols[6]),
      pad(cpuCol, cols[7]),
    ].join(' '));
  }
  lines.push('');
  return lines.join('\n');
}

function generateVcf9Csv(report) {
  const lines = ['Site,Cluster,Hostname,Model,ESXi Version,VCF9 Status,CPU Type,CPU Status,CPU Family'];
  for (const r of report.rows) {
    lines.push([r.site, r.cluster, r.hostname, r.model, r.esxi, r.label,
      r.cpu_type || '', r.cpu_status || '', r.cpu_family || '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById('vcf9-txt-btn').addEventListener('click', () => {
  const report = window.__vcf9Report;
  if (!report) return;
  downloadBlob(generateVcf9Txt(report), 'vcf9_readiness_report.txt', 'text/plain');
});

document.getElementById('vcf9-csv-btn').addEventListener('click', () => {
  const report = window.__vcf9Report;
  if (!report) return;
  downloadBlob(generateVcf9Csv(report), 'vcf9_readiness_report.csv', 'text/csv');
});

function generateLicenseTxt(report) {
  const dt = report.deploymentType;
  const fullName = dt === 'VCF' ? 'VMware Cloud Foundation (VCF) Instance' : 'VMware vSphere Foundation (VVF)';

  const hdrs = ['CLUSTER', 'VMHOST', 'NUM_CPU_SOCKETS', 'NUM_CPU_CORES_PER_SOCKET', 'FOUNDATION_LICENSE_CORE_COUNT', 'VSAN_LICENSE_TIB_COUNT'];
  const cols = hdrs.map(h => h.length);
  for (const r of report.rows) {
    cols[0] = Math.max(cols[0], (r.cluster || '').length);
    cols[1] = Math.max(cols[1], (r.hostname || '').length);
    cols[2] = Math.max(cols[2], String(r.sockets).length);
    cols[3] = Math.max(cols[3], String(r.coresPerSocket).length);
    cols[4] = Math.max(cols[4], String(r.missing ? '-' : r.foundationCores).length);
    cols[5] = Math.max(cols[5], (r.missing ? '-' : r.entitledTib.toFixed(2)).length);
  }
  cols[4] = Math.max(cols[4], String(report.totalCores).length);
  cols[5] = Math.max(cols[5], report.totalTib.toFixed(2).length);
  cols[0] = Math.max(cols[0], 5);

  const pad = (s, w, right) => right ? String(s).padStart(w) : String(s).padEnd(w);
  const sep = cols.map(w => '-'.repeat(w)).join(' ');
  const hdrLine = hdrs.map((h, i) => i < 2 ? pad(h, cols[i], false) : pad(h, cols[i], true)).join(' ');

  const lines = [];
  lines.push(`Sizing Results for ${fullName}:`);
  lines.push('');
  lines.push('Host Information');
  lines.push('');
  lines.push(hdrLine);
  lines.push(sep);

  for (const r of report.rows) {
    const fc = r.missing ? '-' : String(r.foundationCores);
    const tib = r.missing ? '-' : r.entitledTib.toFixed(2);
    lines.push([
      pad(r.cluster || '', cols[0], false),
      pad(r.hostname || '', cols[1], false),
      pad(r.missing ? '-' : r.sockets, cols[2], true),
      pad(r.missing ? '-' : r.coresPerSocket, cols[3], true),
      pad(fc, cols[4], true),
      pad(tib, cols[5], true),
    ].join(' '));
  }

  lines.push([
    pad('Total', cols[0], false),
    pad('-', cols[1], false),
    pad('-', cols[2], true),
    pad('-', cols[3], true),
    pad(String(report.totalCores), cols[4], true),
    pad(report.totalTib.toFixed(2), cols[5], true),
  ].join(' '));

  lines.push('');
  lines.push('Cluster Information');
  lines.push('');

  const clusterTib = {};
  for (const r of report.rows) {
    if (!r.missing) {
      clusterTib[r.cluster] = (clusterTib[r.cluster] || 0) + r.entitledTib;
    }
  }
  const cHdr = 'CLUSTER';
  const tHdr = 'VSAN_ENTITLED_TIB';
  const cw0 = Math.max(cHdr.length, ...Object.keys(clusterTib).map(k => k.length), 5);
  const cw1 = Math.max(tHdr.length, ...Object.values(clusterTib).map(v => v.toFixed(2).length), report.totalTib.toFixed(2).length);
  lines.push(pad(cHdr, cw0, false) + ' ' + pad(tHdr, cw1, true));
  lines.push('-'.repeat(cw0) + ' ' + '-'.repeat(cw1));
  let clusterTibTotal = 0;
  for (const [name, tib] of Object.entries(clusterTib)) {
    lines.push(pad(name, cw0, false) + ' ' + pad(tib.toFixed(2), cw1, true));
    clusterTibTotal += tib;
  }
  lines.push(pad('Total', cw0, false) + ' ' + pad(clusterTibTotal.toFixed(2), cw1, true));

  lines.push('');
  lines.push(`Total Required ${dt} Compute Licenses: ${report.totalCores}`);
  lines.push(`Total Required vSAN Add-on Licenses: N/A (requires actual vSAN capacity data)`);
  lines.push('');

  return lines.join('\n');
}

document.getElementById('license-txt-btn').addEventListener('click', () => {
  const report = window.__licenseReport;
  if (!report) return;
  downloadBlob(generateLicenseTxt(report), `license_report_${report.deploymentType}.txt`, 'text/plain');
});

document.getElementById('license-csv-btn').addEventListener('click', () => {
  const report = window.__licenseReport;
  if (!report) return;
  const lines = ['Site,Cluster,Hostname,Sockets,Cores per Socket,Foundation Cores,Entitled TiB'];
  for (const r of report.rows) {
    lines.push([r.site, r.cluster, r.hostname, r.sockets, r.coresPerSocket,
      r.missing ? '' : r.foundationCores,
      r.missing ? '' : r.entitledTib.toFixed(2)].map(v => `"${v}"`).join(','));
  }
  lines.push(['Total','','','','',report.totalCores,report.totalTib.toFixed(2)].map(v => `"${v}"`).join(','));
  downloadBlob(lines.join('\n'), `license_report_${report.deploymentType}.csv`, 'text/csv');
});

// ── Tab system ─────────────────────────────────────────────────────────────
function buildTabBar(hasVcf9, hasLicense) {
  const bar = document.getElementById('tab-bar');
  bar.innerHTML = '';
  const tabs = [{ id: 'tab-diagram', label: 'Diagram' }];
  if (hasVcf9) tabs.push({ id: 'tab-vcf9', label: 'VCF 9 Readiness' });
  if (hasLicense) tabs.push({ id: 'tab-license', label: 'License Report' });

  tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.textContent = t.label;
    btn.setAttribute('data-tab', t.id);
    btn.addEventListener('click', () => switchTab(t.id));
    bar.appendChild(btn);
  });

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(tabs[0].id).classList.add('active');
}

function switchTab(panelId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${panelId}"]`);
  if (btn) btn.classList.add('active');
  document.getElementById(panelId).classList.add('active');
  if (panelId === 'tab-diagram' && window.renderDiagram) window.renderDiagram().catch(() => {});
}

async function generate() {
  if (!files.length) return;
  genBtn.disabled = true;
  setStatus('Generating diagram\u2026', 'loading');

  try {
    await ensureXlsxLoaded();
    const sites = [];
    for (const item of files) {
      const buf = await readFile(item.file);
      sites.push(parseFile(buf, item.name || item.file.name));
    }

    const vcf9Enabled = document.getElementById('vcf9-check').checked;
    let vcf9Lookup = null;
    let cpuRules = null;
    if (vcf9Enabled) {
      try {
        setStatus('Loading VCF 9 compatibility data\u2026', 'loading');
        const [hclData, cpuData] = await Promise.all([fetchHcl(), fetchCpuRules()]);
        vcf9Lookup = buildVcf9Lookup(hclData);
        cpuRules = cpuData;
      } catch (e) {
        setStatus('Warning: Could not load VCF 9 data \u2014 continuing without VCF9 check', 'err');
        vcf9Lookup = null;
      }
    }

    if (vcf9Enabled && vcf9Lookup) {
      for (const site of sites) {
        for (const chosts of Object.values(site.clusters)) {
          for (const h of chosts) {
            h.vcf9 = checkVcf9Compat(h.model, vcf9Lookup);
            if (cpuRules) {
              h.cpu_compat = checkCpuCompat(h.cpu_type || '', cpuRules);
              enrichVcf9WithCpu(h);
            }
          }
        }
      }
    }

    const doc = generateExcalidraw(sites, vcf9Enabled && !!vcf9Lookup);
    window.__excalidrawDoc = doc;

    const hasVcf9 = vcf9Enabled && !!vcf9Lookup;
    if (hasVcf9) {
      window.__vcf9Report = buildVcf9Report(sites);
      renderVcf9Report();
    } else {
      window.__vcf9Report = null;
    }

    const licenseEnabled = document.getElementById('license-check').checked;
    if (licenseEnabled) {
      const deploymentType = document.getElementById('license-type').value;
      window.__licenseReport = calculateLicensing(sites, deploymentType);
      renderLicenseReport();
    } else {
      window.__licenseReport = null;
    }

    buildTabBar(hasVcf9, licenseEnabled);
    const resultsSection = document.getElementById('results-section');
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.dispatchEvent(new CustomEvent('diagram-ready'));

    setStatus('\u2713 Diagram ready \u2014 see preview below', 'ok');
  } catch (e) {
    setStatus('Error: ' + e.message, 'err');
  } finally {
    genBtn.disabled = false;
  }
}

genBtn.addEventListener('click', generate);

// ── Excalidraw preview (was separate module script) ───────────────────────────
let excalidrawRoot = null;
let excalidrawLoadPromise = null;
let ReactLib = null;
let createRootFn = null;
let ExcalidrawLib = null;

function ensureExcalidrawStyles() {
  if (document.querySelector('link[data-excalidraw-css="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/dev/index.css';
  link.setAttribute('data-excalidraw-css', 'true');
  document.head.appendChild(link);
}

async function ensureExcalidrawLoaded() {
  if (ExcalidrawLib && ReactLib && createRootFn) return;
  if (excalidrawLoadPromise) {
    await excalidrawLoadPromise;
    return;
  }

  excalidrawLoadPromise = Promise.race([
    (async () => {
      window.EXCALIDRAW_ASSET_PATH = 'https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/prod/';
      ensureExcalidrawStyles();
      const [reactMod, reactDomMod, excalidrawMod] = await Promise.all([
        import('https://esm.sh/react@19'),
        import('https://esm.sh/react-dom@19/client'),
        import('https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/dev/index.js?external=react,react-dom'),
      ]);
      ReactLib = reactMod.default;
      createRootFn = reactDomMod.createRoot;
      ExcalidrawLib = excalidrawMod;
    })(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timed out loading Excalidraw \u2014 check your network connection')), 20000)
    ),
  ]);

  await excalidrawLoadPromise;
}

function excalidrawTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark' : 'light';
}

async function renderDiagram() {
  const doc = window.__excalidrawDoc;
  if (!doc) return;
  await ensureExcalidrawLoaded();
  const mount = document.getElementById('excalidraw-mount');
  if (excalidrawRoot) excalidrawRoot.unmount();
  excalidrawRoot = createRootFn(mount);
  excalidrawRoot.render(ReactLib.createElement(ExcalidrawLib.Excalidraw, {
    initialData: { elements: doc.elements, appState: doc.appState, scrollToContent: true },
    viewModeEnabled: true,
    theme: excalidrawTheme(),
  }));
}
window.renderDiagram = renderDiagram;

document.addEventListener('diagram-ready', () => {
  renderDiagram().catch((e) => {
    setStatus('Error loading preview: ' + e.message, 'err');
  });
});

document.addEventListener('theme-changed', () => {
  renderDiagram().catch(() => {});
});

document.getElementById('download-btn').addEventListener('click', () => {
  const doc = window.__excalidrawDoc;
  if (!doc) return;
  downloadBlob(JSON.stringify(doc, null, 2), 'vmware_infrastructure.excalidraw', 'application/json');
});
