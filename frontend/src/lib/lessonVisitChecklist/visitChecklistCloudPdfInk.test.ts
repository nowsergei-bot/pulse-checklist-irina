import assert from 'node:assert/strict';
import test from 'node:test';
import { boostPdfFillOpacity } from './visitChecklistCloudPdfInk.ts';

test('boostPdfFillOpacity raises pale radar fills without clipping strong ones', () => {
  assert.ok(boostPdfFillOpacity(0.16) >= 0.55);
  assert.equal(boostPdfFillOpacity(0.6), 0.6);
  assert.equal(boostPdfFillOpacity(0), 0);
});
