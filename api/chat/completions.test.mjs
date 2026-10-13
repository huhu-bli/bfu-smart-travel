import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTrustedBrowserOrigin } from './completions.mjs';

test('Qwen proxy only accepts the published site and its own preview domain', () => {
  assert.equal(isTrustedBrowserOrigin('https://huhu-bli.github.io'), true);
  assert.equal(isTrustedBrowserOrigin('https://bfu-smart-travel.vercel.app'), true);
  assert.equal(
    isTrustedBrowserOrigin('https://bfu-smart-travel-git-fix-map-and-route-edit-h2642341596-4653.vercel.app'),
    true,
  );
  assert.equal(isTrustedBrowserOrigin('http://localhost:5173'), true);
  assert.equal(isTrustedBrowserOrigin('https://another-project.vercel.app'), false);
  assert.equal(isTrustedBrowserOrigin('https://bfu-smart-travel-git-demo-foreign-team.vercel.app'), false);
  assert.equal(isTrustedBrowserOrigin('http://localhost:8080'), false);
});
