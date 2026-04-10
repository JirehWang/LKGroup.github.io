// --- 基礎變數設定 ---
const urlParams = new URLSearchParams(window.location.search);
const groupName = urlParams.get('name');
const groupCode = urlParams.get('code'); 

let currentMembers = []; 
let editingMembers = []; 
let recentRecordsData = []; 

// --- 🚀 啟動哨兵：確保中央路由 (config.js) 已經準備好 ---
async function ensureAPIReady() {
    let retryCount = 0;
    // 每 100 毫秒檢查一次，最多等 5 秒 (50次)
    while (typeof window.churchAPI !== 'function' && retryCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retryCount++;
    }
    if (typeof window.churchAPI !== 'function') {
        throw new Error("安全路由載入逾時，請確認 config.js 是否正常載入。");
    }
}

// --- 📦 網頁載入啟動流程 (優化版) ---
window.onload = async () => {
    try {
        // 1. 先顯示啟動畫面
        showLoading("🚀 正在啟動安全通道...");

        // 2. 哨兵開始守候 API 就緒
        await ensureAPIReady();

        // 3. API 就緒後，執行原本的初始化邏輯
        document.getElementById('displayGroupName').innerText = groupName || '未知名組別';
        document.getElementById('attendanceDate').valueAsDate = new Date();
        
        await checkGroupStatus();

    } catch (e) {
        console.error(e);
        alert("系統啟動失敗：" + e.message);
        hideLoading();
    }
};

// --- 共用 Loading 功能 ---
function showLoading(msg = "處理中...") {
    const textEl = document.getElementById('overlay-text');
    const overlayEl = document.getElementById('loading-overlay');
    if (textEl) textEl.innerText = msg;
    if (overlayEl) overlayEl.style.display = 'flex';
}
function hideLoading() {
    const overlayEl = document.getElementById('loading-overlay');
    if (overlayEl) overlayEl.style.display = 'none';
}

// 🌟 核心修改：移除明碼網址，改用中央路由安全連線
async function callAPI(action, data = {}) {
    if (typeof window.churchAPI !== 'function') {
        throw new Error("安全路由尚未載入");
    }
    // 透過中央路由發送請求
    return await window.churchAPI(action, data);
}

function getRoleClass(role) {
    if (role === '核心同工') return 'role-core';
    if (role === '一般同工') return 'role-general';
    if (role === '小羊') return 'role-sheep';
    return 'role-default';
}

// --- 初始化檢查 ---
async function checkGroupStatus() {
    showLoading("正在載入點名單與聚會紀錄...");
    try {
        const res = await callAPI('checkGroupStatus', { groupName });
        if (res.isInitialized) {
            currentMembers = res.members;
            document.getElementById('attendance-panel').style.display = 'block';
            document.getElementById('init-panel').style.display = 'none'; // 確保隱藏初始化面板
            renderMemberList(res.members);
            
            if (groupCode) {
                document.getElementById('scheduleBtn').style.display = 'inline-block';
                await loadGroupProgress();
            }
        } else {
            document.getElementById('init-panel').style.display = 'block';
            document.getElementById('attendance-panel').style.display = 'none'; // 確保隱藏點名面板
        }
    } catch (e) {
        alert("載入失敗，請重新整理頁面。");
    } finally {
        hideLoading();
    }
}

// --- 跳轉功能 ---
function goToSchedule() {
    if (!groupCode) return alert("未取得小組編號，無法跳轉。");
    window.open(`https://jirehwang.github.io/LKC1958_June_1.github.io/?id=${groupCode}`, '_blank');
}

function goToFullStats() {
    window.open(`https://jirehwang.github.io/LKGroup.github.io/stats.html?id=${groupCode || ''}`, '_blank');
}

