// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBSfPpoeSmGnKiX7Hhjr83fsLN4ifaPWH4",
  authDomain: "moneymasterpro-a207c.firebaseapp.com",
  projectId: "moneymasterpro-a207c",
  storageBucket: "moneymasterpro-a207c.firebasestorage.app",
  messagingSenderId: "545365209674",
  appId: "1:545365209674:web:b92a785409a56438a06cb3",
  measurementId: "G-W45N876RZ9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Xử lý định dạng tiền tệ khi gõ
function formatCurrencyInput(input) {
    let value = input.value.replace(/\D/g, "");
    if (value) value = parseInt(value, 10).toLocaleString('vi-VN');
    input.value = value;
}

function getRawAmount(elementId) {
    const val = document.getElementById(elementId).value;
    return parseInt(val.replace(/\./g, ""), 10) || 0;
}

// --- QUẢN LÝ TÀI KHOẢN ĐĂNG NHẬP ---
function registerUser() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Vui lòng nhập đầy đủ email và mật khẩu!");
    auth.createUserWithEmailAndPassword(email, password)
        .then(() => alert("✅ Đăng ký thành công!"))
        .catch(error => alert("Lỗi: " + error.message));
}

function loginUser() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Vui lòng nhập đầy đủ email và mật khẩu!");
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => alert("Lỗi đăng nhập: " + error.message));
}

function logoutUser() {
    auth.signOut().then(() => {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
    });
}

// Lắng nghe trạng thái đăng nhập thời gian thực
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUserId = user.uid;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'flex';
        initRealtimeListeners(); // Tải dữ liệu riêng của user này
    } else {
        currentUserId = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
    }
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-menu'));
    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active-menu');
}

function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function clearFilter() {
    document.getElementById('month-filter').value = '';
    document.getElementById('year-filter').value = '';
    renderTransactions();
}

// --- LẮNG NGHE VÀ TẢI DỮ LIỆU CLOUD REALTIME ---
let cachedTransactions = [];
let cachedSavings = [];
let cachedAccounts = [];
let cachedAssets = [];
let cachedDebts = [];

function initRealtimeListeners() {
    if (!currentUserId) return;

    // 1. Giao dịch
    dbCloud.collection("transactions").where("userId", "==", currentUserId).onSnapshot(snapshot => {
        cachedTransactions = [];
        snapshot.forEach(doc => cachedTransactions.push({ id: doc.id, ...doc.data() }));
        renderTransactions();
    });

    // 2. Quỹ tiết kiệm
    dbCloud.collection("savings").where("userId", "==", currentUserId).onSnapshot(snapshot => {
        cachedSavings = [];
        snapshot.forEach(doc => cachedSavings.push({ id: doc.id, ...doc.data() }));
        renderSavings();
    });

    // 3. Tài khoản
    dbCloud.collection("accounts").where("userId", "==", currentUserId).onSnapshot(snapshot => {
        cachedAccounts = [];
        snapshot.forEach(doc => cachedAccounts.push({ id: doc.id, ...doc.data() }));
        renderAccounts();
    });

    // 4. Tài sản
    dbCloud.collection("assets").where("userId", "==", currentUserId).onSnapshot(snapshot => {
        cachedAssets = [];
        snapshot.forEach(doc => cachedAssets.push({ id: doc.id, ...doc.data() }));
        renderAssets();
    });

    // 5. Công nợ
    dbCloud.collection("debts").where("userId", "==", currentUserId).onSnapshot(snapshot => {
        cachedDebts = [];
        snapshot.forEach(doc => cachedDebts.push({ id: doc.id, ...doc.data() }));
        renderDebts();
    });
}

// --- CÁC HÀM LƯU DỮ LIỆU LÊN CLOUD ---
function saveTransaction() {
    const amount = getRawAmount('total-amount');
    if (!amount) return alert("Vui lòng nhập số tiền!");

    const txData = {
        userId: currentUserId,
        type: document.getElementById('tx-type').value,
        date: new Date().toLocaleDateString('vi-VN'),
        vendor: document.getElementById('vendor-name').value || 'Mua sắm',
        total: amount,
        payment: document.getElementById('payment-method').value
    };

    dbCloud.collection("transactions").add(txData).then(() => {
        alert("✅ Lưu thành công!");
        closeModal('tx-modal');
        document.querySelectorAll('#tx-modal input, #tx-modal textarea').forEach(el => el.value = '');
    });
}

