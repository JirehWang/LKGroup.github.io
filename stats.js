/**
 * 1. 取得單一小組統計 (修正陪伴同工顯示與排序)
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

  const mSheet = getSheetSafely(groupName + "_名單");
  const companionSet = new Set();
  const allMembers = [];
  
  if (mSheet) {
    mSheet.getDataRange().getValues().slice(1).forEach(r => {
      const mName = cleanName(r[0]);
      const role = r[1] ? String(r[1]).trim() : "";
      if (!mName) return;
      
      if (role === "陪伴同工") {
        companionSet.add(mName);
      }
      allMembers.push(mName); // 確保陪伴同工也在名單中
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
    
    const singleDayData = allMembers.map(member => {
        const isCompanion = companionSet.has(member);
        return {
            name: member,
            group: groupName,
            cell: presentNames.includes(member),
            isCompanion: isCompanion,
            // 單日模式也標註不列入統計
            cellRate: isCompanion ? "不列入統計" : (presentNames.includes(member) ? "出席" : "缺席"),
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
      const isCompanion = companionSet.has(member);
      const cCount = cellCounts[member] || 0;
      const cTotal = totalCellSessions;
      const cRate = cTotal > 0 ? ((cCount / cTotal) * 100).toFixed(1) : 0;
      
      const sData = sundayData[member];
      return {
          name: member,
          group: groupName,
          isCompanion: isCompanion,
          cellRate: isCompanion ? "不列入統計" : cRate,
          cellStr: isCompanion ? "-" : `${cCount}/${cTotal}`,
          sundayRate: sData.sundayTotal > 0 ? ((sData.sundayCount / sData.sundayTotal) * 100).toFixed(1) : 0,
          sundayStr: `${sData.sundayCount}/${sData.sundayTotal}`,
          schoolRate: sData.schoolTotal > 0 ? ((sData.schoolCount / sData.schoolTotal) * 100).toFixed(1) : 0,
          schoolStr: `${sData.schoolCount}/${sData.schoolTotal}`
      };
  });

  // 排序：陪伴同工固定在最下方 (-1)，其餘按出席率排
  intervalData.sort((a, b) => {
      const rateA = a.isCompanion ? -1 : parseFloat(a.cellRate);
      const rateB = b.isCompanion ? -1 : parseFloat(b.cellRate);
      return rateB - rateA;
  });

  return { success: true, groupName: groupName, isSingleDay: false, data: intervalData };
}

/**
 * 2. 最高權限：全小組彙整 (修正變數名稱一致性)
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
  const globalCompanionMap = {}; // 紀錄每個人的陪伴同工狀態

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name.endsWith("_點名紀錄")) {
      const gName = name.replace("_點名紀錄", "");
      const rows = sheet.getDataRange().getValues().slice(1);
      
      const uniqueDates = new Set();
      const memberSet = new Set();
      const mSheet = getSheetSafely(gName + "_名單");

      if (mSheet) {
          mSheet.getDataRange().getValues().slice(1).forEach(r => {
             const mName = cleanName(r[0]);
             if (!mName) return;
             if (r[1] && String(r[1]).trim() === "陪伴同工") {
                 globalCompanionMap[gName + "_" + mName] = true;
             }
             memberSet.add(mName);
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
        
        combinedList.forEach(m => memberSet.add(m));
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
      const isCompanion = globalCompanionMap[gName + "_" + mName] || false;
      
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
              cell: cellCount > 0,
              isCompanion: isCompanion
          });
      } else {
          const cTotal = groupSessionCounts[gName] || 0;
          const cRate = cTotal > 0 ? ((cellCount / cTotal) * 100).toFixed(1) : 0;
          
          allMembersData.push({
              name: mName,
              group: gName,
              isCompanion: isCompanion,
              cellRate: isCompanion ? "不列入統計" : cRate,
              cellStr: isCompanion ? "-" : `${cellCount}/${cTotal}`
          });
      }
  });

  if(!isSingleDay){
      allMembersData.sort((a, b) => {
         // 先按小組名稱排
         if (a.group !== b.group) return a.group.localeCompare(b.group);
         // 同組內，按出席率排，陪伴同工墊底
         const rateA = a.isCompanion ? -1 : parseFloat(a.cellRate);
         const rateB = b.isCompanion ? -1 : parseFloat(b.cellRate);
         return rateB - rateA;
      });
  }

  return { success: true, groupName: "ALL", isSingleDay: isSingleDay, data: allMembersData };
}
