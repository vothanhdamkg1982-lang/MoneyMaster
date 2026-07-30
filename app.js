// ==========================================
// 1. CƠ SỞ DỮ LIỆU INDEXEDDB (Lưu ảnh hóa đơn)
// ==========================================
let db;
const request = indexedDB.open("MoneyMasterPro_V2", 1);

request.onupgradeneeded = function(e) {
    db = e.target.result;
    if (!db.objectStoreNames.contains("receipts")) {
        db.createObjectStore("receipts", { keyPath: "id" });
    }
};
request.onsuccess = function(e) { 
    db = e.target.result; 
    renderTransactions(); // Render dữ liệu ngay khi DB sẵn sàng
};
request.onerror = function(e) { console.error("Lỗi IndexedDB", e); };

// ==========================================
// 2. BẢO MẬT BẰNG PIN
// ==========================================
function unlockApp() {
    const pin = document.getElementById('pin-code').value;
    if (pin === '1234') { // PIN mặc định
        document.getElementById('lock-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'flex';
        renderTransactions(); // Cập nhật lại UI sau khi mở khóa
    } else { alert("Mã PIN sai! (Mặc định: 1234)"); }
}

// ==========================================
// 3. UI TƯƠNG TÁC (Tab & Modal & Đổi màu form)
// ==========================================
function switchTab(tabId) {
    // Ẩn tất cả nội dung
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    // Bỏ active ở menu
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-menu'));
    
    // Hiển thị tab được chọn
    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active-menu');
}

function openModal(id) { 
    document.getElementById(id).style.display = 'block'; 
    document.getElementById('tx-type').value = 'expense';
    toggleTypeColor();
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

// ==========================================
// 4. OCR - TESSERACT.JS (Đọc Hóa Đơn)
// ==========================================
let currentFileBlob = null;

document.getElementById('receipt-upload').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    currentFileBlob = file;
    
    // Hiển thị ảnh
    document.getElementById('receipt-thumb').src = URL.createObjectURL(file);
    document.getElementById('receipt-thumb').style.display = 'block';

    // Gọi AI OCR
    document.getElementById('ocr-loading').style.display = 'block';
    try {
        const worker = await Tesseract.createWorker('vie');
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        
        // Trích xuất: Tìm số tiền và MST
        const totalMatch = text.match(/(Tổng tiền|Total|Thanh toán)[\s:.-]*([\d,.]+)/i);
        const taxIdMatch = text.match(/MST[\s:.-]*([0-9-]{10,14})/i);

        if (totalMatch) document.getElementById('total-amount').value = totalMatch[2].replace(/[.,]/g, '');
        if (taxIdMatch) document.getElementById('vendor-taxid').value = taxIdMatch[1];
        
        document.getElementById('product-list').value = "--- AI Đọc Hóa Đơn ---\n" + text;
        checkBudget();
    } catch (err) {
        alert("Lỗi khi phân tích ảnh. Bạn hãy tự nhập số tiền nhé.");
    } finally {
        document.getElementById('ocr-loading').style.display = 'none';
    }
});

// ==========================================
// 5. LƯU GIAO DỊCH, THU NHẬP / CHI TIÊU
// ==========================================
const BUDGET_LIMIT = 10000000; // Ngân sách cảnh báo 10 triệu

