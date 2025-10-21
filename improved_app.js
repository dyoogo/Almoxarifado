let db;
const filters = {
  stock: "",
  tools: "",
  withdrawals: "",
  withdrawalsPendingOnly: false,
};

const utils = window.AppUtils;

if (!utils) {
  throw new Error("AppUtils não foi carregado corretamente.");
}

const {
  LOW_STOCK_THRESHOLD,
  normalizeSearchTerm,
  itemMatchesSearch,
  isLowStock,
  getItemStatus,
  calculateInventorySummary,
  withdrawalMatchesFilters,
} = utils;

const THEME_STORAGE_KEY = "almoxarifado-theme";

const themeToggleButton = document.querySelector("#toggle-theme");

function updateThemeToggleLabel() {
  if (!themeToggleButton) return;
  const isDark = document.body.classList.contains("dark-mode");
  themeToggleButton.textContent = isDark ? "Modo Claro" : "Modo Escuro";
}

function applyStoredTheme() {
  if (!themeToggleButton) return;
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "dark") {
    document.body.classList.add("dark-mode");
  }
  updateThemeToggleLabel();
}

function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
  updateThemeToggleLabel();
}

if (themeToggleButton) {
  themeToggleButton.addEventListener("click", toggleTheme);
  applyStoredTheme();
}

function initDatabase() {
  const request = indexedDB.open("AlmoxarifadoDB", 1);

  request.onupgradeneeded = event => {
    db = event.target.result;
    if (!db.objectStoreNames.contains("items")) {
      db.createObjectStore("items", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("withdrawals")) {
      db.createObjectStore("withdrawals", { keyPath: "id", autoIncrement: true });
    }
  };

  request.onsuccess = event => {
    db = event.target.result;
    renderStock();
    renderTools();
    renderWithdrawals();
    populateItemDropdown();
  };

  request.onerror = event => {
    console.error("Erro ao abrir o banco de dados:", event.target.errorCode);
  };
}

function switchTab(tabId) {
  const allTabs = document.querySelectorAll(".tab-content");
  const allButtons = document.querySelectorAll(".tab-button");

  allTabs.forEach(tab => tab.classList.remove("active"));
  allButtons.forEach(button => button.classList.remove("active"));

  document.getElementById(tabId).classList.add("active");
  const button = Array.from(allButtons).find(currentButton => currentButton.dataset.tab === tabId);
  if (button) {
    button.classList.add("active");
  }
}

document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
});

const stockSearchInput = document.querySelector("#stock-search");
if (stockSearchInput) {
  stockSearchInput.addEventListener("input", event => {
    filters.stock = normalizeSearchTerm(event.target.value);
    renderStock();
  });
}

const toolsSearchInput = document.querySelector("#tools-search");
if (toolsSearchInput) {
  toolsSearchInput.addEventListener("input", event => {
    filters.tools = normalizeSearchTerm(event.target.value);
    renderTools();
  });
}

const withdrawalsSearchInput = document.querySelector("#withdrawals-search");
if (withdrawalsSearchInput) {
  withdrawalsSearchInput.addEventListener("input", event => {
    filters.withdrawals = normalizeSearchTerm(event.target.value);
    renderWithdrawals();
  });
}

const withdrawalsPendingCheckbox = document.querySelector("#withdrawals-pending-only");
if (withdrawalsPendingCheckbox) {
  withdrawalsPendingCheckbox.addEventListener("change", event => {
    filters.withdrawalsPendingOnly = event.target.checked;
    renderWithdrawals();
  });
}

async function addItem(category, name, description, quantity) {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const parsedQuantity = parseInt(quantity, 10);

  if (!trimmedName || !trimmedDescription || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
    alert("Preencha todos os campos com valores válidos.");
    return;
  }

  let duplicated = false;
  try {
    duplicated = await checkDuplicateItemName(category, trimmedName);
  } catch (error) {
    console.error("Erro ao verificar duplicidade de itens:", error);
    alert("Não foi possível validar o item. Tente novamente.");
    return;
  }
  if (duplicated) {
    alert("Já existe um item cadastrado com esse nome nesta categoria.");
    return;
  }

  const transaction = db.transaction(["items"], "readwrite");
  const itemsStore = transaction.objectStore("items");

  itemsStore.add({
    category,
    name: trimmedName,
    description: trimmedDescription,
    quantity: parsedQuantity,
  });

  transaction.oncomplete = () => {
    if (category === "Estoque") renderStock();
    if (category === "Ferramentas") renderTools();
    populateItemDropdown();
  };

  transaction.onerror = event => {
    console.error("Erro ao salvar item:", event.target.error);
  };
}

