/**
 * Statistics.gs - 處理資料彙整與統計 (完美隔離陪伴同工 + 支援管理員權限分級)
 */

const SUNDAY_SPREADSHEET_ID = "1tS_RSufp4Y1F1G84oUxzXCp4g5S5bg8dODzGwi3O_wE"; 

// 💡 定義萬用分隔符號：非中文、非英文、非數字、非空白的字元一律視為分隔符
const splitRegex = /[^\u4e00-\u9fa5a-zA-Z0-9\s]+/;

function cleanName(rawName) {
  if (!rawName) return "";
  let name = rawName.toString().trim();
  name = name.replace(/\(男\)|\(女\)/g, ""); 
  name = name.replace(/\s+/g, ""); 
  return name;
}

function fetchSundayDataEngine(sDate, eDate, targetMembers) {
  const result = {};
  targetMembers.forEach(member => {
    result[member] = {
      sundayDates: new Set(),
      schoolDates: new Set()  
    };
  });
  
  const globalSundayDates = new Set();
  const globalSchoolDates = new Set();

  try {
    const ssSunday = SpreadsheetApp.openById(SUNDAY_SPREADSHEET_ID);
    const sheets = ssSunday.getSheets();
    
    const schoolTargetSheets = ["主日學A/B班", "主日學"]; 
    const sundayTargetSheets = ["台語點名紀錄", "華語點名紀錄", "聯合點名紀錄"];

    sheets.forEach(sheet => {
      const sheetName = sheet.getName();
      const isSchoolSheet = schoolTargetSheets.some(kw => sheetName.includes(kw));
      const isSundaySheet = sundayTargetSheets.some(kw => sheetName.includes(kw));
      if (!isSchoolSheet && !isSundaySheet) return;

      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return; 

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0]) continue; 
        
        const rowDate = new Date(row[0]);
        const time = rowDate.getTime();
        
        if (sDate && time < sDate.getTime()) continue;
        if (eDate && time > eDate.getTime()) continue;

        const dateStr = Utilities.formatDate(rowDate, "GMT+8", "yyyy-MM-dd");
        if (isSchoolSheet) globalSchoolDates.add(dateStr);
        if (isSundaySheet) globalSundayDates.add(dateStr);

        const rawNames = row[1] ? row[1].toString().split(splitRegex) : [];
        const presentNames = rawNames.map(n => cleanName(n)).filter(n => n);

        targetMembers.forEach(member => {
          if (presentNames.includes(member)) {
            if (isSchoolSheet) result[member].schoolDates.add(dateStr);
            else if (isSundaySheet) result[member].sundayDates.add(dateStr);
          }
        });
      }
    });
  } catch (e) {
    console.error("讀取主日表單失敗: " + e.toString());
  }

  const totalSundayDays = globalSundayDates.size;
  const totalSchoolDays = globalSchoolDates.size;
  
  const finalResult = {};
  targetMembers.forEach(member => {
     finalResult[member] = {
         sundayCount: result[member].sundayDates.size,
         sundayTotal: totalSundayDays,
         schoolCount: result[member].schoolDates.size,
         schoolTotal: totalSchoolDays
     };
  });

  return finalResult;
}

/**
 * 1. 取得單一小組統計 (自動過濾陪伴同工進入統計分母)
 */
