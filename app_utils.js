(function (globalScope, factory) {
  const utils = factory();

  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = utils;
  }

  if (globalScope && typeof globalScope === "object") {
    globalScope.AppUtils = utils;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const LOW_STOCK_THRESHOLD = 5;

  function normalizeSearchTerm(term) {
    return (term ?? "").toString().trim().toLowerCase();
  }

  function itemMatchesSearch(item, term, keys = ["name", "description", "quantity"]) {
    if (!term) return true;

    return keys.some(key => {
      const value = item?.[key];
      if (value === undefined || value === null) return false;
      return value.toString().toLowerCase().includes(term);
    });
  }

  function isLowStock(quantity, threshold = LOW_STOCK_THRESHOLD) {
    const parsed = Number(quantity);
    if (Number.isNaN(parsed)) return false;
    return parsed <= threshold;
  }

  function getItemStatus(quantity) {
    const parsed = Number(quantity);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return { label: "Indisponível", className: "unavailable" };
    }

    return { label: "Disponível", className: "available" };
  }

  function calculateCategoryTotals(items, threshold = LOW_STOCK_THRESHOLD) {
    return items.reduce(
      (acc, item) => {
        const quantity = Number(item?.quantity) || 0;

        return {
          count: acc.count + 1,
          quantity: acc.quantity + quantity,
          low: acc.low + (isLowStock(quantity, threshold) ? 1 : 0),
        };
      },
      { count: 0, quantity: 0, low: 0 }
    );
  }

  function splitItemsByCategory(items) {
    return items.reduce((acc, item) => {
      const category = item?.category ?? "Outros";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {});
  }

  function calculateInventorySummary(items, withdrawals, threshold = LOW_STOCK_THRESHOLD) {
    const groupedItems = splitItemsByCategory(items);
    const stockTotals = calculateCategoryTotals(groupedItems.Estoque ?? [], threshold);
    const toolsTotals = calculateCategoryTotals(groupedItems.Ferramentas ?? [], threshold);

    const totalWithdrawals = withdrawals.length;
    const pendingWithdrawals = withdrawals.filter(record => record.status !== "Devolvido").length;

    return {
      stock: stockTotals,
      tools: toolsTotals,
      withdrawals: {
        total: totalWithdrawals,
        pending: pendingWithdrawals,
      },
    };
  }

  function withdrawalMatchesFilters(withdrawal, term, pendingOnly) {
    const normalizedTerm = normalizeSearchTerm(term);
    const matchesTerm =
      !normalizedTerm ||
      ["personName", "itemName", "itemType"].some(key => {
        const value = withdrawal?.[key];
        return value ? value.toString().toLowerCase().includes(normalizedTerm) : false;
      });

    const matchesPending = !pendingOnly || withdrawal?.status !== "Devolvido";
    return matchesTerm && matchesPending;
  }

  return {
    LOW_STOCK_THRESHOLD,
    normalizeSearchTerm,
    itemMatchesSearch,
    isLowStock,
    getItemStatus,
    calculateCategoryTotals,
    calculateInventorySummary,
    withdrawalMatchesFilters,
  };
});
