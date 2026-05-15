/**
 * 성동노인종합복지관 업무일지 시스템 - 백엔드 스크립트 (최종 병합셀 대응 및 날짜파싱 강화 버전)
 * [업데이트] 취업팀 싸인 이미지 구글 드라이브 업로드 및 시트 자동 반영 기능 포함
 */

// =========================================================================
// [0] 상단 커스텀 메뉴 만들기
// =========================================================================
function onOpen() {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('🪄 시트 정리 작업')
        .addItem('색칠 + 테두리 긋기', 'runScheduleManagement')
        .addSeparator()
        .addItem('⚠️ 유실된 싸인 링크 복구하기', 'recoverDeletedSignatures')
        .addToUi();
}

function doGet(e) {
    try {
        var action = e.parameter.action;
        var team = e.parameter.team;
        var teacher = e.parameter.teacher;

        if (action === 'getTeachers') {
            return ContentService.createTextOutput(JSON.stringify({
                teachers: getTeacherList(team)
            })).setMimeType(ContentService.MimeType.JSON);
        }

        if (action === 'getScheduleAll') {
            return ContentService.createTextOutput(JSON.stringify(
                getTeacherScheduleAll(team, teacher)
            )).setMimeType(ContentService.MimeType.JSON);
        }

        if (action === 'saveLog') {
            var result = saveLog(e.parameter);
            return ContentService.createTextOutput(JSON.stringify(result))
                .setMimeType(ContentService.MimeType.JSON);
        }

        if (action === 'saveLogBatch') {
            var result = saveLogBatch(e.parameter);
            return ContentService.createTextOutput(JSON.stringify(result))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // 새로 추가된 부분: 웹앱에서 모든 데이터 저장이 끝난 후 딱 한 번만 테두리/색칠을 실행하는 신호
        if (action === 'runFormat') {
            var sheet = getSheetByTeamName(team);
            if (sheet) {
                runScheduleManagement(sheet.getParent());
                return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
            }
            return ContentService.createTextOutput(JSON.stringify({ success: false })).setMimeType(ContentService.MimeType.JSON);
        }

        // [수정] action 또는 type 모두 대응 가능하도록 개선, date 파라미터 추가
        if (action === 'getAllSigns' || e.parameter.type === 'getAllSigns' || action === 'getSignsByDate') {
            var targetDate = e.parameter.date;
            var finalSigns = getFormattedSignData(team, targetDate);
            return ContentService.createTextOutput(JSON.stringify(finalSigns)).setMimeType(ContentService.MimeType.JSON);
        }

        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "알 수 없는 액션입니다: " + action }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        // 에러 발생 시에도 JSON으로 반환하여 CORS 차단을 방지
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: err.toString(),
            message: "백엔드 실행 중 오류가 발생했습니다."
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

// 전용 싸인 데이터 추출 함수 추가 (targetDate가 있으면 해당 날짜만 추출)
function getFormattedSignData(team, targetDate) {
    var sheet = getSheetByTeamName(team);
    if (!sheet) return {};
    var range = sheet.getDataRange();
    var data = range.getValues();
    var formulas = range.getFormulas();
    var dates = data[1];
    var signMap = {};

    var currentTeacher = "";
    for (var i = 2; i < data.length; i++) {
        if (data[i][1] && data[i][1].toString().trim() !== "") {
            currentTeacher = data[i][1].toString().trim();
        }
        var category = data[i][3] ? data[i][3].toString().trim() : "";
        var shiftTime = data[i][2] ? data[i][2].toString().trim() : "";

        // '싸인' 행인 경우에만 처리
        if (category === "싸인" && shiftTime !== "") {
            for (var col = 4; col < dates.length; col++) {
                var dateStr = formatDate(dates[col]);
                if (!dateStr) continue;

                // targetDate가 지정된 경우, 해당 날짜가 아니면 스킵
                if (targetDate && dateStr !== targetDate) continue;

                var formula = formulas[i][col];
                var location = "";

                // IMAGE 수식 파싱
                if (formula && formula.toUpperCase().indexOf("IMAGE") !== -1) {
                    var match = formula.match(/IMAGE\s*\(\s*["']([^"']+)["']/i);
                    if (match && match[1]) location = match[1];
                } else if (data[i][col] && data[i][col].toString().startsWith('http')) {
                    location = data[i][col].toString().trim();
                }

                if (location) {
                    if (!signMap[dateStr]) signMap[dateStr] = {};
                    // "강사명_시간" 복합 키 생성
                    signMap[dateStr][currentTeacher + "_" + shiftTime] = { location: location };
                    // 호환성을 위해 "시간" 단독 키도 추가
                    signMap[dateStr][shiftTime] = { location: location };
                }
            }
        }
    }
    return signMap;
}

function getSheetByTeamName(teamNameFromWeb) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
        if (sheets[i].getName().indexOf(teamNameFromWeb) !== -1) {
            return sheets[i];
        }
    }
    return null;
}

function getTeacherList(team) {
    var sheet = getSheetByTeamName(team);
    if (!sheet) return [];
    var names = sheet.getRange("B3:B200").getValues();
    var list = [];
    for (var i = 0; i < names.length; i++) {
        var name = names[i][0] ? names[i][0].toString().trim() : "";
        if (name && name !== "성명" && list.indexOf(name) === -1) {
            list.push(name);
        }
    }
    return list;
}

function getTeacherScheduleAll(team, teacherName) {
    var sheet = getSheetByTeamName(team);
    if (!sheet) return {};
    var range = sheet.getDataRange();
    var data = range.getValues();
    var formulas = range.getFormulas(); // 공식도 함께 가져옴
    var schedule = {};
    var dates = data[1];
    var currentTeacher = "";
    for (var i = 2; i < data.length; i++) {
        if (data[i][1] && data[i][1].toString().trim() !== "") {
            currentTeacher = data[i][1].toString().trim();
        }
        if (teacherName === "__ALL__" || currentTeacher === teacherName.trim()) {
            var shiftTime = data[i][2] ? data[i][2].toString().trim() : "";
            if (shiftTime !== "") {
                for (var col = 4; col < dates.length; col++) {
                    var dateStr = formatDate(dates[col]);
                    if (!dateStr) continue;
                    if (!schedule[dateStr]) schedule[dateStr] = {};

                    var studentRaw = data[i][col];
                    var locationRaw = data[i + 1][col];
                    var statusRaw = data[i + 2][col];

                    // 취업팀의 경우, locationRaw가 비어있어도 IMAGE 공식이 있으면 URL 추출
                    if (team.indexOf("취업팀") !== -1) {
                        var formula = formulas[i + 1][col];
                        if (formula && formula.toUpperCase().indexOf("IMAGE") !== -1) {
                            // 대소문자, 공백, 따옴표 유연하게 대응하는 정규식
                            var match = formula.match(/IMAGE\s*\(\s*["']([^"']+)["']/i);
                            if (match && match[1]) {
                                locationRaw = match[1];
                            }
                        }
                    }

                    schedule[dateStr][shiftTime] = {
                        student: (studentRaw == null || studentRaw === "") ? "" : studentRaw.toString().trim(),
                        location: (locationRaw == null || locationRaw === "") ? "" : locationRaw.toString().trim(),
                        status: (statusRaw == null || statusRaw === "") ? "" : statusRaw.toString().trim()
                    };
                }
                i += 2;
            }
        }
    }
    return schedule;
}

function saveLog(p) {
    try {
        var sheet = getSheetByTeamName(p.team);
        if (!sheet) return { success: false, message: "시트를 찾을 수 없습니다." };
        var data = sheet.getDataRange().getValues();
        var dates = data[1];
        var targetCol = -1;
        for (var col = 4; col < dates.length; col++) {
            if (formatDate(dates[col]) === p.date) {
                targetCol = col + 1;
                break;
            }
        }
        if (targetCol === -1) return { success: false, message: "날짜를 찾지 못했습니다." };
        var currentTeacher = "";
        for (var i = 2; i < data.length; i++) {
            if (data[i][1] && data[i][1].toString().trim() !== "") {
                currentTeacher = data[i][1].toString().trim();
            }
            if (currentTeacher === p.teacher.trim()) {
                var rowShift = data[i][2] ? data[i][2].toString().trim() : "";
                if (rowShift === p.shift) {

                    var studentCell = sheet.getRange(i + 1, targetCol);
                    var locationCell = sheet.getRange(i + 2, targetCol);
                    var statusCell = sheet.getRange(i + 3, targetCol);

                    // 데이터 저장
                    studentCell.setValue(p.student);
                    locationCell.setValue(p.location);

                    statusCell.setNumberFormat("@");
                    statusCell.setValue(p.status);

                    var currentStatus = p.status ? p.status.toString() : "";
                    if (currentStatus.indexOf("결석") !== -1 || currentStatus.indexOf("취소") !== -1) {
                        statusCell.setFontColor("red");
                        statusCell.setFontWeight("bold");
                    } else {
                        statusCell.setFontColor("black");
                        statusCell.setFontWeight("bold");
                    }
                    var byteLength = currentStatus ? Utilities.newBlob(currentStatus).getBytes().length : 0;
                    if (byteLength > 15) {
                        statusCell.setFontSize(10);
                    } else {
                        statusCell.setFontSize(13);
                    }

                    // ★ [형 요청 완벽 반영] 저장할 때 '보조강사' 단어 포함 여부에 따라 배경색 즉시 칠하기
                    var studentText = p.student ? p.student.toString() : "";
                    var locationText = p.location ? p.location.toString() : "";

                    // 학생(대상) 칸 색칠 로직
                    if (studentText.indexOf("보조강사") !== -1) {
                        studentCell.setBackground("#ffff00"); // 보조강사면 노란색
                    } else {
                        studentCell.setBackground("#eeeeee"); // 그 외는 연한 회색
                    }

                    // 장소 칸 색칠 로직 (장소에 보조강사가 적힐 경우도 대비)
                    if (locationText.indexOf("보조강사") !== -1) {
                        locationCell.setBackground("#ffff00"); // 장소에 보조강사 쓰면 노란색
                    } else {
                        locationCell.setBackground("#ffffff"); // 장소는 기본적으로 표를 위해 흰색 유지
                    }

                    // ★ 수정됨: 전체 시트 포맷팅하는 무거운 함수를 여기서 빼고, 바로바로 배경색만 칠하도록 최적화했습니다.
                    return { success: true };
                }
            }
        }
        return { success: false, message: "선생닙 정보를 찾지 못했습니다." };
    } catch (e) {
        return { success: false, message: e.toString() };
    }
}

function formatDate(date) {
    if (!date) return "";
    var timeZone = Session.getScriptTimeZone();

    if (date instanceof Date) {
        if (isNaN(date.getTime())) return "";
        // 타임존 오차를 방지하기 위해 Utilities.formatDate 사용
        return Utilities.formatDate(date, timeZone, "yyyy-MM-dd");
    }

    var str = date.toString().trim();
    var match = str.match(/(\d+)\/(\d+)/);
    if (match) {
        var m = String(match[1]).padStart(2, '0');
        var d = String(match[2]).padStart(2, '0');
        var year = new Date().getFullYear();
        return year + '-' + m + '-' + d;
    }

    var fallbackDate = new Date(str);
    if (!isNaN(fallbackDate.getTime())) {
        return Utilities.formatDate(fallbackDate, timeZone, "yyyy-MM-dd");
    }
    return "";
}

/**
 * 여러 개의 로그를 한 번에 저장하는 배치 함수
 * p: { team, teacher, date, items: [ { shift, student, location, status, signatureData }, ... ] }
 */
function saveLogBatch(p) {
    try {
        // 문자열로 넘어온 경우 파싱
        if (typeof p.items === 'string') {
            p.items = JSON.parse(p.items);
        }
        
        var sheet = getSheetByTeamName(p.team);
        if (!sheet) return { success: false, message: "시트를 찾을 수 없습니다." };
        
        var data = sheet.getDataRange().getValues();
        var dates = data[1];
        var targetCol = -1;
        for (var col = 4; col < dates.length; col++) {
            if (formatDate(dates[col]) === p.date) {
                targetCol = col + 1;
                break;
            }
        }
        if (targetCol === -1) return { success: false, message: "날짜를 찾지 못했습니다." };

        var items = p.items || [];
        var itemMap = {};
        items.forEach(function(item) {
            itemMap[item.shift.trim()] = item;
        });

        var results = [];
        var currentTeacher = "";
        var foundCount = 0;
        
        // 시트 전체를 한 번 순회하며 해당하는 행을 찾아서 업데이트
        for (var i = 2; i < data.length; i++) {
            if (data[i][1] && data[i][1].toString().trim() !== "") {
                currentTeacher = data[i][1].toString().trim();
            }
            
            if (currentTeacher === p.teacher.trim()) {
                var rowShift = data[i][2] ? data[i][2].toString().trim() : "";
                if (itemMap[rowShift]) {
                    var item = itemMap[rowShift];
                    
                    var studentCell = sheet.getRange(i + 1, targetCol);
                    var locationCell = sheet.getRange(i + 2, targetCol);
                    var statusCell = sheet.getRange(i + 3, targetCol);

                    var finalLocation = item.location || "";
                    
                    // 싸인 데이터 처리 (취업팀 등)
                    if (item.signatureData) {
                        var uploadRes = uploadSignatureToDrive(p.date, p.teacher, item.shift, item.student, item.signatureData);
                        if (uploadRes.success) {
                            finalLocation = uploadRes.url;
                        } else if (item.signatureData === "__DELETE__") {
                            finalLocation = "";
                        }
                    }

                    // 데이터 저장
                    studentCell.setValue(item.student || "");
                    locationCell.setValue(finalLocation);

                    statusCell.setNumberFormat("@");
                    statusCell.setValue(item.status || "");

                    // 포맷팅
                    var currentStatus = item.status ? item.status.toString() : "";
                    if (currentStatus.indexOf("결석") !== -1 || currentStatus.indexOf("취소") !== -1) {
                        statusCell.setFontColor("red").setFontWeight("bold");
                    } else {
                        statusCell.setFontColor("black").setFontWeight("bold");
                    }
                    
                    var byteLength = currentStatus ? Utilities.newBlob(currentStatus).getBytes().length : 0;
                    statusCell.setFontSize(byteLength > 15 ? 10 : 13);

                    // 배경색
                    var studentText = (item.student || "").toString();
                    studentCell.setBackground(studentText.indexOf("보조강사") !== -1 ? "#ffff00" : "#eeeeee");
                    
                    var locationText = finalLocation.toString();
                    locationCell.setBackground(locationText.indexOf("보조강사") !== -1 ? "#ffff00" : "#ffffff");

                    results.push({ shift: item.shift, success: true, url: finalLocation });
                    foundCount++;
                    
                    if (foundCount >= items.length) break;
                }
            }
        }

        SpreadsheetApp.flush();
        return { success: true, results: results };
    } catch (e) {
        return { success: false, message: e.toString() };
    }
}

/**
 * 싸인 이미지를 구글 드라이브에 업로드하는 공용 함수
 */
function uploadSignatureToDrive(date, teacher, shift, student, signatureData) {
    try {
        var studentSafeName = student ? student.replace(/[^가-힣a-zA-Z0-9]/g, "") : "이름없음";
        var teacherSafeName = teacher ? teacher.replace(/[^가-힣a-zA-Z0-9]/g, "") : "선생님없음";
        var shiftSafeName = shift ? shift.replace(/[^0-9]/g, "") : "시간없음";
        var filePrefix = date + "_" + teacherSafeName + "_" + shiftSafeName + "_" + studentSafeName;

        var folderIter = DriveApp.getFoldersByName("취업팀 수업 싸인");
        var folder = folderIter.hasNext() ? folderIter.next() : DriveApp.createFolder("취업팀 수업 싸인");

        // 기존 파일 삭제
        var existingFiles = folder.searchFiles("title contains '" + filePrefix + "' and trashed = false");
        while (existingFiles.hasNext()) {
            var f = existingFiles.next();
            if (f.getName().indexOf(filePrefix) === 0) f.setTrashed(true);
        }

        if (signatureData && signatureData.indexOf("data:image") === 0) {
            var base64Data = signatureData.split(",")[1];
            var fileName = filePrefix + "_" + Date.now() + ".png";
            var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/png", fileName);
            var file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            return { success: true, url: "https://drive.google.com/uc?export=view&id=" + file.getId() };
        }
        
        return { success: false, mode: "delete" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function doPost(e) {
    try {
        // =========================================================================
        // ★ [추가됨] 취업팀 싸인 이미지 저장 로직 (x-www-form-urlencoded 요청 처리)
        // =========================================================================
        if (e.parameter && e.parameter.action === "saveSignatureLog") {
            return handleSignatureUpload(e.parameter);
        }
        if (e.parameter && e.parameter.action === "saveLogBatch") {
            // x-www-form-urlencoded 로 오는 경우 (POST body에 action이 포함된 경우)
            return ContentService.createTextOutput(JSON.stringify(saveLogBatch(e.parameter)))
                .setMimeType(ContentService.MimeType.JSON);
        }

        var parsedData = {};
        try {
            parsedData = JSON.parse(e.postData.contents);
        } catch(ex) {
            // JSON 파싱 실패 시 e.parameter 활용
            parsedData = e.parameter;
        }

        if (parsedData.action === "saveLogBatch" || parsedData.mode === "batch") {
             return ContentService.createTextOutput(JSON.stringify(saveLogBatch(parsedData)))
                .setMimeType(ContentService.MimeType.JSON);
        }

        var parsedData = JSON.parse(e.postData.contents);
        var docId = parsedData.documentId;
        var ss = SpreadsheetApp.openById(docId);

        // ★ 새로 추가된 모드: 여러 시트를 한꺼번에 넘겨받아 딱 한 번만 색칠/테두리 작업을 실행합니다!
        if (parsedData.mode === "format_only") {
            var targetTeamNames = parsedData.teams || [];
            var targetSheets = [];
            var allSheets = ss.getSheets();

            // 넘겨받은 팀 이름과 일치하는 시트만 쏙쏙 뽑아냅니다.
            for (var sIdx = 0; sIdx < allSheets.length; sIdx++) {
                for (var tIdx = 0; tIdx < targetTeamNames.length; tIdx++) {
                    if (allSheets[sIdx].getName() === targetTeamNames[tIdx] || allSheets[sIdx].getName().indexOf(targetTeamNames[tIdx]) !== -1) {
                        targetSheets.push(allSheets[sIdx]);
                        break;
                    }
                }
            }

            // 뽑아낸 시트들에 대해서만 포맷팅(색칠/테두리)을 한 번씩 실행합니다. 전체 시트를 뒤지지 않아 훨씬 빠릅니다.
            if (targetSheets.length > 0) {
                colorAssistantTeachers(targetSheets);
                drawGridBorders(targetSheets);
            }
            return ContentService.createTextOutput(JSON.stringify({ "result": "success", "message": "포맷팅 완료!" })).setMimeType(ContentService.MimeType.JSON);
        }

        // 기존의 데이터 병합(기록) 모드
        var sheet = ss.getSheetByName(parsedData.teamName);
        if (!sheet) sheet = ss.getSheets()[0];

        function clean(str) {
            if (str === null || str === undefined) return "";
            return str.toString().replace(/[\s\n\r\u200B-\u200D\uFEFF]/g, "");
        }

        if (parsedData.mode === "merge") {
            var dates = parsedData.dateHeaders;
            var items = parsedData.scheduleItems;
            var lastRow = Math.max(1, sheet.getLastRow());
            var lastCol = Math.max(1, sheet.getLastColumn());
            var data = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
            var headerRowIdx = -1;
            for (var i = 0; i < Math.min(5, data.length); i++) {
                var rowStr = clean(data[i].join(""));
                if ((rowStr.indexOf("성명") > -1 || rowStr.indexOf("이름") > -1 || rowStr.indexOf("선생님") > -1) && rowStr.indexOf("시간") > -1) {
                    headerRowIdx = i;
                    break;
                }
            }
            if (headerRowIdx === -1) headerRowIdx = 0;
            var headerRow = data[headerRowIdx] || [];
            var colMap = { teacher: -1, time: -1, type: -1, dateStart: -1 };
            for (var c = 0; c < Math.min(15, headerRow.length); c++) {
                var title = clean(headerRow[c]);
                if (title.indexOf("성명") > -1 || title.indexOf("이름") > -1 || title.indexOf("선생님") > -1) colMap.teacher = c;
                else if (title.indexOf("시간") > -1) colMap.time = c;
                else if (title.indexOf("구분") > -1) colMap.type = c;
            }
            var lastMetaCol = Math.max(colMap.teacher, colMap.time, colMap.type);
            colMap.dateStart = lastMetaCol > -1 ? lastMetaCol + 1 : 4;
            var dateColMap = {};
            var maxCol = lastCol;
            dates.forEach(function (d) {
                var foundCol = -1;
                var cleanD = clean(d);
                for (var c = colMap.dateStart; c < headerRow.length; c++) {
                    if (clean(headerRow[c]) === cleanD) {
                        foundCol = c + 1;
                        break;
                    }
                }
                if (foundCol === -1) {
                    maxCol++;
                    foundCol = maxCol;
                    sheet.getRange(headerRowIdx + 1, foundCol).setValue(d)
                        .setBackground("#fff2cc").setHorizontalAlignment("center").setFontWeight("bold");
                }
                dateColMap[d] = foundCol;
            });
            var rowMap = [];
            var currentTeacher = "";
            var currentTime = "";
            for (var r = 0; r < data.length; r++) {
                if (r <= headerRowIdx) {
                    rowMap.push(null);
                    continue;
                }
                var t = (colMap.teacher !== -1) ? clean(data[r][colMap.teacher]) : "";
                var tm = (colMap.time !== -1) ? clean(data[r][colMap.time]) : "";
                var ty = (colMap.type !== -1) ? clean(data[r][colMap.type]).toUpperCase() : "";
                if (t !== "") currentTeacher = t;
                if (tm !== "") currentTime = tm;
                rowMap.push({
                    teacher: currentTeacher,
                    time: currentTime,
                    type: ty,
                    rowIndex: r + 1
                });
            }
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var targetRow = -1, placeRow = -1, statusRow = -1;
                var iTeacher = clean(item.teacher);
                var iTime = clean(item.time);
                var matches = rowMap.filter(function (r) {
                    return r && r.teacher === iTeacher && r.time === iTime;
                });
                if (matches.length > 0) {
                    targetRow = matches[0].rowIndex;
                    if (matches.length > 1) placeRow = matches[1].rowIndex;
                    if (matches.length > 2) statusRow = matches[2].rowIndex;
                }
                if (targetRow !== -1) {
                    dates.forEach(function (d, dIdx) {
                        var c = dateColMap[d];
                        if (item.target && item.target[dIdx] !== undefined) {
                            var val1 = item.target[dIdx] === "-" ? "" : item.target[dIdx];
                            var cellTarget = sheet.getRange(targetRow, c);
                            cellTarget.setValue(val1);
                        }
                        if (placeRow !== -1 && item.place && item.place[dIdx] !== undefined) {
                            var val2 = item.place[dIdx] === "-" ? "" : item.place[dIdx];
                            var cellPlace = sheet.getRange(placeRow, c);
                            cellPlace.setValue(val2);
                        }
                    });
                }
            }
            if (parsedData.applyBorders) {
                // ...
            }
        }

        return ContentService.createTextOutput(JSON.stringify({ "result": "success" })).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": error.toString(), "stack": error.stack })).setMimeType(ContentService.MimeType.JSON);
    }
}

// =========================================================================
// ★ [추가됨] 취업팀 싸인 처리 전용 함수
// =========================================================================
function handleSignatureUpload(p) {
    try {
        var sheet = getSheetByTeamName(p.team);
        if (!sheet) return ContentService.createTextOutput(JSON.stringify({ success: false, message: "시트를 찾을 수 없습니다." })).setMimeType(ContentService.MimeType.JSON);

        var data = sheet.getDataRange().getValues();
        var dates = data[1];
        var targetCol = -1;
        for (var col = 4; col < dates.length; col++) {
            if (formatDate(dates[col]) === p.date) {
                targetCol = col + 1;
                break;
            }
        }
        if (targetCol === -1) return ContentService.createTextOutput(JSON.stringify({ success: false, message: "날짜를 찾지 못했습니다." })).setMimeType(ContentService.MimeType.JSON);

        // 구글 드라이브에 저장
        var signatureData = p.signatureData;
        var imageUrl = "";
        if (signatureData && signatureData.indexOf("data:image") === 0) {
            var base64Data = signatureData.split(",")[1];
            var studentSafeName = p.student ? p.student.replace(/[^가-힣a-zA-Z0-9]/g, "") : "이름없음";
            var teacherSafeName = p.teacher ? p.teacher.replace(/[^가-힣a-zA-Z0-9]/g, "") : "선생님없음";
            var shiftSafeName = p.shift ? p.shift.replace(/[^0-9]/g, "") : "시간없음";

            // [개선] 날짜_선생님_시간_학생명 규칙으로 파일명 생성 (추후 복구용)
            var filePrefix = p.date + "_" + teacherSafeName + "_" + shiftSafeName + "_" + studentSafeName;
            var fileName = filePrefix + "_" + Date.now() + ".png";
            var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/png", fileName);

            // 폴더 찾기/생성
            var folderIter = DriveApp.getFoldersByName("취업팀 수업 싸인");
            var folder;
            if (folderIter.hasNext()) {
                folder = folderIter.next();
            } else {
                folder = DriveApp.createFolder("취업팀 수업 싸인");
            }

            // 기존 파일(같은 날짜, 선생님, 시간, 학생)이 있으면 모두 삭제
            var existingFiles = folder.searchFiles("title contains '" + filePrefix + "' and trashed = false");
            while (existingFiles.hasNext()) {
                var f = existingFiles.next();
                if (f.getName().indexOf(filePrefix) === 0) {
                    f.setTrashed(true);
                }
            }

            var file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            imageUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
        } else {
            // 빈 값: 기존 드라이브 파일 삭제
            imageUrl = "";
            var studentSafeName = p.student ? p.student.replace(/[^가-힣a-zA-Z0-9]/g, "") : "이름없음";
            var teacherSafeName = p.teacher ? p.teacher.replace(/[^가-힣a-zA-Z0-9]/g, "") : "선생님없음";
            var shiftSafeName = p.shift ? p.shift.replace(/[^0-9]/g, "") : "시간없음";

            var filePrefix = p.date + "_" + teacherSafeName + "_" + shiftSafeName + "_" + studentSafeName;
            var folderIter = DriveApp.getFoldersByName("취업팀 수업 싸인");
            if (folderIter.hasNext()) {
                var folder = folderIter.next();
                var existingFiles = folder.searchFiles("title contains '" + filePrefix + "' and trashed = false");
                while (existingFiles.hasNext()) {
                    var f = existingFiles.next();
                    if (f.getName().indexOf(filePrefix) === 0) {
                        f.setTrashed(true);
                    }
                }
            }
        }

        // 시트 셀 업데이트
        var currentTeacher = "";
        for (var i = 2; i < data.length; i++) {
            if (data[i][1] && data[i][1].toString().trim() !== "") {
                currentTeacher = data[i][1].toString().trim();
            }
            if (currentTeacher === p.teacher.trim()) {
                var rowShift = data[i][2] ? data[i][2].toString().trim() : "";
                if (rowShift === p.shift) {

                    var studentCell = sheet.getRange(i + 1, targetCol);
                    var signatureCell = sheet.getRange(i + 2, targetCol); // 싸인 들어갈 셀
                    var statusCell = sheet.getRange(i + 3, targetCol);

                    // 데이터 저장
                    studentCell.setValue(p.student);
                    if (imageUrl) {
                        signatureCell.setValue(imageUrl);
                    } else {
                        signatureCell.setValue("");
                    }

                    statusCell.setNumberFormat("@");
                    statusCell.setValue(p.status);

                    var currentStatus = p.status ? p.status.toString() : "";
                    if (currentStatus.indexOf("결석") !== -1 || currentStatus.indexOf("취소") !== -1) {
                        statusCell.setFontColor("red");
                        statusCell.setFontWeight("bold");
                    } else {
                        statusCell.setFontColor("black");
                        statusCell.setFontWeight("bold");
                    }
                    var byteLength = currentStatus ? Utilities.newBlob(currentStatus).getBytes().length : 0;
                    if (byteLength > 15) {
                        statusCell.setFontSize(10);
                    } else {
                        statusCell.setFontSize(13);
                    }

                    // 학생(대상) 칸 색칠 로직
                    var studentText = p.student ? p.student.toString() : "";
                    if (studentText.indexOf("보조강사") !== -1) {
                        studentCell.setBackground("#ffff00");
                    } else {
                        studentCell.setBackground("#eeeeee");
                    }

                    signatureCell.setBackground("#ffffff"); // 싸인은 항상 흰색

                    SpreadsheetApp.flush(); // 수정된 내용 강제 반영

                    return ContentService.createTextOutput(JSON.stringify({ success: true, url: imageUrl })).setMimeType(ContentService.MimeType.JSON);
                }
            }
        }
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "선생님 정보를 찾지 못했습니다." })).setMimeType(ContentService.MimeType.JSON);
    } catch (e) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: e.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
}

// =========================================================================
// [3] 보조강사 노란색 & 대상(학생이름) 옅은 분홍색/회색 칠하기 함수
// =========================================================================
function colorAssistantTeachers(targetInput) {
    var sheets = [];
    if (targetInput && typeof targetInput.getSheets === 'function') {
        sheets = targetInput.getSheets();
    } else if (Array.isArray(targetInput)) {
        sheets = targetInput;
    } else if (targetInput && typeof targetInput.getName === 'function') {
        sheets = [targetInput];
    } else {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        if (ss) sheets = ss.getSheets();
    }

    for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var range = sheet.getDataRange();
        var values = range.getValues();
        var backgrounds = range.getBackgrounds();
        var changed = false;

        var headerRowIdx = -1;
        var timeColIdx = 2;
        for (var r = 0; r < Math.min(10, values.length); r++) {
            var rowStr = values[r].join("").replace(/[\s\n\r\u200B-\u200D\uFEFF]/g, "");
            if ((rowStr.indexOf("성명") > -1 || rowStr.indexOf("이름") > -1 || rowStr.indexOf("선생님") > -1) && rowStr.indexOf("시간") > -1) {
                headerRowIdx = r;
                for (var c = 0; c < values[r].length; c++) {
                    var colStr = values[r][c].toString().replace(/[\s\n\r\u200B-\u200D\uFEFF]/g, "");
                    if (colStr === "시간" || colStr === "수업시간") {
                        timeColIdx = c;
                        break;
                    }
                }
                break;
            }
        }

        var rowTypes = new Array(values.length).fill(0);
        var currentType = 0;
        if (headerRowIdx !== -1) {
            for (var r = headerRowIdx + 1; r < values.length; r++) {
                var timeVal = values[r][timeColIdx] ? values[r][timeColIdx].toString().replace(/\s/g, "") : "";
                if (timeVal !== "" && /\d/.test(timeVal)) {
                    currentType = 1;
                }
                rowTypes[r] = currentType;
                if (currentType === 1) currentType = 2;
                else if (currentType === 2) currentType = 3;
                else if (currentType === 3) currentType = 0;
            }
        }

        for (var i = 0; i < values.length; i++) {
            var rType = (headerRowIdx !== -1 && i > headerRowIdx) ? rowTypes[i] : 0;
            for (var j = 0; j < values[i].length; j++) {
                var cellValue = values[i][j] ? values[i][j].toString().replace(/\s/g, "") : "";
                var currentBg = backgrounds[i][j] ? backgrounds[i][j].toLowerCase() : "";

                if (headerRowIdx !== -1 && i > headerRowIdx && rType !== 1) {
                    if (currentBg === "#f4cccc" || currentBg === "#ffddee" || currentBg === "#eeeeee") {
                        backgrounds[i][j] = "#ffffff";
                        changed = true;
                    }
                }

                if (headerRowIdx !== -1 && i > headerRowIdx && (rType === 3 || rType === 0)) {
                    continue;
                }

                if (headerRowIdx !== -1 && i > headerRowIdx && rType === 1) {
                    if (cellValue === "" || cellValue === "-") {
                        if (currentBg !== "#eeeeee") {
                            backgrounds[i][j] = "#eeeeee";
                            changed = true;
                        }
                        continue;
                    }
                }

                if (cellValue.indexOf("보조강사") !== -1) {
                    if (currentBg !== "#ffff00") {
                        backgrounds[i][j] = "#ffff00";
                        changed = true;
                    }
                    continue;
                }

                var isPinkKeyword = (cellValue.indexOf("도선복지관") !== -1 ||
                    cellValue.indexOf("사근복지관") !== -1 ||
                    cellValue.indexOf("방문") !== -1 ||
                    cellValue.indexOf("경로당") !== -1 ||
                    cellValue.indexOf("마장") !== -1);

                var isGrayKeyword = (cellValue.indexOf("복지관") !== -1 && cellValue.indexOf("도선") === -1);

                if ((isGrayKeyword || isPinkKeyword) && headerRowIdx !== -1 && i > headerRowIdx) {
                    var targetStudentRow = (rType === 1) ? i : (i - 1);
                    var targetPlaceRow = (rType === 1) ? (i + 1) : i;

                    if (targetStudentRow >= 0 && rowTypes[targetStudentRow] === 1) {
                        var studentCellValue = values[targetStudentRow][j] ? values[targetStudentRow][j].toString().replace(/\s/g, "") : "";

                        if (studentCellValue === "" || studentCellValue === "-") {
                            if (backgrounds[targetStudentRow][j] !== "#eeeeee") {
                                backgrounds[targetStudentRow][j] = "#eeeeee";
                                changed = true;
                            }
                        } else if (studentCellValue.indexOf("보조강사") === -1) {
                            var colorToApply = isPinkKeyword ? "#f4cccc" : "#eeeeee";
                            if (backgrounds[targetStudentRow][j] !== colorToApply) {
                                backgrounds[targetStudentRow][j] = colorToApply;
                                changed = true;
                            }
                        }
                    }

                    if (targetPlaceRow < values.length && rowTypes[targetPlaceRow] === 2) {
                        var placeCellValue = values[targetPlaceRow][j] ? values[targetPlaceRow][j].toString().replace(/\s/g, "") : "";
                        if (backgrounds[targetPlaceRow][j] !== "#ffffff" && placeCellValue.indexOf("보조강사") === -1) {
                            backgrounds[targetPlaceRow][j] = "#ffffff";
                            changed = true;
                        }
                    }
                }
            }
        }
        if (changed) {
            range.setBackgrounds(backgrounds);
        }
    }
}

