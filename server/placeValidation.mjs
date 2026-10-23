const CITY_CATEGORIES = ['landmark', 'heritage', 'museum', 'park', 'university', 'neighborhood', 'restaurant'];
const CAMPUS_CATEGORIES = ['入口', '景观', '建筑', '场馆', '科研', '绿地', '运动', '餐饮'];
const TAGS = ['plant', 'culture', 'research', 'sport', 'food', 'photo'];
const FIELDS = new Set(['operation', 'expectedVersion', 'id', 'scope', 'campusId', 'districtId', 'name',
  'aliases', 'category', 'emoji', 'lng', 'lat', 'x', 'y', 'visit', 'short', 'description', 'highlights',
  'bestTime', 'tips', 'interests', 'mustSee', 'openingHours', 'bookingUrl', 'address', 'ticketNote', 'ticketPrice', 'coordinateSystem', 'sources']);

export class PlaceValidationError extends Error {
  constructor(message) { super(message); this.name = 'PlaceValidationError'; }
}
function fail(message) { throw new PlaceValidationError(message); }
function text(value, label, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${label}必须是${required ? '非空' : ''}文本，最长 ${max} 字。`);
  return value.trim();
}
function id(value, label) {
  const result = text(value, label, 100, true);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(result)) fail(`${label}只允许小写字母、数字和短横线。`);
  return result;
}
function texts(value, label, maxItems, maxLength) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) fail(`${label}必须是最多 ${maxItems} 项的数组。`);
  const result = value.map((item) => text(item, label, maxLength, true));
  if (new Set(result).size !== result.length) fail(`${label}不能重复。`);
  return result;
}
function number(value, label, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${label}必须是 ${min}–${max} 之间的${integer ? '整数' : '数字'}。`);
  return value;
}
function httpsUrl(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const result = text(value, label, 2000, true);
  try {
    const url = new URL(result);
    if (url.protocol !== 'https:' || url.username || url.password) fail(`${label}必须是无账号密码的 HTTPS 地址。`);
  } catch { fail(`${label}必须是无账号密码的 HTTPS 地址。`); }
  return result;
}

function source(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('来源必须是对象。');
  if (Object.keys(value).some((key) => !['reference', 'kind', 'verificationStatus', 'verifiedAt'].includes(key))) fail('来源包含未知字段。');
  const kind = value.kind;
  if (!['project-import', 'official', 'manual'].includes(kind)) fail('资料来源类型无效。');
  const reference = kind === 'official' ? httpsUrl(value.reference, '官方来源') : text(value.reference, '资料来源', 2000, true);
  if (!reference) fail('资料来源不能为空。');
  const verificationStatus = value.verificationStatus ?? 'unverified';
  if (!['unverified', 'verified'].includes(verificationStatus)) fail('核实状态无效。');
  let verifiedAt = null;
  if (verificationStatus === 'verified') {
    const raw = text(value.verifiedAt, '核实日期', 10, true);
    const date = new Date(raw + 'T00:00:00Z');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw || raw > today) fail('核实日期必须是真实且不晚于今天的 YYYY-MM-DD 日期。');
    verifiedAt = raw;
  } else if (value.verifiedAt !== undefined && value.verifiedAt !== null) fail('待核实资料不能填写核实日期。');
  return { reference, kind, verificationStatus, verifiedAt };
}

function ticketPrice(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !['currency', 'min', 'max', 'basis'].includes(key)) || value.currency !== 'CNY') fail('门票价格格式无效。');
  const min = number(value.min, '门票最低价', 0, 100000);
  const max = number(value.max, '门票最高价', 0, 100000);
  if (min > max || [min, max].some((n) => Math.abs(n * 100 - Math.round(n * 100)) > 0.000001)) fail('门票价格上下限或小数位无效。');
  return { currency: 'CNY', min, max, basis: text(value.basis, '门票适用范围', 500, true) };
}

