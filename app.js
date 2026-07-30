let db;
let myChart = null;
let currentFileBlob = null;
const BUDGET_LIMIT = 10000000;

// Khởi tạo IndexedDB lưu ảnh hóa đơn
const request = indexedDB.open("MoneyMasterPro_V3", 1);
request.onupgradeneeded = function(e) {
    db = e.target.result;
    if (!db.objectStoreNames.contains("receipts")) {
        db.createObjectStore("receipts", { keyPath: "id" });
    }
};
request.onsuccess = function(e) { 
    db = e.target.result; 
    loadAllData();
};

// Hàm định dạng số tiền tự động (Thêm dấu chấm phân cách hàng nghìn)
function formatCurrencyInput(input) {
    let value = input.value.replace(/\D/g, "");
    if (value) {
        value = parseInt(value, 10).toLocaleString('vi-VN');
    }
    input.value = value;
}

// Hàm lấy giá trị thực từ ô input có dấu chấm
function getRawAmount(elementId) {
    const val = document.getElementById(elementId).value;
    return parseInt(val.replace(/\./g, ""), 10) || 0;
}

function unlockApp() {
    const pin = document.getElementById('pin-code').value;
    if (pin === '1234') {
        document.getElementById('lock-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'flex';
        loadAllData();
    } else { alert("Mã PIN sai! (Mặc định: 1234)"); }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-menu'));
    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active-menu');
}

function openModal(id) { 
    document.getElementById(id).style.display = 'block'; 
    if(id === 'tx-modal') {
        document.getElementById('tx-type').value = 'expense';
        toggleTypeColor();
    }
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function toggleTypeColor() {
    const type = document.getElementById('tx-type').value;
    const amountInput = document.getElementById('total-amount');
    if(type === 'income') {
        amountInput.style.color = '#166534';
        amountInput.style.backgroundColor = '#dcfce7';
        document.getElementById('budget-warning').style.display = 'none';
    } else {
        amountInput.style.color = '#991b1b';
        amountInput.style.backgroundColor = '#fee2e2';
        checkBudget();
    }
}

function checkBudget() {
    const type = document.getElementById('tx-type').value;
    if (type === 'income') return;
    const currentInput = getRawAmount('total-amount');
    const warningDiv = document.getElementById('budget-warning');
    
    if (currentInput >= BUDGET_LIMIT) {
        warningDiv.innerText = "🚨 Vượt 100% ngân sách 1 lần chi!";
        warningDiv.className = "warning red";
    } else if (currentInput >= BUDGET_LIMIT * 0.8) {
        warningDiv.innerText = "⚠️ Chi phí khá cao, hãy cân nhắc!";
        warningDiv.className = "warning yellow";
    } else {
        warningDiv.className = "warning";
        warningDiv.style.display = 'none';
    }
}

// Xử lý OCR Hóa đơn
document.getElementById('receipt-upload').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    currentFileBlob = file;
    document.getElementById('receipt-thumb').style.display = 'block';
    document.getElementById('receipt-thumb').src = URL.createObjectURL(file);
    document.getElementById('ocr-loading').style.display = 'block';
    try {
        const worker = await Tesseract.createWorker('vie');
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        const totalMatch = text.match(/(Tổng tiền|Total|Thanh toán)[\s:.-]*([\d,.]+)/i);
        const taxIdMatch = text.match(/MST[\s:.-]*([0-9-]{10,14})/i);
        if (totalMatch) {
            const rawVal = totalMatch[2].replace(/[.,]/g, '');
            document.getElementById('total-amount').value = parseInt(rawVal, 10).toLocaleString('vi-VN');
        }
        if (taxIdMatch) document.getElementById('vendor-taxid').value = taxIdMatch[1];
        document.getElementById('product-list').value = "--- AI Đọc Hóa Đơn ---\n" + text;
        checkBudget();
    } catch (err) {
        alert("Lỗi khi phân tích ảnh.");
    } finally {
        document.getElementById('ocr-loading').style.display = 'none';
    }
});