// --- 📊 歷史進度表載入與渲染 ---
// --- 📊 歷史進度表載入與渲染 ---
async function loadGroupProgress() {
    const tbody = document.getElementById('progressTableBody');
    if (!tbody) return;
    document.getElementById('progressSection').style.display = 'block';

    try {
        // 💡 關鍵修復：把 startDate 設定為 "RAW_MODE" (專屬暗號)
        // 告訴後端：我只是點名頁面，請直接給我原始紀錄就好，不用幫我算綜合出席率！
        const res = await callAPI('getStats', { 
            groupName: groupName, 
            groupCode: groupCode, 
            startDate: "RAW_MODE", 
            endDate: "" 
        });
        
        if (res.success && res.data.length > 0) {
            recentRecordsData = res.data.slice().reverse().slice(0, 3); 
            
            tbody.innerHTML = recentRecordsData.map((row, index) => {
                const dateObj = new Date(row[0]);
                const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`; 
                
                const fullDateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                row.fullDateStr = fullDateStr; 

                const present = row[1] ? row[1].toString().split(/[,，]/).map(s=>s.trim()).filter(n=>n) : [];
                const newFriends = row[3] ? row[3].toString().split(/[,，]/).map(s=>s.trim()).filter(n=>n) : [];
                const totalCount = present.length + newFriends.length;
                
                let namesHtml = present.join('、');
                if (newFriends.length > 0) {
                    namesHtml += ` <span style="color:#ef6c00; font-size:12px; font-weight:bold;">(+新朋友: ${newFriends.join('、')})</span>`;
                }

                return `
                    <tr>
                        <td><span style="background: #e3f2fd; padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 12px;">${dateStr}</span></td>
                        <td style="font-weight: bold; font-size: 16px;">${totalCount} 人</td>
                        <td style="text-align: left; font-size: 13px; color: #555;">
                            ${namesHtml || '無出席紀錄'}
                            <button class="edit-record-btn" onclick="openEditAttendanceModal(${index})">✏️</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="3" style="color: #999; padding: 20px;">目前尚無聚會紀錄</td></tr>';
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" style="color: red;">讀取紀錄失敗</td></tr>';
    }
}
// --- ✏️ 歷史紀錄修改與刪除 ---
function openEditAttendanceModal(index) {
    const row = recentRecordsData[index];
    const originalDate = row.fullDateStr;
    const presentArr = row[1] ? row[1].toString().split(/[,，]/).map(s=>s.trim()).filter(n=>n) : [];
    const newFriendsStr = row[3] ? row[3].toString() : '';

    document.getElementById('editOriginalDate').value = originalDate;
    document.getElementById('editAttendanceDate').value = originalDate;
    document.getElementById('editNewFriends').value = newFriendsStr;

    const listDiv = document.getElementById('editAttendanceMemberList');
    listDiv.innerHTML = currentMembers.map(m => {
        const isChecked = presentArr.includes(m.name) ? 'checked' : '';
        const roleClass = getRoleClass(m.role);
        return `
            <div class="member-item">
                <input type="checkbox" class="edit-attendance-check" value="${m.name}" ${isChecked}>
                <span class="role-badge ${roleClass}">${m.role}</span>
                <span style="font-size: 16px; font-weight: bold; color: #333;">${m.name}</span>
            </div>
        `;
    }).join('');

    document.getElementById('edit-attendance-modal').style.display = 'block';
}

function closeEditAttendanceModal() {
    document.getElementById('edit-attendance-modal').style.display = 'none';
}

async function submitAttendanceEdit() {
    const originalDate = document.getElementById('editOriginalDate').value;
    const newDate = document.getElementById('editAttendanceDate').value;
    const newFriends = document.getElementById('editNewFriends').value;

    const present = Array.from(document.querySelectorAll('.edit-attendance-check:checked')).map(cb => cb.value);
    const absent = Array.from(document.querySelectorAll('.edit-attendance-check:not(:checked)')).map(cb => cb.value);

    if (present.length === 0 && !newFriends) {
        if (!confirm("修改後出席人數為 0，確定要儲存嗎？")) return;
    }

    showLoading("正在更新點名紀錄...");
    try {
        const res = await callAPI('updateAttendanceRecord', { groupName, originalDate, newDate, present, absent, newFriends });
        if (res.success) {
            alert('修改成功！');
            closeEditAttendanceModal(); // SPA：關閉彈窗
            if (groupCode) await loadGroupProgress(); // SPA：重新載入下方紀錄
        } else { alert('修改失敗：' + res.message); }
    } finally { hideLoading(); }
}

async function deleteAttendanceRecord() {
    const originalDate = document.getElementById('editOriginalDate').value;
    if (!confirm(`確定要將【${originalDate}】的點名紀錄完全刪除嗎？刪除後無法復原喔！`)) return;

    showLoading("正在刪除紀錄...");
    try {
        const res = await callAPI('deleteAttendanceRecord', { groupName, originalDate });
        if (res.success) {
            alert('紀錄已刪除！');
            closeEditAttendanceModal(); // SPA：關閉彈窗
            if (groupCode) await loadGroupProgress(); // SPA：重新載入下方紀錄
        } else { alert('刪除失敗：' + res.message); }
    } finally { hideLoading(); }
}

// --- 📝 名單初始化與管理 ---
async function initGroup() {
    const rawMembers = document.getElementById('memberInput').value.split('\n').filter(n => n.trim());
    if (rawMembers.length === 0) return alert('請輸入名單');
    const members = rawMembers.map(name => ({ name: name.trim(), role: '小羊' }));

    showLoading("正在建立雲端分頁，這可能需要幾秒鐘...");
    try {
        const res = await callAPI('initGroup', { groupName, members });
        if (res.success) { 
            await checkGroupStatus(); // SPA：直接重新驗證狀態，無須重整
        } 
        else { alert(res.message); }
    } finally { hideLoading(); }
}

function renderMemberList(members) {
    const list = document.getElementById('memberList');
    list.innerHTML = members.map(m => {
        const roleClass = getRoleClass(m.role);
        return `
            <div class="member-item">
                <input type="checkbox" class="attendance-check" value="${m.name}">
                <span class="role-badge ${roleClass}">${m.role}</span>
                <span style="font-size: 16px; font-weight: bold; color: #333;">${m.name}</span>
            </div>
        `;
    }).join('');
}

function toggleEditMode() {
    const modal = document.getElementById('edit-modal');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        editingMembers = currentMembers.map(m => ({...m}));
        document.getElementById('newMemberInput').value = ""; 
        renderEditList();
        modal.style.display = 'block';
    }
}

function renderEditList() {
    const container = document.getElementById('editMemberList');
    if (editingMembers.length === 0) {
        container.innerHTML = '<div class="empty-hint">目前名單為空</div>';
        return;
    }
    container.innerHTML = editingMembers.map((m, index) => {
        return `
            <div class="edit-member-item">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight:bold; width: 60px; overflow: hidden; text-overflow: ellipsis;">${m.name}</span>
                    <select class="edit-role-select" onchange="updateMemberRole(${index}, this.value)">
                        <option value="核心同工" ${m.role==='核心同工'?'selected':''}>核心同工</option>
                        <option value="一般同工" ${m.role==='一般同工'?'selected':''}>一般同工</option>
                        <option value="小羊" ${m.role==='小羊'?'selected':''}>小羊</option>
                    </select>
                </div>
                <button class="btn-remove" onclick="removeEditMember(${index})">🗑️ 移除</button>
            </div>
        `;
    }).join('');
}

function updateMemberRole(index, newRole) { editingMembers[index].role = newRole; }

function addEditMember() {
    const input = document.getElementById('newMemberInput');
    const roleSelect = document.getElementById('newMemberRole');
    const newName = input.value.trim();
    const newRole = roleSelect.value;
    
    if (!newName) return alert("請輸入要新增的姓名！");
    if (editingMembers.some(m => m.name === newName)) return alert("此人已經在名單中了！");

    editingMembers.push({ name: newName, role: newRole });
    input.value = ""; 
    renderEditList(); 
}

function removeEditMember(index) {
    const nameToRemove = editingMembers[index].name;
    if (confirm(`確定要將【${nameToRemove}】從名單中移除嗎？`)) {
        editingMembers.splice(index, 1);
        renderEditList();
    }
}

async function saveUpdatedList() {
    if (editingMembers.length === 0) {
        if (!confirm('目前名單為空，確定要清空整個小組名單嗎？')) return;
    } else {
        if (!confirm('確定要儲存這份新名單嗎？')) return;
    }
    showLoading("正在更新雲端名單...");
    try {
        const res = await callAPI('updateMemberList', { groupName, members: editingMembers });
        if (res.success) { 
            alert('名單更新成功！'); 
            currentMembers = [...editingMembers]; // SPA：更新名單暫存
            renderMemberList(currentMembers); // SPA：重新渲染名單
            toggleEditMode(); // SPA：關閉編輯彈窗
        } 
        else { alert('更新失敗：' + res.message); }
    } catch (e) { alert("連線發生錯誤，請稍後再試。"); } finally { hideLoading(); }
}

// --- 💾 今日點名 ---
async function submitAttendance() {
    const date = document.getElementById('attendanceDate').value;
    const present = Array.from(document.querySelectorAll('.attendance-check:checked')).map(cb => cb.value);
    const absent = Array.from(document.querySelectorAll('.attendance-check:not(:checked)')).map(cb => cb.value);
    const newFriends = document.getElementById('newFriends').value;

    if (present.length === 0 && !newFriends) {
        if (!confirm("目前出席人數為 0，確定要送出嗎？")) return;
    }

    showLoading("正在存入點名資料，請勿關閉網頁...");
    try {
        const res = await callAPI('submitAttendance', { groupName, date, present, absent, newFriends });
        if (res.success) { 
            alert('點名成功！'); 
            document.querySelectorAll('.attendance-check').forEach(cb => cb.checked = false); // SPA：清空勾選
            document.getElementById('newFriends').value = ''; // SPA：清空新朋友
            if (groupCode) await loadGroupProgress(); // SPA：重新載入下方紀錄
        } 
        else { alert('失敗：' + res.message); }
    } finally { hideLoading(); }
}
