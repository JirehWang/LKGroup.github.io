// --- Loading 控制函式 ---
function showLoading(msg = "處理中...") {
    document.getElementById('overlay-text').innerText = msg;
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}
// 🛡️ 哨兵機制：確保中央路由 (config.js) 已經準備好
async function ensureAPIReady() {
    let retryCount = 0;
    // 每 100ms 檢查一次，最多等 5 秒 (50次)
    while (typeof window.churchAPI !== 'function' && retryCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retryCount++;
    }
    if (typeof window.churchAPI !== 'function') {
        throw new Error("安全路由載入逾時，請確認網路連線或檔案路徑。");
    }
}
// 🚀 網頁載入初始化邏輯 (包含專屬連結攔截)
window.onload = async () => {
    // 檢查中央路由是否就緒
    if (typeof window.churchAPI !== 'function') {
        alert("⚠️ 系統錯誤：安全路由 (config.js) 尚未載入！請聯絡管理員。");
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const queryId = urlParams.get('id');
    
    // 如果網址帶有 ?id=代碼
    if (queryId) {
        showLoading("正在驗證專屬連結...");
        try {
            // 🌟 使用中央路由發送請求
            const res = await window.churchAPI('findGroupByCode', { groupCode: queryId });
            
            if (res.success) {
                // 驗證成功，直接跳轉到該小組的點名頁面，並帶上名稱與代碼
                document.getElementById('overlay-text').innerText = "進入專屬小組中...";
                window.location.href = `group.html?name=${encodeURIComponent(res.groupName)}&code=${encodeURIComponent(queryId)}`;
            } else {
                alert("專屬連結無效或代碼錯誤！");
                hideLoading();
                fetchGroups(); // 若失敗，則載入正常首頁清單
            }
        } catch (e) {
            alert("驗證連結時發生錯誤。");
            hideLoading();
            fetchGroups();
        }
    } else {
        // 沒有帶 id，正常載入首頁的小組清單
        fetchGroups(); 
    }
};

// 載入小組按鈕清單
async function fetchGroups() {
    showLoading("正在獲取最新小組清單...");
    const container = document.getElementById('group-list-container');
    try {
        // 🌟 使用中央路由發送請求
        const res = await window.churchAPI('getGroups');
        
        if (res.success) {
            container.innerHTML = '';
            res.groups.forEach(group => {
                const btn = document.createElement('button');
                btn.className = 'tag-btn group-tag';
                btn.innerText = group.name;
                btn.onclick = () => enterGroup(group.name);
                container.appendChild(btn);
            });

            const createBtn = document.createElement('button');
            createBtn.className = 'tag-btn create-tag';
            createBtn.innerText = '➕ 創建新小組';
            createBtn.onclick = () => toggleModal(true);
            container.appendChild(createBtn);
        } else {
            container.innerHTML = `<p>讀取失敗：${res.message || '未知錯誤'}</p>`;
        }
    } catch (e) {
        container.innerHTML = '<p>讀取失敗，請重新整理頁面</p>';
    } finally {
        hideLoading();
    }
}

function toggleModal(show) {
    document.getElementById('createModal').style.display = show ? 'block' : 'none';
}

// 建立新小組
async function createNewGroup() {
    const name = document.getElementById('newGroupName').value;
    const code = document.getElementById('newGroupCode').value;
    if (!name || !code) return alert('請填寫完整資訊');

    showLoading("正在雲端建立小組並設定權限...");
    try {
        // 🌟 使用中央路由發送請求
        const res = await window.churchAPI('createGroup', { groupName: name, groupCode: code });
        
        alert(res.message);
        if (res.success) {
            toggleModal(false);
            fetchGroups();
        }
    } catch (e) {
        alert("建立失敗，請稍後再試。");
    } finally {
        hideLoading();
    }
}

// 手動點擊進入小組
async function enterGroup(groupName) {
    const code = prompt(`請輸入【${groupName}】的小組編號：`);
    if (code === null) return;

    showLoading(`正在驗證【${groupName}】的身分...`);
    
    try {
        // 🌟 使用中央路由發送請求
        const res = await window.churchAPI('verifyGroup', { groupName, groupCode: code });
        
        if (res.success) {
            document.getElementById('overlay-text').innerText = "驗證成功，進入小組中...";
            window.location.href = `group.html?name=${encodeURIComponent(groupName)}&code=${encodeURIComponent(code)}`;
        } else {
            hideLoading(); 
            alert(res.message);
        }
    } catch (e) {
        hideLoading();
        alert("驗證時發生網路錯誤。");
    }
}