function checkDuplicateItemName(category, name) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["items"], "readonly");
    const itemsStore = transaction.objectStore("items");
    let found = false;

    const request = itemsStore.openCursor();
    request.onsuccess = event => {
      const cursor = event.target.result;
      if (!cursor) {
        if (!found) resolve(false);
        return;
      }

      const item = cursor.value;
      if (item.category === category && item.name.toLowerCase() === name.toLowerCase()) {
        found = true;
        resolve(true);
        return;
      }

      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
}

document.querySelector("#add-stock-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = document.querySelector("#stock-name").value;
  const description = document.querySelector("#stock-description").value;
  const quantity = document.querySelector("#stock-quantity").value;
  addItem("Estoque", name, description, quantity);
  event.target.reset();
});

document.querySelector("#add-tools-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = document.querySelector("#tool-name").value;
  const description = document.querySelector("#tool-description").value;
  const quantity = document.querySelector("#tool-quantity").value;
  addItem("Ferramentas", name, description, quantity);
  event.target.reset();
});

function renderStock() {
  renderItems("Estoque", "#stock-table tbody", filters.stock);
}

function renderTools() {
  renderItems("Ferramentas", "#tools-table tbody", filters.tools);
}

function renderItems(category, tableSelector, searchTerm = "") {
  const transaction = db.transaction(["items"], "readonly");
  const itemsStore = transaction.objectStore("items");
  const tableBody = document.querySelector(tableSelector);
  tableBody.innerHTML = "";
  const normalizedSearch = normalizeSearchTerm(searchTerm);
  let hasResults = false;

  itemsStore.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;
      if (item.category === category) {
        const matchesSearch = itemMatchesSearch(item, normalizedSearch, [
          "name",
          "description",
          "quantity",
        ]);

        if (!matchesSearch) {
          cursor.continue();
          return;
        }

        const tr = document.createElement("tr");
        tr.dataset.id = item.id;

        if (isLowStock(item.quantity, LOW_STOCK_THRESHOLD)) {
          tr.classList.add("low-stock");
        }

        ["name", "description", "quantity"].forEach(key => {
          const td = document.createElement("td");
          td.classList.add(key);
          td.textContent = item[key];
          tr.appendChild(td);
        });

        const tdStatus = document.createElement("td");
        const { label: statusLabel, className: statusClass } = getItemStatus(item.quantity);
        tdStatus.textContent = statusLabel;
        tdStatus.className = statusClass;
        tr.appendChild(tdStatus);

        // Botão para editar
        const tdAction = document.createElement("td");
        const editButton = document.createElement("button");
        editButton.textContent = "Editar";
        editButton.classList.add("edit-btn");
        tdAction.appendChild(editButton);

        // Botão para remover
        const removeButton = document.createElement("button");
        removeButton.textContent = "Remover";
        removeButton.classList.add("remove-btn");
        removeButton.addEventListener("click", () => removeItem(item.id, category));
        tdAction.appendChild(removeButton);

        tr.appendChild(tdAction);
        tableBody.appendChild(tr);
        hasResults = true;
      }
      cursor.continue();
    }
  };

  transaction.oncomplete = () => {
    attachEditButtons(category, tableSelector);
    if (!hasResults) {
      showEmptyState(tableBody, "Nenhum item encontrado.");
    }
    updateSummary();
  };
}

function removeItem(itemId, category) {
  const transaction = db.transaction(["items"], "readwrite");
  const itemsStore = transaction.objectStore("items");

  itemsStore.delete(itemId);

  transaction.oncomplete = () => {
    if (category === "Estoque") renderStock();
    if (category === "Ferramentas") renderTools();
    populateItemDropdown();
  };
}


function attachEditButtons(category, tableSelector) {
  const table = document.querySelector(tableSelector);
  table.querySelectorAll(".edit-btn").forEach(button => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      const itemId = parseInt(row.dataset.id, 10);
      const newDescription = prompt("Digite a nova descrição:", row.querySelector(".description").textContent);
      const newQuantity = prompt("Digite a nova quantidade:", row.querySelector(".quantity").textContent);

      if (newDescription !== null && newQuantity !== null) {
        editItem(itemId, newDescription, newQuantity);
      }
    });
  });
}

