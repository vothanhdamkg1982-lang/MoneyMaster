// ================== CẤU HÌNH SUPABASE ==================
// ⚠️ CẦN SỬA Ở ĐÂY: Thay bằng Project URL của bạn trên Supabase Dashboard
// ================== CẤU HÌNH SUPABASE ==================
const SUPABASE_URL = 'https://ohmwphdeeldmlxuuknny.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DgxnOXel9t7woqYrfInl5Q_YogcW--c';

// Kiểm tra Supabase client đã được tải chưa
if (typeof supabase === 'undefined') {
    alert('Supabase chưa được tải! Vui lòng kiểm tra kết nối internet hoặc tải lại trang.');
    throw new Error('Supabase client not loaded');
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUserId = null;
let myChart = null;

// Biến hóa đơn
let currentReceiptFile = null;
let currentReceiptUrl = null;
let currentReceiptAmount = 0;
let videoStream = null;

// Cache dữ liệu
let cachedTransactions = [];
let cachedSavings = [];
let cachedAccounts = [];
let cachedAssets = [];
let cachedDebts = [];
let cachedReceipts = [];

// ================== XỬ LÝ TIỀN TỆ ==================
function formatCurrencyInput(input) {
    let value = input.value.replace(/\D/g, "");
    if (value) value = parseInt(value, 10).toLocaleString('vi-VN');
    input.value = value;
}

function getRawAmount(elementId) {
    const val = document.getElementById(elementId).value;
    return parseInt(val.replace(/\./g, ""), 10) || 0;
}

// ================== AUTH ==================
async function registerUser() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const statusDiv = document.getElementById('auth-status');

    if (!email || !password) {
        statusDiv.innerText = "Vui lòng nhập đầy đủ email và mật khẩu!";
        return;
    }
    if (!email.includes('@') || !email.includes('.')) {
        statusDiv.innerText = "Email không hợp lệ!";
        return;
    }
    if (password.length < 6) {
        statusDiv.innerText = "Mật khẩu phải có ít nhất 6 ký tự!";
        return;
    }

    statusDiv.innerText = "Đang đăng ký...";
    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
        statusDiv.innerText = "❌ Lỗi: " + error.message;
        console.error("Register error:", error);
    } else {
        statusDiv.innerText = "✅ Đăng ký thành công! Vui lòng kiểm tra email để xác nhận.";
        console.log("Register success:", data);
    }
}

async function loginUser() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const statusDiv = document.getElementById('auth-status');

    if (!email || !password) {
        statusDiv.innerText = "Vui lòng nhập đầy đủ email và mật khẩu!";
        return;
    }
    if (!email.includes('@') || !email.includes('.')) {
        statusDiv.innerText = "Email không hợp lệ!";
        return;
    }

    statusDiv.innerText = "Đang đăng nhập...";
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        statusDiv.innerText = "❌ Lỗi: " + error.message;
        console.error("Login error:", error);
    } else {
        statusDiv.innerText = "✅ Thành công!";
        console.log("Login success:", data);
    }
}

async function logoutUser() {
    await supabaseClient.auth.signOut();
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
}

async function forgotPassword() {
    const email = document.getElementById('auth-email').value.trim();
    const statusDiv = document.getElementById('auth-status');
    if (!email || !email.includes('@')) {
        statusDiv.innerText = "Vui lòng nhập email hợp lệ!";
        return;
    }
    statusDiv.innerText = "Đang gửi yêu cầu...";
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });
    if (error) {
        statusDiv.innerText = "❌ Lỗi: " + error.message;
    } else {
        statusDiv.innerText = "✅ Email đặt lại mật khẩu đã được gửi!";
    }
}

// Lắng nghe trạng thái auth
supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event, session);
    if (session && session.user) {
        currentUser = session.user;
        currentUserId = session.user.id;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'flex';
        initRealtimeListeners();
        document.getElementById('auth-status').innerText = "";
    } else {
        currentUser = null;
        currentUserId = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
    }
});


// ================== REAL-TIME SUBSCRIPTIONS ==================
let realtimeSubscribed = false; // Biến kiểm tra trạng thái đã đăng ký hay chưa