function drawGridBorders(targetInput) {
    var sheets = [];
    if (targetInput && typeof targetInput.getSheets === 'function') {
        sheets = targetInput.getSheets();
    } else if (Array.isArray(targetInput)) {
        sheets = targetInput;
    } else if (targetInput && typeof targetInput.getName === 'function') {
        sheets = [targetInput];
    } else {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        if (ss) sheets = ss.getSheets();
    }

    for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var lastRow = sheet.getLastRow();
        var lastCol = sheet.getLastColumn();
        if (lastRow < 1 || lastCol < 1) continue;
        var data = sheet.getRange(1, 1, Math.min(10, lastRow), lastCol).getDisplayValues();
        var headerRowIdx = -1;
        for (var i = 0; i < data.length; i++) {
            var rowStr = data[i].join("").replace(/[\s\n\r\u200B-\u200D\uFEFF]/g, "");
            if ((rowStr.indexOf("성명") > -1 || rowStr.indexOf("이름") > -1 || rowStr.indexOf("선생님") > -1) && rowStr.indexOf("시간") > -1) {
                headerRowIdx = i;
                break;
            }
        }
        if (headerRowIdx !== -1 && lastRow > headerRowIdx && lastCol > 0) {
            var numRows = lastRow - headerRowIdx;
            var numCols = lastCol;
            var fullRange = sheet.getRange(headerRowIdx + 1, 1, numRows, numCols);
            var verticalBorder = numCols > 1 ? true : null;
            var horizontalBorder = numRows > 1 ? true : null;

            fullRange.setBorder(true, true, true, true, verticalBorder, horizontalBorder, "black", SpreadsheetApp.BorderStyle.SOLID);

            var headerRange = sheet.getRange(headerRowIdx + 1, 1, 1, numCols);
            headerRange.setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_THICK);

            var headerValues = headerRange.getDisplayValues()[0];
            var currentMonth = -1;
            for (var colIdx = 0; colIdx < headerValues.length; colIdx++) {
                var colNameText = headerValues[colIdx] ? headerValues[colIdx].toString() : "";

                if (colNameText.indexOf("금") > -1) {
                    var fridayRange = sheet.getRange(headerRowIdx + 1, colIdx + 1, numRows, 1);
                    fridayRange.setBorder(null, null, null, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_THICK);
                }

                var match = colNameText.match(/(\d+)\//);
                if (match) {
                    var monthVal = parseInt(match[1], 10);
                    if (currentMonth !== -1 && currentMonth !== monthVal) {
                        var newMonthRange = sheet.getRange(headerRowIdx + 1, colIdx + 1, numRows, 1);
                        newMonthRange.setBorder(null, true, null, null, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_THICK);
                    }
                    currentMonth = monthVal;
                }
            }

            for (var c = 1; c <= numCols; c++) {
                var bottomCell = sheet.getRange(lastRow, c);
                if (bottomCell.isPartOfMerge()) {
                    bottomCell.getMergedRanges()[0].setBorder(null, null, true, null, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_THICK);
                } else {
                    bottomCell.setBorder(null, null, true, null, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_THICK);
                }
            }
        }
    }
}

