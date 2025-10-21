const test = require('node:test');
const assert = require('node:assert/strict');
const AppUtils = require('../app_utils.js');

test('normalizeSearchTerm removes excess spacing and lowercases', () => {
  assert.equal(AppUtils.normalizeSearchTerm('  ExAmPle  '), 'example');
  assert.equal(AppUtils.normalizeSearchTerm(''), '');
});

test('itemMatchesSearch checks against multiple fields', () => {
  const item = { name: 'Parafuso', description: 'Aço Inoxidável', quantity: 10 };
  const nameTerm = AppUtils.normalizeSearchTerm('Para');
  const descTerm = AppUtils.normalizeSearchTerm('AÇO');
  const quantityTerm = AppUtils.normalizeSearchTerm('10');
  const missingTerm = AppUtils.normalizeSearchTerm('martelo');

  assert.equal(AppUtils.itemMatchesSearch(item, nameTerm), true);
  assert.equal(AppUtils.itemMatchesSearch(item, descTerm), true);
  assert.equal(AppUtils.itemMatchesSearch(item, quantityTerm), true);
  assert.equal(AppUtils.itemMatchesSearch(item, missingTerm), false);
});

test('isLowStock respects threshold', () => {
  assert.equal(AppUtils.isLowStock(3), true);
  assert.equal(AppUtils.isLowStock(6), false);
  assert.equal(AppUtils.isLowStock('2', 1), false);
});

test('getItemStatus maps quantities to labels and classes', () => {
  assert.deepEqual(AppUtils.getItemStatus(5), { label: 'Disponível', className: 'available' });
  assert.deepEqual(AppUtils.getItemStatus(0), { label: 'Indisponível', className: 'unavailable' });
  assert.deepEqual(AppUtils.getItemStatus('not a number'), { label: 'Indisponível', className: 'unavailable' });
});

test('calculateInventorySummary aggregates categories and withdrawals', () => {
  const items = [
    { category: 'Estoque', quantity: 10 },
    { category: 'Estoque', quantity: 2 },
    { category: 'Ferramentas', quantity: 1 },
  ];
  const withdrawals = [
    { status: 'Retirado' },
    { status: 'Devolvido' },
  ];

  const summary = AppUtils.calculateInventorySummary(items, withdrawals, 3);

  assert.deepEqual(summary.stock, { count: 2, quantity: 12, low: 1 });
  assert.deepEqual(summary.tools, { count: 1, quantity: 1, low: 1 });
  assert.deepEqual(summary.withdrawals, { total: 2, pending: 1 });
});

test('withdrawalMatchesFilters respects search term and pending only flag', () => {
  const withdrawal = {
    personName: 'Diogo Moura',
    itemName: 'Parafuso',
    itemType: 'Estoque',
    status: 'Retirado',
  };

  const personTerm = AppUtils.normalizeSearchTerm('Diogo');
  const wrongTerm = AppUtils.normalizeSearchTerm('martelo');

  assert.equal(AppUtils.withdrawalMatchesFilters(withdrawal, personTerm, false), true);
  assert.equal(AppUtils.withdrawalMatchesFilters(withdrawal, wrongTerm, false), false);
  assert.equal(AppUtils.withdrawalMatchesFilters(withdrawal, '', true), true);

  const returned = { ...withdrawal, status: 'Devolvido' };
  assert.equal(AppUtils.withdrawalMatchesFilters(returned, '', true), false);
});