function saveAccount() {
    const name = document.getElementById('acc-name').value;
    const type = document.getElementById('acc-type').value;
    const balance = getRawAmount('acc-balance');
    if (!name) return alert("Nhập tên tài khoản!");
    dbCloud.collection("accounts").add({ userId: currentUserId, name, type, balance }).then(() => {
        closeModal('account-modal');
        document.getElementById('acc-name').value = '';
        document.getElementById('acc-balance').value = '';
    });
}

function saveSavingManual() {
    const desc = document.getElementById('svg-desc').value;
    const amount = getRawAmount('svg-amount');
    if (!desc || !amount) return alert("Nhập đủ thông tin!");
    
    // Lưu quỹ tiết kiệm
    dbCloud.collection("savings").add({ userId: currentUserId, date: new Date().toLocaleDateString('vi-VN'), desc, amount });
    // Tự động trừ vào số dư tổng thu (tạo giao dịch chi ẩn)
    dbCloud.collection("transactions").add({
        userId: currentUserId,
        type: 'expense',
        date: new Date().toLocaleDateString('vi-VN'),
        vendor: 'Trích quỹ: ' + desc,
        total: amount,
        payment: 'Tiết kiệm'
    });

    closeModal('saving-modal');
    document.getElementById('svg-desc').value = '';
    document.getElementById('svg-amount').value = '';
    alert("✅ Đã thêm quỹ tiết kiệm và trừ vào số dư!");
}

function saveAsset() {
    const name = document.getElementById('ast-name').value;
    const type = document.getElementById('ast-type').value;
    const value = getRawAmount('ast-value');
    if (!name) return alert("Nhập tên tài sản!");
    dbCloud.collection("assets").add({ userId: currentUserId, name, type, value }).then(() => {
        closeModal('asset-modal');
        document.getElementById('ast-name').value = '';
        document.getElementById('ast-value').value = '';
    });
}

function saveDebt() {
    const person = document.getElementById('dbt-person').value;
    const type = document.getElementById('dbt-type').value;
    const amount = getRawAmount('dbt-amount');
    const dueDate = document.getElementById('dbt-duedate').value;
    if (!person || !amount) return alert("Nhập đầy đủ thông tin!");
    dbCloud.collection("debts").add({ userId: currentUserId, person, type, amount, dueDate }).then(() => {
        closeModal('debt-modal');
        document.getElementById('dbt-person').value = '';
        document.getElementById('dbt-amount').value = '';
    });
}

function deleteCloudData(collectionName, docId) {
    if (confirm("Bạn có chắc muốn xóa?")) {
        dbCloud.collection(collectionName).doc(docId).delete();
    }
}

// --- CÁC HÀM RENDER GIAO DIỆN ---
function renderTransactions() {
    const monthFilter = document.getElementById('month-filter').value;
    const yearFilter = document.getElementById('year-filter').value;
    
    let txs = cachedTransactions;
    if (monthFilter) {
        const [filterYear, filterMonth] = monthFilter.split('-');
        txs = cachedTransactions.filter(tx => {
            const parts = tx.date.split('/');
            return parts.length === 3 && parts[1].padStart(2, '0') === filterMonth && parts[2] === filterYear;
        });
    } else if (yearFilter) {
        txs = cachedTransactions.filter(tx => {
            const parts = tx.date.split('/');
            return parts.length === 3 && parts[2] === yearFilter;
        });
    }

    let totalIncome = 0, totalExpense = 0;
    const tbody = document.getElementById('tx-table');
    const recentList = document.getElementById('recent-list');
    if (tbody) tbody.innerHTML = '';
    if (recentList) recentList.innerHTML = '';

    txs.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.total;
        else totalExpense += tx.total;

        const isInc = tx.type === 'income';
        const amtText = (isInc ? '+' : '-') + tx.total.toLocaleString('vi-VN') + ' đ';
        if (tbody) {
            tbody.innerHTML += `<tr>
                <td>${tx.date}</td>
                <td><span class="${isInc ? 'bg-green' : 'bg-red'}">${isInc ? 'Thu' : 'Chi'}</span></td>
                <td><strong>${tx.vendor}</strong></td>
                <td class="${isInc ? 'text-green' : 'text-red'}"><strong>${amtText}</strong></td>
                <td>${tx.payment}</td>
                <td><button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCloudData('transactions', '${tx.id}')">Xóa</button></td>
            </tr>`;
        }
    });

    let gInc = 0, gExp = 0;
    cachedTransactions.forEach(t => { if (t.type === 'income') gInc += t.total; else gExp += t.total; });
    const cumulativeBalance = gInc - gExp;
    const periodSavings = totalIncome - totalExpense;

    cachedTransactions.slice(-5).reverse().forEach(tx => {
        const isInc = tx.type === 'income';
        if (recentList) {
            recentList.innerHTML += `<li><span>${tx.vendor}</span><strong class="${isInc ? 'text-green' : 'text-red'}">${isInc ? '+' : '-'}${tx.total.toLocaleString('vi-VN')} đ</strong></li>`;
        }
    });

    document.getElementById('total-income').innerText = totalIncome.toLocaleString('vi-VN') + ' đ';
    document.getElementById('total-expense').innerText = totalExpense.toLocaleString('vi-VN') + ' đ';
    document.getElementById('period-savings').innerText = periodSavings.toLocaleString('vi-VN') + ' đ';
    document.getElementById('total-balance').innerText = cumulativeBalance.toLocaleString('vi-VN') + ' đ';
    
    document.getElementById('ai-insight').innerText = `💡 Thống kê: Số dư khả dụng hiện tại là ${cumulativeBalance.toLocaleString('vi-VN')} đ.`;
    updateChart(totalIncome, totalExpense);
}