function editItem(itemId, newDescription, newQuantity) {
  const transaction = db.transaction(["items"], "readwrite");
  const itemsStore = transaction.objectStore("items");

  const itemRequest = itemsStore.get(itemId);
  itemRequest.onsuccess = () => {
    const item = itemRequest.result;
      if (item) {
        item.description = newDescription;
        item.quantity = parseInt(newQuantity, 10);
        itemsStore.put(item);

        if (item.category === "Estoque") renderStock();
        if (item.category === "Ferramentas") renderTools();
        populateItemDropdown();
      }
  };
}

document.querySelector("#register-withdrawal-form").addEventListener("submit", event => {
  event.preventDefault();
  const personName = document.querySelector("#person-name").value.trim();
  const itemSelect = document.querySelector("#withdraw-item-name");
  const itemIdValue = itemSelect.value;
  const quantity = parseInt(document.querySelector("#withdraw-quantity").value, 10);

  if (!personName) {
    alert("Informe o nome da pessoa responsável pela retirada.");
    return;
  }

  if (!itemIdValue) {
    alert("Selecione um item válido para a retirada.");
    return;
  }

  if (Number.isNaN(quantity) || quantity <= 0) {
    alert("Informe uma quantidade válida para a retirada.");
    return;
  }

  const itemId = parseInt(itemIdValue, 10);

  const transaction = db.transaction(["items", "withdrawals"], "readwrite");
  const itemsStore = transaction.objectStore("items");
  const withdrawalsStore = transaction.objectStore("withdrawals");

  const itemRequest = itemsStore.get(itemId);

  itemRequest.onsuccess = () => {
    const item = itemRequest.result;

    if (item && item.quantity >= quantity) {
      item.quantity -= quantity;
      itemsStore.put(item);

      withdrawalsStore.add({
        personName,
        itemId,
        itemName: item.name,
        itemType: item.category,
        quantity,
        date: new Date().toLocaleString(),
        status: "Retirado",
      });

      renderWithdrawals();
      renderStock();
      renderTools();
      populateItemDropdown();
    } else {
      alert("Quantidade indisponível para retirada.");
    }
  };

  event.target.reset();
  itemSelect.value = "";
});

function renderWithdrawals() {
  const transaction = db.transaction(["withdrawals"], "readonly");
  const withdrawalsStore = transaction.objectStore("withdrawals");
  const tableBody = document.querySelector("#withdrawals-table tbody");
  tableBody.innerHTML = "";
  let hasResults = false;

  withdrawalsStore.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const withdrawal = cursor.value;

      if (withdrawalMatchesFilters(withdrawal, filters.withdrawals, filters.withdrawalsPendingOnly)) {
        const tr = document.createElement("tr");
        tr.dataset.id = withdrawal.id;
        tr.classList.add(withdrawal.status === "Devolvido" ? "returned" : "withdrawn");

        ["personName", "itemName", "itemType", "quantity", "date"].forEach(key => {
          const td = document.createElement("td");
          td.textContent = withdrawal[key];
          tr.appendChild(td);
        });

        const statusTd = document.createElement("td");
        statusTd.textContent = withdrawal.status;
        statusTd.classList.add(withdrawal.status === "Devolvido" ? "status-devolvido" : "status-retirado");
        tr.appendChild(statusTd);

        const tdAction = document.createElement("td");

        const returnButton = document.createElement("button");
        returnButton.textContent = withdrawal.status === "Devolvido" ? "Devolvido" : "Devolver";
        returnButton.disabled = withdrawal.status === "Devolvido";
        returnButton.addEventListener("click", () => returnItem(withdrawal.id));
        tdAction.appendChild(returnButton);

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remover";
        removeButton.classList.add("remove-btn");
        removeButton.addEventListener("click", () => removeWithdrawal(withdrawal.id));
        tdAction.appendChild(removeButton);

        tr.appendChild(tdAction);
        tableBody.appendChild(tr);
        hasResults = true;
      }
      cursor.continue();
    }
  };

  transaction.oncomplete = () => {
    if (!hasResults) {
      showEmptyState(tableBody, "Nenhum registro encontrado.");
    }
    updateSummary();
  };
}

