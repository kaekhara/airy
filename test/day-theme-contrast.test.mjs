import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8');
const dayRules = Array.from(html.matchAll(/body\[data-theme-mode="day"\]\s*\{([^}]+)\}/g), match => match[1]);
const tokens = new Map();
for (const rule of dayRules) {
  for (const [, name, value] of rule.matchAll(/(--[\w-]+)\s*:\s*(#[\da-f]{3,8})\s*(?:;|$)/gi)) {
    tokens.set(name, value);
  }
}

function luminance(hex) {
  let value = hex.slice(1);
  if (value.length === 3) value = value.split('').map(channel => channel + channel).join('');
  assert.equal(value.length, 6, `Expected an opaque hex color, received ${hex}`);
  const [r, g, b] = value.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('light theme keeps core text and primary action at WCAG AA contrast', () => {
  const foreground = tokens.get('--ink');
  const muted = tokens.get('--muted');
  const surface = tokens.get('--panel-solid');
  const accent = tokens.get('--accent');
  const accentInk = tokens.get('--accent-ink');
  for (const [name, value] of Object.entries({ foreground, muted, surface, accent, accentInk })) {
    assert.ok(value, `Light theme defines ${name}`);
  }
  assert.ok(contrast(foreground, surface) >= 4.5, 'body text must meet AA');
  assert.ok(contrast(muted, surface) >= 4.5, 'muted text must meet AA');
  assert.ok(contrast(accentInk, accent) >= 4.5, 'primary button text must meet AA');
});
