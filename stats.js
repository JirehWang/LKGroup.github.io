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

// 2. 加入這段「哨兵」，確保 config.js 跑完了
async function ensureAPIReady() {
    let retryCount = 0;
    while (typeof window.churchAPI !== 'function' && retryCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100)); 
        retryCount++;
    }
}

// 3. 升級後的啟動入口
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

// 🌟 核心修改：移除明碼網址，改用中央路由安全連線
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
        if (isAdmin && group === 'ALL') {
            res = await callAPI('getAllGroupsStats', { groupCode: code, startDate: start, endDate: end });
            // 全教會模式：傳遞 true 以顯示「小組」欄位
            renderMultiStats(res, start, end, true); 
        } else {
            res = await callAPI('getStats', { groupName: group, groupCode: code, startDate: start, endDate: end });
            // 單一小組模式：傳遞 false 隱藏「小組」欄位
            renderMultiStats(res, start, end, false); 
        }
    } catch (e) {
        alert("查詢失敗，請稍後再試。");
    } finally {
        hideLoading();
    }
}

// 🌟 全新三合一核心渲染函式 (取代原本的 renderSingleStats 與 renderAllStats)
function renderMultiStats(res, start, end, showGroupCol) {
    if (!res.success) return alert(res.message);
    const thead = document.querySelector('#statsTable thead');
    const tbody = document.querySelector('#statsTable tbody');
    const isSingleDay = (start === end && start !== "");

    if (isSingleDay) {
        // --- 📅 單日點名模式 ---
        let headerHTML = `<tr><th>姓名</th>`;
        if (showGroupCol) headerHTML += `<th>所屬小組</th>`;
        headerHTML += `<th>小組出席</th><th>主日崇拜</th><th>主日學</th></tr>`;
        thead.innerHTML = headerHTML;

        if (!res.data || res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${showGroupCol ? 5 : 4}">當日查無任何紀錄</td></tr>`;
            return;
        }

        tbody.innerHTML = res.data.map(m => {
            let rowHTML = `<tr><td style="font-weight:bold; font-size:16px;">${m.name}</td>`;
            if (showGroupCol) rowHTML += `<td><span style="background:#eee; padding:4px 8px; border-radius:12px; font-size:12px;">${m.group || '未分類'}</span></td>`;
            
            // 根據 true/false 顯示打勾或叉叉
            rowHTML += `
                <td style="font-size:20px;">${m.cell ? '✅' : '❌'}</td>
                <td style="font-size:20px;">${m.sunday ? '✅' : '❌'}</td>
                <td style="font-size:20px;">${m.school ? '✅' : '❌'}</td>
            </tr>`;
            return rowHTML;
        }).join('');

    } else {
        // --- 📊 區間統計模式 (進度條) ---
        let headerHTML = `<tr><th style="width:15%">姓名</th>`;
        if (showGroupCol) headerHTML += `<th style="width:15%">所屬小組</th>`;
        headerHTML += `<th style="width:23%">🌱 小組聚會</th><th style="width:23%">⛪ 主日崇拜</th><th style="width:23%">📖 主日學</th></tr>`;
        thead.innerHTML = headerHTML;

        if (!res.data || res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${showGroupCol ? 5 : 4}">此區間內查無資料</td></tr>`;
            return;
        }

        tbody.innerHTML = res.data.map(m => {
            let rowHTML = `<tr><td style="font-weight:bold; font-size:16px;">${m.name}</td>`;
            if (showGroupCol) rowHTML += `<td><span style="background:#eee; padding:4px 8px; border-radius:12px; font-size:12px;">${m.group || '未分類'}</span></td>`;
            
            // 生成三個進度條 (依賴後端提供的 cellStr, cellRate 等資料)
            rowHTML += `
                <td>${createProgressBar(m.cellStr, m.cellRate, 'color-cell')}</td>
                <td>${createProgressBar(m.sundayStr, m.sundayRate, 'color-sunday')}</td>
                <td>${createProgressBar(m.schoolStr, m.schoolRate, 'color-school')}</td>
            </tr>`;
            return rowHTML;
        }).join('');
    }
}

// 輔助函式：產生進度條 HTML
function createProgressBar(textStr, percentage, colorClass) {
    if (!textStr || textStr === "0/0" || textStr.endsWith("/0")) {
        return `<span style="color:#aaa; font-size:12px;">無聚會</span>`;
    }
    // 確保 percentage 是一個有效數字，避免 NaN
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

// --- Excel 匯出功能 ---
function exportToExcel() {
    const table = document.getElementById("statsTable");
    if (table.rows.length <= 1) return alert('目前沒有資料可供匯出');
    
    showLoading("正在準備 Excel 檔案...");
    setTimeout(() => {
        let csv = "\ufeff";
        for (let i = 0; i < table.rows.length; i++) {
            const row = [], cols = table.rows[i].cells;
            for (let j = 0; j < cols.length; j++) {
                // 如果該欄位有進度條文字(例: "4/4 100%")，我們只抓出最上面的字
                let cellText = cols[j].innerText;
                cellText = cellText.replace(/\n/g, ' '); // 處理換行
                row.push(cellText);
            }
            csv += row.join(",") + "\r\n";
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `聚會統計關聯報表_${new Date().toLocaleDateString().replace(/\//g,'-')}.csv`;
        link.click();
        hideLoading();
    }, 500);
}
