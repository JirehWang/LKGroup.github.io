let adminGroupsList = [];
let currentEditingGroup = null; // 改為儲存完整的 group 物件（包含 uuid）
let verifiedAdminCode = ""; // 儲存已驗證的管理員代碼

async function ensureAPIReady() {
    let retryCount = 0;
    while (typeof window.churchAPI !== 'function' && retryCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100)); 
        retryCount++;
    }
}

window.onload = async () => {
    try {
        await ensureAPIReady(); 
    } catch (e) {
        alert("系統路由啟動失敗，請重新整理");
    }
};

function showLoading(msg = "處理中...") {
    document.getElementById('overlay-text').innerText = msg;
    document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

async function callAPI(action, data = {}) {
    if (typeof window.churchAPI !== 'function') throw new Error("安全路由尚未載入");
    return await window.churchAPI(action, data);
}

// 1. 驗證管理員身分
async function verifyAdmin() {
    const code = document.getElementById('adminInput').value.trim();
    if (!code) return alert("請輸入代碼");

    showLoading("驗證權限中...");
    try {
        // 利用原本就有的 findGroupByCode 來驗證
        const res = await callAPI('findGroupByCode', { groupCode: code });
        
        // ✅ 修復：只要驗證成功就放行（不論是管理員還是小組長）
        if (res.success) {
            verifiedAdminCode = code; // ✅ 儲存已驗證的代碼
            document.getElementById('login-panel').style.display = 'none';
            document.getElementById('manage-panel').style.display = 'block';
            await loadGroups(); // 驗證成功後載入清單
        } else {
            // 只有驗證失敗才顯示錯誤
            alert("❌ 權限不足或代碼錯誤！\n詳細訊息: " + (res.message || "查無此代碼"));
        }
    } catch (e) {
        alert("連線發生錯誤: " + e.message);
    } finally {
        hideLoading();
    }
}

// 2. 載入小組清單
async function loadGroups() {
    showLoading("正在撈取小組資料庫...");
    try {
        // ✅ 傳入已驗證的管理員代碼
        const res = await callAPI('getAdminGroupsList', { authCode: verifiedAdminCode });
        if (res.success) {
            adminGroupsList = res.groups;
            updatePermissionBadge(res.isAdmin); // ✅ 更新權限徽章
            renderTable(res.isAdmin); // ✅ 傳入權限等級
        } else {
            alert("載入失敗：" + res.message);
        }
    } catch (e) {
        alert("連線發生錯誤: " + e.message);
    } finally {
        hideLoading();
    }
}

// 2.5 更新權限徽章顯示
function updatePermissionBadge(isAdmin) {
    const badge = document.getElementById('permission-badge');
    if (isAdmin) {
        badge.innerHTML = '👑 最高權限 - 系統管理員';
        badge.style.background = '#c62828';
    } else {
        badge.innerHTML = '👤 小組權限 - 小組管理員';
        badge.style.background = '#FF9800';
    }
}

// 3. 渲染表格
function renderTable(isAdmin) {
    const tbody = document.querySelector('#groupsTable tbody');
    const dateColumn = document.getElementById('dateColumn');
    
    // ✅ 根據權限動態調整欄位顯示
    if (isAdmin) {
        dateColumn.style.display = ''; // 顯示日期欄
    } else {
        dateColumn.style.display = 'none'; // 隱藏日期欄
    }
    
    if (adminGroupsList.length === 0) {
        const colspan = isAdmin ? '5' : '4';
        tbody.innerHTML = `<tr><td colspan="${colspan}" style="color: #999;">目前沒有小組資料</td></tr>`;
        return;
    }

    tbody.innerHTML = adminGroupsList.map((g, index) => {
        // 狀態顯示樣式
        const statusBadge = g.status === '顯示' 
            ? '<span style="background: #4CAF50; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px;">✅ 顯示</span>'
            : '<span style="background: #9E9E9E; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px;">🚫 隱藏</span>';
        
        // 日期格式化
        const dateDisplay = g.date ? formatDate(g.date) : '-';
        
        // ✅ 根據權限決定顯示的欄位
        const dateCell = isAdmin ? `<td style="color: #666; font-size: 14px;">${dateDisplay}</td>` : '';
        
        return `
            <tr>
                <td style="font-weight: bold; font-size: 16px;">${g.name}</td>
                <td><span style="background: #eee; padding: 4px 10px; border-radius: 12px; font-family: monospace;">${g.code}</span></td>
                <td>${statusBadge}</td>
                ${dateCell}
                <td>
                    <button class="btn" style="background: #2196F3; padding: 6px 12px; font-size: 13px;" onclick="openEditModal(${index})">✏️ 編輯</button>
                </td>
            </tr>
        `;
    }).join('');
}

// 3.5 日期格式化輔助函數
function formatDate(dateValue) {
    if (!dateValue) return '-';
    
    // 處理 Google Sheets 的日期物件或字串
    let date;
    if (typeof dateValue === 'string') {
        date = new Date(dateValue);
    } else if (dateValue instanceof Date) {
        date = dateValue;
    } else {
        return String(dateValue); // 無法解析的格式直接顯示
    }
    
    if (isNaN(date.getTime())) return String(dateValue);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

// 4. 開啟編輯彈窗
function openEditModal(index) {
    const group = adminGroupsList[index];
    currentEditingGroup = group; // ✅ 儲存完整的 group 物件（包含 uuid）
    
    document.getElementById('editOldName').value = group.name;
    document.getElementById('editNewName').value = group.name;
    document.getElementById('editNewCode').value = group.code;
    document.getElementById('editNewStatus').value = group.status || '顯示'; // ✅ 載入狀態
    
    document.getElementById('edit-group-modal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('edit-group-modal').style.display = 'none';
}

// 5. 儲存修改
async function saveGroupEdit() {
    const newName = document.getElementById('editNewName').value.trim();
    const newCode = document.getElementById('editNewCode').value.trim();
    const newStatus = document.getElementById('editNewStatus').value; // ✅ 讀取狀態

    if (!newName) return alert("名稱不可為空！");
    if (newCode.length < 4) return alert("代碼至少需要 4 碼！");

    // 檢查是否有實質性的修改
    const hasChanges = 
        newName !== currentEditingGroup.name || 
        newCode !== currentEditingGroup.code || 
        newStatus !== currentEditingGroup.status;
    
    if (!hasChanges) {
        return alert("⚠️ 您沒有做任何修改！");
    }

    if (newName !== currentEditingGroup.name) {
        if (!confirm(`⚠️ 警告：您即將把【${currentEditingGroup.name}】改名為【${newName}】\n\n系統將會同步重新命名資料庫中的分頁，此動作需要幾秒鐘，確定要執行嗎？`)) {
            return;
        }
    }

    showLoading("正在更新資料庫與同步分頁名稱，請勿關閉網頁...");
    try {
        // ✅ 傳入完整參數，包含 uuid 和 status
        const res = await callAPI('updateGroupInfo', { 
            uuid: currentEditingGroup.uuid,        // ✅ 必須傳入 UUID
            oldName: currentEditingGroup.name,     // ✅ 使用原始名稱
            newName: newName, 
            newCode: newCode,
            newStatus: newStatus                   // ✅ 傳入新狀態
        });

        if (res.success) {
            alert('✅ 修改成功！分頁名稱已同步更新。');
            closeEditModal();
            
            // ✅ 如果代碼被修改了，更新本地儲存的代碼
            if (newCode !== currentEditingGroup.code) {
                verifiedAdminCode = newCode;
            }
            
            await loadGroups(); // 重新載入最新清單
        }
        } else {
            alert('❌ 修改失敗：' + res.message);
        }
    } catch (e) {
        alert("連線發生錯誤: " + e.message);
    } finally {
        hideLoading();
    }
}