function initRealtimeListeners() {
    if (!currentUserId) return;
    
    // Nếu đã đăng ký rồi thì dừng lại, tránh lỗi lặp trên Console
    if (realtimeSubscribed) return; 
    realtimeSubscribed = true;

    supabaseClient
        .channel('transactions-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${currentUserId}` }, () => fetchTransactions())
        .subscribe();

    supabaseClient
        .channel('savings-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'savings', filter: `user_id=eq.${currentUserId}` }, () => fetchSavings())
        .subscribe();

    supabaseClient
        .channel('accounts-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${currentUserId}` }, () => fetchAccounts())
        .subscribe();

    supabaseClient
        .channel('assets-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assets', filter: `user_id=eq.${currentUserId}` }, () => fetchAssets())
        .subscribe();

    supabaseClient
        .channel('debts-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: `user_id=eq.${currentUserId}` }, () => fetchDebts())
        .subscribe();

    supabaseClient
        .channel('receipts-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts', filter: `user_id=eq.${currentUserId}` }, () => fetchReceipts())
        .subscribe();

    // Fetch dữ liệu lần đầu tiên
    fetchTransactions();
    fetchSavings();
    fetchAccounts();
    fetchAssets();
    fetchDebts();
    fetchReceipts();
}
// ================== FETCH FUNCTIONS ==================
async function fetchTransactions() {
    const { data, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });
    if (!error) {
        cachedTransactions = data || [];
        renderTransactions();
    } else console.error("fetchTransactions error:", error);
}

async function fetchSavings() {
    const { data, error } = await supabaseClient
        .from('savings')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });
    if (!error) {
        cachedSavings = data || [];
        renderSavings();
    }
}

async function fetchAccounts() {
    const { data, error } = await supabaseClient
        .from('accounts')
        .select('*')
        .eq('user_id', currentUserId);
    if (!error) {
        cachedAccounts = data || [];
        renderAccounts();
    }
}

async function fetchAssets() {
    const { data, error } = await supabaseClient
        .from('assets')
        .select('*')
        .eq('user_id', currentUserId);
    if (!error) {
        cachedAssets = data || [];
        renderAssets();
    }
}

async function fetchDebts() {
    const { data, error } = await supabaseClient
        .from('debts')
        .select('*')
        .eq('user_id', currentUserId);
    if (!error) {
        cachedDebts = data || [];
        renderDebts();
    }
}

async function fetchReceipts() {
    const { data, error } = await supabaseClient
        .from('receipts')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });
    if (!error) {
        cachedReceipts = data || [];
        renderReceipts();
    }
}

// ================== CRUD OPERATIONS ==================
async function saveTransaction() {
    const amount = getRawAmount('total-amount');
    if (!amount) return alert("Vui lòng nhập số tiền!");

    const txData = {
        user_id: currentUserId,
        type: document.getElementById('tx-type').value,
        date: new Date().toLocaleDateString('vi-VN'),
        vendor: document.getElementById('vendor-name').value || 'Mua sắm',
        total: amount,
        payment: document.getElementById('payment-method').value,
        created_at: new Date().toISOString()
    };

    const { data, error } = await supabaseClient
        .from('transactions')
        .insert(txData)
        .select();

    if (error) {
        alert("Lỗi lưu giao dịch: " + error.message);
        return;
    }

    // Liên kết với hóa đơn gần nhất chưa có transaction_id
    if (data && data.length > 0) {
        const newTxId = data[0].id;
        const { data: receiptData } = await supabaseClient
            .from('receipts')
            .select('id')
            .eq('user_id', currentUserId)
            .is('transaction_id', null)
            .order('created_at', { ascending: false })
            .limit(1);

        if (receiptData && receiptData.length > 0) {
            await supabaseClient
                .from('receipts')
                .update({ transaction_id: newTxId })
                .eq('id', receiptData[0].id);
        }
    }

    alert("✅ Lưu thành công!");
    
    // ✅ Thêm dòng này để tải lại danh sách giao dịch ngay lập tức
    fetchTransactions(); 

    closeModal('tx-modal');
    document.querySelectorAll('#tx-modal input, #tx-modal textarea').forEach(el => el.value = '');
    document.getElementById('receipt-thumb').style.display = 'none';
    document.getElementById('btn-save-receipt').style.display = 'none';
    currentReceiptFile = null;
    currentReceiptAmount = 0;
}

