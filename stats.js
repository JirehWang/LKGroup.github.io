const API_URL = 'https://script.google.com/macros/s/AKfycbzfaWh_ooRTGijLV_7lYFUHFm83oL6DvYt9rt6ze5mDXhtwLv8ymxLX_PGuDTHzmNwe/exec';
let identifiedGroupName = "";
let isAdmin = false;
let debounceTimer;

// --- Loading 控制 ---
function showLoading(msg = "處理中...") {
    document.getElementById('overlay-text').innerText = msg;
    document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

// --- 小組編號即時驗證 ---
document.getElementById('groupCode').addEventListener('input', (e) => {
    const code = e.target.value.trim().toUpperCase();
    const idRes = document.getElementById('idResult');
    const adminSelect = document.getElementById('adminGroupSelect');
    
    clearTimeout(debounceTimer);

    if (code.length === 0) {
        idRes.innerText = '等待輸入...';
        idRes.className = 'status-badge';
        return;
    }

    idRes.innerText = '等待中...';
    idRes.className = 'status-badge status-wait';

    debounceTimer = setTimeout(async () => {
        if (code.length < 4) {
            idRes.innerText = '❌ 字數不足';
            idRes.className = 'status-badge status-err';
            return;
        }

        showLoading("正在驗證小組編號...");
        try {
            const res = await callAPI('findGroupByCode', { groupCode: code });
            if (res.success) {
                identifiedGroupName = res.groupName;
                isAdmin = res.isAdmin;
                idRes.className = 'status-badge status-ok';
                idRes.innerText = isAdmin ? '🛡️ 最高權限模式' : `✅ 小組：${res.groupName}`;
                adminSelect.style.display = isAdmin ? 'inline-block' : 'none';
                if (isAdmin) await loadAdminOptions();
            } else {
                identifiedGroupName = "";
                idRes.innerText = '❌ 查無此代碼';
                idRes.className = 'status-badge status-err';
                adminSelect.style.display = 'none';
            }
        } catch (err) {
            idRes.innerText = '⚠️ 連線異常';
        } finally {
            hideLoading();
        }
    }, 1000);
});

async function loadAdminOptions() {
    const res = await callAPI('getGroups');
    const select = document.getElementById('adminGroupSelect');
    select.innerHTML = '<option value="ALL">-- 全小組彙整 --</option>';
    res.groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.name; opt.innerText = g.name;
        select.appendChild(opt);
    });
}

// --- 數據查詢與渲染 ---
async function loadStats() {
    if (!identifiedGroupName) return alert('請先輸入正確的編號並等待識別');
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const group = isAdmin ? document.getElementById('adminGroupSelect').value : identifiedGroupName;
    const code = document.getElementById('groupCode').value.toUpperCase();

    showLoading("正在從雲端資料庫彙整報表，請稍候...");
    
    try {
        let res;
        if (isAdmin && group === 'ALL') {
            res = await callAPI('getAllGroupsStats', { groupCode: code, startDate: start, endDate: end });
            renderAllStats(res, start, end);
        } else {
            res = await callAPI('getStats', { groupName: group, groupCode: code, startDate: start, endDate: end });
            renderSingleStats(res, start, end);
        }
    } catch (e) {
        alert("查詢失敗，請稍後再試。");
    } finally {
        hideLoading();
    }
}

