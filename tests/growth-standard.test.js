import test from 'node:test';
import assert from 'node:assert/strict';
import { growthStandard, weightStandard, standardForMonth } from '../public/growth-standard-data.js';

test('卫健委身长标准保留男女童44个官方年龄点', () => {
  assert.equal(growthStandard.male.length, 44);
  assert.equal(growthStandard.female.length, 44);
  assert.deepEqual(standardForMonth('male', 0), {month:0,p3:47.6,p50:51.2,p97:54.8});
  assert.deepEqual(standardForMonth('female', 0), {month:0,p3:46.8,p50:50.3,p97:53.8});
  assert.equal(standardForMonth('male', 24).p50, 88.2);
  assert.equal(standardForMonth('female', 24).p50, 87.0);
  assert.equal(standardForMonth('male', 81).p50, 123.5);
  assert.equal(standardForMonth('female', 81).p50, 122.1);
  assert.equal(standardForMonth('male', 25), null);
  assert.equal(weightStandard.male.length, 44);
  assert.equal(weightStandard.female.length, 44);
  assert.equal(standardForMonth('male', 0, 'weight').p50, 3.5);
  assert.equal(standardForMonth('female', 24, 'weight').p50, 11.9);
});
