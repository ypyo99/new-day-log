import React, { useState, useEffect } from 'react';
import XLSX from 'xlsx-js-style';
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
  getDayName
} from '../utils/helpers';
import {
  Home,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  DownloadIcon,
  CalendarIcon
} from './Icons';

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
        setData(records);
        const tSet = new Set();
        getTeamTeacherNames(currentTeam).forEach(t => tSet.add(t));
        records.forEach(r => { if (r.teacher) tSet.add(r.teacher); });
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
        return;
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
    setExporting(true);
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const yearStr = String(year);
      const monthStr = String(month).padStart(2, '0');

      // 올해(현재 연도)의 1월 1일부터 검색
      const startDateStr = `${yearStr}-01-01`;

      let nextYear = year;
      let nextMonth = month + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      const nextMonthLastDay = new Date(nextYear, nextMonth, 0).getDate();
      const endDateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextMonthLastDay).padStart(2, '0')}`;

      // 올해 최초 근무일자 조회
      let firstWorkDateStr = `${yearStr}-01-01`; // 기본값
      const { data: firstRec, error: firstRecErr } = await supabaseClient
        .from('daily_logs')
        .select('log_date')
        .gte('log_date', `${yearStr}-01-01`)
        .lte('log_date', endDateStr)
        .order('log_date', { ascending: true })
        .limit(1);

      if (!firstRecErr && firstRec && firstRec.length > 0) {
        firstWorkDateStr = firstRec[0].log_date;
      }

      const dateList = [];
      const [startYear, startMonth, startDay] = firstWorkDateStr.split('-').map(Number);
      let curr = new Date(startYear, startMonth - 1, startDay); // DB에 기록된 올해 첫 근무일부터 시작
      const endLimit = new Date(nextYear, nextMonth - 1, nextMonthLastDay);
      while (curr <= endLimit) {
        const dayOfWeekIndex = curr.getDay();
        if (dayOfWeekIndex !== 0 && dayOfWeekIndex !== 6) { // 일요일(0), 토요일(6) 제외
          const yyyy = curr.getFullYear();
          const mm = String(curr.getMonth() + 1).padStart(2, '0');
          const dd = String(curr.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;

          const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][dayOfWeekIndex];
          const label = `${curr.getMonth() + 1}/${curr.getDate()} (${dayOfWeek})`;

          dateList.push({
            dateStr,
            label,
            dayIndex: dayOfWeekIndex
          });
        }
        curr.setDate(curr.getDate() + 1);
      }

      const wb = XLSX.utils.book_new();
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

        // 해당 팀의 전체 데이터를 페이지 단위(Chunk)로 여러 번 나누어 받아와서 유실 방지 (Supabase 서버 강제 1000개 리밋 회피)
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
            .order('log_date', { ascending: true });

          if (chunkErr) throw chunkErr;

          if (chunk && chunk.length > 0) {
            teamData = teamData.concat(chunk);
            if (chunk.length < limit) {
              hasMore = false;
            } else {
              start += limit;
            }
          } else {
            hasMore = false;
          }
        }

        const teamTeacherShiftsMap = {};
        getGlobalTeachersList().filter(t => t.team === tName).forEach(rec => {
          const teacher = rec.name;
          const group = getTeacherGroup(tName, teacher);
          if (isExcludedTeacherForExport(teacher)) return;
          const tLogs = teamData.filter(r => r.teacher === teacher);
          if (tLogs.length > 0) {
            tLogs.forEach(r => {
              const key = `${teacher}::${r.shift}`;
              teamTeacherShiftsMap[key] = {
                teacher,
                shift: r.shift,
                groupName: group
              };
            });
          } else {
            const defaultShift = getTeacherDefaultShift(tName, teacher, group);
            const key = `${teacher}::${defaultShift}`;
            teamTeacherShiftsMap[key] = {
              teacher,
              shift: defaultShift,
              groupName: group
            };
          }
        });

        teamData.forEach(item => {
          if (isExcludedTeacherForExport(item.teacher)) return;
          if (tName === "취업팀" && !isOfficialTeamTeacher("취업팀", item.teacher)) {
            return;
          }
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
            } else {
              break;
            }
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
            } else {
              break;
            }
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
            } else {
              break;
            }
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

        const wsData = [];
        // 1행: 제목행 (B컬럼부터 = 인덱스 1에 제목 텍스트)
        const titleRow = ["", `2026년 디지털 서포터즈 활동 일정표 [${tName}]`, ...Array(dateList.length + 1).fill("")];
        wsData.push(titleRow);
        // 2행: 헤더행
        const headerRow = ["연번", "성명", "시간", ...dateList.map(d => d.label)];
        wsData.push(headerRow);

        const fontName = "Malgun Gothic";
        const borderThin = {
          top: { style: "thin", color: { rgb: "D1D5DB" } },
          bottom: { style: "thin", color: { rgb: "D1D5DB" } },
          left: { style: "thin", color: { rgb: "D1D5DB" } },
          right: { style: "thin", color: { rgb: "D1D5DB" } }
        };

        const firstRowHeaderStyle = {
          font: { name: fontName, sz: 10, bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1E3A8A" } },
          alignment: { vertical: "center", horizontal: "center", wrapText: true },
          border: borderThin
        };

        const cellStyleGroup = {
          font: { name: fontName, sz: 9, bold: true, color: { rgb: "64748B" } },
          fill: { fgColor: { rgb: "F8FAFC" } },
          alignment: { vertical: "center", horizontal: "center" },
          border: borderThin
        };

        const cellStyleTeacher = {
          font: { name: fontName, sz: 10, bold: true, color: { rgb: "0F172A" } },
          fill: { fgColor: { rgb: "FFFFFF" } },
          alignment: { vertical: "center", horizontal: "center" },
          border: borderThin
        };

        const cellStyleShift = {
          font: { name: fontName, sz: 9, color: { rgb: "334155" } },
          fill: { fgColor: { rgb: "FFFFFF" } },
          alignment: { vertical: "center", horizontal: "center" },
          border: borderThin
        };

        const merges = [];

        gridRows.forEach((row, rIdx) => {
          const excelRowIdx = rIdx + 2; // 제목행(0행)이 추가되어 +2
          const rowArr = [];

          rowArr.push(row.groupName);
          rowArr.push(row.teacher);
          rowArr.push(row.shift);

          dateList.forEach(d => {
            const item = dataLookup[`${row.teacher}::${row.shift}::${d.dateStr}`];
            let val = "";
            if (item) {
              if (row.category === "대상") {
                val = item.student || "";
              } else if (row.category === "장소") {
                val = item.signature_url ? "서명 이미지 확인" : (item.location || "");
              } else if (row.category === "진행") {
                val = item.status === "1" ? "1" : (item.status || "");
              }
            }
            rowArr.push(val);
          });

          wsData.push(rowArr);

          if (row.renderGroup && row.rowspanGroup > 1) {
            merges.push({ s: { r: excelRowIdx, c: 0 }, e: { r: excelRowIdx + row.rowspanGroup - 1, c: 0 } });
          }
          if (row.renderTeacher && row.rowspanTeacher > 1) {
            merges.push({ s: { r: excelRowIdx, c: 1 }, e: { r: excelRowIdx + row.rowspanTeacher - 1, c: 1 } });
          }
          if (row.renderShift && row.rowspanShift > 1) {
            merges.push({ s: { r: excelRowIdx, c: 2 }, e: { r: excelRowIdx + row.rowspanShift - 1, c: 2 } });
          }
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData, { raw: true });

        // 💡 [날짜 오변환 완전 복원] xlsx-js-style이 raw:true를 무시하고 "1/1" 등을 Date로 자동 변환하는 문제 해결
        const wsRange = XLSX.utils.decode_range(ws['!ref']);
        for (let R2 = wsRange.s.r; R2 <= wsRange.e.r; ++R2) {
          for (let C2 = wsRange.s.c; C2 <= wsRange.e.c; ++C2) {
            const ref = XLSX.utils.encode_cell({ r: R2, c: C2 });
            const c = ws[ref];
            if (c && (c.t === 'd' || c.t === 'n' || c.v instanceof Date)) {
              const origRow = wsData[R2];
              if (origRow && C2 < origRow.length) {
                c.v = String(origRow[C2] ?? "");
                c.t = 's';
                delete c.w;
                delete c.z;
              }
            }
          }
        }

        // 제목 셀(B1, 즉 r=0, c=1) 스타일 설정
        const titleCellStyle = {
          font: { name: fontName, sz: 16, bold: true, color: { rgb: "1E3A8A" } },
          alignment: { vertical: "center", horizontal: "left" }
        };
        const titleCellRef = XLSX.utils.encode_cell({ r: 0, c: 1 });
        if (ws[titleCellRef]) {
          ws[titleCellRef].s = titleCellStyle;
        }

        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellRef]) {
              ws[cellRef] = { v: "" };
            }
            const cell = ws[cellRef];

            if (R === 0) {
              continue;
            }

            if (R === 1) {
              cell.s = firstRowHeaderStyle;
              continue;
            }

            const rowObj = gridRows[R - 2];
            if (C === 0) {
              cell.s = cellStyleGroup;
            } else if (C === 1) {
              cell.s = cellStyleTeacher;
            } else if (C === 2) {
              cell.s = cellStyleShift;
            } else {
              const dateObj = dateList[C - 3];
              const item = dataLookup[`${rowObj.teacher}::${rowObj.shift}::${dateObj.dateStr}`];

              let fillRGB = "FFFFFF";
              let fontColorRGB = "475569";
              let isBold = false;

              if (item) {
                const isHoliday = (item.student && /공휴일|근로자의날|어린이날|휴일|공휴/.test(item.student)) ||
                  (item.status && /공휴일|근로자의날|어린이날|휴일|공휴/.test(item.status)) ||
                  (item.location && /공휴일|근로자의날|어린이날|휴일|공휴/.test(item.location));

                if (rowObj.category === "장소") {
                  if (isHoliday) {
                    fillRGB = "F87171";
                    fontColorRGB = "FEF08A";
                    isBold = true;
                  } else {
                    fillRGB = "FFFFFF";
                    if (item.signature_url) {
                      fontColorRGB = "2563EB";
                      isBold = true;
                    } else if (item.location) {
                      fontColorRGB = "000000";
                    }
                  }
                } else if (isHoliday) {
                  fillRGB = "F87171";
                  fontColorRGB = "FFFFFF";
                  isBold = true;
                } else {
                  if (rowObj.category === "대상") {
                    if (item.student?.includes('보조강사')) {
                      fillRGB = "FFFF00";
                      fontColorRGB = "000000";
                      isBold = true;
                    } else if (item.student) {
                      fillRGB = "E0F2FE";
                      fontColorRGB = "000000";
                      isBold = true;
                    }
                  } else if (rowObj.category === "진행") {
                    if (item.status?.includes('결석') || item.status?.includes('취소')) {
                      fillRGB = "FEE2E2";
                      fontColorRGB = "DC2626";
                      isBold = true;
                    } else if (item.status?.includes('휴가')) {
                      fillRGB = "F3F4F6";
                      fontColorRGB = "6B7280";
                      isBold = true;
                    } else if (item.status) {
                      fillRGB = "F0FDF4";
                      fontColorRGB = "000000";
                      isBold = true;
                    }
                  }
                }
              }

              cell.s = {
                font: { 
                  name: fontName, 
                  sz: 10, 
                  bold: isBold, 
                  color: { rgb: fontColorRGB },
                  underline: (rowObj.category === "장소" && item && item.signature_url) ? true : false
                },
                fill: { fgColor: { rgb: fillRGB } },
                alignment: { vertical: "center", horizontal: "center", wrapText: true },
                border: borderThin
              };

              // 서명이 있는 경우 하이퍼링크 추가
              if (rowObj.category === "장소" && item && item.signature_url) {
                cell.l = { Target: item.signature_url, Tooltip: "클릭하여 서명 이미지 보기" };
              }
            }

            if (R > 1 && rowObj) {
              let origVal = "";
              if (C === 0) {
                origVal = rowObj.groupName || "";
              } else if (C === 1) {
                origVal = rowObj.teacher || "";
              } else if (C === 2) {
                origVal = rowObj.shift || "";
              } else {
                const dateObj = dateList[C - 3];
                const item = dataLookup[`${rowObj.teacher}::${rowObj.shift}::${dateObj.dateStr}`];
                if (item) {
                  if (rowObj.category === "대상") {
                    origVal = item.student || "";
                  } else if (rowObj.category === "장소") {
                    origVal = item.signature_url ? "서명 이미지 확인" : (item.location || "");
                  } else if (rowObj.category === "진행") {
                    origVal = item.status === "1" ? "1" : (item.status || "");
                  }
                }
              }
              cell.v = origVal;
              cell.t = 's';
            }

            const nextRowObj = R > 1 ? gridRows[R - 1] : null;
            const isTeacherBoundary = R > 1 && rowObj && (!nextRowObj || rowObj.teacher !== nextRowObj.teacher);
            const isShiftBoundary = R > 1 && rowObj && nextRowObj && rowObj.shift !== nextRowObj.shift;
            let rightBorder = { style: "thin", color: { rgb: "D1D5DB" } };

            if (C === 2) {
              rightBorder = { style: "thick", color: { rgb: "4B5563" } };
            } else if (C >= 3) {
              const dateObj = dateList[C - 3];
              const nextDateObj = dateList[C - 2];
              const isFriday = dateObj && dateObj.dayIndex === 5;
              const isMonthEnd = dateObj && (!nextDateObj || dateObj.dateStr.slice(0, 7) !== nextDateObj.dateStr.slice(0, 7));

              if (isMonthEnd) {
                rightBorder = { style: "thick", color: { rgb: "4B5563" } };
              } else if (isFriday) {
                rightBorder = { style: "medium", color: { rgb: "2563EB" } };
              }
            }

            const currentBorder = {
              top: { style: "thin", color: { rgb: "D1D5DB" } },
              bottom: isShiftBoundary
                ? { style: "medium", color: { rgb: "2563EB" } }
                : (isTeacherBoundary ? { style: "medium", color: { rgb: "6B7280" } } : { style: "thin", color: { rgb: "D1D5DB" } }),
              left: { style: "thin", color: { rgb: "D1D5DB" } },
              right: rightBorder
            };

            cell.s = { ...cell.s, border: currentBorder };
          }
        }

        merges.unshift({ s: { r: 0, c: 1 }, e: { r: 0, c: 7 } });
        ws['!merges'] = merges;

        const wscols = [
          { wch: 8 },
          { wch: 11 },
          { wch: 15 },
          ...dateList.map(() => ({ wch: 14 }))
        ];
        ws['!cols'] = wscols;

        const wsrows = [
          { hpt: 40 },
          { hpt: 35 },
          ...gridRows.map(() => ({ hpt: 26 }))
        ];
        ws['!rows'] = wsrows;

        XLSX.utils.book_append_sheet(wb, ws, tName);
      }

      const todayYYYY = today.getFullYear();
      const todayMM = String(today.getMonth() + 1).padStart(2, '0');
      const todayDD = String(today.getDate()).padStart(2, '0');
      const filename = `디지털_서포터즈_일정표-${todayYYYY}-${todayMM}-${todayDD}.xlsx`;

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
      const buf = new ArrayBuffer(wbout.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < wbout.length; i++) {
        view[i] = wbout.charCodeAt(i) & 0xFF;
      }
      const blob = new Blob([buf], { type: 'application/octet-stream' });

      if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, filename);
      } else {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 100);
      }
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

  const teacherShiftsMap = {};

  getGlobalTeachersList().filter(t => t.team === currentTeam).forEach(rec => {
    const g = getTeacherGroup(currentTeam, rec.name);
    const defaultShift = getTeacherDefaultShift(currentTeam, rec.name, g);
    const key = `${rec.name}::${defaultShift}`;
    teacherShiftsMap[key] = {
      teacher: rec.name,
      shift: defaultShift,
      groupName: g
    };
  });

  filteredData.forEach(item => {
    if (currentTeam === "취업팀" && !isOfficialTeamTeacher("취업팀", item.teacher)) {
      return;
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

  const isHolidayStr = (str) => {
    if (!str) return false;
    if (/공휴일|근로자의날|어린이날|공휴|명절|연휴/.test(str)) return true;
    if (str.trim() === "휴일") return true;
    return false;
  };

  const holidayDates = {};
  filteredData.forEach(item => {
    if (!holidayDates[item.log_date]) {
      const isHol = isHolidayStr(item.student) || isHolidayStr(item.status) || isHolidayStr(item.location);
      if (isHol && !item.status?.includes("결석") && !item.status?.includes("취소")) {
        holidayDates[item.log_date] = item;
      }
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
        <div className="shrink-0 bg-[#2b5ce6] text-white shadow-md z-40 relative flex items-start px-4 pt-3 pb-7 min-h-[84px]">
          <div>
            <div className="flex items-center mb-1">
              <img src="Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl sm:text-2xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-sm sm:text-base font-bold text-yellow-300">
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
                      <th className="border border-blue-700 py-2.5 w-[50px] sm:w-[60px] md:w-[70px] lg:w-[80px] font-bold text-white bg-[#1E3A8A] text-[13px] sm:text-sm md:text-base lg:text-lg">연번</th>
                      <th className="border border-blue-700 py-2.5 w-[70px] sm:w-[80px] md:w-[90px] lg:w-[100px] font-bold text-white bg-[#1E3A8A] text-[13px] sm:text-sm md:text-base lg:text-lg">성명</th>
                      <th className="border border-blue-700 border-r-2 border-r-gray-700 py-2.5 w-[90px] sm:w-[100px] md:w-[115px] lg:w-[130px] font-bold text-white bg-[#1E3A8A] text-[13px] sm:text-sm md:text-base lg:text-lg">시간</th>
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
                          {row.renderGroup && (
                            <td className="border border-gray-300 font-extrabold text-gray-800 bg-gray-50/80 align-middle py-1.5 px-0.5 text-[13px] sm:text-sm md:text-base lg:text-lg" rowSpan={row.rowspanGroup}>
                              {row.groupName}
                            </td>
                          )}
                          {row.renderTeacher && (
                            <td className="border border-gray-300 font-bold text-gray-800 bg-[#F3F4F6] align-middle py-1.5 px-0.5 text-[13px] sm:text-sm md:text-base lg:text-lg" rowSpan={row.rowspanTeacher}>
                              {row.teacher}
                            </td>
                          )}
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

                            const holidayItem = holidayDates[dateStr];
                            const isHolidayDate = !!holidayItem;
                            const isFirstShift = row.shift === firstShiftForTeacher[row.teacher];
                            const isSpecialTeacher = row.teacher.includes('천은선') || row.teacher.includes('서승희');

                            const isHolidayItem = item && (isHolidayStr(item.student) || isHolidayStr(item.status) || isHolidayStr(item.location)) && !item.status?.includes("결석") && !item.status?.includes("취소");

                            if (isHolidayDate && isFirstShift && isSpecialTeacher && !item) {
                              if (row.category === "대상") {
                                cellContent = holidayItem.student || '공휴일';
                                cellClass = "bg-red-400 text-white font-extrabold text-[12px] sm:text-[13px] md:text-sm lg:text-base py-1 px-1";
                              } else if (row.category === "장소") {
                                cellContent = holidayItem.location || '공휴일';
                                cellClass = "!bg-white text-red-500 font-extrabold text-[13px] sm:text-[14px] py-1 px-1";
                              } else if (row.category === "진행") {
                                cellContent = holidayItem.status || '';
                                cellClass = "bg-[#F0FDF4] text-black font-extrabold text-[13px] sm:text-[14px] py-1 px-1";
                              }
                            } else if (item) {
                              if (isHolidayItem) {
                                if (!isFirstShift) {
                                  cellContent = '';
                                  cellClass = "bg-white text-gray-400 font-normal";
                                } else {
                                  if (row.category === "대상") {
                                    cellContent = item.student || '공휴일';
                                    if (item.student?.includes('보조강사')) {
                                      cellClass = "bg-yellow-300 text-gray-950 font-extrabold text-[12px] sm:text-[13px] md:text-sm lg:text-base py-1 px-1";
                                    } else {
                                      cellClass = "bg-red-400 text-white font-extrabold text-[12px] sm:text-[13px] md:text-sm lg:text-base py-1 px-1";
                                    }
                                  } else if (row.category === "장소") {
                                    cellContent = item.location || '공휴일';
                                    cellClass = "!bg-white text-red-500 font-extrabold text-[13px] sm:text-[14px] py-1 px-1";
                                  } else if (row.category === "진행") {
                                    cellContent = item.status || '';
                                    if (item.status?.includes('결석') || item.status?.includes('취소')) {
                                      cellClass = "bg-red-500 text-white font-extrabold text-[13px] sm:text-[14px] py-1 px-1";
                                    } else if (item.status?.includes('휴가')) {
                                      cellClass = "bg-gray-200 text-gray-700 font-bold text-[13px] sm:text-[14px] py-1 px-1";
                                    } else if (item.status) {
                                      cellClass = "bg-[#F0FDF4] text-black font-extrabold text-[13px] sm:text-[14px] py-1 px-1";
                                    } else {
                                      cellClass = "bg-gray-50 text-gray-400 font-normal";
                                    }
                                  }
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
                                  if (item.signature_url) {
                                    cellContent = (
                                      <a href={item.signature_url} target="_blank" rel="noopener noreferrer" className="block w-full flex justify-center py-0.5 sm:py-1">
                                        <img src={item.signature_url} alt="서명" className="h-6 sm:h-8 md:h-10 object-contain" />
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
                                  cellContent = item.status || '';
                                  if (item.status?.includes('결석') || item.status?.includes('취소')) {
                                    cellClass = "text-red-600 font-extrabold bg-red-50";
                                  } else if (item.status?.includes('휴가')) {
                                    cellClass = "text-gray-500 font-bold bg-gray-100";
                                  } else if (item.status) {
                                    cellClass = "text-black font-bold bg-[#F0FDF4]";
                                  } else {
                                    cellClass = "text-gray-400 font-normal bg-white";
                                  }
                                }
                              }
                            }

                            return (
                              <td key={dateStr} className={`border border-gray-300 py-1.5 px-0.5 align-middle text-center text-[13px] sm:text-sm md:text-base lg:text-[17px] ${cellClass}`} style={{ height: '36px', borderRight: rightBorderStyle, ...(row.category === "장소" ? { backgroundColor: "#ffffff" } : {}) }}>{cellContent || '\u00A0'}
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
                            <th className="border-r border-gray-200 py-2 w-[18%]">시간</th>
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
                                <td className="border-r border-b border-gray-200 text-gray-800 font-medium align-middle py-2 px-1">
                                  <span className="text-sm font-bold text-gray-800">{item.student || '-'}</span>
                                </td>
                                <td className="border-r border-b border-gray-200 text-black align-middle py-2 px-1">
                                  {item.signature_url ? (
                                    <a href={item.signature_url} target="_blank" rel="noopener noreferrer" className="block w-full flex justify-center py-0.5">
                                      <img src={item.signature_url} alt="서명" className="h-5 sm:h-7 object-contain" />
                                    </a>
                                  ) : (
                                    <span className="truncate block max-w-[120px] mx-auto" title={item.location}>{item.location || '-'}</span>
                                  )}
                                </td>
                                <td className="border-b border-gray-200 align-middle py-2 px-1">
                                  <span className={`text-sm font-bold ${item.status?.includes('결석') || item.status?.includes('취소') ? 'text-red-500'
                                    : item.status?.includes('선생님휴가') ? 'text-black'
                                      : item.status?.includes('휴가') ? 'text-gray-400'
                                        : item.status ? 'text-black'
                                          : 'text-gray-400'
                                    }`}>
                                    {item.status || '-'}
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