async function callAPI(action, data) {
    const response = await fetch(API_URL, {
        method: 'POST', 
        body: JSON.stringify({action, data}),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    return await response.json();
}

function renderSingleStats(res, start, end) {
    if (!res.success) return alert(res.message);
    const thead = document.querySelector('#statsTable thead');
    const tbody = document.querySelector('#statsTable tbody');
    const isSingleDay = (start === end && start !== "");

    if (isSingleDay) {
        thead.innerHTML = `<tr><th>類型</th><th>姓名</th><th>狀態</th></tr>`;
        const row = res.data[0] || [];
        if (!row.length) {
            tbody.innerHTML = '<tr><td colspan="3">當日查無點名紀錄</td></tr>';
            return;
        }
        const presentArr = row[1] ? row[1].split(/[,，]/).map(s => s.trim()).filter(n => n) : [];
        const absentArr = row[2] ? row[2].split(/[,，]/).map(s => s.trim()).filter(n => n) : [];
        const newFriendsArr = row[3] ? row[3].split(/[,，]/).map(s => s.trim()).filter(n => n) : [];

        let html = "";
        presentArr.forEach(name => {
            html += `<tr style="background:#e8f5e9"><td>正式成員</td><td>${name}</td><td style="color:#2e7d32; font-weight:bold;">✅ 出席</td></tr>`;
        });
        newFriendsArr.forEach(name => {
            html += `<tr style="background:#fff3e0"><td>✨ 新朋友</td><td>${name}</td><td style="color:#ef6c00; font-weight:bold;">✅ 出席</td></tr>`;
        });
        absentArr.forEach(name => {
            if (!presentArr.includes(name)) {
                html += `<tr style="background:#ffebee"><td>正式成員</td><td>${name}</td><td style="color:#c62828;">❌ 缺席</td></tr>`;
            }
        });
        tbody.innerHTML = html;
    } else {
        thead.innerHTML = `<tr><th>姓名</th><th>聚會次數</th><th>出席次數</th><th>出席率</th></tr>`;
        const totalSessions = res.data.length;
        const counts = {};
        res.data.forEach(row => {
            const p = row[1] ? row[1].split(/[,，]/).map(s => s.trim()) : [];
            const nf = row[3] ? row[3].split(/[,，]/).map(s => s.trim()) : [];
            const dailySet = [...new Set([...p, ...nf])].filter(n => n);
            dailySet.forEach(name => { counts[name] = (counts[name] || 0) + 1; });
        });
        const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
        tbody.innerHTML = sorted.map(([name, count]) => {
            const rate = ((count/totalSessions)*100).toFixed(1);
            return `<tr><td>${name}</td><td>${totalSessions}</td><td>${count}</td><td>${rate}%</td></tr>`;
        }).join('');
    }
}

function renderAllStats(res, start, end) {
    if (!res.success) return alert(res.message);
    const thead = document.querySelector('#statsTable thead');
    const tbody = document.querySelector('#statsTable tbody');
    const isSingleDay = (start === end && start !== "");

    if (isSingleDay) {
        thead.innerHTML = `<tr><th>姓名</th><th>小組</th><th>狀態</th></tr>`;
        tbody.innerHTML = res.members.map(m => `<tr><td>${m.name}</td><td>${m.group}</td><td style="color:green; font-weight:bold;">V</td></tr>`).join('');
    } else {
        thead.innerHTML = `<tr><th>姓名</th><th>小組</th><th>總聚會次數</th><th>出席次數</th><th>出席率</th></tr>`;
        tbody.innerHTML = res.members.map(m => {
            const count = Object.keys(m.attendance).length;
            const total = res.groupSessions[m.group] || 0;
            const rate = total > 0 ? ((count/total)*100).toFixed(1) : 0;
            return `<tr><td>${m.name}</td><td>${m.group}</td><td>${total}</td><td>${count}</td><td>${rate}%</td></tr>`;
        }).join('');
    }
}

// --- Excel 匯出功能 ---
function exportToExcel() {
    const table = document.getElementById("statsTable");
    if (table.rows.length <= 1) return alert('目前沒有資料可供匯出');
    
    showLoading("正在準備 Excel 檔案...");
    setTimeout(() => {
        let csv = "\ufeff";
        for (let i = 0; i < table.rows.length; i++) {
            const row = [], cols = table.rows[i].cells;
            for (let j = 0; j < cols.length; j++) row.push(cols[j].innerText);
            csv += row.join(",") + "\r\n";
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `小組統計報表_${new Date().toLocaleDateString().replace(/\//g,'-')}.csv`;
        link.click();
        hideLoading();
    }, 500);
}
