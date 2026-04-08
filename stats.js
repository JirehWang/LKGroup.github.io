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
        
        if (typeof checkGroupStatus === 'function') {
            await checkGroupStatus();
        } else if (typeof loadAdminData === 'function') {
            await loadAdminData();
        }
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
        alert("⚠️ 系統錯誤：安全路由 (config.js) 尚未載入！");
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
    if (res.groups) {
        res.groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.name; opt.innerText = g.name;
            select.appendChild(opt);
        });
    }
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
        // 💡 關鍵更新：如果是最高權限 且 選了「ALL」，才隱藏主日數據。其餘情況全部顯示！
        const isAllGroups = (isAdmin && group === 'ALL');
        const showSunday = !isAllGroups; 

        if (isAllGroups) {
            res = await callAPI('getAllGroupsStats', { groupCode: code, startDate: start, endDate: end });
            renderMultiStats(res, start, end, true, showSunday); 
        } else {
            res = await callAPI('getStats', { groupName: group, groupCode: code, startDate: start, endDate: end });
            renderMultiStats(res, start, end, false, showSunday); 
        }
    } catch (e) {
        alert("查詢失敗，請稍後再試。");
    } finally {
        hideLoading();
    }
}
// 🌟 條件渲染：依據權限決定是否顯示三合一進度條
function renderMultiStats(res, start, end, showGroupCol, showSunday) {
    if (!res.success) return alert(res.message);
    const thead = document.querySelector('#statsTable thead');
    const tbody = document.querySelector('#statsTable tbody');
    const isSingleDay = (start === end && start !== "");

    if (isSingleDay) {
        let headerHTML = `<tr><th>姓名</th>`;
        if (showGroupCol) headerHTML += `<th>所屬小組</th>`;
        headerHTML += `<th>小組出席</th>`;
        if (showSunday) headerHTML += `<th>主日崇拜</th><th>主日學</th>`;
        headerHTML += `</tr>`;
        thead.innerHTML = headerHTML;

        if (!res.data || res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${showGroupCol ? (showSunday ? 5 : 3) : (showSunday ? 4 : 2)}">當日查無任何紀錄</td></tr>`;
            return;
        }

        tbody.innerHTML = res.data.map(m => {
            let rowHTML = `<tr><td style="font-weight:bold; font-size:16px;">${m.name}</td>`;
            if (showGroupCol) rowHTML += `<td><span style="background:#eee; padding:4px 8px; border-radius:12px; font-size:12px;">${m.group || '未分類'}</span></td>`;
            
            rowHTML += `<td style="font-size:20px;">${m.cell ? '✅' : '❌'}</td>`;
            
            if (showSunday) {
                rowHTML += `
                    <td style="font-size:20px;">${m.sunday ? '✅' : '❌'}</td>
                    <td style="font-size:20px;">${m.school ? '✅' : '❌'}</td>`;
            }
            rowHTML += `</tr>`;
            return rowHTML;
        }).join('');

    } else {
        let headerHTML = `<tr><th style="width:15%">姓名</th>`;
        if (showGroupCol) headerHTML += `<th style="width:15%">所屬小組</th>`;
        
        if (showSunday) {
            headerHTML += `<th style="width:23%">🌱 小組聚會</th><th style="width:23%">⛪ 主日崇拜</th><th style="width:23%">📖 主日學</th></tr>`;
        } else {
            headerHTML += `<th>🌱 小組聚會出席狀況</th></tr>`;
        }
        thead.innerHTML = headerHTML;

        if (!res.data || res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${showGroupCol ? (showSunday ? 5 : 3) : (showSunday ? 4 : 2)}">此區間內查無資料</td></tr>`;
            return;
        }

        tbody.innerHTML = res.data.map(m => {
            let rowHTML = `<tr><td style="font-weight:bold; font-size:16px;">${m.name}</td>`;
            if (showGroupCol) rowHTML += `<td><span style="background:#eee; padding:4px 8px; border-radius:12px; font-size:12px;">${m.group || '未分類'}</span></td>`;
            
            rowHTML += `<td>${createProgressBar(m.cellStr, m.cellRate, 'color-cell')}</td>`;
            
            if (showSunday) {
                rowHTML += `
                    <td>${createProgressBar(m.sundayStr, m.sundayRate, 'color-sunday')}</td>
                    <td>${createProgressBar(m.schoolStr, m.schoolRate, 'color-school')}</td>`;
            }
            rowHTML += `</tr>`;
            return rowHTML;
        }).join('');
    }
}

// 輔助函式：產生進度條 HTML
function createProgressBar(textStr, percentage, colorClass) {
    if (!textStr || textStr === "0/0" || textStr.endsWith("/0")) {
        return `<span style="color:#aaa; font-size:12px;">無聚會</span>`;
    }
    const safePercentage = isNaN(percentage) ? 0 : parseFloat(percentage).toFixed(1);
    
    return `
        <div class="stat-box">
            <div class="stat-labels">
                <span>${textStr}</span>
                <span>${safePercentage}%</span>
            </div>
            <div class="prog-container">
                <div class="prog-bar ${colorClass}" style="width: ${safePercentage}%"></div>
            </div>
        </div>
    `;
}

// --- Excel 匯出功能 (完美支援動態欄位) ---
function exportToExcel() {
    const table = document.getElementById("statsTable");
    if (table.rows.length <= 1) return alert('目前沒有資料可供匯出');
    
    showLoading("正在準備 Excel 檔案...");
    setTimeout(() => {
        let csv = "\ufeff";
        for (let i = 0; i < table.rows.length; i++) {
            const row = [], cols = table.rows[i].cells;
            for (let j = 0; j < cols.length; j++) {
                let cellText = cols[j].innerText;
                cellText = cellText.replace(/\n/g, ' '); 
                row.push(cellText);
            }
            csv += row.join(",") + "\r\n";
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `聚會統計報表_${new Date().toLocaleDateString().replace(/\//g,'-')}.csv`;
        link.click();
        hideLoading();
    }, 500);
}
