// 전체 일정 보기/엑셀 다운로드

import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabaseClient } from '../utils/supabase';
import {
  getTeamTeacherNames,
  getTeacherSortWeight,
  getTeacherGroup,
  getTeacherDefaultShift,
  getGlobalTeachersList,
  isOfficialTeamTeacher,
  getGroupWeight,
  getShiftWeight,
  getDayName,
  getTeacherShifts
} from '../utils/helpers';
import {
  Home,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  DownloadIcon,
  CalendarIcon
} from './Icons';

const mapShiftToOfficial = (team, teacherName, originalShift) => {
  if (!originalShift || !teacherName) return originalShift;
  const officialShifts = getTeacherShifts(team, teacherName);
  if (!officialShifts || officialShifts.length === 0) return originalShift;
  if (officialShifts.includes(originalShift)) return originalShift;

  const standardDefaults = team === "3팀" 
    ? ["13:00~14:00", "14:00~15:00", "15:00~16:00"]
    : ["9:30~10:30", "10:30~11:30", "11:30~12:30"];
    
  const idx = standardDefaults.indexOf(originalShift);
  if (idx !== -1 && officialShifts[idx]) {
    return officialShifts[idx];
  }
  return originalShift;
};

export default function TeamScheduleApp({ team, onNavigateBack }) {
  const [currentTeam, setCurrentTeam] = useState(team);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [teacherFilter, setTeacherFilter] = useState("전체");
  const [uniqueTeachers, setUniqueTeachers] = useState([]);
  const [viewMode, setViewMode] = useState("sheet"); // "sheet" or "list"
  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadTextToggle, setDownloadTextToggle] = useState(false);
  const [holidaysList, setHolidaysList] = useState([]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setDownloadTextToggle(prev => !prev);
    }, 1200);
    return () => clearInterval(intervalId);
  }, []);

  const fetchTeamData = async (month) => {
    setLoading(true);
    try {
      const [year, monthStr] = month.split('-');
      const firstDay = `${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(monthStr), 0).getDate();
      const cleanLastDayStr = `${month}-${String(lastDay).padStart(2, '0')}`;

      const { data: hData, error: hError } = await supabaseClient
        .from('holidays')
        .select('date, name, content1, content2, vacation_available');
      if (hError) throw hError;
      setHolidaysList(hData || []);

      const { data: records, error } = await supabaseClient
        .from('daily_logs')
        .select('*')
        .eq('team', currentTeam)
        .gte('log_date', firstDay)
        .lte('log_date', cleanLastDayStr)
        .order('log_date', { ascending: false })
        .order('shift', { ascending: true });

      if (error) throw error;

      if (records) {
        const mappedRecords = records.map(r => ({
          ...r,
          shift: mapShiftToOfficial(r.team, r.teacher, r.shift)
        }));
        setData(mappedRecords);
        const tSet = new Set();
        const [year, monthStr] = month.split('-');
        const selFirstDay = `${month}-01`;
        const selLastDayVal = new Date(parseInt(year), parseInt(monthStr), 0).getDate();
        const selLastDay = `${month}-${String(selLastDayVal).padStart(2, '0')}`;

        getGlobalTeachersList()
          .filter(t => t.team === currentTeam)
          .forEach(t => {
            if (t.hire_date && selLastDay < t.hire_date) return;
            if (t.resign_date && selFirstDay > t.resign_date) return;
            tSet.add(t.name);
          });

        records.forEach(r => {
          if (!r.teacher) return;
          const tRec = getGlobalTeachersList().find(t => t.team === currentTeam && t.name === r.teacher);
          if (tRec) {
            if (tRec.hire_date && selLastDay < tRec.hire_date) return;
            if (tRec.resign_date && selFirstDay > tRec.resign_date) return;
          }
          tSet.add(r.teacher);
        });

        setUniqueTeachers(Array.from(tSet).sort((a, b) => {
          return getTeacherSortWeight(currentTeam, a) - getTeacherSortWeight(currentTeam, b);
        }));
      }
    } catch (e) {
      console.error("데이터 로딩 실패:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentTeam) fetchTeamData(selectedMonth);
  }, [currentTeam, selectedMonth]);

  const changeMonth = async (offset) => {
    const [year, m] = selectedMonth.split('-');
    let d = new Date(parseInt(year), parseInt(m) - 1 + offset, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    const targetMonth = `${newY}-${newM}`;

    try {
      const firstDay = `${targetMonth}-01`;
      const lastDay = new Date(parseInt(newY), parseInt(newM), 0).getDate();
      const cleanLastDayStr = `${targetMonth}-${String(lastDay).padStart(2, '0')}`;

      const { data: records, error } = await supabaseClient
        .from('daily_logs')
        .select('id')
        .eq('team', currentTeam)
        .gte('log_date', firstDay)
        .lte('log_date', cleanLastDayStr)
        .limit(1);

      if (error) throw error;

      if (!records || records.length === 0) {
        setErrorMessage("해당 월에는 데이터가 없습니다.");
        setTimeout(() => {
          setErrorMessage("");
        }, 2000);
      }

      setSelectedMonth(targetMonth);
    } catch (err) {
      console.error("월 변경 체크 에러:", err);
      setErrorMessage("데이터 확인 중 오류가 발생했습니다.");
      setTimeout(() => {
        setErrorMessage("");
      }, 2000);
    }
  };


  const handleExportExcel = async () => {
    if (exporting) return;
    try {
      setExporting(true);

      const { data: hData, error: hError } = await supabaseClient
        .from('holidays')
        .select('date, name, content1, content2, vacation_available');
      if (hError) throw hError;
      const holidays = hData || [];

      const today = new Date();

      // 전체 데이터 중 가장 첫 날짜(오름차순)와 마지막 날짜(내림차순)를 DB에서 조회합니다.
      let firstWorkDateStr = null;
      let endDateStr = null;

      const { data: firstRec, error: firstErr } = await supabaseClient
        .from('daily_logs')
        .select('log_date')
        .order('log_date', { ascending: true })
        .limit(1);
      if (firstErr) throw firstErr;

      const { data: lastRec, error: lastErr } = await supabaseClient
        .from('daily_logs')
        .select('log_date')
        .order('log_date', { ascending: false })
        .limit(1);
      if (lastErr) throw lastErr;

      if (firstRec && firstRec.length > 0 && lastRec && lastRec.length > 0) {
        firstWorkDateStr = firstRec[0].log_date;
        endDateStr = lastRec[0].log_date;
      } else {
        // 데이터가 아예 없을 경우를 대비한 기본값 (오늘 날짜)
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        firstWorkDateStr = `${y}-${m}-${d}`;
        endDateStr = `${y}-${m}-${d}`;
      }

      const dateList = [];
      const [startYear, startMonth, startDay] = firstWorkDateStr.split('-').map(Number);
      let curr = new Date(startYear, startMonth - 1, startDay);
      const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
      const endLimit = new Date(endYear, endMonth - 1, endDay);
      while (curr <= endLimit) {
        const dayOfWeekIndex = curr.getDay();
        if (dayOfWeekIndex !== 0 && dayOfWeekIndex !== 6) {
          const yyyy = curr.getFullYear();
          const mm = String(curr.getMonth() + 1).padStart(2, '0');
          const dd = String(curr.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][dayOfWeekIndex];
          const label = `${curr.getMonth() + 1}/${curr.getDate()} (${dayOfWeek})`;
          dateList.push({ dateStr, label, dayIndex: dayOfWeekIndex });
        }
        curr.setDate(curr.getDate() + 1);
      }

      const wb = new ExcelJS.Workbook();
      const targetTeams = ["1팀", "2팀", "3팀", "취업팀"];
      const exportExcludedTeachersByTeam = {
        "1팀": new Set(["천은선", "서승희"])
      };

      for (const tName of targetTeams) {
        const isExcludedTeacherForExport = (teacher) => {
          const excluded = exportExcludedTeachersByTeam[tName];
          if (!excluded) return false;
          return excluded.has((teacher || "").trim());
        };

        let teamData = [];
        let start = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: chunk, error: chunkErr } = await supabaseClient
            .from('daily_logs')
            .select('*')
            .eq('team', tName)
            .gte('log_date', firstWorkDateStr)
            .lte('log_date', endDateStr)
            .range(start, start + limit - 1)
            .order('log_date', { ascending: true })
            .order('id', { ascending: true });

          if (chunkErr) throw chunkErr;

          if (chunk && chunk.length > 0) {
            const mappedChunk = chunk.map(r => ({
              ...r,
              shift: mapShiftToOfficial(r.team, r.teacher, r.shift)
            }));
            teamData = teamData.concat(mappedChunk);
            if (chunk.length < limit) {
              hasMore = false;
            } else {
              start += limit;
            }
          } else {
            hasMore = false;
          }
        }

        const inactiveTeachersWithRecordsExcel = new Set();
        teamData.forEach(item => {
          const dbT = getGlobalTeachersList().find(t => t.team === tName && t.name === item.teacher);
          if (dbT && dbT.is_active === false) {
            inactiveTeachersWithRecordsExcel.add(item.teacher);
          }
        });

        const teamTeacherShiftsMap = {};
        getGlobalTeachersList().filter(t => t.team === tName).forEach(rec => {
          if (rec.is_active === false && !inactiveTeachersWithRecordsExcel.has(rec.name)) return;
          const teacher = rec.name;
          const group = getTeacherGroup(tName, teacher);
          if (isExcludedTeacherForExport(teacher)) return;

          const shifts = [rec.shift1, rec.shift2, rec.shift3].map(s => (s || "").trim()).filter(Boolean);
          if (shifts.length === 0) {
            const defaultShift = getTeacherDefaultShift(tName, teacher, group);
            const key = `${teacher}::${defaultShift}`;
            teamTeacherShiftsMap[key] = { teacher, shift: defaultShift, groupName: group };
          } else {
            shifts.forEach(shift => {
              const key = `${teacher}::${shift}`;
              teamTeacherShiftsMap[key] = { teacher, shift, groupName: group };
            });
          }
        });

        teamData.forEach(item => {
          if (isExcludedTeacherForExport(item.teacher)) return;
          if (tName === "취업팀" && !isOfficialTeamTeacher("취업팀", item.teacher)) return;
          const key = `${item.teacher}::${item.shift}`;
          if (!teamTeacherShiftsMap[key]) {
            teamTeacherShiftsMap[key] = {
              teacher: item.teacher,
              shift: item.shift,
              groupName: getTeacherGroup(tName, item.teacher)
            };
          }
        });

        const sortedShifts = Object.values(teamTeacherShiftsMap).sort((a, b) => {
          const weightA = getGroupWeight(a.groupName);
          const weightB = getGroupWeight(b.groupName);
          if (weightA !== weightB) return weightA - weightB;
          if (a.teacher !== b.teacher) {
            return getTeacherSortWeight(tName, a.teacher) - getTeacherSortWeight(tName, b.teacher);
          }
          return getShiftWeight(a.shift) - getShiftWeight(b.shift);
        });

        const gridRows = [];
        sortedShifts.forEach(ts => {
          gridRows.push({ ...ts, category: "대상" });
          gridRows.push({ ...ts, category: "장소" });
          gridRows.push({ ...ts, category: "진행" });
        });

        let startRowIdx = 0;
        while (startRowIdx < gridRows.length) {
          let count = 1;
          for (let nextRow = startRowIdx + 1; nextRow < gridRows.length; nextRow++) {
            if (gridRows[startRowIdx].groupName === gridRows[nextRow].groupName) {
              count++;
              gridRows[nextRow].renderGroup = false;
            } else break;
          }
          gridRows[startRowIdx].rowspanGroup = count;
          gridRows[startRowIdx].renderGroup = true;
          startRowIdx += count;
        }

        startRowIdx = 0;
        while (startRowIdx < gridRows.length) {
          let count = 1;
          for (let nextRow = startRowIdx + 1; nextRow < gridRows.length; nextRow++) {
            if (gridRows[startRowIdx].groupName === gridRows[nextRow].groupName &&
              gridRows[startRowIdx].teacher === gridRows[nextRow].teacher) {
              count++;
              gridRows[nextRow].renderTeacher = false;
            } else break;
          }
          gridRows[startRowIdx].rowspanTeacher = count;
          gridRows[startRowIdx].renderTeacher = true;
          startRowIdx += count;
        }

        startRowIdx = 0;
        while (startRowIdx < gridRows.length) {
          let count = 1;
          for (let nextRow = startRowIdx + 1; nextRow < gridRows.length; nextRow++) {
            if (gridRows[startRowIdx].groupName === gridRows[nextRow].groupName &&
              gridRows[startRowIdx].teacher === gridRows[nextRow].teacher &&
              gridRows[startRowIdx].shift === gridRows[nextRow].shift) {
              count++;
              gridRows[nextRow].renderShift = false;
            } else break;
          }
          gridRows[startRowIdx].rowspanShift = count;
          gridRows[startRowIdx].renderShift = true;
          startRowIdx += count;
        }

        const dataLookup = {};
        teamData.forEach(item => {
          const key = `${item.teacher}::${item.shift}::${item.log_date}`;
          dataLookup[key] = item;
        });

        const ws = wb.addWorksheet(tName);

        // Columns setup
        const cols = [
          { width: 10 }, // A
          { width: 13 }, // B
          { width: 17 }, // C
          ...dateList.map(() => ({ width: 16 }))
        ];
        ws.columns = cols;

        // Row 1: Title
        const titleRow = ws.addRow(["", `2026년 디지털 서포터즈 활동 일정표 [${tName}]`, ...Array(dateList.length + 1).fill("")]);
        titleRow.height = 40;
        ws.mergeCells(1, 2, 1, 8); // B1:H1
        const titleCell = ws.getCell('B1');
        titleCell.font = { name: "Malgun Gothic", size: 16, bold: true, color: { argb: "FF1E3A8A" } };
        titleCell.alignment = { vertical: "middle", horizontal: "left" };

        // Row 2: Headers
        const headerRowData = ["연번", "성명", "수업시간", ...dateList.map(d => d.label)];
        const headerRow = ws.addRow(headerRowData);
        headerRow.height = 35;

        const borderThin = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };

        headerRow.eachCell((cell, colNumber) => {
          cell.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FF1E3A8A" } };
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          cell.border = borderThin;
        });

        // Add Data Rows
        const excelRowStart = 3;
        // Keep track of image promises
        const imagePromises = [];

        const excelFirstShiftForTeacher = {};
        gridRows.forEach(row => {
          if (!excelFirstShiftForTeacher[row.teacher]) {
            excelFirstShiftForTeacher[row.teacher] = row.shift;
          }
        });

        const getHolidayInfo = (dateStr) => {
          if (!dateStr) return null;
          const parts = dateStr.split('-');
          if (parts.length < 3) return null;
          const m = parts[1];
          const d = parts[2];
          const mmdd1 = `${m}-${d}`;
          const mmdd2 = `${parseInt(m)}-${parseInt(d)}`;
          const mmdd3 = `${parseInt(m)}/${parseInt(d)}`;
          return holidays.find(h => h.date === mmdd1 || h.date === mmdd2 || h.date === mmdd3 || h.date === dateStr) || null;
        };

        const holidayDates = {};
        dateList.forEach(d => {
          const holInfo = getHolidayInfo(d.dateStr);
          if (holInfo && !holInfo.vacation_available) {
            holidayDates[d.dateStr] = holInfo;
          }
        });
        const holidayTracker = {};

        gridRows.forEach((rowObj, rIdx) => {
          const excelRowIdx = excelRowStart + rIdx;
          const rowArr = [];

          rowArr.push(rowObj.groupName);
          rowArr.push(rowObj.teacher);
          rowArr.push(rowObj.shift);

          dateList.forEach(d => {
            let item = dataLookup[`${rowObj.teacher}::${rowObj.shift}::${d.dateStr}`];
            const holidayItem = holidayDates[d.dateStr];
            const isHolidayRaw = !!holidayItem;

            let isFirstHolidayShift = false;
            if (isHolidayRaw) {
              const hKey = `${rowObj.teacher}::${d.dateStr}`;
              if (!holidayTracker[hKey]) {
                holidayTracker[hKey] = rowObj.shift;
              }
              if (holidayTracker[hKey] === rowObj.shift) {
                isFirstHolidayShift = true;
              }
            }

            const isMeeting = item && item.student && item.student.includes("간담회");
            const isFirstShift = rowObj.shift === excelFirstShiftForTeacher[rowObj.teacher];

            let val = "";
            if (isHolidayRaw) {
              if (isFirstHolidayShift) {
                if (rowObj.category === "대상") val = holidayItem.name || '공휴일';
                else if (rowObj.category === "장소") val = holidayItem.content1 || '공휴일';
                else if (rowObj.category === "진행") val = holidayItem.content2 || '';
              } else {
                val = "";
              }
            } else if (isMeeting) {
              if (isFirstShift && item) {
                if (rowObj.category === "대상") val = item.student || "";
                else if (rowObj.category === "장소") val = item.location || "";
                else if (rowObj.category === "진행") val = item.status === "1" ? "1" : (item.status === '\u200B' ? "" : (item.status || ""));
              } else {
                val = "";
              }
            } else if (item) {
              if (rowObj.category === "대상") val = item.student || "";
              else if (rowObj.category === "장소") {
                const isSignatureUrl = tName === "취업팀" && item.location && (item.location.startsWith("http://") || item.location.startsWith("https://"));
                if (isSignatureUrl) val = ""; // Will overlay image
                else val = item.location || "";
              }
              else if (rowObj.category === "진행") val = item.status === "1" ? "1" : (item.status === '\u200B' ? "" : (item.status || ""));
            }
            rowArr.push(val);
          });

          const dataRow = ws.addRow(rowArr);
          
          let maxLines = 1;
          rowArr.forEach(val => {
            if (typeof val === 'string' && val) {
              const lines = val.split('\n').length;
              if (lines > maxLines) maxLines = lines;
            }
          });

          if (tName === "취업팀" && rowObj.category === "장소") {
            dataRow.height = Math.max(54, maxLines * 15); // 취업팀 장소(싸인) 행의 기본 높이 54 또는 줄바꿈에 따른 높이
          } else {
            dataRow.height = Math.max(40, maxLines * 15); // 기본 높이 40 또는 줄바꿈에 따른 높이
          }

          const totalCols = dateList.length + 3;
          for (let colNumber = 1; colNumber <= totalCols; colNumber++) {
            const cell = dataRow.getCell(colNumber);
            const C = colNumber - 1; // 0-based

            if (C === 0) {
              cell.font = { name: "Malgun Gothic", size: 9, bold: true, color: { argb: "FF64748B" } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFF8FAFC" } };
            } else if (C === 1) {
              cell.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF0F172A" } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFFFFFFF" } };
            } else if (C === 2) {
              cell.font = { name: "Malgun Gothic", size: 9, color: { argb: "FF334155" } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFFFFFFF" } };
            } else {
              const dateObj = dateList[C - 3];
              let item = dataLookup[`${rowObj.teacher}::${rowObj.shift}::${dateObj.dateStr}`];
              const holidayItem = holidayDates[dateObj.dateStr];
              const isHolidayRaw = !!holidayItem;

              let isFirstHolidayShift = false;
              if (isHolidayRaw) {
                const hKey = `${rowObj.teacher}::${dateObj.dateStr}`;
                if (holidayTracker[hKey] === rowObj.shift) {
                  isFirstHolidayShift = true;
                }
              }

              let fillRGB = "FFFFFFFF";
              let fontColorRGB = "FF475569";
              let isBold = false;

              const isMeeting = item && item.student && item.student.includes("간담회");
              const isFirstShift = rowObj.shift === excelFirstShiftForTeacher[rowObj.teacher];

              if (isHolidayRaw) {
                if (isFirstHolidayShift) {
                  const isRedHoliday = holidayItem.content1 && holidayItem.content1.includes('공휴일');
                  fillRGB = isRedHoliday ? "FFFCA5A5" : "FF86EFAC";
                  fontColorRGB = "FF374151"; // 진한 회색
                  isBold = true;
                } else {
                  fillRGB = "FFFFFFFF";
                }
              } else if (isMeeting) {
                if (isFirstShift) {
                  fillRGB = "FF86EFAC"; // 초록색-300
                  isBold = true;
                  if (rowObj.category === "대상") {
                    fontColorRGB = "FF374151";
                  } else if (rowObj.category === "장소") {
                    fontColorRGB = "FF374151";
                  } else if (rowObj.category === "진행") {
                    fontColorRGB = "FFFFFFFF";
                  }
                } else {
                  fillRGB = "FFFFFFFF";
                  fontColorRGB = "FF475569";
                }
              } else if (item) {
                if (rowObj.category === "장소") {
                  fillRGB = "FFFFFFFF";
                  const sigUrl = tName === "취업팀" && item.location && (item.location.startsWith("http://") || item.location.startsWith("https://")) ? item.location : null;
                  if (sigUrl) {
                    const promise = fetch(sigUrl)
                      .then(res => res.arrayBuffer())
                      .then(buffer => {
                        const imageId = wb.addImage({
                          buffer: buffer,
                          extension: 'png'
                        });
                        const isEmpTeam = tName === "취업팀";
                        const imgWidth = isEmpTeam ? 90 : 70;
                        const imgHeight = isEmpTeam ? 35 : 35;
                        const colOffset = isEmpTeam ? 0.24 : 0.2;
                        const rowOffset = isEmpTeam ? 0.175 : 0.15;

                        ws.addImage(imageId, {
                          tl: { col: C + colOffset, row: excelRowIdx - 1 + rowOffset },
                          ext: { width: imgWidth, height: imgHeight },
                          editAs: 'oneCell'
                        });
                      }).catch(err => console.error("Error downloading image", err));
                    imagePromises.push(promise);
                  } else if (item.location) {
                    fontColorRGB = "FF000000";
                  }
                } else {
                  if (rowObj.category === "대상") {
                    if (item.student?.includes('보조강사')) {
                      fillRGB = "FFFFFF00"; fontColorRGB = "FF000000"; isBold = true;
                    } else if (item.student) {
                      fillRGB = "FFE0F2FE"; fontColorRGB = "FF000000"; isBold = true;
                    }
                  } else if (rowObj.category === "진행") {
                    if (item.status?.includes('결석') || item.status?.includes('종료') || item.status?.includes('취소')) {
                      fillRGB = "FFFEE2E2"; fontColorRGB = "FFDC2626"; isBold = true;
                    } else if (item.status?.includes('휴가')) {
                      fillRGB = "FFF3F4F6"; fontColorRGB = "FF6B7280"; isBold = true;
                    } else if (item.status) {
                      fillRGB = "FFF0FDF4"; fontColorRGB = "FF000000"; isBold = true;
                    }
                  }
                }
              }

              cell.font = { name: "Malgun Gothic", size: 9, bold: isBold, color: { argb: fontColorRGB } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillRGB } };

              if (rowObj.category === "진행" && cell.value && typeof cell.value === 'string' && /\d+\s*회차/.test(cell.value)) {
                const parts = cell.value.split(/(\d+\s*회차)/g);
                cell.value = {
                  richText: parts.map(part => {
                    if (/\d+\s*회차/.test(part)) {
                      return { text: part, font: { name: "Malgun Gothic", size: 9, bold: isBold, color: { argb: "FF2563EB" } } };
                    }
                    return { text: part, font: { name: "Malgun Gothic", size: 9, bold: isBold, color: { argb: fontColorRGB } } };
                  }).filter(rt => rt.text !== '')
                };
              }
            }

            let alignHorizontal = "center";
            let alignVertical = "middle";
            if (rowObj.category === "진행") {
              alignHorizontal = "left";
              alignVertical = "top";
            }
            cell.alignment = { vertical: alignVertical, horizontal: alignHorizontal, wrapText: true };
          }
        });

        // Merge cells
        gridRows.forEach((row, rIdx) => {
          const excelRowIdx = excelRowStart + rIdx;
          if (row.renderGroup && row.rowspanGroup > 1) {
            ws.mergeCells(excelRowIdx, 1, excelRowIdx + row.rowspanGroup - 1, 1);
          }
          if (row.renderTeacher && row.rowspanTeacher > 1) {
            ws.mergeCells(excelRowIdx, 2, excelRowIdx + row.rowspanTeacher - 1, 2);
          }
          if (row.renderShift && row.rowspanShift > 1) {
            ws.mergeCells(excelRowIdx, 3, excelRowIdx + row.rowspanShift - 1, 3);
          }
        });

        // 엑셀 병합 완료 후 테두리 서식 일괄 재적용 루프
        gridRows.forEach((rowObj, rIdx) => {
          const excelRowIdx = excelRowStart + rIdx;
          const dataRow = ws.getRow(excelRowIdx);
          const totalCols = dateList.length + 3;

          for (let colNumber = 1; colNumber <= totalCols; colNumber++) {
            const cell = dataRow.getCell(colNumber);
            const C = colNumber - 1; // 0-based

            // 1. 우측 테두리(rightBorder) 계산
            let rightBorder = { style: "thin", color: { argb: "FFD1D5DB" } };
            if (C === 2) {
              rightBorder = { style: "thick", color: { argb: "FF4B5563" } };
            } else if (C >= 3) {
              const dateObj = dateList[C - 3];
              const nextDateObj = dateList[C - 2];
              const isFriday = dateObj && dateObj.dayIndex === 5;
              const isMonthEnd = dateObj && (!nextDateObj || dateObj.dateStr.slice(0, 7) !== nextDateObj.dateStr.slice(0, 7));

              if (isMonthEnd) rightBorder = { style: "thick", color: { argb: "FF4B5563" } };
              else if (isFriday) rightBorder = { style: "medium", color: { argb: "FF2563EB" } };
            }

            // 2. 가로선(bottom) 테두리 분기 설정 (선 시작 지점 컬럼 분기 반영)
            let bottomBorder = { style: "thin", color: { argb: "FFD1D5DB" } };

            if (C === 0) {
              // A열: 조 병합 영역
              let startG = rIdx;
              while (startG > 0 && !gridRows[startG].renderGroup) {
                startG--;
              }
              const endG = startG + gridRows[startG].rowspanGroup - 1;

              // 현재 셀이 병합 영역의 상단(대표 셀) 또는 하단(마지막 셀)일 때 테두리 적용
              if (rIdx === startG || rIdx === endG) {
                const nextRowObj = endG < gridRows.length - 1 ? gridRows[endG + 1] : null;
                if (!nextRowObj) {
                  bottomBorder = { style: "thick", color: { argb: "FF000000" } };
                } else if (gridRows[endG].groupName !== nextRowObj.groupName) {
                  bottomBorder = { style: "medium", color: { argb: "FF000000" } };
                }
              }
            } else if (C === 1) {
              // B열: 선생님 병합 영역
              let startT = rIdx;
              while (startT > 0 && !gridRows[startT].renderTeacher) {
                startT--;
              }
              const endT = startT + gridRows[startT].rowspanTeacher - 1;

              if (rIdx === startT || rIdx === endT) {
                const nextRowObj = endT < gridRows.length - 1 ? gridRows[endT + 1] : null;
                if (!nextRowObj) {
                  bottomBorder = { style: "thick", color: { argb: "FF000000" } };
                } else if (gridRows[endT].groupName !== nextRowObj.groupName) {
                  bottomBorder = { style: "medium", color: { argb: "FF000000" } };
                } else if (gridRows[endT].teacher !== nextRowObj.teacher) {
                  bottomBorder = { style: "thin", color: { argb: "FF000000" } };
                }
              }
            } else if (C === 2) {
              // C열: 시간대 병합 영역
              let startS = rIdx;
              while (startS > 0 && !gridRows[startS].renderShift) {
                startS--;
              }
              const endS = startS + gridRows[startS].rowspanShift - 1;

              if (rIdx === startS || rIdx === endS) {
                const nextRowObj = endS < gridRows.length - 1 ? gridRows[endS + 1] : null;
                if (!nextRowObj) {
                  bottomBorder = { style: "thick", color: { argb: "FF000000" } };
                } else if (gridRows[endS].groupName !== nextRowObj.groupName) {
                  bottomBorder = { style: "medium", color: { argb: "FF000000" } };
                } else if (gridRows[endS].teacher !== nextRowObj.teacher) {
                  bottomBorder = { style: "thin", color: { argb: "FF000000" } };
                } else if (gridRows[endS].shift !== nextRowObj.shift) {
                  bottomBorder = { style: "medium", color: { argb: "FF2563EB" } };
                }
              }
            } else {
              // D열 ~ 끝열: 개별 날짜 셀
              const nextRowObj = rIdx < gridRows.length - 1 ? gridRows[rIdx + 1] : null;
              if (!nextRowObj) {
                bottomBorder = { style: "thick", color: { argb: "FF000000" } };
              } else if (rowObj.groupName !== nextRowObj.groupName) {
                bottomBorder = { style: "medium", color: { argb: "FF000000" } };
              } else if (rowObj.teacher !== nextRowObj.teacher) {
                bottomBorder = { style: "thin", color: { argb: "FF000000" } };
              } else if (rowObj.shift !== nextRowObj.shift) {
                bottomBorder = { style: "medium", color: { argb: "FF2563EB" } };
              }
            }

            cell.border = {
              top: { style: "thin", color: { argb: "FFD1D5DB" } },
              bottom: bottomBorder,
              left: { style: "thin", color: { argb: "FFD1D5DB" } },
              right: rightBorder
            };
          }
        });

        // Wait for all image downloads in this sheet
        await Promise.allSettled(imagePromises);
      }

      const todayYYYY = today.getFullYear();
      const todayMM = String(today.getMonth() + 1).padStart(2, '0');
      const todayDD = String(today.getDate()).padStart(2, '0');
      const filename = `디지털_서포터즈_일정표-${todayYYYY}-${todayMM}-${todayDD}.xlsx`;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, filename);

      setShowExportModal(true);
    } catch (err) {
      console.error(err);
      alert("⚠️ 엑셀 다운로드 중 오류가 발생했습니다: " + err.message);
    } finally {
      setExporting(false);
    }
  };


  const filteredData = data.filter(d => teacherFilter === "전체" || d.teacher === teacherFilter);

  const groupedByDate = {};
  filteredData.forEach(item => {
    if (!groupedByDate[item.log_date]) groupedByDate[item.log_date] = [];
    groupedByDate[item.log_date].push(item);
  });

  const uniqueDates = Array.from(new Set(filteredData.map(item => item.log_date))).sort();

  const inactiveTeachersWithRecordsUI = new Set();
  filteredData.forEach(item => {
    const dbT = getGlobalTeachersList().find(t => t.team === currentTeam && t.name === item.teacher);
    if (dbT && dbT.is_active === false) {
      inactiveTeachersWithRecordsUI.add(item.teacher);
    }
  });

  const teacherShiftsMap = {};

  const [selYear, selMonthStr] = selectedMonth.split('-');
  const selFirstDay = `${selectedMonth}-01`;
  const selLastDayVal = new Date(parseInt(selYear), parseInt(selMonthStr), 0).getDate();
  const selLastDay = `${selectedMonth}-${String(selLastDayVal).padStart(2, '0')}`;

  getGlobalTeachersList()
    .filter(t => t.team === currentTeam && (teacherFilter === "전체" || t.name === teacherFilter))
    .forEach(rec => {
      if (rec.is_active === false && !inactiveTeachersWithRecordsUI.has(rec.name)) return;
      if (rec.hire_date && selLastDay < rec.hire_date) return;
      if (rec.resign_date && selFirstDay > rec.resign_date) return;

      const g = getTeacherGroup(currentTeam, rec.name);
      const shifts = [rec.shift1, rec.shift2, rec.shift3].map(s => (s || "").trim()).filter(Boolean);
      if (shifts.length === 0) {
        const defaultShift = getTeacherDefaultShift(currentTeam, rec.name, g);
        const key = `${rec.name}::${defaultShift}`;
        teacherShiftsMap[key] = {
          teacher: rec.name,
          shift: defaultShift,
          groupName: g
        };
      } else {
        shifts.forEach(shift => {
          const key = `${rec.name}::${shift}`;
          teacherShiftsMap[key] = {
            teacher: rec.name,
            shift: shift,
            groupName: g
          };
        });
      }
    });

  filteredData.forEach(item => {
    if (currentTeam === "취업팀" && !isOfficialTeamTeacher("취업팀", item.teacher)) {
      return;
    }

    const tRec = getGlobalTeachersList().find(t => t.team === currentTeam && t.name === item.teacher);
    if (tRec) {
      if (tRec.hire_date && selLastDay < tRec.hire_date) return;
      if (tRec.resign_date && selFirstDay > tRec.resign_date) return;
    }

    const key = `${item.teacher}::${item.shift}`;
    teacherShiftsMap[key] = {
      teacher: item.teacher,
      shift: item.shift,
      groupName: getTeacherGroup(currentTeam, item.teacher)
    };
  });

  const sortedTeacherShifts = Object.values(teacherShiftsMap).sort((a, b) => {
    const weightA = getGroupWeight(a.groupName);
    const weightB = getGroupWeight(b.groupName);
    if (weightA !== weightB) return weightA - weightB;

    if (a.teacher !== b.teacher) {
      return getTeacherSortWeight(currentTeam, a.teacher) - getTeacherSortWeight(currentTeam, b.teacher);
    }
    return getShiftWeight(a.shift) - getShiftWeight(b.shift);
  });

  const gridRows = [];
  sortedTeacherShifts.forEach(ts => {
    gridRows.push({ ...ts, category: "대상" });
    gridRows.push({ ...ts, category: "장소" });
    gridRows.push({ ...ts, category: "진행" });
  });

  let startRow = 0;
  while (startRow < gridRows.length) {
    let count = 1;
    for (let nextRow = startRow + 1; nextRow < gridRows.length; nextRow++) {
      if (gridRows[startRow].groupName === gridRows[nextRow].groupName) {
        count++;
        gridRows[nextRow].renderGroup = false;
      } else {
        break;
      }
    }
    gridRows[startRow].rowspanGroup = count;
    gridRows[startRow].renderGroup = true;
    startRow += count;
  }

  startRow = 0;
  while (startRow < gridRows.length) {
    let count = 1;
    for (let nextRow = startRow + 1; nextRow < gridRows.length; nextRow++) {
      if (gridRows[startRow].groupName === gridRows[nextRow].groupName &&
        gridRows[startRow].teacher === gridRows[nextRow].teacher) {
        count++;
        gridRows[nextRow].renderTeacher = false;
      } else {
        break;
      }
    }
    gridRows[startRow].rowspanTeacher = count;
    gridRows[startRow].renderTeacher = true;
    startRow += count;
  }

  startRow = 0;
  while (startRow < gridRows.length) {
    let count = 1;
    for (let nextRow = startRow + 1; nextRow < gridRows.length; nextRow++) {
      if (gridRows[startRow].groupName === gridRows[nextRow].groupName &&
        gridRows[startRow].teacher === gridRows[nextRow].teacher &&
        gridRows[startRow].shift === gridRows[nextRow].shift) {
        count++;
        gridRows[nextRow].renderShift = false;
      } else {
        break;
      }
    }
    gridRows[startRow].rowspanShift = count;
    gridRows[startRow].renderShift = true;
    startRow += count;
  }

  const dataLookup = {};
  filteredData.forEach(item => {
    const key = `${item.teacher}::${item.shift}::${item.log_date}`;
    dataLookup[key] = item;
  });

  const getHolidayInfo = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length < 3) return null;
    const m = parts[1];
    const d = parts[2];
    const mmdd1 = `${m}-${d}`;
    const mmdd2 = `${parseInt(m)}-${parseInt(d)}`;
    const mmdd3 = `${parseInt(m)}/${parseInt(d)}`;
    return holidaysList.find(h => h.date === mmdd1 || h.date === mmdd2 || h.date === mmdd3 || h.date === dateStr) || null;
  };

  const holidayDates = {};
  uniqueDates.forEach(dateStr => {
    const holInfo = getHolidayInfo(dateStr);
    if (holInfo && !holInfo.vacation_available) {
      holidayDates[dateStr] = holInfo;
    }
  });

  const firstShiftForTeacher = {};
  gridRows.forEach(row => {
    if (!firstShiftForTeacher[row.teacher]) {
      firstShiftForTeacher[row.teacher] = row.shift;
    }
  });

  return (
    <div className="w-full min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="bg-white flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="shrink-0 bg-[#2b5ce6] text-white shadow-md z-40 relative flex items-start px-4 pt-3 pb-9 sm:pb-7 min-h-[110px] sm:min-h-[92px]">
          <div>
            <div className="flex items-center mb-1">
              <img src="/Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl sm:text-2xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-[18px] font-bold text-yellow-300">
              디지털교육 서포터즈
            </p>
          </div>

          {/* [다운로드] 버튼 */}
          <div className="absolute left-1/2 bottom-1.5 transform -translate-x-1/2 z-50">
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="px-5 py-1.5 md:px-7 md:py-2 rounded-lg border border-blue-900 bg-blue-800 text-white font-bold hover:bg-blue-900 shadow-lg active:scale-95 text-sm md:text-base transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <DownloadIcon className="w-4 h-4 md:w-5 md:h-5" />
              <span
                key={exporting ? 'exporting' : String(downloadTextToggle)}
                style={{
                  display: 'inline-block',
                  animation: exporting ? 'none' : 'btnTextFade 0.4s ease-in-out'
                }}
              >
                {exporting ? "생성 중..." : (downloadTextToggle ? "엑셀화일" : "다운로드")}
              </span>
            </button>
          </div>

          <div className="ml-auto">
            <button onClick={onNavigateBack} className="text-xs flex flex-col items-center font-bold p-2 rounded-lg shadow-md transition-all touch-manipulation bg-blue-800 text-white opacity-90 active:scale-95">
              <Home className="w-5 h-5 mb-1" />
              <span>처음으로</span>
            </button>
          </div>
        </div>

        {/* 필터 및 월 선택 */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-col md:flex-row gap-3 justify-between items-center z-10 shadow-sm relative">
          <div className="flex flex-col items-center w-full md:w-auto">
            <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-1 border border-blue-100 w-full md:w-auto justify-center">
              <button onClick={() => changeMonth(-1)} className="p-1.5 text-blue-600 hover:bg-blue-200 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
              <div className="font-bold text-blue-900 px-2 min-w-[90px] text-center">{selectedMonth}</div>
              <button onClick={() => changeMonth(1)} className="p-1.5 text-blue-600 hover:bg-blue-200 rounded-md transition-colors"><ChevronRight className="w-5 h-5" /></button>
            </div>
            {errorMessage && (
              <div className="text-red-500 text-base font-bold mt-1.5 animate-fadeIn">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="flex flex-row flex-nowrap items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end">
            {/* 보기 방식 토글 */}
            <div className="flex items-center">
              <div className="flex bg-gray-100 rounded-lg p-0.5 border border-gray-200">
                <button
                  onClick={() => setViewMode("sheet")}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === "sheet" ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                >
                  구글시트형
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === "list" ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                >
                  목록형
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <select
                className="w-24 sm:w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-xs sm:text-sm font-bold text-blue-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 outline-none"
                value={currentTeam}
                onChange={(e) => {
                  setCurrentTeam(e.target.value);
                  setTeacherFilter("전체");
                }}
              >
                <option value="" disabled hidden>팀</option>
                <option value="1팀">1팀</option>
                <option value="2팀">2팀</option>
                <option value="3팀">3팀</option>
                <option value="취업팀">취업팀</option>
              </select>
              <select
                className="w-28 sm:w-36 border border-gray-300 rounded-lg px-2 py-1.5 text-xs sm:text-sm font-bold text-blue-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 outline-none"
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
              >
                <option value="전체">선생님</option>
                {uniqueTeachers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 lg:p-1 bg-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-blue-500">
              <RotateCcw className="w-8 h-8 animate-spin mb-3" />
              <p className="font-bold">데이터를 불러오는 중입니다...</p>
            </div>
          ) : Object.keys(groupedByDate).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500 font-bold">해당 월에 등록된 일정이 없습니다.</p>
            </div>
          ) : viewMode === "sheet" ? (
            /* ========================================================
               1. 구글시트형 격자 테이블 뷰
               ======================================================== */
            <div className="bg-white rounded-xl shadow-md border border-gray-300 overflow-hidden">
              <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                <table className="table-fixed text-center border-collapse text-[13px] sm:text-sm md:text-base lg:text-lg min-w-[900px] w-full">
                  <thead className="sticky top-0 z-30 bg-[#2b5ce6] text-white">
                    <tr>
                      {/* 연번 열 고정 - left:0 */}
                      <th className="border border-blue-700 py-2.5 w-[50px] sm:w-[60px] md:w-[70px] lg:w-[80px] font-bold text-white bg-[#1E3A8A] text-[13px] sm:text-sm md:text-base lg:text-lg" style={{ position: 'sticky', left: 0, zIndex: 40 }}>연번</th>
                      {/* 성명 열 고정 - left: 연번열 너비만큼 */}
                      <th className="border border-blue-700 py-2.5 w-[70px] sm:w-[80px] md:w-[90px] lg:w-[100px] font-bold text-white bg-[#1E3A8A] text-[13px] sm:text-sm md:text-base lg:text-lg" style={{ position: 'sticky', left: 50, zIndex: 40 }}>성명</th>
                      {/* 수업시간 열 - 고정 없음 */}
                      <th className="border border-blue-700 border-r-2 border-r-gray-700 py-2.5 w-[90px] sm:w-[100px] md:w-[115px] lg:w-[130px] font-bold text-white bg-[#1E3A8A] text-[13px] sm:text-sm md:text-base lg:text-lg">수업시간</th>
                      {uniqueDates.map(dateStr => {
                        const m = dateStr.split('-')[1];
                        const d = dateStr.split('-')[2];
                        const dayName = getDayName(dateStr);
                        const dayIndex = new Date(dateStr).getDay();
                        const isFriday = dayIndex === 5;
                        const idx = uniqueDates.indexOf(dateStr);
                        const nextDate = uniqueDates[idx + 1];
                        const isMonthEnd = !nextDate || dateStr.slice(0, 7) !== nextDate.slice(0, 7);
                        const rightBorderStyle = isMonthEnd
                          ? "3px solid #4B5563"
                          : (isFriday ? "2px solid #2563EB" : "1px solid #D1D5DB");
                        return (
                          <th key={dateStr} className="border border-blue-700 py-2 w-[90px] sm:w-[105px] md:w-[120px] lg:w-[135px] font-bold text-white bg-[#1E3A8A] whitespace-nowrap text-[13px] sm:text-sm md:text-base lg:text-lg" style={{ borderRight: rightBorderStyle }}>
                            {parseInt(m)}/{parseInt(d)} ({dayName})
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.map((row, idx) => {
                      const isNewGroup = idx > 0 && gridRows[idx].renderGroup;
                      const isNewTeacher = idx > 0 && gridRows[idx].renderTeacher;
                      const isNewShift = idx > 0 && gridRows[idx].renderShift;

                      const borderStyle = isNewGroup
                        ? { borderTop: '2.5px solid #334155' }
                        : (isNewTeacher ? { borderTop: '2px solid #64748b' } : (isNewShift ? { borderTop: '2px solid #2563EB' } : {}));

                      return (
                        <tr key={idx} className="hover:bg-blue-50/40 bg-gray-50" style={{ ...borderStyle, height: '36px' }}>
                          {/* 연번 열 고정 */}
                          {row.renderGroup && (
                            <td className="border border-gray-300 font-extrabold text-gray-800 bg-gray-50/80 align-middle py-1.5 px-0.5 text-[13px] sm:text-sm md:text-base lg:text-lg" rowSpan={row.rowspanGroup} style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#F9FAFB' }}>
                              {row.groupName}
                            </td>
                          )}
                          {/* 성명 열 고정 */}
                          {row.renderTeacher && (
                            <td className="border border-gray-300 font-bold text-gray-800 align-middle py-1.5 px-0.5 text-[13px] sm:text-sm md:text-base lg:text-lg" rowSpan={row.rowspanTeacher} style={{ position: 'sticky', left: 50, zIndex: 10, backgroundColor: '#F3F4F6' }}>
                              {row.teacher}
                            </td>
                          )}
                          {/* 수업시간 열 - 고정 없음 */}
                          {row.renderShift && (
                            <td className="border border-gray-300 border-r-2 border-r-gray-700 text-gray-700 font-bold align-middle py-1.5 px-0.5 text-[12px] sm:text-[13px] md:text-sm lg:text-base bg-gray-50" rowSpan={row.rowspanShift}>
                              {row.shift}
                            </td>
                          )}

                          {uniqueDates.map((dateStr, dateIdx) => {
                            const item = dataLookup[`${row.teacher}::${row.shift}::${dateStr}`];
                            let cellContent = '';
                            let cellClass = "text-gray-400 font-normal bg-white";
                            const dayIndex = new Date(dateStr).getDay();
                            const isFriday = dayIndex === 5;
                            const nextDate = uniqueDates[dateIdx + 1];
                            const isMonthEnd = !nextDate || dateStr.slice(0, 7) !== nextDate.slice(0, 7);
                            const rightBorderStyle = isMonthEnd
                              ? "3px solid #4B5563"
                              : (isFriday ? "2px solid #2563EB" : "1px solid #D1D5DB");

                            const holidayInfo = holidayDates[dateStr];
                            const isHoliday = !!holidayInfo;
                            const isFirstShift = row.shift === firstShiftForTeacher[row.teacher];

                            if (isHoliday) {
                              if (isFirstShift) {
                                if (row.category === "대상") {
                                  cellContent = holidayInfo.name || '공휴일';
                                } else if (row.category === "장소") {
                                  cellContent = holidayInfo.content1 || '공휴일';
                                } else if (row.category === "진행") {
                                  cellContent = holidayInfo.content2 || '';
                                }
                                cellClass = "text-gray-700 font-extrabold text-[12px] sm:text-[13px] md:text-sm lg:text-base py-1 px-1";
                              } else {
                                cellContent = '';
                                cellClass = "bg-white text-gray-400 font-normal";
                              }
                            } else if (item) {
                              const isMeeting = item.student && item.student.includes("간담회");

                              if (isMeeting) {
                                if (isFirstShift) {
                                  if (row.category === "대상") {
                                    cellContent = item.student || '간담회';
                                    cellClass = "font-extrabold text-[12px] sm:text-[13px] md:text-sm lg:text-base py-1 px-1 text-gray-700";
                                  } else if (row.category === "장소") {
                                    cellContent = item.location || '';
                                    cellClass = "font-extrabold text-[13px] sm:text-[14px] py-1 px-1 text-gray-700";
                                  } else if (row.category === "진행") {
                                    cellContent = item.status || '';
                                    cellClass = "font-extrabold text-[13px] sm:text-[14px] py-1 px-1 text-white";
                                  }
                                } else {
                                  cellContent = '';
                                  cellClass = "bg-white text-gray-400 font-normal";
                                }
                              } else {
                                if (row.category === "대상") {
                                  cellContent = item.student || '';
                                  if (item.student?.includes('보조강사')) {
                                    cellClass = "bg-yellow-300 text-gray-950 font-extrabold text-[12px] sm:text-[13px] md:text-sm lg:text-base py-1 px-1";
                                  } else if (item.student) {
                                    cellClass = "text-gray-955 font-bold bg-sky-100";
                                  }
                                } else if (row.category === "장소") {
                                  const sigUrl = currentTeam === "취업팀" && item.location && (item.location.startsWith("http://") || item.location.startsWith("https://")) ? item.location : null;
                                  if (sigUrl) {
                                    cellContent = (
                                      <a href={sigUrl} target="_blank" rel="noopener noreferrer" className="block w-full flex justify-center py-0.5 sm:py-1">
                                        <img src={sigUrl} alt="서명" className="h-6 sm:h-8 md:h-10 object-contain" />
                                      </a>
                                    );
                                    cellClass = "!bg-white";
                                  } else {
                                    cellContent = (
                                      <span className="text-black font-medium truncate max-w-[75px] sm:max-w-[95px] lg:max-w-[125px] block mx-auto text-[11px] sm:text-[13px] md:text-sm lg:text-base">
                                        {item.location || ''}
                                      </span>
                                    );
                                    cellClass = "!bg-white";
                                  }
                                } else if (row.category === "진행") {
                                  const rawStatus = item.status || '';
                                  cellContent = rawStatus ? (
                                    <div className="w-full break-all whitespace-pre-wrap px-0.5 leading-snug text-left text-[10px] sm:text-[11px] md:text-xs lg:text-sm" title={rawStatus}>
                                      {rawStatus.split(/(\d+\s*회차)/g).map((part, idx) => {
                                        if (/\d+\s*회차/.test(part)) {
                                          return <span key={idx} className="text-blue-600">{part}</span>;
                                        }
                                        return part;
                                      })}
                                    </div>
                                  ) : '';

                                  if (rawStatus.includes('결석') || rawStatus.includes('종료') || rawStatus.includes('취소')) {
                                    cellClass = "text-red-600 font-extrabold bg-red-50";
                                  } else if (rawStatus.includes('휴가')) {
                                    cellClass = "text-gray-500 font-bold bg-gray-100";
                                  } else if (rawStatus) {
                                    cellClass = "text-black font-bold bg-[#F0FDF4]";
                                  } else {
                                    cellClass = "text-gray-400 font-normal bg-white";
                                  }
                                }
                              }
                            }

                            let cellStyle = { height: '36px', borderRight: rightBorderStyle };
                            const isMeeting = !isHoliday && item && item.student && item.student.includes("간담회");
                            if (isHoliday) {
                              if (isFirstShift) {
                                const isRedHoliday = holidayInfo.content1 && holidayInfo.content1.includes('공휴일');
                                cellStyle.backgroundColor = isRedHoliday ? "#fca5a5" : "#86efac";
                              } else {
                                cellStyle.backgroundColor = "#ffffff";
                              }
                            } else if (isMeeting) {
                              if (isFirstShift) {
                                cellStyle.backgroundColor = "#86efac";
                              } else {
                                cellStyle.backgroundColor = "#ffffff";
                              }
                            } else if (row.category === "장소") {
                              cellStyle.backgroundColor = "#ffffff";
                            }

                            const alignClass = row.category === "진행" ? "align-top text-left" : "align-middle text-center";

                            return (
                              <td key={dateStr} className={`border border-gray-300 py-1.5 px-0.5 ${alignClass} text-[11px] sm:text-xs md:text-sm lg:text-[15px] break-all whitespace-pre-wrap leading-snug ${cellClass}`} style={cellStyle}>
                                {/* 내용이 많아도 최대 72px(약 3~4줄) 높이에서 고정, 넘치면 스크롤 */}
                                <div style={{ maxHeight: '72px', overflowY: 'auto' }}>
                                  {cellContent || '\u00A0'}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ========================================================
               2. 목록형 일정 뷰
               ======================================================== */
            <div className="space-y-5">
              {Object.entries(groupedByDate).sort(([a], [b]) => b.localeCompare(a)).map(([dateStr, items]) => {
                const sortedItems = [...items].sort((a, b) => {
                  const groupA = getTeacherGroup(currentTeam, a.teacher);
                  const groupB = getTeacherGroup(currentTeam, b.teacher);

                  const weightA = getGroupWeight(groupA);
                  const weightB = getGroupWeight(groupB);
                  if (weightA !== weightB) return weightA - weightB;

                  if (a.teacher !== b.teacher) {
                    const tWeightA = getTeacherSortWeight(currentTeam, a.teacher);
                    const tWeightB = getTeacherSortWeight(currentTeam, b.teacher);
                    if (tWeightA !== tWeightB) return tWeightA - tWeightB;
                    return a.teacher.localeCompare(b.teacher);
                  }

                  return getShiftWeight(a.shift) - getShiftWeight(b.shift);
                });

                const parsedItems = sortedItems.map(item => ({
                  ...item,
                  groupName: getTeacherGroup(currentTeam, item.teacher),
                  rowspan: { group: 1, teacher: 1 },
                  render: { group: true, teacher: true }
                }));

                let startRow = 0;
                while (startRow < parsedItems.length) {
                  let count = 1;
                  for (let nextRow = startRow + 1; nextRow < parsedItems.length; nextRow++) {
                    if (parsedItems[startRow].groupName === parsedItems[nextRow].groupName) {
                      count++;
                      parsedItems[nextRow].render.group = false;
                    } else {
                      break;
                    }
                  }
                  parsedItems[startRow].rowspan.group = count;
                  startRow += count;
                }

                startRow = 0;
                while (startRow < parsedItems.length) {
                  let count = 1;
                  for (let nextRow = startRow + 1; nextRow < parsedItems.length; nextRow++) {
                    if (parsedItems[startRow].groupName === parsedItems[nextRow].groupName &&
                      parsedItems[startRow].teacher === parsedItems[nextRow].teacher) {
                      count++;
                      parsedItems[nextRow].render.teacher = false;
                    } else {
                      break;
                    }
                  }
                  parsedItems[startRow].rowspan.teacher = count;
                  startRow += count;
                }

                return (
                  <div key={dateStr} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-blue-100/50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5 text-blue-600" />
                      <span className="font-black text-blue-900 text-[17px]">{dateStr} ({getDayName(dateStr)})</span>
                    </div>
                    <div className="p-0 overflow-x-auto">
                      <table className="w-full text-center border-collapse text-xs sm:text-sm min-w-[600px]">
                        <thead>
                          <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold">
                            <th className="border-r border-gray-200 py-2 w-[12%]">조</th>
                            <th className="border-r border-gray-200 py-2 w-[18%]">강사명</th>
                            <th className="border-r border-gray-200 py-2 w-[18%]">수업시간</th>
                            <th className="border-r border-gray-200 py-2 w-[22%]">대상(학생)</th>
                            <th className="border-r border-gray-200 py-2 w-[18%]">장소/서명</th>
                            <th className="py-2 w-[12%]">출결 상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedItems.map((item, idx) => {
                            const isNewGroup = idx > 0 && parsedItems[idx].render.group;
                            const isNewTeacher = idx > 0 && parsedItems[idx].render.teacher;
                            const rowStyle = isNewGroup
                              ? { borderTop: '2px solid #cbd5e1' }
                              : (isNewTeacher ? { borderTop: '1px solid #e2e8f0' } : {});

                            const holidayInfo = getHolidayInfo(item.log_date);
                            const isHoliday = !!holidayInfo && !holidayInfo.vacation_available;
                            const isMeeting = !isHoliday && item.student && item.student.includes("간담회");

                            // 배경색 style 계산
                            let targetStyle = {};
                            if (isHoliday) {
                              if (item.render.teacher) {
                                const isRedHoliday = holidayInfo.content1 && holidayInfo.content1.includes('공휴일');
                                targetStyle = { backgroundColor: isRedHoliday ? "#fca5a5" : "#86efac" };
                              }
                            } else if (isMeeting) {
                              if (item.render.teacher) targetStyle = { backgroundColor: "#86efac" };
                            }

                            // 텍스트 클래스 계산
                            let studentTextClass = "text-gray-800";
                            let locationTextClass = "text-black";
                            let statusTextClass = 'text-gray-400';
                            if (item.status) {
                              let hasIndAbsence = false;
                              item.status.split(/(결석)/g).forEach((subPart, j, arr) => {
                                if (subPart === '결석') {
                                  const prevChar = arr[j - 1]?.slice(-1) || '';
                                  const nextChar = arr[j + 1]?.[0] || '';
                                  if (!/[가-힣a-zA-Z0-9]/.test(prevChar) && !/[가-힣a-zA-Z0-9]/.test(nextChar)) hasIndAbsence = true;
                                }
                              });
                              const hasCancel = (() => {
                                const t = item.status.split(/[,/]+/).map(x => x.trim());
                                return t[0] === '취소' || t[0] === '종료' || (t.length > 1 && (t[1] === '취소' || t[1] === '종료'));
                              })();

                              if (item.status.includes('선생님휴가')) {
                                statusTextClass = 'text-gray-500';
                              } else if (item.status.includes('결석')) {
                                statusTextClass = 'text-red-700';
                              } else if (item.status.includes('종료')) {
                                statusTextClass = 'text-red-400';
                              } else if (hasIndAbsence || hasCancel) {
                                statusTextClass = 'text-gray-300';
                              } else if (item.status.includes('휴가')) {
                                statusTextClass = 'text-gray-400';
                              } else {
                                statusTextClass = 'text-black';
                              }
                            }

                            if (isHoliday) {
                              if (item.render.teacher) {
                                studentTextClass = "text-gray-700";
                                locationTextClass = "text-gray-700";
                                statusTextClass = "text-gray-700";
                              }
                            } else if (isMeeting) {
                              if (item.render.teacher) {
                                studentTextClass = "text-gray-700";
                                locationTextClass = "text-gray-700 font-bold";
                              }
                            }

                            return (
                              <tr key={idx} className="hover:bg-blue-50/40 bg-white" style={rowStyle}>
                                {item.render.group && (
                                  <td className="border-r border-b border-gray-200 font-extrabold text-gray-700 bg-gray-50/80 align-middle py-2 px-1" rowSpan={item.rowspan.group}>
                                    {item.groupName}
                                  </td>
                                )}
                                {item.render.teacher && (
                                  <td className="border-r border-b border-gray-200 font-bold text-blue-900 bg-blue-50/10 align-middle py-2 px-1" rowSpan={item.rowspan.teacher}>
                                    {item.teacher}
                                  </td>
                                )}
                                <td className="border-r border-b border-gray-200 text-blue-700 font-bold align-middle py-2 px-1">{item.shift}</td>
                                <td className="border-r border-b border-gray-200 text-gray-800 font-medium align-middle py-2 px-1" style={targetStyle}>
                                  <span className={`text-sm font-bold break-all whitespace-pre-wrap ${studentTextClass}`}>{(isHoliday && !item.render.teacher) ? '' : (isMeeting && !item.render.teacher) ? '' : isHoliday ? (holidayInfo.name || '공휴일') : (item.student || '-')}</span>
                                </td>
                                <td className="border-r border-b border-gray-200 text-black align-middle py-2 px-1" style={targetStyle}>
                                  {(currentTeam === "취업팀" && item.location && (item.location.startsWith("http://") || item.location.startsWith("https://"))) && !(isHoliday) ? (
                                    (() => {
                                      const sigUrl = item.location;
                                      return (
                                        <a href={sigUrl} target="_blank" rel="noopener noreferrer" className="block w-full flex justify-center py-0.5">
                                          <img src={sigUrl} alt="서명" className="h-5 sm:h-7 object-contain" />
                                        </a>
                                      );
                                    })()
                                  ) : (
                                    <span className={`truncate block max-w-[120px] mx-auto ${locationTextClass}`} title={isHoliday ? (holidayInfo.content1 || '공휴일') : item.location}>{(isHoliday && !item.render.teacher) ? '' : (isMeeting && !item.render.teacher) ? '' : isHoliday ? (holidayInfo.content1 || '공휴일') : (item.location || '-')}</span>
                                  )}
                                </td>
                                <td className="border-b border-gray-200 align-top py-2 px-1 text-left" style={targetStyle}>
                                  <span className={`text-xs font-bold break-all whitespace-normal block w-full overflow-hidden line-clamp-3 ${statusTextClass}`} title={isHoliday ? (item.render.teacher ? (holidayInfo.content2 || '') : '') : (item.status || '')}>
                                    {(isHoliday && !item.render.teacher) ? '' : (isMeeting && !item.render.teacher) ? '' : isHoliday ? (holidayInfo.content2 || '-') : (item.status && item.status !== '\u200B' ? item.status : '-')}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* 엑셀 완료 안내 모달 */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl transform transition-all border border-gray-100 flex flex-col items-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600 text-2xl">
                🎉
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">엑셀 다운로드 완료</h3>
              <p className="text-gray-500 text-sm text-center mb-6">
                디지털 서포터즈 일정표 엑셀 파일 다운로드가 완료되었습니다.
              </p>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-md transition-colors active:scale-95"
              >
                확인
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}