function checkBudget() {
    const type = document.getElementById('tx-type').value;
    if (type === 'income') return; // Không cảnh báo ngân sách cho thu nhập

    const currentInput = parseInt(document.getElementById('total-amount').value) || 0;
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

function saveTransaction() {
    const amount = document.getElementById('total-amount').value;
    if (!amount) { alert("Vui lòng nhập số tiền!"); return; }

    const txId = Date.now().toString();
    const txData = {
        id: txId,
        type: document.getElementById('tx-type').value, // 'income' hoặc 'expense'
        date: new Date().toLocaleDateString('vi-VN'),
        vendor: document.getElementById('vendor-name').value || (document.getElementById('tx-type').value === 'income' ? 'Nguồn thu khác' : 'Mua sắm chung'),
        total: parseInt(amount),
        payment: document.getElementById('payment-method').value
    };

    // Lưu vào LocalStorage
    let txs = JSON.parse(localStorage.getItem('transactions')) || [];
    txs.push(txData);
    localStorage.setItem('transactions', JSON.stringify(txs));

    // Lưu Ảnh hóa đơn vào IndexedDB
    if (currentFileBlob && db) {
        const transaction = db.transaction(["receipts"], "readwrite");
        transaction.objectStore("receipts").put({ id: txId, file: currentFileBlob });
    }

    alert("✅ Lưu thành công!");
    closeModal('tx-modal');
    
    // Reset form
    document.querySelectorAll('#tx-modal input, #tx-modal textarea').forEach(el => el.value = '');
    document.getElementById('receipt-thumb').style.display = 'none';
    currentFileBlob = null;

    renderTransactions();
}

// ==========================================
// 6. RENDER DỮ LIỆU & TÍNH TOÁN BANNER
// ==========================================
let myChart = null; // Biến giữ biểu đồ

function renderTransactions() {
    const txs = JSON.parse(localStorage.getItem('transactions')) || [];
    
    // Biến tính toán Banner
    let totalIncome = 0;
    let totalExpense = 0;

    const tbody = document.getElementById('tx-list');
    const recentList = document.getElementById('recent-list');
    tbody.innerHTML = '';
    recentList.innerHTML = '';
    
    txs.forEach((tx, index) => {
        // Tính tổng
        if (tx.type === 'income') totalIncome += tx.total;
        else totalExpense += tx.total;

        // Render UI cho Loại Thu/Chi
        const isIncome = tx.type === 'income';
        const amountText = isIncome ? `+${tx.total.toLocaleString('vi-VN')}` : `-${tx.total.toLocaleString('vi-VN')}`;
        const amountClass = isIncome ? 'text-green' : 'text-red';
        const typeBadge = isIncome ? '<span class="bg-green">Thu nhập</span>' : '<span class="bg-red">Chi tiêu</span>';

        // 1. Đổ vào Bảng chi tiết
        tbody.innerHTML += `<tr>
            <td>${tx.date}</td>
            <td>${typeBadge}</td>
            <td><strong>${tx.vendor}</strong></td>
            <td class="${amountClass}"><strong>${amountText} đ</strong></td>
            <td>${tx.payment}</td>
            <td><button class="btn-secondary" style="padding: 4px 8px; font-size:12px;" onclick="viewReceipt('${tx.id}')">📷 Xem</button></td>
            <td><button class="btn-danger" onclick="deleteTransaction(${index}, '${tx.id}')">Xóa</button></td>
        </tr>`;

        // 2. Đổ vào list rút gọn ở Dashboard (Lấy 5 cái mới nhất)
        if (index >= txs.length - 5) {
            recentList.innerHTML = `<li>
                <span>${tx.vendor} (${tx.date})</span>
                <strong class="${amountClass}">${amountText} đ</strong>
            </li>` + recentList.innerHTML; // Đảo ngược để mới nhất lên đầu
        }
    });

    // 3. Cập nhật Banner Số dư
    const balance = totalIncome - totalExpense;
    document.getElementById('total-income').innerText = totalIncome.toLocaleString('vi-VN') + ' đ';
    document.getElementById('total-expense').innerText = totalExpense.toLocaleString('vi-VN') + ' đ';
    document.getElementById('total-balance').innerText = balance.toLocaleString('vi-VN') + ' đ';

    // 4. Update Thống kê AI Insight
    const insightBox = document.getElementById('ai-insight');
    if(txs.length === 0) {
        insightBox.innerText = "🤖 AI: Bạn chưa có dữ liệu giao dịch nào. Hãy thêm khoản thu/chi đầu tiên!";
    } else {
        if(balance < 0) {
            insightBox.innerText = "🚨 CẢNH BÁO AI: Số dư của bạn đang âm. Bạn đang chi tiêu vượt mức thu nhập!";
            insightBox.style.borderLeftColor = "#ef4444";
            insightBox.style.backgroundColor = "#fef2f2";
        } else {
            insightBox.innerText = `💡 AI Thống kê: Bạn đã tiết kiệm được ${balance.toLocaleString('vi-VN')} đ. Dòng tiền đang dương!`;
            insightBox.style.borderLeftColor = "#10b981";
            insightBox.style.backgroundColor = "#ecfdf5";
        }
    }

    // 5. Cập nhật Biểu đồ Chart.js
    updateChart(totalIncome, totalExpense);
}

function deleteTransaction(index, txId) {
    if(confirm("Bạn có chắc muốn xóa giao dịch này?")) {
        let txs = JSON.parse(localStorage.getItem('transactions')) || [];
        txs.splice(index, 1);
        localStorage.setItem('transactions', JSON.stringify(txs));

        // Xóa ảnh trong IndexedDB
        if (db) {
            const transaction = db.transaction(["receipts"], "readwrite");
            transaction.objectStore("receipts").delete(txId);
        }
        renderTransactions();
    }
}

function viewReceipt(id) {
    const transaction = db.transaction(["receipts"]);
    const request = transaction.objectStore("receipts").get(id);
    request.onsuccess = function() {
        if(request.result && request.result.file) {
            const url = URL.createObjectURL(request.result.file);
            window.open(url, '_blank');
        } else {
            alert("Không có hóa đơn đính kèm cho giao dịch này!");
        }
    };
}

function exportExcel() {
    let txs = JSON.parse(localStorage.getItem('transactions')) || [];
    let csv = "Ngày,Loại,Cửa Hàng,Số Tiền,Thanh Toán\n";
    txs.forEach(tx => { 
        const typeStr = tx.type === 'income' ? 'Thu Nhập' : 'Chi Tiêu';
        csv += `${tx.date},${typeStr},${tx.vendor},${tx.total},${tx.payment}\n`; 
    });
    
    let hiddenElement = document.createElement('a');
    hiddenElement.href = 'data:text/csv;charset=utf-8,%EF%BB%BF' + encodeURI(csv);
    hiddenElement.target = '_blank';
    hiddenElement.download = 'Lich_Su_Thu_Chi.csv';
    hiddenElement.click();
}

// ==========================================
// 7. CHART.JS (Biểu đồ động Thu vs Chi)
// ==========================================
function updateChart(income, expense) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    
    // Hủy biểu đồ cũ nếu có để tránh lỗi đè hình
    if (myChart != null) { myChart.destroy(); }

    // Nếu chưa có dữ liệu, vẽ biểu đồ rỗng
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
            datasets: [{
                data: [income, expense],
                backgroundColor: ['#4ade80', '#f87171'],
                borderWidth: 1
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
    // ==========================================
// 8. CÁC MODULE: TÀI KHOẢN, TÀI SẢN, CÔNG NỢ
// ==========================================

// --- QUẢN LÝ TÀI KHOẢN ---
function saveAccount() {
    const name = document.getElementById('acc-name').value;
    const type = document.getElementById('acc-type').value;
    const balance = document.getElementById('acc-balance').value;

    if (!name || !balance) return alert("Vui lòng nhập đủ thông tin!");

    let accounts = JSON.parse(localStorage.getItem('accounts')) || [];
    accounts.push({ id: Date.now(), name, type, balance: parseInt(balance) });
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
        <tr>
            <td><strong>${acc.name}</strong></td>
            <td>${acc.type}</td>
            <td class="text-green"><strong>${acc.balance.toLocaleString('vi-VN')} đ</strong></td>
            <td><button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteData('accounts', ${index}, renderAccounts)">Xóa</button></td>
        </tr>
    `).join('');
}

// --- QUẢN LÝ TÀI SẢN ---
function saveAsset() {
    const name = document.getElementById('ast-name').value;
    const type = document.getElementById('ast-type').value;
    const value = document.getElementById('ast-value').value;

    if (!name || !value) return alert("Vui lòng nhập đủ thông tin!");

    let assets = JSON.parse(localStorage.getItem('assets')) || [];
    assets.push({ id: Date.now(), name, type, value: parseInt(value) });
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
        <tr>
            <td><strong>${ast.name}</strong></td>
            <td>${ast.type}</td>
            <td style="color: #0284c7;"><strong>${ast.value.toLocaleString('vi-VN')} đ</strong></td>
            <td><button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteData('assets', ${index}, renderAssets)">Xóa</button></td>
        </tr>
    `).join('');
}

// --- QUẢN LÝ CÔNG NỢ ---
function saveDebt() {
    const person = document.getElementById('dbt-person').value;
    const type = document.getElementById('dbt-type').value;
    const amount = document.getElementById('dbt-amount').value;
    const dueDate = document.getElementById('dbt-duedate').value;

    if (!person || !amount) return alert("Vui lòng nhập tên và số tiền!");

    let debts = JSON.parse(localStorage.getItem('debts')) || [];
    debts.push({ id: Date.now(), person, type, amount: parseInt(amount), dueDate });
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
        const colorClass = isLend ? 'text-green' : 'text-red';
        const badge = isLend ? '<span class="bg-green">Cho vay</span>' : '<span class="bg-red">Đi vay</span>';
        const dateStr = dbt.dueDate ? new Date(dbt.dueDate).toLocaleDateString('vi-VN') : 'Không có hạn';
        
        return `
        <tr>
            <td><strong>${dbt.person}</strong></td>
            <td>${badge}</td>
            <td class="${colorClass}"><strong>${dbt.amount.toLocaleString('vi-VN')} đ</strong></td>
            <td>${dateStr}</td>
            <td><button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteData('debts', ${index}, renderDebts)">Xóa / Đã trả</button></td>
        </tr>
    `}).join('');
}

// Hàm Xóa dùng chung cho 3 module
function deleteData(storageKey, index, renderFunc) {
    if (confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) {
        let data = JSON.parse(localStorage.getItem(storageKey)) || [];
        data.splice(index, 1);
        localStorage.setItem(storageKey, JSON.stringify(data));
        renderFunc(); // Gọi lại hàm render tương ứng để cập nhật UI
    }
}

// Bổ sung vào hàm khởi tạo (gọi khi ứng dụng chạy)
// Tìm hàm unlockApp() của bạn ở trên và thêm 3 dòng này vào cuối hàm đó, 
// hoặc gọi trực tiếp ở đây để đảm bảo lúc load trang nó lấy dữ liệu ra:
window.addEventListener('DOMContentLoaded', () => {
    renderAccounts();
    renderAssets();
    renderDebts();
});
}