function returnItem(withdrawalId) {
  const transaction = db.transaction(["withdrawals", "items"], "readwrite");
  const withdrawalsStore = transaction.objectStore("withdrawals");
  const itemsStore = transaction.objectStore("items");

  const withdrawalRequest = withdrawalsStore.get(withdrawalId);
  withdrawalRequest.onsuccess = () => {
    const withdrawal = withdrawalRequest.result;
    const itemRequest = itemsStore.get(withdrawal.itemId);

    itemRequest.onsuccess = () => {
      const item = itemRequest.result;
      item.quantity += withdrawal.quantity;
      withdrawal.status = "Devolvido";

      withdrawalsStore.put(withdrawal);
      itemsStore.put(item);

      renderWithdrawals();
      if (item.category === "Estoque") {
        renderStock();
      } else {
        renderTools();
      }
    };
  };
}

function removeWithdrawal(id) {
  const transaction = db.transaction(["withdrawals"], "readwrite");
  const withdrawalsStore = transaction.objectStore("withdrawals");
  withdrawalsStore.delete(id);

  transaction.oncomplete = () => {
    renderWithdrawals();
  };
}

function populateItemDropdown() {
  const transaction = db.transaction(["items"], "readonly");
  const itemsStore = transaction.objectStore("items");
  const dropdown = document.querySelector("#withdraw-item-name");

  const previousValue = dropdown.value;
  dropdown.innerHTML = ""; // Limpar opções anteriores

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "Selecione um item";
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  dropdown.appendChild(placeholderOption);

  itemsStore.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      dropdown.appendChild(option);
      cursor.continue();
    }
  };

  transaction.oncomplete = () => {
    if (previousValue && dropdown.querySelector(`option[value="${previousValue}"]`)) {
      dropdown.value = previousValue;
    } else {
      dropdown.value = "";
    }

    const submitButton = document.querySelector("#register-withdrawal-form button[type="submit"]");
    if (submitButton) {
      const hasItems = dropdown.options.length > 1;
      submitButton.disabled = !hasItems;
      submitButton.title = hasItems ? "" : "Cadastre itens para permitir retiradas.";
    }
  };
}
initDatabase();
document.querySelector("#export-stock").addEventListener("click", () => saveStockAsJSON());

function exportStock() {
  const transaction = db.transaction(["items"], "readonly");
  const itemsStore = transaction.objectStore("items");
  const stockData = [];

  itemsStore.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;
      if (item.category === "Estoque") {
        stockData.push([item.name, item.description, item.quantity]);
      }
      cursor.continue();
    } else {
      const ws = XLSX.utils.aoa_to_sheet([
        ["Nome", "Descrição", "Quantidade"],
        ...stockData
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Estoque");
      XLSX.writeFile(wb, "estoque.xlsx");
    }
  };
}
function showEmptyState(tableBody, message) {
  const emptyRow = document.createElement("tr");
  const emptyCell = document.createElement("td");
  const columns = tableBody.closest("table").querySelectorAll("th").length || 1;
  emptyCell.colSpan = columns;
  emptyCell.textContent = message;
  emptyCell.classList.add("empty-state");
  emptyRow.appendChild(emptyCell);
  tableBody.appendChild(emptyRow);
}

function getAllRecords(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const results = [];

    store.openCursor().onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

async function updateSummary() {
  if (!db) return;

  const [items, withdrawals] = await Promise.all([
    getAllRecords("items"),
    getAllRecords("withdrawals"),
  ]);

  const summary = calculateInventorySummary(items, withdrawals, LOW_STOCK_THRESHOLD);

  const summaryMap = {
    "stock-total-items": summary.stock.count,
    "stock-total-quantity": summary.stock.quantity,
    "stock-low-count": summary.stock.low,
    "tools-total-items": summary.tools.count,
    "tools-total-quantity": summary.tools.quantity,
    "tools-low-count": summary.tools.low,
    "withdrawals-total": summary.withdrawals.total,
    "withdrawals-pending": summary.withdrawals.pending,
  };

  Object.entries(summaryMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });
}

function saveStockAsJSON() {
  const transaction = db.transaction(["items"], "readonly");
  const itemsStore = transaction.objectStore("items");
  const stockData = [];

  itemsStore.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;

      if (item.category === "Estoque") {
        stockData.push({
          name: item.name || "Nome não disponível",
          description: item.description || "Descrição não disponível",
          quantity: item.quantity !== undefined ? item.quantity : 0,
        });
      }
      cursor.continue();
    } else {
      // Salvar o arquivo JSON localmente
      const jsonContent = JSON.stringify(stockData, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "estoque.json";
      link.click();
    }
  };
}

// Chame esta função para gerar o JSON
//saveStockAsJSON();



