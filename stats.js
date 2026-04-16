let identifiedGroupName = "";
let isAdmin = false;
let debounceTimer;
const splitRegex = /[^\u4e00-\u9fa5a-zA-Z0-9\s]+/; // 與後端一致的分隔符號

// --- Loading 控制 ---
function showLoading(msg = "處理中...") {
    document.getElementById('overlay-text').innerText = msg;
    document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

// --- 確保路由載入 ---
async function ensureAPIReady() {
    let retryCount = 0;
    while (typeof window.churchAPI !== 'function' && retryCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100)); 
        retryCount++;
    }
}

// --- 系統啟動 ---
window.onload = async () => {
    try {
        showLoading("🚀 正在啟動系統通道...");
        await ensureAPIReady(); 
    } catch (e) {
        console.error(e);
        alert("系統啟動失敗：" + e.message);
    } finally {
        hideLoading();
    }
};

// --- API 呼叫 ---
async function callAPI(action, data = {}) {
    if (typeof window.churchAPI !== 'function') {
        alert("⚠️ 系統錯誤：安全路由尚未載入！");
        throw new Error("安全路由尚未載入");
    }
    return await window.churchAPI(action, data);
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
        }
    }, 1000);
});

async function loadAdminOptions() {
    const res = await callAPI('getGroups');
    const select = document.getElementById('adminGroupSelect');
    select.innerHTML = '<option value="ALL">-- 全小組彙整 --</option>';
    if (res.groups) {
        res.groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.name; opt.innerText = g.name;
            select.appendChild(opt);
        });
    }
}

// --- 數據查詢主入口 ---
async function loadStats() {
    if (!identifiedGroupName) return alert('請先輸入正確的編號並等待識別');
    
    const reportType = document.querySelector('input[name="reportType"]:checked').value;
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const group = isAdmin ? document.getElementById('adminGroupSelect').value : identifiedGroupName;
    const code = document.getElementById('groupCode').value.toUpperCase();

    showLoading("正在彙整報表數據...");
    
    try {
        if (reportType === "WEEKLY") {
            const targetGroup = (group === "ALL") ? "小組清單" : group; 
            const res = await callAPI('getStats', { 
                groupName: targetGroup, 
                groupCode: code, 
                startDate: "RAW_MODE" 
            });
            renderWeeklyStats(res, start, end);
        } else {
            const isAllGroups = (isAdmin && group === 'ALL');
            let res;
            if (isAllGroups) {
                res = await callAPI('getAllGroupsStats', { groupCode: code, startDate: start, endDate: end });
            } else {
                res = await callAPI('getStats', { groupName: group, groupCode: code, startDate: start, endDate: end });
            }
            renderMemberStats(res, start, end, isAllGroups);
        }
    } catch (e) {
        console.error(e);
        alert("查詢失敗：" + e.message);
    } finally {
        hideLoading();
    }
}

