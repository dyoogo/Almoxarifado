let db;

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
  const button = Array.from(allButtons).find(button => button.dataset.tab === tabId);
  button.classList.add("active");
}

document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
});

function addItem(category, name, description, quantity) {
  const transaction = db.transaction(["items"], "readwrite");
  const itemsStore = transaction.objectStore("items");

  itemsStore.add({
    category,
    name,
    description,
    quantity: parseInt(quantity, 10),
  });

  transaction.oncomplete = () => {
    if (category === "Estoque") renderStock();
    if (category === "Ferramentas") renderTools();
    populateItemDropdown();
  };
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

function getSearchTerm(selector) {
  const input = document.querySelector(selector);
  return input ? input.value.trim().toLowerCase() : "";
}

function renderStock() {
  renderItems("Estoque", "#stock-table tbody", getSearchTerm("#stock-search"));
}

function renderTools() {
  renderItems("Ferramentas", "#tools-table tbody", getSearchTerm("#tools-search"));
}

function matchesItemSearch(item, searchTerm) {
  if (!searchTerm) return true;
  return [item.name, item.description]
    .filter(Boolean)
    .some(value => value.toLowerCase().includes(searchTerm));
}

function matchesWithdrawalSearch(withdrawal, searchTerm) {
  if (!searchTerm) return true;
  const fields = [
    withdrawal.personName,
    withdrawal.itemName,
    withdrawal.itemType,
    withdrawal.status,
    String(withdrawal.quantity),
  ];

  return fields
    .filter(Boolean)
    .some(value => value.toLowerCase().includes(searchTerm));
}

function renderItems(category, tableSelector, searchTerm = "") {
  const transaction = db.transaction(["items"], "readonly");
  const itemsStore = transaction.objectStore("items");
  const tableBody = document.querySelector(tableSelector);
  tableBody.innerHTML = "";

  itemsStore.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;
      if (item.category === category && matchesItemSearch(item, searchTerm)) {
        const tr = document.createElement("tr");
        tr.dataset.id = item.id;

        ["name", "description", "quantity"].forEach(key => {
          const td = document.createElement("td");
          td.classList.add(key);
          td.textContent = item[key];
          tr.appendChild(td);
        });

        const tdStatus = document.createElement("td");
        tdStatus.textContent = item.quantity > 0 ? "Disponível" : "Indisponível";
        tdStatus.className = item.quantity > 0 ? "available" : "unavailable";
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
      }
      cursor.continue();
    }
  };

  transaction.oncomplete = () => {
    attachEditButtons(category, tableSelector);
  };
}

function removeItem(itemId, category) {
  const transaction = db.transaction(["items"], "readwrite");
  const itemsStore = transaction.objectStore("items");

  itemsStore.delete(itemId);

  transaction.oncomplete = () => {
    if (category === "Estoque") renderStock();
    if (category === "Ferramentas") renderTools();
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
    }
  };
}

document.querySelector("#register-withdrawal-form").addEventListener("submit", event => {
  event.preventDefault();
  const personName = document.querySelector("#person-name").value;
  const itemId = parseInt(document.querySelector("#withdraw-item-name").value, 10);
  const quantity = parseInt(document.querySelector("#withdraw-quantity").value, 10);

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
});