function renderSavings() {
    const tbody = document.getElementById('saving-list');
    if (!tbody) return;
    let totalFund = 0;
    tbody.innerHTML = cachedSavings.map(item => {
        totalFund += item.amount;
        return `<tr><td>${item.date}</td><td><strong>${item.desc}</strong></td><td class="text-green"><strong>+${item.amount.toLocaleString('vi-VN')} đ</strong></td><td><button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCloudData('savings', '${item.id}')">Xóa</button></td></tr>`;
    }).join('');
    document.getElementById('total-savings-fund').innerText = totalFund.toLocaleString('vi-VN') + ' đ';
}

function renderAccounts() {
    const tbody = document.getElementById('account-list');
    if (!tbody) return;
    tbody.innerHTML = cachedAccounts.map(acc => `<tr><td><strong>${acc.name}</strong></td><td>${acc.type}</td><td class="text-green"><strong>${acc.balance.toLocaleString('vi-VN')} đ</strong></td><td><button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCloudData('accounts', '${acc.id}')">Xóa</button></td></tr>`).join('');
}

function renderAssets() {
    const tbody = document.getElementById('asset-list');
    if (!tbody) return;
    tbody.innerHTML = cachedAssets.map(ast => `<tr><td><strong>${ast.name}</strong></td><td>${ast.type}</td><td style="color:#0284c7;"><strong>${ast.value.toLocaleString('vi-VN')} đ</strong></td><td><button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCloudData('assets', '${ast.id}')">Xóa</button></td></tr>`).join('');
}

function renderDebts() {
    const tbody = document.getElementById('debt-list');
    if (!tbody) return;
    tbody.innerHTML = cachedDebts.map(dbt => {
        const isLend = dbt.type === 'Cho vay';
        return `<tr><td><strong>${dbt.person}</strong></td><td><span class="${isLend ? 'bg-green' : 'bg-red'}">${dbt.type}</span></td><td class="${isLend ? 'text-green' : 'text-red'}"><strong>${dbt.amount.toLocaleString('vi-VN')} đ</strong></td><td>${dbt.dueDate || 'Không'}</td><td><button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCloudData('debts', '${dbt.id}')">Xóa</button></td></tr>`;
    }).join('');
}

function updateChart(income, expense) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart != null) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'pie',
        data: { labels: ['Thu nhập', 'Chi tiêu'], datasets: [{ data: [income || 1, expense || 0], backgroundColor: ['#4ade80', '#f87171'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

function exportExcel() {
    let csv = "Ngày,Loại,Cửa Hàng,Số Tiền,Thanh Toán\n";
    cachedTransactions.forEach(tx => { csv += `${tx.date},${tx.type},${tx.vendor},${tx.total},${tx.payment}\n`; });
    let el = document.createElement('a');
    el.href = 'data:text/csv;charset=utf-8,%EF%BB%BF' + encodeURI(csv);
    el.download = 'Lich_Su_Thu_Chi.csv';
    el.click();
}