async function saveAccount() {
    const name = document.getElementById('acc-name').value;
    const type = document.getElementById('acc-type').value;
    const balance = getRawAmount('acc-balance');
    if (!name) return alert("Nhập tên tài khoản!");
    const { error } = await supabaseClient
        .from('accounts')
        .insert({ user_id: currentUserId, name, type, balance });
    if (error) alert("Lỗi: " + error.message);
    else {
        closeModal('account-modal');
        document.getElementById('acc-name').value = '';
        document.getElementById('acc-balance').value = '';
        fetchAccounts(); // ✅ Đã thêm dòng này để hiển thị ngay lập tức
    }
}

async function saveSavingManual() {
    const description = document.getElementById('svg-desc').value;
    const amount = getRawAmount('svg-amount');
    if (!description || !amount) return alert("Nhập đủ thông tin!");

    await supabaseClient
        .from('savings')
        .insert({ user_id: currentUserId, date: new Date().toLocaleDateString('vi-VN'), description, amount });

    await supabaseClient
        .from('transactions')
        .insert({
            user_id: currentUserId,
            type: 'expense',
            date: new Date().toLocaleDateString('vi-VN'),
            vendor: 'Trích quỹ: ' + description,
            total: amount,
            payment: 'Tiết kiệm'
        });

    closeModal('saving-modal');
    document.getElementById('svg-desc').value = '';
    document.getElementById('svg-amount').value = '';
    fetchSavings(); // ✅ Đã thêm dòng này để hiển thị ngay lập tức
    alert("✅ Đã thêm quỹ tiết kiệm và trừ vào số dư!");
}

async function saveAsset() {
    const name = document.getElementById('ast-name').value;
    const type = document.getElementById('ast-type').value;
    const value = getRawAmount('ast-value');
    if (!name) return alert("Nhập tên tài sản!");
    const { error } = await supabaseClient
        .from('assets')
        .insert({ user_id: currentUserId, name, type, value });
    if (error) alert("Lỗi: " + error.message);
    else {
        closeModal('asset-modal');
        document.getElementById('ast-name').value = '';
        document.getElementById('ast-value').value = '';
        fetchAssets(); // ✅ Đã thêm dòng này để hiển thị ngay lập tức
    }
}

async function saveDebt() {
    const person = document.getElementById('dbt-person').value;
    const type = document.getElementById('dbt-type').value;
    const amount = getRawAmount('dbt-amount');
    const dueDate = document.getElementById('dbt-duedate').value;
    if (!person || !amount) return alert("Nhập đầy đủ thông tin!");
    const { error } = await supabaseClient
        .from('debts')
        .insert({ user_id: currentUserId, person, type, amount, due_date: dueDate });
    if (error) alert("Lỗi: " + error.message);
    else {
        closeModal('debt-modal');
        document.getElementById('dbt-person').value = '';
        document.getElementById('dbt-amount').value = '';
        fetchDebts(); // ✅ Đã thêm dòng này để hiển thị ngay lập tức
    }
}

// Hàm xóa dữ liệu (đã sửa để tải lại UI ngay lập tức)
async function deleteCloudData(table, id) {
    if (!confirm("Bạn có chắc muốn xóa?")) return;
    
    const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq('id', id)
        .eq('user_id', currentUserId);
        
    if (error) {
        alert("Lỗi xóa: " + error.message);
    } else {
        // Nếu xóa thành công, gọi hàm tải lại dữ liệu tương ứng với bảng vừa xóa
        if (table === 'transactions') fetchTransactions();
        if (table === 'savings') fetchSavings();
        if (table === 'accounts') fetchAccounts();
        if (table === 'assets') fetchAssets();
        if (table === 'debts') fetchDebts();
        if (table === 'receipts') fetchReceipts();
    }
}

