// WGS84 -> GCJ02 subset adapted from wandergis/coordtransform (MIT).
// Copyright (c) 2015 记忆的残骸. See licenses/coordtransform-MIT.txt.
// Offline import only. A converted place centre is not a verified visitor entrance.
export function wgs84ToGcj02(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new Error('Invalid WGS84 coordinate');
  }
  if (!(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)) return [lng, lat];
  const x = lng - 105, y = lat - 35, pi = Math.PI;
  const waves = (terms) => terms.reduce((sum, [amplitude, angle]) => sum + amplitude * Math.sin(angle * pi), 0) * 2 / 3;
  let dy = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  dy += waves([[20, 6*x], [20, 2*x], [20, y], [40, y/3], [160, y/12], [320, y/30]]);
  let dx = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dx += waves([[20, 6*x], [20, 2*x], [20, x], [40, x/3], [150, x/12], [300, x/30]]);
  const radians = lat / 180 * pi;
  const eccentricity = 0.00669342162296594323, radius = 6378245;
  const magic = 1 - eccentricity * Math.sin(radians) ** 2;
  const root = Math.sqrt(magic);
  return [lng + dx * 180 / (radius / root * Math.cos(radians) * pi),
    lat + dy * 180 / ((radius * (1 - eccentricity)) / (magic * root) * pi)];
}
