const TIME_ZONE = 'Asia/Shanghai';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface WeatherPayload {
  current?: Record<string, unknown>;
  daily?: Record<string, unknown>;
}

const CAMPUS_LOCATION: WeatherLocation = {
  name: '北京林业大学',
  latitude: 40.0023,
  longitude: 116.3507,
  timezone: TIME_ZONE,
};

function numberAt(value: unknown, index: number): number | null {
  if (!Array.isArray(value)) return null;
  const item = value[index];
  return typeof item === 'number' && Number.isFinite(item) ? item : null;
}

function stringAt(value: unknown, index: number): string | null {
  if (!Array.isArray(value)) return null;
  const item = value[index];
  return typeof item === 'string' ? item : null;
}

async function requestJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('天气服务返回 HTTP ' + response.status + '。');
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('天气服务返回 HTTP')) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('天气服务请求超时。');
    }
    throw new Error('天气服务暂时不可用。');
  } finally {
    clearTimeout(timer);
  }
}

function todayInBeijing(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return year + '-' + month + '-' + day;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function resolveDate(rawDate: string): string {
  const value = rawDate.trim().toLowerCase();
  const today = todayInBeijing();
  if (!value || value === 'today' || value === '今天') return today;
  if (value === 'tomorrow' || value === '明天') return shiftDate(today, 1);
  if (value === 'day_after_tomorrow' || value === '后天') return shiftDate(today, 2);
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return value;
  return today;
}

function locationLooksLikeCampus(rawLocation: string): boolean {
  const value = rawLocation.trim().toLowerCase();
  return !value || ['北林', '北京林业大学', '北林校园', '校园', '校内'].some((item) => value.includes(item));
}

async function resolveLocation(rawLocation: string): Promise<WeatherLocation> {
  if (locationLooksLikeCampus(rawLocation)) return CAMPUS_LOCATION;
  const name = rawLocation.trim();
  const params = new URLSearchParams({ name, count: '1', language: 'zh', format: 'json' });
  const payload = await requestJson<{ results?: Array<Record<string, unknown>> }>(GEOCODING_URL + '?' + params);
  const result = payload.results?.[0];
  const latitude = typeof result?.latitude === 'number' ? result.latitude : null;
  const longitude = typeof result?.longitude === 'number' ? result.longitude : null;
  if (latitude === null || longitude === null) throw new Error('没有找到“' + name + '”的天气位置，请换成城市或景点名称。');
  const label = [result?.name, result?.admin1, result?.country]
    .filter((item) => typeof item === 'string' && item)
    .join('，');
  return {
    name: label || name,
    latitude,
    longitude,
    timezone: typeof result?.timezone === 'string' ? result.timezone : TIME_ZONE,
  };
}

export function weatherCodeLabel(code: number | null): string {
  if (code === null) return '天气情况未知';
  if (code === 0) return '晴';
  if (code === 1 || code === 2) return '少云或间晴';
  if (code === 3) return '阴';
  if ([45, 48].includes(code)) return '有雾';
  if ([51, 53, 55, 56, 57].includes(code)) return '毛毛雨';
  if ([61, 63, 65, 66, 67].includes(code)) return '雨';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪';
  if ([80, 81, 82].includes(code)) return '阵雨';
  if ([95, 96, 99].includes(code)) return '雷雨';
  return '多变天气';
}

function formatNumber(value: number | null, suffix = ''): string {
  return value === null ? '未知' : String(Math.round(value * 10) / 10) + suffix;
}

export async function fetchWeather(rawLocation: string, rawDate: string): Promise<Record<string, unknown>> {
  const location = await resolveLocation(rawLocation);
  const date = resolveDate(rawDate);
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
    timezone: location.timezone || TIME_ZONE,
    forecast_days: '7',
  });
  const payload = await requestJson<WeatherPayload>(FORECAST_URL + '?' + params);
  const daily = payload.daily ?? {};
  const dates = daily.time;
  const index = Array.isArray(dates) ? dates.indexOf(date) : -1;
  if (index < 0) throw new Error('天气预报暂时只提供未来 7 天，无法查询 ' + date + '。');

  const code = numberAt(daily.weather_code, index);
  const max = numberAt(daily.temperature_2m_max, index);
  const min = numberAt(daily.temperature_2m_min, index);
  const rainProbability = numberAt(daily.precipitation_probability_max, index);
  const precipitation = numberAt(daily.precipitation_sum, index);
  const windMax = numberAt(daily.wind_speed_10m_max, index);
  const rainy = (rainProbability ?? 0) >= 50 || (precipitation ?? 0) >= 0.5 || (code !== null && code >= 51);
  const advice = rainy
    ? '可能有降水，建议携带雨具；校园路线可优先安排室内或有遮蔽点位。'
    : '降水风险较低，适合安排户外游览；仍请根据实时变化调整路线。';

  const result: Record<string, unknown> = {
    location: location.name,
    date,
    summary: weatherCodeLabel(code) + '，' + formatNumber(min, '℃') + '–' + formatNumber(max, '℃') + '，降水概率 ' + formatNumber(rainProbability, '%'),
    forecast: {
      condition: weatherCodeLabel(code),
      weatherCode: code,
      temperatureMinC: min,
      temperatureMaxC: max,
      precipitationProbability: rainProbability,
      precipitationMm: precipitation,
      windSpeedMaxKmh: windMax,
      sunrise: stringAt(daily.sunrise, index),
      sunset: stringAt(daily.sunset, index),
    },
    advice,
    source: 'Open-Meteo Forecast API',
  };

  if (date === todayInBeijing() && payload.current) {
    result.current = {
      condition: weatherCodeLabel(typeof payload.current.weather_code === 'number' ? payload.current.weather_code : null),
      temperatureC: payload.current.temperature_2m ?? null,
      apparentTemperatureC: payload.current.apparent_temperature ?? null,
      precipitationMm: payload.current.precipitation ?? null,
      windSpeedKmh: payload.current.wind_speed_10m ?? null,
    };
  }
  return result;
}