// ================== RENDER FUNCTIONS ==================
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

    // ✅ QUAN TRỌNG: Lưu danh sách giao dịch đang hiển thị vào biến toàn cục để CSV xuất đúng
    window.currentFilteredTxs = txs; 

    let totalIncome = 0, totalExpense = 0;
    const tbody = document.getElementById('tx-list'); 
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
// Hàm xuất CSV (Dùng requestAnimationFrame để an toàn tuyệt đối với trình duyệt)
function exportExcel() {
    const txsToExport = window.currentFilteredTxs || cachedTransactions;
    if (txsToExport.length === 0) {
        alert("Không có giao dịch nào để xuất.");
        return;
    }

    let csv = "\uFEFF"; 
    csv += "Ngày,Loại,Cửa Hàng,Số Tiền,Thanh Toán\n";
    
    txsToExport.forEach(tx => {
        const typeText = tx.type === 'income' ? 'Thu' : 'Chi';
        const amountText = tx.total.toLocaleString('vi-VN') + ' đ';
        csv += `${tx.date},${typeText},"${tx.vendor}",${amountText},${tx.payment}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Lich_Su_Thu_Chi.csv';
    document.body.appendChild(link);
    
    // ⏱️ Chờ 200ms để DOM có thời gian ghi nhận thẻ link
    setTimeout(() => {
        link.click(); // Kích hoạt tải xuống
        // Sau khi tải xuống bắt đầu, dùng thêm 200ms nữa để dọn dẹp
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 200);
    }, 200);
}

function renderSavings() {
    const tbody = document.getElementById('saving-list');
    if (!tbody) return;
    let totalFund = 0;
    tbody.innerHTML = cachedSavings.map(item => {
        totalFund += item.amount;
        return `<tr><td>${item.date}</td><td><strong>${item.description}</strong></td><td class="text-green"><strong>+${item.amount.toLocaleString('vi-VN')} đ</strong></td><td><button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCloudData('savings', '${item.id}')">Xóa</button></td></tr>`;
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
        return `<tr><td><strong>${dbt.person}</strong></td><td><span class="${isLend ? 'bg-green' : 'bg-red'}">${dbt.type}</span></td><td class="${isLend ? 'text-green' : 'text-red'}"><strong>${dbt.amount.toLocaleString('vi-VN')} đ</strong></td><td>${dbt.due_date || 'Không'}</td><td><button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCloudData('debts', '${dbt.id}')">Xóa</button></td></tr>`;
    }).join('');
}
// Hàm vẽ biểu đồ (Đã sửa lại để khắc phục lỗi "is not defined")
function updateChart(income, expense) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    // Hủy biểu đồ cũ nếu tồn tại để tránh lỗi chồng chéo
    if (myChart != null) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Thu nhập', 'Chi tiêu'],
            datasets: [{ 
                data: [income || 1, expense || 0], 
                backgroundColor: ['#4ade80', '#f87171'] 
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}
function renderReceipts() {
    const tbody = document.getElementById('receipt-list');
    if (!tbody) return;
    if (cachedReceipts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Chưa có hóa đơn nào</td></tr>';
        return;
    }
    let html = '';
    cachedReceipts.forEach((receipt, index) => {
        const dateStr = receipt.created_at ? new Date(receipt.created_at).toLocaleDateString('vi-VN') : '';
        const amountStr = receipt.amount ? receipt.amount.toLocaleString('vi-VN') + ' đ' : 'Chưa xác định';
        const linked = receipt.transaction_id ? '✅ Đã liên kết' : 'Chưa';
        html += `<tr>
            <td>${index + 1}</td>
            <td>${dateStr}</td>
            <td><img src="${receipt.image_url}" onclick="window.open('${receipt.image_url}','_blank')" alt="hóa đơn" style="max-height:50px; border-radius:4px; cursor:pointer;"></td>
            <td>${amountStr}</td>
            <td>${linked}</td>
            <td>
                <button class="btn-secondary" style="padding:4px 8px; font-size:12px; margin-right:5px;" onclick="downloadReceipt('${receipt.image_url}')">⬇️ Tải xuống</button>
                <button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteReceipt('${receipt.id}')">Xóa</button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// Hàm tải xuống hóa đơn (Đã sửa lỗi để tải file thay vì mở ảnh)
// Hàm tải xuống hóa đơn (Đã sửa an toàn tuyệt đối cho Localhost)
async function downloadReceipt(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        const fileName = url.split('/').pop() || 'hoa_don_' + Date.now() + '.jpg';
        a.download = fileName;
        document.body.appendChild(a);
        
        // ⏱️ Chờ 200ms rồi mới click
        setTimeout(() => {
            a.click();
            // Chờ 200ms rồi dọn dẹp bộ nhớ
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            }, 200);
        }, 200);
        
    } catch (error) {
        console.error('Lỗi tải xuống ảnh:', error);
        alert('Không thể tự động tải xuống ảnh. Vui lòng nhấn chuột phải vào ảnh > "Lưu hình ảnh thành..."');
    }
}
// ================== CAMERA & OCR ==================
document.getElementById('receipt-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    currentReceiptFile = file;
    previewAndOCR(file);
});

function openCameraModal() {
    document.getElementById('camera-modal').style.display = 'block';
    startCamera();
}
function closeCameraModal() { stopCamera(); document.getElementById('camera-modal').style.display = 'none'; }

function startCamera() {
    const video = document.getElementById('video');
    const status = document.getElementById('camera-status');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                videoStream = stream;
                video.srcObject = stream;
                video.play();
                document.getElementById('btn-take-picture').style.display = 'inline-block';
                document.getElementById('btn-retake').style.display = 'none';
                status.innerText = '';
            })
            .catch(err => {
                status.innerText = 'Không thể truy cập camera: ' + err.message + '. Vui lòng chọn file thủ công.';
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.capture = 'environment';
                input.onchange = function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        currentReceiptFile = file;
                        previewAndOCR(file);
                        closeCameraModal();
                    }
                };
                input.click();
            });
    } else {
        status.innerText = 'Trình duyệt không hỗ trợ camera. Vui lòng chọn file.';
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                currentReceiptFile = file;
                previewAndOCR(file);
                closeCameraModal();
            }
        };
        input.click();
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
        document.getElementById('video').srcObject = null;
    }
}

document.getElementById('btn-take-picture').addEventListener('click', function() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(function(blob) {
        const file = new File([blob], 'receipt_capture.jpg', { type: 'image/jpeg' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.getElementById('receipt-upload').files = dataTransfer.files;
        currentReceiptFile = file;
        previewAndOCR(file);
        closeCameraModal();
        document.getElementById('btn-save-receipt').style.display = 'inline-block';
    }, 'image/jpeg', 0.9);
});

document.getElementById('btn-retake').addEventListener('click', function() {
    document.getElementById('btn-retake').style.display = 'none';
    document.getElementById('btn-take-picture').style.display = 'inline-block';
    startCamera();
});

function previewAndOCR(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const thumb = document.getElementById('receipt-thumb');
        thumb.src = e.target.result;
        thumb.style.display = 'block';
        currentReceiptUrl = e.target.result;
    };
    reader.readAsDataURL(file);

    const loading = document.getElementById('ocr-loading');
    loading.style.display = 'block';
    loading.innerText = '🤖 AI đang phân tích ảnh...';

    Tesseract.recognize(
        file,
        'vie+eng',
        { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
        loading.style.display = 'none';
        const amount = extractAmount(text);
        if (amount > 0) {
            currentReceiptAmount = amount;
            document.getElementById('total-amount').value = amount.toLocaleString('vi-VN');
            loading.innerText = '✅ Nhận diện thành công!';
            loading.style.color = '#16a34a';
            loading.style.display = 'block';
            setTimeout(() => loading.style.display = 'none', 2000);
        } else {
            alert('Không nhận diện được số tiền, vui lòng nhập thủ công.');
        }
        document.getElementById('btn-save-receipt').style.display = 'inline-block';
    }).catch(err => {
        loading.style.display = 'none';
        alert('Lỗi OCR: ' + err.message);
    });
}

function extractAmount(text) {
    const matches = text.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)/g);
    if (!matches) return 0;
    const numbers = matches.map(s => parseInt(s.replace(/[,.]/g, ''), 10)).filter(n => n > 1000);
    if (numbers.length === 0) return 0;
    return Math.max(...numbers);
}

// Lưu hóa đơn lên Supabase Storage
document.getElementById('btn-save-receipt').addEventListener('click', async function() {
    if (!currentReceiptFile) {
        alert('Chưa có ảnh hóa đơn.');
        return;
    }
    if (!currentUserId) {
        alert('Vui lòng đăng nhập.');
        return;
    }

    const filePath = `receipts/${currentUserId}/${Date.now()}_${currentReceiptFile.name}`;
    const { data, error } = await supabaseClient.storage
        .from('receipts')
        .upload(filePath, currentReceiptFile);

    if (error) {
        alert('Lỗi upload: ' + error.message);
        return;
    }

    const { data: urlData } = supabaseClient.storage
        .from('receipts')
        .getPublicUrl(filePath);
    const imageUrl = urlData.publicUrl;

    const { error: insertError } = await supabaseClient
        .from('receipts')
        .insert({
            user_id: currentUserId,
            image_url: imageUrl,
            amount: currentReceiptAmount || 0,
            created_at: new Date().toISOString(),
            transaction_id: null
        });

   // Tìm đến dòng 648 (trong file app.js cũ)
if (insertError) {
    // Sửa thành:
    alert('Lỗi lưu Supabase: ' + insertError.message); 
    return;
}

        alert('✅ Lưu hóa đơn thành công!');
    fetchReceipts(); 
    document.getElementById('btn-save-receipt').style.display = 'none';
    document.getElementById('receipt-thumb').style.display = 'none';
    currentReceiptFile = null;
    currentReceiptAmount = 0;
});

// Xóa hóa đơn (Sửa lỗi JSON an toàn, không làm vỡ các module khác)
async function deleteReceipt(docId) {
    if (!confirm('Xóa hóa đơn này?')) return;

    const { data, error } = await supabaseClient
        .from('receipts')
        .select('image_url')
        .eq('id', docId);

    if (error) {
        alert('Lỗi lấy thông tin: ' + error.message);
        return;
    }

    if (!data || data.length === 0) {
        alert('Không tìm thấy hóa đơn này (có thể đã bị xóa trước đó).');
        return;
    }

    const receipt = data[0];

    // Xóa file trên Storage
    const urlParts = receipt.image_url.split('/');
    const bucketIndex = urlParts.indexOf('receipts');
    if (bucketIndex !== -1) {
        const filePath = urlParts.slice(bucketIndex + 1).join('/');
        const { error: deleteError } = await supabaseClient.storage
            .from('receipts')
            .remove([filePath]);
        if (deleteError) console.warn('Không xóa được file:', deleteError);
    }

    // Xóa bản ghi trong Database
    const { error: delDbError } = await supabaseClient
        .from('receipts')
        .delete()
        .eq('id', docId)
        .eq('user_id', currentUserId);
    
    if (delDbError) {
        alert('Lỗi xóa: ' + delDbError.message);
    } else {
        fetchReceipts(); // Cập nhật UI ngay lập tức
    }
}

// ================== UTILITY ==================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-menu'));
    document.getElementById('tab-' + tabId).classList.add('active');
    const menuItems = document.querySelectorAll('.sidebar li');
    const tabNames = ['dashboard', 'transactions', 'accounts', 'savings', 'assets', 'debts', 'receipts'];
    const idx = tabNames.indexOf(tabId);
    if (idx !== -1 && menuItems[idx]) {
        menuItems[idx].classList.add('active-menu');
    }
}

function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function clearFilter() {
    document.getElementById('month-filter').value = '';
    document.getElementById('year-filter').value = '';
    renderTransactions();
}

// Đóng modal khi click ra ngoài
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        if (event.target.id === 'camera-modal') stopCamera();
    }
};

// Kiểm tra kết nối Supabase khi load (Chỉ chạy khi đã có user đăng nhập)
(async function checkSupabase() {
    // Đợi trạng thái auth thay đổi (thay vì gọi lúc load trang)
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            try {
                const { error } = await supabaseClient.from('transactions').select('count', { count: 'exact', head: true });
                if (error) {
                    console.warn('Supabase connection warning:', error);
                } else {
                    console.log('✅ Supabase connected successfully');
                }
            } catch (e) {
                console.error('Supabase connection error:', e);
            }
        }
    });
})();

// Đảm bảo các hàm được gọi từ HTML tồn tại
window.registerUser = registerUser;
window.loginUser = loginUser;
window.logoutUser = logoutUser;
window.forgotPassword = forgotPassword;
window.saveTransaction = saveTransaction;
window.saveAccount = saveAccount;
window.saveSavingManual = saveSavingManual;
window.saveAsset = saveAsset;
window.saveDebt = saveDebt;
window.deleteCloudData = deleteCloudData;
window.deleteReceipt = deleteReceipt;
window.downloadReceipt = downloadReceipt;
window.exportExcel = exportExcel;
window.switchTab = switchTab;
window.openModal = openModal;
window.closeModal = closeModal;
window.clearFilter = clearFilter;
window.openCameraModal = openCameraModal;
window.closeCameraModal = closeCameraModal;
window.formatCurrencyInput = formatCurrencyInput;