import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const style = await readFile(new URL('../src/style.scss', import.meta.url), 'utf8');
const components = await readFile(new URL('../src/ui/components/index.tsx', import.meta.url), 'utf8');
const load = await readFile(new URL('../src/ui/load-controls.tsx', import.meta.url), 'utf8');

test('defines the shared viewer theme tokens', () => {
    for (const token of ['--ui-accent: #f60', '--ui-panel:', '--ui-border:', '--ui-text:', '--ui-radius:']) {
        assert.match(style, new RegExp(token));
    }
});

test('supports reduced motion, safe areas and opaque panel fallbacks', () => {
    assert.match(style, /prefers-reduced-motion/);
    assert.match(style, /safe-area-inset-bottom/);
    assert.match(style, /@supports not \(backdrop-filter/);
});

test('gives icon-only controls accessible names and tooltips', () => {
    assert.match(components, /export const IconButton/);
    assert.match(components, /setAttribute\('aria-label', label\)/);
    assert.match(components, /\.title = label/);
});

test('makes the file drop zone keyboard accessible', () => {
    assert.match(load, /role="button"/);
    assert.match(load, /tabIndex=\{0\}/);
    assert.match(load, /onKeyDown=/);
});
