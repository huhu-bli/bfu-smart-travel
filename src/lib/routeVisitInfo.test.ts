import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import BeijingRouteResult from '../components/BeijingRouteResult';
import { BEIJING_PLACES } from '../data/beijingPlaces';
import { PACES } from '../data/interests';
import { buildBeijingRoute, beijingRouteToText } from './beijingPlanner';

const place = { ...BEIJING_PLACES[0], openingHours: '测试公告：指定日期临时闭馆。', bookingUrl: 'https://example.com/visit' };
const options = { scope: 'beijing' as const, interests: ['culture' as const], minutes: 480,
  pace: PACES[1], travelMode: 'mixed' as const, districtIds: [], includePlaceIds: [place.id], preserveSelectedStops: true };
const html = (plan: ReturnType<typeof buildBeijingRoute>) => renderToString(createElement(BeijingRouteResult,
  { plan, options, onOpenMap: () => {}, onEditRoute: () => {} }));

test('route display and copied itinerary retain opening notices without implying calendar or ticket validation', () => {
  const plan = buildBeijingRoute(options, [place]);
  assert.match(html(plan), /指定日期临时闭馆/);
  assert.match(html(plan), /https:\/\/example.com\/visit/);
  assert.match(html(plan), /尚未校验出游日期/);
  assert.match(beijingRouteToText(plan), /指定日期临时闭馆/);
  assert.match(beijingRouteToText(plan), /预约余票/);
});

test('malformed optional visit fields in an old cached route cannot break rendering or create unsafe links', () => {
  const badPlace = { ...place, openingHours: {}, bookingUrl: 'javascript:alert(1)' };
  const plan = buildBeijingRoute(options, [badPlace]);
  assert.match(html(plan), /尚未核实/);
  assert.doesNotMatch(html(plan), /javascript:/);
  assert.doesNotThrow(() => beijingRouteToText(plan));
});
