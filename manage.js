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
    const code = document.getElementById('adminInput').value.trim(); // ✅ 移除 .toUpperCase()，保持原始大小寫
    if (!code) return alert("請輸入代碼");

    showLoading("驗證權限中...");
    try {
        // 利用原本就有的 findGroupByCode 來驗證是否為最高權限 LK31
        const res = await callAPI('findGroupByCode', { groupCode: code });
        if (res.success && res.isAdmin) {
            verifiedAdminCode = code; // ✅ 儲存已驗證的代碼
            document.getElementById('login-panel').style.display = 'none';
            document.getElementById('manage-panel').style.display = 'block';
            await loadGroups(); // 驗證成功後載入清單
        } else {
            alert("❌ 權限不足或代碼錯誤！");
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
            renderTable();
        } else {
            alert("載入失敗：" + res.message);
        }
    } catch (e) {
        alert("連線發生錯誤: " + e.message);
    } finally {
        hideLoading();
    }
}

// 3. 渲染表格
function renderTable() {
    const tbody = document.querySelector('#groupsTable tbody');
    if (adminGroupsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="color: #999;">目前沒有小組資料</td></tr>';
        return;
    }

    tbody.innerHTML = adminGroupsList.map((g, index) => {
        return `
            <tr>
                <td style="font-weight: bold; font-size: 16px;">${g.name}</td>
                <td><span style="background: #eee; padding: 4px 10px; border-radius: 12px; font-family: monospace;">${g.code}</span></td>
                <td>
                    <button class="btn" style="background: #2196F3; padding: 6px 12px; font-size: 13px;" onclick="openEditModal(${index})">✏️ 編輯</button>
                </td>
            </tr>
        `;
    }).join('');
}

// 4. 開啟編輯彈窗
function openEditModal(index) {
    const group = adminGroupsList[index];
    currentEditingGroup = group; // ✅ 儲存完整的 group 物件（包含 uuid）
    
    document.getElementById('editOldName').value = group.name;
    document.getElementById('editNewName').value = group.name;
    document.getElementById('editNewCode').value = group.code;
    
    document.getElementById('edit-group-modal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('edit-group-modal').style.display = 'none';
}

// 5. 儲存修改
async function saveGroupEdit() {
    const newName = document.getElementById('editNewName').value.trim();
    const newCode = document.getElementById('editNewCode').value.trim(); // ✅ 移除 .toUpperCase()，保持原始大小寫

    if (!newName) return alert("名稱不可為空！");
    if (newCode.length < 4) return alert("代碼至少需要 4 碼！");

    if (newName !== currentEditingGroup.name) {
        if (!confirm(`⚠️ 警告：您即將把【${currentEditingGroup.name}】改名為【${newName}】\n\n系統將會同步重新命名資料庫中的分頁，此動作需要幾秒鐘，確定要執行嗎？`)) {
            return;
        }
    }

    showLoading("正在更新資料庫與同步分頁名稱，請勿關閉網頁...");
    try {
        // ✅ 傳入完整參數，包含 uuid
        const res = await callAPI('updateGroupInfo', { 
            uuid: currentEditingGroup.uuid,        // ✅ 必須傳入 UUID
            oldName: currentEditingGroup.name,     // ✅ 使用原始名稱
            newName: newName, 
            newCode: newCode,
            newStatus: currentEditingGroup.status  // ✅ 保持原狀態不變
        });

        if (res.success) {
            alert('✅ 修改成功！分頁名稱已同步更新。');
            closeEditModal();
            await loadGroups(); // 重新載入最新清單
        } else {
            alert('❌ 修改失敗：' + res.message);
        }
    } catch (e) {
        alert("連線發生錯誤: " + e.message);
    } finally {
        hideLoading();
    }
}