export function validatePlace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('地点必须是对象。');
  if (Object.keys(value).some((key) => !FIELDS.has(key))) fail('地点包含未知字段，请使用导出文件中的字段。');
  const operation = value.operation;
  if (!['create', 'update'].includes(operation)) fail('operation 必须是 create 或 update。');
  const expectedVersion = operation === 'update' ? number(value.expectedVersion, 'expectedVersion', 1, 2147483646, true) : undefined;
  if (operation === 'create' && value.expectedVersion !== undefined) fail('新增记录不能携带 expectedVersion。');
  const scope = value.scope;
  if (!['city', 'campus'].includes(scope)) fail('scope 必须是 city 或 campus。');
  const category = text(value.category, '分类', 40, true);
  if (!(scope === 'city' ? CITY_CATEGORIES : CAMPUS_CATEGORIES).includes(category)) fail('分类不属于当前地点范围。');
  const interests = texts(value.interests, '兴趣标签', 6, 40);
  if (interests.some((tag) => !TAGS.includes(tag))) fail('兴趣标签无效。');
  const sources = Array.isArray(value.sources) ? value.sources.map(source) : [];
  if (!sources.length || sources.length > 10 || new Set(sources.map((item) => item.reference)).size !== sources.length) fail('每个地点必须有 1–10 条不重复的资料来源。');
  const result = { operation, ...(expectedVersion === undefined ? {} : { expectedVersion }),
    id: id(value.id, 'id'), scope, name: text(value.name, '名称', 200, true), category,
    aliases: texts(value.aliases, '别名', 30, 200), emoji: text(value.emoji ?? '📍', '图标', 20),
    visit: number(value.visit, '停留分钟数', category === '入口' ? 0 : 1, 1440, true),
    short: text(value.short, '简介', 1000), description: text(value.description, '介绍', 20000),
    highlights: texts(value.highlights, '看点', 30, 300), interests: interests.sort(),
    bestTime: text(value.bestTime, '最佳时间', 300), tips: text(value.tips, '提示', 3000),
    ticketPrice: ticketPrice(value.ticketPrice),
    address: text(value.address, '地址', 1000), ticketNote: text(value.ticketNote, '票价说明', 1000),
    openingHours: value.openingHours == null ? null : text(value.openingHours, '开放说明', 2000),
    bookingUrl: httpsUrl(value.bookingUrl, '预约地址'),
    mustSee: value.mustSee ?? false, sources: sources.sort((a, b) => a.reference.localeCompare(b.reference)),
  };
  if (typeof result.mustSee !== 'boolean') fail('mustSee 必须是布尔值。');
  if (scope === 'city') {
    if (value.campusId != null || value.x != null || value.y != null) fail('城市景点不能携带校园编号或示意坐标。');
    result.districtId = id(value.districtId, 'districtId');
    result.lng = number(value.lng, '经度', -180, 180);
    result.lat = number(value.lat, '纬度', -90, 90);
    result.coordinateSystem = value.coordinateSystem ?? 'unknown';
    if (!['gcj02', 'unknown'].includes(result.coordinateSystem)) fail('坐标须为 gcj02 或 unknown；不能把其他坐标系直接用于高德。');
  } else {
    if (value.districtId != null || value.lng != null || value.lat != null || value.coordinateSystem != null) fail('校园示意点不能混入城市经纬度。');
    result.campusId = id(value.campusId, 'campusId');
    result.x = number(value.x, '校园 x 坐标', -10000, 10000);
    result.y = number(value.y, '校园 y 坐标', -10000, 10000);
  }
  return result;
}

export function validateImport(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document) || document.schemaVersion !== 1 ||
      Object.keys(document).some((key) => !['schemaVersion', 'places'].includes(key)) ||
      !Array.isArray(document.places) || !document.places.length || document.places.length > 200) fail('文件须包含 schemaVersion:1 和 1–200 条 places 记录。');
  const records = document.places.map((place, index) => {
    try { return validatePlace(place); } catch (error) { fail(`第 ${index + 1} 条：${error.message}`); }
  });
  if (new Set(records.map((record) => record.id)).size !== records.length) fail('同一导入文件不能重复使用地点 id。');
  return records;
}