// --- 渲染：每週出席人次 (包含出席組員與新朋友名單) ---
function renderWeeklyStats(res, start, end) {
    if (!res.success) return alert(res.message);
    const thead = document.querySelector('#statsTable thead');
    const tbody = document.querySelector('#statsTable tbody');

    thead.innerHTML = `
        <tr>
            <th style="width:15%">聚會日期</th>
            <th style="width:10%">出席人數</th>
            <th style="width:10%">新朋友</th>
            <th style="width:10%">總人次</th>
            <th style="text-align:left;">出席名單 (組員 / ✨新朋友)</th>
        </tr>
    `;

    const sLimit = start ? new Date(start).getTime() : 0;
    const eLimit = end ? new Date(end).getTime() : Infinity;

    const filteredRows = res.data.filter(row => {
        const d = new Date(row[0]).getTime();
        return d >= sLimit && d <= eLimit;
    });

    if (filteredRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">此區間內查無點名紀錄</td></tr>`;
        return;
    }

    filteredRows.sort((a, b) => new Date(b[0]) - new Date(a[0]));

    tbody.innerHTML = filteredRows.map(row => {
        const dateStr = row[0] ? new Date(row[0]).toLocaleDateString() : "未知";
        
        // 解析出席者 (row[1]) 與新朋友 (row[3])
        const presentArr = row[1] ? row[1].toString().split(splitRegex).filter(n => n.trim()) : [];
        const newFriendsArr = row[3] ? row[3].toString().split(splitRegex).filter(n => n.trim()) : [];
        
        const presentCount = presentArr.length;
        const newFriendsCount = newFriendsArr.length;
        const total = presentCount + newFriendsCount;

        // 💡 組合顯示名單：組員用綠色，新朋友用黃色加星星
        const attendeeHTML = presentArr.map(name => 
            `<span style="display:inline-block; background:#e8f5e9; color:#2e7d32; padding:2px 8px; border-radius:4px; margin:2px; font-size:13px; border:1px solid #c8e6c9;">${name}</span>`
        ).join('');

        const newFriendsHTML = newFriendsArr.map(name => 
            `<span style="display:inline-block; background:#fff9c4; color:#f57f17; padding:2px 8px; border-radius:4px; margin:2px; font-size:13px; border:1px solid #ffe082;">✨ ${name}</span>`
        ).join('');

        return `
            <tr>
                <td style="font-weight:bold;">${dateStr}</td>
                <td style="color:#2ecc71; font-weight:bold; font-size:18px;">${presentCount}</td>
                <td style="color:#f1c40f; font-weight:bold; font-size:18px;">${newFriendsCount}</td>
                <td style="background:#f9f9f9; font-weight:bold; font-size:18px;">${total}</td>
                <td style="text-align:left; padding:10px;">
                    ${attendeeHTML}
                    ${newFriendsHTML}
                    ${(!attendeeHTML && !newFriendsHTML) ? '<span style="color:#ccc;">(無人出席)</span>' : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// --- 渲染：組員出席率 ---
function renderMemberStats(res, start, end, showGroupCol) {
    if (!res.success) return alert(res.message);
    const thead = document.querySelector('#statsTable thead');
    const tbody = document.querySelector('#statsTable tbody');
    const isSingleDay = (start === end && start !== "");
    const showSunday = !showGroupCol;

    if (isSingleDay) {
        thead.innerHTML = `
            <tr>
                <th>姓名</th>
                ${showGroupCol ? '<th>所屬小組</th>' : ''}
                <th>小組出席</th>
                ${showSunday ? '<th>主日崇拜</th><th>主日學</th>' : ''}
            </tr>
        `;
        tbody.innerHTML = res.data.map(m => `
            <tr>
                <td style="font-weight:bold;">${m.name}</td>
                ${showGroupCol ? `<td><span class="badge">${m.group}</span></td>` : ''}
                <td style="font-size:20px;">${m.cell ? '✅' : '❌'}</td>
                ${showSunday ? `<td style="font-size:20px;">${m.sunday ? '✅' : '❌'}</td><td style="font-size:20px;">${m.school ? '✅' : '❌'}</td>` : ''}
            </tr>
        `).join('');
    } else {
        thead.innerHTML = `
            <tr>
                <th style="width:15%">姓名</th>
                ${showGroupCol ? '<th style="width:15%">所屬小組</th>' : ''}
                <th style="width: 23%;">🌱 小組出席率</th>
                ${showSunday ? '<th style="width: 23%;">⛪ 主日率</th><th style="width: 23%;">📖 主日學率</th>' : ''}
            </tr>
        `;
        tbody.innerHTML = res.data.map(m => `
            <tr>
                <td style="font-weight:bold;">${m.name}</td>
                ${showGroupCol ? `<td><span class="badge">${m.group}</span></td>` : ''}
                <td>${createProgressBar(m.cellStr, m.cellRate, 'color-cell')}</td>
                ${showSunday ? `<td>${createProgressBar(m.sundayStr, m.sundayRate, 'color-sunday')}</td><td>${createProgressBar(m.schoolStr, m.schoolRate, 'color-school')}</td>` : ''}
            </tr>
        `).join('');
    }
}

function createProgressBar(textStr, percentage, colorClass) {
    if (!textStr || textStr.endsWith("/0")) return `<span style="color:#aaa; font-size:12px;">無數據</span>`;
    const safePercentage = isNaN(percentage) ? 0 : parseFloat(percentage).toFixed(1);
    return `
        <div class="stat-box">
            <div class="stat-labels"><span>${textStr}</span><span>${safePercentage}%</span></div>
            <div class="prog-container"><div class="prog-bar ${colorClass}" style="width: ${safePercentage}%"></div></div>
        </div>
    `;
}

// --- Excel 匯出 ---
function exportToExcel() {
    const table = document.getElementById("statsTable");
    if (table.rows.length <= 1) return alert('目前沒有資料可供匯出');
    showLoading("正在準備 Excel 檔案...");
    setTimeout(() => {
        let csv = "\ufeff";
        for (let i = 0; i < table.rows.length; i++) {
            const row = [], cols = table.rows[i].cells;
            for (let j = 0; j < cols.length; j++) row.push(cols[j].innerText.replace(/\n/g, ' '));
            csv += row.join(",") + "\r\n";
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `統計報表_${new Date().toLocaleDateString().replace(/\//g,'-')}.csv`;
        link.click();
        hideLoading();
    }, 500);
}