function getStats(groupName, groupCode, startDate, endDate) {
  const isAdminCall = (groupCode === ADMIN_CODE);
  const isRawMode = (startDate === "RAW_MODE"); 

  if (!isAdminCall) {
    const verify = verifyGroup(groupName, groupCode);
    if (!verify.success) return { success: false, message: "權限不足" };
  }

  const rSheet = getSheetSafely(groupName + "_點名紀錄");
  if (!rSheet) return { success: false, message: "找不到紀錄" };

  const allValues = rSheet.getDataRange().getValues();
  const rows = allValues.slice(1); 

  if (isRawMode) {
      return { success: true, groupName: groupName, isSingleDay: false, data: rows };
  }

  // 💡 關鍵：把「陪伴同工」獨立存放，不加進母體名單 (allMembers)
  const mSheet = getSheetSafely(groupName + "_名單");
  const companionSet = new Set();
  const allMembers = [];
  
  if (mSheet) {
    mSheet.getDataRange().getValues().slice(1).forEach(r => {
      const mName = cleanName(r[0]);
      const role = r[1] ? r[1].toString().trim() : "";
      if (!mName) return;
      
      if (role === "陪伴同工") {
        companionSet.add(mName);
      } else {
        allMembers.push(mName);
      }
    });
  }
  
  const sDate = startDate ? new Date(startDate) : null;
  const eDate = endDate ? new Date(endDate) : null;
  if (sDate) sDate.setHours(0, 0, 0, 0);
  if (eDate) eDate.setHours(23, 59, 59, 999); 
  
  const filteredRows = rows.filter(row => {
    if (!row[0]) return false;
    const time = new Date(row[0]).getTime();
    if (sDate && time < sDate.getTime()) return false;
    if (eDate && time > eDate.getTime()) return false;
    return true;
  });

  const isSingleDay = (startDate === endDate && startDate !== "");
  const sundayData = fetchSundayDataEngine(sDate, eDate, allMembers);

  if (isSingleDay) {
    if (filteredRows.length === 0) return { success: true, groupName: groupName, isSingleDay: true, data: [] };
    
    const row = filteredRows[0];
    const presentNames = row[1] ? row[1].toString().split(splitRegex).map(s => cleanName(s)).filter(n => n) : [];
    
    // 單日統計也只針對 allMembers (已排除陪伴同工)
    const singleDayData = allMembers.map(member => {
        return {
            name: member,
            group: groupName,
            cell: presentNames.includes(member),
            sunday: sundayData[member].sundayCount > 0,
            school: sundayData[member].schoolCount > 0
        };
    });

    return { success: true, groupName: groupName, isSingleDay: true, data: singleDayData };
  }

  // 區間模式
  const totalCellSessions = filteredRows.length;
  const cellCounts = {};
  allMembers.forEach(m => cellCounts[m] = 0);

  filteredRows.forEach(row => {
    const presentList = row[1] ? row[1].toString().split(splitRegex).map(s => cleanName(s)) : [];
    const newFriendsList = row[3] ? row[3].toString().split(splitRegex).map(s => cleanName(s)) : [];
    const combinedList = [...new Set([...presentList, ...newFriendsList])].filter(n => n);

    combinedList.forEach(name => {
      // 💡 遇到陪伴同工出席，直接略過，不計入統計
      if (companionSet.has(name)) return;

      if (cellCounts.hasOwnProperty(name)) {
        cellCounts[name]++;
      } else {
        cellCounts[name] = 1;
        sundayData[name] = { sundayCount: 0, sundayTotal: 0, schoolCount: 0, schoolTotal: 0 };
        allMembers.push(name);
      }
    });
  });

  const intervalData = allMembers.map(member => {
      const cCount = cellCounts[member] || 0;
      const cTotal = totalCellSessions;
      const cRate = cTotal > 0 ? ((cCount / cTotal) * 100).toFixed(1) : 0;
      
      const sData = sundayData[member];
      return {
          name: member,
          group: groupName,
          cellRate: cRate,
          cellStr: `${cCount}/${cTotal}`,
          sundayRate: sData.sundayTotal > 0 ? ((sData.sundayCount / sData.sundayTotal) * 100).toFixed(1) : 0,
          sundayStr: `${sData.sundayCount}/${sData.sundayTotal}`,
          schoolRate: sData.schoolTotal > 0 ? ((sData.schoolCount / sData.schoolTotal) * 100).toFixed(1) : 0,
          schoolStr: `${sData.schoolCount}/${sData.schoolTotal}`
      };
  });

  intervalData.sort((a, b) => parseFloat(b.cellRate) - parseFloat(a.cellRate));
  return { success: true, groupName: groupName, isSingleDay: false, data: intervalData };
}

/**
 * 2. 最高權限：全小組彙整 (同樣過濾陪伴同工)
 */