// Lưu giao dịch
function saveTransaction() {
    const amount = getRawAmount('total-amount');
    if (!amount) { alert("Vui lòng nhập số tiền!"); return; }

    const txId = Date.now().toString();
    const txData = {
        id: txId,
        type: document.getElementById('tx-type').value,
        date: new Date().toLocaleDateString('vi-VN'),
        vendor: document.getElementById('vendor-name').value || (document.getElementById('tx-type').value === 'income' ? 'Nguồn thu khác' : 'Mua sắm chung'),
        total: amount,
        payment: document.getElementById('payment-method').value
    };

    let txs = JSON.parse(localStorage.getItem('transactions')) || [];
    txs.push(txData);
    localStorage.setItem('transactions', JSON.stringify(txs));

    if (currentFileBlob && db) {
        const transaction = db.transaction(["receipts"], "readwrite");
        transaction.objectStore("receipts").put({ id: txId, file: currentFileBlob });
    }

    alert("✅ Lưu thành công!");
    closeModal('tx-modal');
    document.querySelectorAll('#tx-modal input, #tx-modal textarea').forEach(el => el.value = '');
    document.getElementById('receipt-thumb').style.display = 'none';
    currentFileBlob = null;
    renderTransactions();
}

// Bộ lọc & Render Giao dịch
function clearFilter() {
    if(document.getElementById('month-filter')) document.getElementById('month-filter').value = '';
    if(document.getElementById('year-filter')) document.getElementById('year-filter').value = '';
    renderTransactions();
}

function renderTransactions() {
    const allTxs = JSON.parse(localStorage.getItem('transactions')) || [];
    const monthFilter = document.getElementById('month-filter') ? document.getElementById('month-filter').value : '';
    const yearFilter = document.getElementById('year-filter') ? document.getElementById('year-filter').value : '';
    
    let txs = allTxs;
    if (monthFilter) {
        const [filterYear, filterMonth] = monthFilter.split('-');
        txs = allTxs.filter(tx => {
            const dateParts = tx.date.split('/');
            return dateParts.length === 3 && dateParts[1].padStart(2, '0') === filterMonth && dateParts[2] === filterYear;
        });
    } else if (yearFilter) {
        txs = allTxs.filter(tx => {
            const dateParts = tx.date.split('/');
            return dateParts.length === 3 && dateParts[2] === yearFilter;
        });
    }

    let totalIncome = 0;
    let totalExpense = 0;
    const tbody = document.getElementById('tx-table');
    const recentList = document.getElementById('recent-list');
    if (tbody) tbody.innerHTML = '';
    if (recentList) recentList.innerHTML = '';
    
    txs.forEach((tx) => {
        if (tx.type === 'income') totalIncome += tx.total;
        else totalExpense += tx.total;

        const isIncome = tx.type === 'income';
        const amountText = isIncome ? `+${tx.total.toLocaleString('vi-VN')}` : `-${tx.total.toLocaleString('vi-VN')}`;
        const amountClass = isIncome ? 'text-green' : 'text-red';
        const typeBadge = isIncome ? '<span class="bg-green">Thu nhập</span>' : '<span class="bg-red">Chi tiêu</span>';
        const originalIndex = allTxs.findIndex(t => t.id === tx.id);

        if (tbody) {
            tbody.innerHTML += `<tr>
                <td>${tx.date}</td>
                <td>${typeBadge}</td>
                <td><strong>${tx.vendor}</strong></td>
                <td class="${amountClass}"><strong>${amountText} đ</strong></td>
                <td>${tx.payment}</td>
                <td><button class="btn-secondary" style="padding: 4px 8px; font-size:12px;" onclick="viewReceipt('${tx.id}')">📷 Xem</button></td>
                <td><button class="btn-danger" onclick="deleteTransaction(${originalIndex}, '${tx.id}')">Xóa</button></td>
            </tr>`;
        }
    });

    const periodSavings = totalIncome - totalExpense;
    
    // Tính số dư khả dụng tổng cộng (Tổng Thu - Tổng Chi toàn bộ lịch sử)
    let globalIncome = 0, globalExpense = 0;
    allTxs.forEach(tx => {
        if (tx.type === 'income') globalIncome += tx.total;
        else globalExpense += tx.total;
    });
    const cumulativeBalance = globalIncome - globalExpense;

    // Lấy 5 giao dịch gần đây cho Dashboard
    const recentSlice = txs.slice(-5).reverse();
    recentSlice.forEach(tx => {
        const isIncome = tx.type === 'income';
        const amountText = isIncome ? `+${tx.total.toLocaleString('vi-VN')}` : `-${tx.total.toLocaleString('vi-VN')}`;
        const amountClass = isIncome ? 'text-green' : 'text-red';
        if (recentList) {
            recentList.innerHTML += `<li>
                <span>${tx.vendor} (${tx.date})</span>
                <strong class="${amountClass}">${amountText} đ</strong>
            </li>`;
        }
    });

    // Hiển thị ra Banner Tổng quan
    document.getElementById('total-income').innerText = totalIncome.toLocaleString('vi-VN') + ' đ';
    document.getElementById('total-expense').innerText = totalExpense.toLocaleString('vi-VN') + ' đ';
    document.getElementById('period-savings').innerText = periodSavings.toLocaleString('vi-VN') + ' đ';
    document.getElementById('total-balance').innerText = cumulativeBalance.toLocaleString('vi-VN') + ' đ';

    const insightBox = document.getElementById('ai-insight');
    if (insightBox) {
        if (txs.length === 0) {
            insightBox.innerText = "🤖 AI: Không có giao dịch nào trong khoảng thời gian này.";
            insightBox.style.borderLeftColor = "#cbd5e1";
            insightBox.style.backgroundColor = "#f8fafc";
        } else if (periodSavings < 0) {
            insightBox.innerText = `🚨 CẢNH BÁO AI: Kỳ này bạn đang âm ${Math.abs(periodSavings).toLocaleString('vi-VN')} đ!`;
            insightBox.style.borderLeftColor = "#ef4444";
            insightBox.style.backgroundColor = "#fef2f2";
        } else {
            insightBox.innerText = `💡 AI Thống kê: Kỳ này sau khi trừ chi tiêu, bạn còn dư ${periodSavings.toLocaleString('vi-VN')} đ có thể trích sang Quỹ Tiết Kiệm riêng.`;
            insightBox.style.borderLeftColor = "#10b981";
            insightBox.style.backgroundColor = "#ecfdf5";
        }
    }

    updateChart(totalIncome, totalExpense);
}