function renderWithdrawals() {
  const searchTerm = getSearchTerm("#withdrawals-search");
  const transaction = db.transaction(["withdrawals"], "readonly");
  const withdrawalsStore = transaction.objectStore("withdrawals");
  const tableBody = document.querySelector("#withdrawals-table tbody");
  tableBody.innerHTML = "";

  withdrawalsStore.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const withdrawal = cursor.value;
      if (!matchesWithdrawalSearch(withdrawal, searchTerm)) {
        cursor.continue();
        return;
      }
      const tr = document.createElement("tr");
      tr.dataset.id = withdrawal.id;

      // Define a cor de fundo com base no status
      let rowColor = "lightcoral";
      if (withdrawal.status === "Devolvido") {
        rowColor = "lightgreen";
      } else if (withdrawal.status === "Parcialmente devolvido") {
        rowColor = "moccasin";
      }
      tr.style.backgroundColor = rowColor;

      ["personName", "itemName", "itemType", "quantity", "date", "status"].forEach(key => {
        const td = document.createElement("td");
        td.textContent = withdrawal[key];
        if (key === "quantity") {
          td.classList.add("quantity-cell");
        }
        tr.appendChild(td);
      });

      const tdAction = document.createElement("td");

      const editButton = document.createElement("button");
      editButton.textContent = "Editar";
      editButton.classList.add("edit-withdrawal-btn");
      editButton.addEventListener("click", () => {
        const newQuantity = prompt(
          "Digite a nova quantidade retirada:",
          withdrawal.quantity
        );

        if (newQuantity !== null) {
          const parsedQuantity = parseInt(newQuantity, 10);
          if (!Number.isNaN(parsedQuantity) && parsedQuantity >= 0) {
            const isDevolution = confirm("Esta edição refere-se a uma devolução?");
            editWithdrawal(withdrawal.id, parsedQuantity, isDevolution);
          } else {
            alert("Informe um número válido para a quantidade.");
          }
        }
      });
      tdAction.appendChild(editButton);

      const returnButton = document.createElement("button");
      returnButton.textContent = withdrawal.status === "Devolvido" ? "Devolvido" : "Devolver";
      returnButton.disabled = withdrawal.status === "Devolvido";
      returnButton.addEventListener("click", () => returnItem(withdrawal.id));
      tdAction.appendChild(returnButton);

      const removeButton = document.createElement("button");
      removeButton.textContent = "Remover";
      removeButton.style.backgroundColor = "red";
      removeButton.style.color = "white";
      removeButton.style.border = "none";
      removeButton.style.padding = "0.5em";
      removeButton.style.marginLeft = "0.5em";
      removeButton.style.borderRadius = "5px";
      removeButton.addEventListener("click", () => removeWithdrawal(withdrawal.id));
      tdAction.appendChild(removeButton);

      tr.appendChild(tdAction);
      tableBody.appendChild(tr);
      cursor.continue();
    }
  };

}

function editWithdrawal(withdrawalId, newQuantity, isDevolution) {
  const transaction = db.transaction(["withdrawals", "items"], "readwrite");
  const withdrawalsStore = transaction.objectStore("withdrawals");
  const itemsStore = transaction.objectStore("items");

  const withdrawalRequest = withdrawalsStore.get(withdrawalId);

  withdrawalRequest.onsuccess = () => {
    const withdrawal = withdrawalRequest.result;
    const itemRequest = itemsStore.get(withdrawal.itemId);

    itemRequest.onsuccess = () => {
      const item = itemRequest.result;

      const originalQuantity = withdrawal.quantity;
      const difference = originalQuantity - newQuantity;

      if (isDevolution) {
        if (newQuantity > originalQuantity) {
          alert("A nova quantidade não pode ser maior que a retirada original.");
          return;
        }

        const returnedAmount = originalQuantity - newQuantity;
        if (returnedAmount > 0) {
          item.quantity += returnedAmount;
        }

        withdrawal.status = returnedAmount === originalQuantity
          ? "Devolvido"
          : returnedAmount > 0
            ? "Parcialmente devolvido"
            : withdrawal.status;
      } else if (difference !== 0) {
        if (difference < 0) {
          const additionalNeeded = Math.abs(difference);
          if (item.quantity < additionalNeeded) {
            alert("Quantidade indisponível para atualizar a retirada.");
            return;
          }
          item.quantity -= additionalNeeded;
        } else {
          item.quantity += difference;
        }
      }

      withdrawal.quantity = newQuantity;
      itemsStore.put(item);
      withdrawalsStore.put(withdrawal);

      renderWithdrawals();
      renderStock();
      renderTools();
    };
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
      renderStock();
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
  if (!dropdown) return;
  const currentValue = dropdown.value;

  dropdown.innerHTML = ""; // Limpar opções anteriores

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione um item";
  placeholder.disabled = true;
  placeholder.selected = true;
  dropdown.appendChild(placeholder);

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
    if (currentValue && dropdown.querySelector(`option[value="${currentValue}"]`)) {
      dropdown.value = currentValue;
    }
  };
}
initDatabase();
document.querySelector("#export-stock").addEventListener("click", () => saveStockAsJSON());

const stockSearchInput = document.querySelector("#stock-search");
if (stockSearchInput) {
  stockSearchInput.addEventListener("input", () => renderStock());
}

const toolsSearchInput = document.querySelector("#tools-search");
if (toolsSearchInput) {
  toolsSearchInput.addEventListener("input", () => renderTools());
}

const withdrawalsSearchInput = document.querySelector("#withdrawals-search");
if (withdrawalsSearchInput) {
  withdrawalsSearchInput.addEventListener("input", () => renderWithdrawals());
}

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