function getAllGroupsStats(startDate, endDate) {
  const ss = getSs();
  const sheets = ss.getSheets();
  const allMembersData = []; 
  
  const sLimit = startDate ? new Date(startDate) : null;
  const eLimit = endDate ? new Date(endDate) : null;
  if (sLimit) sLimit.setHours(0, 0, 0, 0);
  if (eLimit) eLimit.setHours(23, 59, 59, 999);

  let globalMembers = [];
  const groupSessionCounts = {};

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name.endsWith("_點名紀錄")) {
      const gName = name.replace("_點名紀錄", "");
      const rows = sheet.getDataRange().getValues().slice(1);
      
      const uniqueDates = new Set();
      const memberSet = new Set();
      const companionNames = new Set();
      const mSheet = getSheetSafely(gName + "_名單");

      // 💡 先把該組的陪伴同工找出來
      if (mSheet) {
          mSheet.getDataRange().getValues().slice(1).forEach(r => {
             const mName = cleanName(r[0]);
             if (!mName) return;
             if (r[1] && r[1].toString().trim() === "陪伴同工") {
                 companionNames.add(mName);
             } else {
                 memberSet.add(mName);
             }
          });
      }

      rows.forEach(row => {
        if (!row[0]) return;
        const time = new Date(row[0]).getTime();
        if (sLimit && time < sLimit.getTime()) return;
        if (eLimit && time > eLimit.getTime()) return;
        
        uniqueDates.add(Utilities.formatDate(new Date(row[0]), "GMT+8", "yyyy-MM-dd")); 

        const presentList = row[1] ? row[1].toString().split(splitRegex).map(s => cleanName(s)) : [];
        const newFriendsList = row[3] ? row[3].toString().split(splitRegex).map(s => cleanName(s)) : [];
        const combinedList = [...new Set([...presentList, ...newFriendsList])].filter(n => n);
        
        combinedList.forEach(m => {
            // 💡 若不是陪伴同工才加入大名單
            if (!companionNames.has(m)) memberSet.add(m); 
        });
      });
      
      groupSessionCounts[gName] = uniqueDates.size;
      
      memberSet.forEach(mName => {
         globalMembers.push({ name: mName, group: gName });
      });
    }
  });

  const isSingleDay = (startDate === endDate && startDate !== "");
  
  globalMembers.forEach(memberObj => {
      let cellCount = 0;
      const gName = memberObj.group;
      const mName = memberObj.name;
      
      const rSheet = getSheetSafely(gName + "_點名紀錄");
      if (rSheet) {
          const rows = rSheet.getDataRange().getValues().slice(1);
          rows.forEach(row => {
              if (!row[0]) return;
              const time = new Date(row[0]).getTime();
              if (sLimit && time < sLimit.getTime()) return;
              if (eLimit && time > eLimit.getTime()) return;
              
              const presentList = row[1] ? row[1].toString().split(splitRegex).map(s => cleanName(s)) : [];
              const newFriendsList = row[3] ? row[3].toString().split(splitRegex).map(s => cleanName(s)) : [];
              const combinedList = [...new Set([...presentList, ...newFriendsList])].filter(n => n);
              if (combinedList.includes(mName)) cellCount++;
          });
      }

      if (isSingleDay) {
          allMembersData.push({
              name: mName,
              group: gName,
              cell: cellCount > 0
          });
      } else {
          const cTotal = groupSessionCounts[gName] || 0;
          const cRate = cTotal > 0 ? ((cellCount / cTotal) * 100).toFixed(1) : 0;
          
          allMembersData.push({
              name: mName,
              group: gName,
              cellRate: cRate,
              cellStr: `${cellCount}/${cTotal}`
          });
      }
  });

  if(!isSingleDay){
      allMembersData.sort((a, b) => {
         if (a.group !== b.group) return a.group.localeCompare(b.group);
         return parseFloat(b.cellRate) - parseFloat(a.cellRate);
      });
  }

  return { success: true, groupName: "ALL", isSingleDay: isSingleDay, data: allMembersData };
}

function findGroupByCode(groupCode) {
  const cleanCode = groupCode ? groupCode.toString().trim().toUpperCase() : "";
  if (cleanCode === ADMIN_CODE) return { success: true, groupName: "ADMIN", isAdmin: true };
  
  const sheet = getSheetSafely("小組清單");
  if (!sheet) return { success: false, message: "找不到 '小組清單' 分頁" };
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "清單目前沒有資料" };
  
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < data.length; i++) {
    const sheetCode = data[i][2].toString().trim().toUpperCase();
    if (sheetCode === cleanCode) return { success: true, groupName: data[i][0], isAdmin: false };
  }
  return { success: false, message: "無效的代碼，請重新輸入" };
}