function deleteTransaction(index, txId) {
    if(confirm("Bạn có chắc muốn xóa giao dịch này?")) {
        let txs = JSON.parse(localStorage.getItem('transactions')) || [];
        txs.splice(index, 1);
        localStorage.setItem('transactions', JSON.stringify(txs));
        if (db) {
            db.transaction(["receipts"], "readwrite").objectStore("receipts").delete(txId);
        }
        renderTransactions();
    }
}

function viewReceipt(id) {
    const transaction = db.transaction(["receipts"]);
    const request = transaction.objectStore("receipts").get(id);
    request.onsuccess = function() {
        if(request.result && request.result.file) {
            window.open(URL.createObjectURL(request.result.file), '_blank');
        } else {
            alert("Không có hóa đơn đính kèm!");
        }
    };
}

// XUẤT & NHẬP DỮ LIỆU JSON
function exportJSON() {
    const backupData = {
        transactions: JSON.parse(localStorage.getItem('transactions')) || [],
        accounts: JSON.parse(localStorage.getItem('accounts')) || [],
        savings: JSON.parse(localStorage.getItem('savings')) || [],
        assets: JSON.parse(localStorage.getItem('assets')) || [],
        debts: JSON.parse(localStorage.getItem('debts')) || [],
        exportDate: new Date().toLocaleDateString('vi-VN')
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `MoneyMaster_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = JSON.parse(e.target.result);
            if (content.transactions) localStorage.setItem('transactions', JSON.stringify(content.transactions));
            if (content.accounts) localStorage.setItem('accounts', JSON.stringify(content.accounts));
            if (content.savings) localStorage.setItem('savings', JSON.stringify(content.savings));
            if (content.assets) localStorage.setItem('assets', JSON.stringify(content.assets));
            if (content.debts) localStorage.setItem('debts', JSON.stringify(content.debts));
            
            alert("✅ Khôi phục dữ liệu từ file JSON thành công!");
            loadAllData();
        } catch (err) {
            alert("❌ Lỗi: File JSON không hợp lệ!");
        }
    };
    reader.readAsText(file);
}

function exportExcel() {
    let txs = JSON.parse(localStorage.getItem('transactions')) || [];
    let csv = "Ngày,Loại,Cửa Hàng,Số Tiền,Thanh Toán\n";
    txs.forEach(tx => { 
        csv += `${tx.date},${tx.type === 'income' ? 'Thu' : 'Chi'},${tx.vendor},${tx.total},${tx.payment}\n`; 
    });
    let hiddenElement = document.createElement('a');
    hiddenElement.href = 'data:text/csv;charset=utf-8,%EF%BB%BF' + encodeURI(csv);
    hiddenElement.target = '_blank';
    hiddenElement.download = 'Lich_Su_Thu_Chi.csv';
    hiddenElement.click();
}

function updateChart(income, expense) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart != null) { myChart.destroy(); }
    if(income === 0 && expense === 0) {
        myChart = new Chart(ctx, {
            type: 'pie',
            data: { labels: ['Chưa có dữ liệu'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'] }] }
        });
        return;
    }
    myChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Thu nhập', 'Chi tiêu'],
            datasets: [{ data: [income, expense], backgroundColor: ['#4ade80', '#f87171'], borderWidth: 1 }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

// Quản lý Tài khoản, Quỹ Tiết Kiệm riêng biệt (tự động trừ số dư thu nhập), Tài sản, Công nợ
function saveAccount() {
    const name = document.getElementById('acc-name').value;
    const type = document.getElementById('acc-type').value;
    const balance = getRawAmount('acc-balance');
    if (!name || isNaN(balance)) return alert("Vui lòng nhập đủ thông tin!");
    let accounts = JSON.parse(localStorage.getItem('accounts')) || [];
    accounts.push({ id: Date.now(), name, type, balance: balance });
    localStorage.setItem('accounts', JSON.stringify(accounts));
    closeModal('account-modal');
    document.getElementById('acc-name').value = '';
    document.getElementById('acc-balance').value = '';
    renderAccounts();
}

function renderAccounts() {
    const accounts = JSON.parse(localStorage.getItem('accounts')) || [];
    const tbody = document.getElementById('account-list');
    if (!tbody) return;
    tbody.innerHTML = accounts.map((acc, index) => `
        <tr><td><strong>${acc.name}</strong></td><td>${acc.type}</td><td class="text-green"><strong>${acc.balance.toLocaleString('vi-VN')} đ</strong></td><td><button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteData('accounts', ${index}, renderAccounts)">Xóa</button></td></tr>
    `).join('');
}

// Xử lý Quỹ Tiết Kiệm Riêng Biệt (Tự động trừ vào số dư tổng thu)
function saveSavingManual() {
    const desc = document.getElementById('svg-desc').value;
    const amount = getRawAmount('svg-amount');
    if (!desc || !amount) return alert("Vui lòng nhập đầy đủ mô tả và số tiền tiết kiệm!");
    
    // 1. Lưu vào danh sách Quỹ Tiết Kiệm
    let savings = JSON.parse(localStorage.getItem('savings')) || [];
    savings.push({
        id: Date.now(),
        date: new Date().toLocaleDateString('vi-VN'),
        desc: desc,
        amount: amount
    });
    localStorage.setItem('savings', JSON.stringify(savings));

    // 2. Tự động ghi nhận một khoản trừ (chi phí/trích quỹ) vào danh sách giao dịch để trừ trực tiếp trên tổng thu/số dư
    let txs = JSON.parse(localStorage.getItem('transactions')) || [];
    txs.push({
        id: 'saving_' + Date.now(),
        type: 'expense',
        date: new Date().toLocaleDateString('vi-VN'),
        vendor: 'Trích quỹ tiết kiệm: ' + desc,
        total: amount,
        payment: 'Tiết kiệm'
    });
    localStorage.setItem('transactions', JSON.stringify(txs));

    closeModal('saving-modal');
    document.getElementById('svg-desc').value = '';
    document.getElementById('svg-amount').value = '';
    
    loadAllData();
    alert("✅ Đã thêm vào quỹ tiết kiệm và trừ thành công khỏi số dư khả dụng!");
}

function renderSavings() {
    const savings = JSON.parse(localStorage.getItem('savings')) || [];
    const tbody = document.getElementById('saving-list');
    if (!tbody) return;
    
    let totalSavingsFund = 0;
    tbody.innerHTML = savings.map((item, index) => {
        totalSavingsFund += item.amount;
        return `
            <tr>
                <td>${item.date}</td>
                <td><strong>${item.desc}</strong></td>
                <td class="text-green"><strong>+${item.amount.toLocaleString('vi-VN')} đ</strong></td>
                <td><button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteData('savings', ${index}, renderSavings)">Xóa</button></td>
            </tr>
        `;
    }).join('');

    document.getElementById('total-savings-fund').innerText = totalSavingsFund.toLocaleString('vi-VN') + ' đ';
}

function saveAsset() {
    const name = document.getElementById('ast-name').value;
    const type = document.getElementById('ast-type').value;
    const value = getRawAmount('ast-value');
    if (!name || isNaN(value)) return alert("Vui lòng nhập đủ thông tin!");
    let assets = JSON.parse(localStorage.getItem('assets')) || [];
    assets.push({ id: Date.now(), name, type, value: value });
    localStorage.setItem('assets', JSON.stringify(assets));
    closeModal('asset-modal');
    document.getElementById('ast-name').value = '';
    document.getElementById('ast-value').value = '';
    renderAssets();
}

function renderAssets() {
    const assets = JSON.parse(localStorage.getItem('assets')) || [];
    const tbody = document.getElementById('asset-list');
    if (!tbody) return;
    tbody.innerHTML = assets.map((ast, index) => `
        <tr><td><strong>${ast.name}</strong></td><td>${ast.type}</td><td style="color: #0284c7;"><strong>${ast.value.toLocaleString('vi-VN')} đ</strong></td><td><button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteData('assets', ${index}, renderAssets)">Xóa</button></td></tr>
    `).join('');
}

function saveDebt() {
    const person = document.getElementById('dbt-person').value;
    const type = document.getElementById('dbt-type').value;
    const amount = getRawAmount('dbt-amount');
    const dueDate = document.getElementById('dbt-duedate').value;
    if (!person || !amount) return alert("Vui lòng nhập tên và số tiền!");
    let debts = JSON.parse(localStorage.getItem('debts')) || [];
    debts.push({ id: Date.now(), person, type, amount: amount, dueDate });
    localStorage.setItem('debts', JSON.stringify(debts));
    closeModal('debt-modal');
    document.getElementById('dbt-person').value = '';
    document.getElementById('dbt-amount').value = '';
    document.getElementById('dbt-duedate').value = '';
    renderDebts();
}

function renderDebts() {
    const debts = JSON.parse(localStorage.getItem('debts')) || [];
    const tbody = document.getElementById('debt-list');
    if (!tbody) return;
    tbody.innerHTML = debts.map((dbt, index) => {
        const isLend = dbt.type === 'Cho vay';
        return `<tr><td><strong>${dbt.person}</strong></td><td>${isLend ? '<span class="bg-green">Cho vay</span>' : '<span class="bg-red">Đi vay</span>'}</td><td class="${isLend ? 'text-green' : 'text-red'}"><strong>${dbt.amount.toLocaleString('vi-VN')} đ</strong></td><td>${dbt.dueDate ? new Date(dbt.dueDate).toLocaleDateString('vi-VN') : 'Không hạn'}</td><td><button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteData('debts', ${index}, renderDebts)">Xóa</button></td></tr>`;
    }).join('');
}

function deleteData(storageKey, index, renderFunc) {
    if (confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) {
        let data = JSON.parse(localStorage.getItem(storageKey)) || [];
        data.splice(index, 1);
        localStorage.setItem(storageKey, JSON.stringify(data));
        renderFunc();
        if(storageKey === 'savings') renderSavings();
    }
}

function loadAllData() {
    renderTransactions();
    renderAccounts();
    renderSavings();
    renderAssets();
    renderDebts();
}