function runScheduleManagement(targetSs) {
    var ss = (targetSs && typeof targetSs.getSheets === 'function') ? targetSs : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;

    colorAssistantTeachers(ss);
    drawGridBorders(ss);

    if (!targetSs || typeof targetSs.getSheets !== 'function') {
        ss.toast("색칠하기와 표 테두리 정리가 모두 완료되었습니다!", "✨ 스케줄 관리 완료");
    }
}


// --- 여기부터 복사해서 기존 코드 맨 아래에 붙여넣으세요 ---

/**
 * 시트 자동 백업 함수
 * 기존 기능을 건드리지 않고 이 함수만 추가하여 백업을 수행합니다.
 */
function autoBackupSheet_New() {
    try {
        // 1. 현재 활성화된 시트 가져오기
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var fileId = ss.getId();
        var fileName = ss.getName();

        // 2. 현재 시간 구하기 (파일명 뒤에 붙임)
        var now = new Date();
        var timeZone = Session.getScriptTimeZone();
        var timeStamp = Utilities.formatDate(now, timeZone, "yyyy-MM-dd_HH시mm분");

        // 3. 백업용 파일 이름 설정
        var backupName = fileName + "_백업_" + timeStamp;

        // 4. 원본 파일이 있는 폴더 찾기
        var file = DriveApp.getFileById(fileId);
        var folders = file.getParents();
        var targetFolder = folders.hasNext() ? folders.next() : DriveApp.getRootFolder();

        // 5. 복사본 생성
        file.makeCopy(backupName, targetFolder);

        console.log("백업 완료: " + backupName);
    } catch (e) {
        console.error("백업 중 오류 발생: " + e.toString());
    }
}
// =========================================================================
// ★ [추가] 유실된 싸인 링크 자동 복구 프로그램
// =========================================================================
function recoverDeletedSignatures() {
    var ui = SpreadsheetApp.getUi();
    var team = "취업팀"; // 현재 취업팀 전용으로 작동
    var sheet = getSheetByTeamName(team);

    if (!sheet) {
        ui.alert("⚠️ '취업팀' 시트를 찾을 수 없습니다.");
        return;
    }

    var folderName = "취업팀 수업 싸인";
    var folderIter = DriveApp.getFoldersByName(folderName);
    if (!folderIter.hasNext()) {
        ui.alert("⚠️ '" + folderName + "' 폴더를 찾을 수 없습니다.");
        return;
    }
    var folder = folderIter.next();
    var files = folder.getFiles();

    var recoveryCount = 0;
    var skipCount = 0;

    // 시트 데이터 전체 로드 (성능 최적화)
    var range = sheet.getDataRange();
    var data = range.getValues();
    var dates = data[1];

    while (files.hasNext()) {
        var file = files.next();
        var fileName = file.getName();

        // 파일명 파싱 (형식: 2026-05-15_선생님_시간_학생명_타임스탬프.png)
        var parts = fileName.split("_");
        if (parts.length < 4) continue; // 형식이 맞지 않는 파일 스킵

        var fDate = parts[0];     // 날짜 (YYYY-MM-DD)
        var fTeacher = parts[1];  // 선생님
        var fShift = parts[2];    // 시간 (숫자만 남은 형태)
        var fStudent = parts[3];  // 학생명

        var targetCol = -1;
        for (var col = 4; col < dates.length; col++) {
            if (formatDate(dates[col]) === fDate) {
                targetCol = col + 1;
                break;
            }
        }

        if (targetCol === -1) continue; // 해당 날짜를 시트에서 못 찾으면 패스

        var currentTeacher = "";
        for (var i = 2; i < data.length; i++) {
            if (data[i][1] && data[i][1].toString().trim() !== "") {
                currentTeacher = data[i][1].toString().trim().replace(/[^가-힣a-zA-Z0-9]/g, "");
            }

            if (currentTeacher === fTeacher) {
                var rowShiftRaw = data[i][2] ? data[i][2].toString().trim() : "";
                var rowShiftSafe = rowShiftRaw.replace(/[^0-9]/g, "");

                if (rowShiftSafe === fShift) {
                    var signatureCell = sheet.getRange(i + 2, targetCol); // 싸인 셀 (보통 학생명 바로 아래)
                    var currentVal = signatureCell.getValue();

                    // 이미 값이 있으면 스킵 (중복 방지)
                    if (currentVal && (currentVal.toString().startsWith("http") || currentVal.toString().startsWith("=IMAGE"))) {
                        skipCount++;
                        continue;
                    }

                    // 복구 실행
                    var imageUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
                    signatureCell.setValue(imageUrl);
                    recoveryCount++;
                    break;
                }
            }
        }
    }

    ui.alert("✅ 복구 작업 완료!\n- 복구된 링크: " + recoveryCount + "개\n- 기존 유지: " + skipCount + "개");
}
