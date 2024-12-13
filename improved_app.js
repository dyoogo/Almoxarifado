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

function renderStock() {
  renderItems("Estoque", "#stock-table tbody");
  
}

function renderTools() {
  renderItems("Ferramentas", "#tools-table tbody");
}

function renderItems(category, tableSelector) {
  const transaction = db.transaction(["items"], "readonly");
  const itemsStore = transaction.objectStore("items");
  const tableBody = document.querySelector(tableSelector);
  tableBody.innerHTML = "";

  itemsStore.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;
      if (item.category === category) {
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
  const transaction = db.transaction(["withdrawals"], "readonly");
  const withdrawalsStore = transaction.objectStore("withdrawals");
  const tableBody = document.querySelector("#withdrawals-table tbody");
  tableBody.innerHTML = "";

  withdrawalsStore.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const withdrawal = cursor.value;
      const tr = document.createElement("tr");

      // Define a cor de fundo com base no status
      tr.style.backgroundColor = withdrawal.status === "Devolvido" ? "lightgreen" : "lightcoral";

      ["personName", "itemName", "itemType", "quantity", "date", "status"].forEach(key => {
        const td = document.createElement("td");
        td.textContent = withdrawal[key];
        tr.appendChild(td);
      });

      const tdAction = document.createElement("td");

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

  transaction.oncomplete = () => {
    attachEditWithdrawalButtons();
  };
}

function attachEditWithdrawalButtons() {
  const table = document.querySelector("#withdrawals-table");
  table.querySelectorAll(".edit-withdrawal-btn").forEach(button => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      const withdrawalId = parseInt(row.dataset.id, 10);
      const newQuantity = prompt("Digite a nova quantidade retirada:", row.querySelector(".quantity").textContent);

      if (newQuantity !== null) {
        const isDevolution = confirm("Esta edição refere-se a uma devolução?");
        editWithdrawal(withdrawalId, parseInt(newQuantity, 10), isDevolution);
      }
    });
  });
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

      if (isDevolution) {
        item.quantity += withdrawal.quantity; // Devolver a quantidade
        withdrawal.status = "Devolvido";
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

  dropdown.innerHTML = ""; // Limpar opções anteriores

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



