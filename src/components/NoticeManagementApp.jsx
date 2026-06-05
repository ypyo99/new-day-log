import React, { useState, useEffect, useRef } from 'react';
import { supabaseClient } from '../utils/supabase';
import { Home, LucideCalendar } from './Icons';

const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';

const formatMMDD = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
};

const isValidMMDD = (value) => {
  if (!/^\d{2}-\d{2}$/.test(value)) return false;
  const [mm, dd] = value.split('-').map(Number);
  if (mm < 1 || mm > 12) return false;
  
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dd < 1 || dd > daysInMonth[mm - 1]) return false;
  
  return true;
};

function ImageResizer({ selectedImg, editorRef, onResize, onResizeEnd }) {
  const [style, setStyle] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const isResizing = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, width: 0, height: 0, direction: '' });

  const updatePosition = () => {
    if (!selectedImg || !editorRef.current) return;
    const imgRect = selectedImg.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();

    const scrollTop = editorRef.current.scrollTop;
    const scrollLeft = editorRef.current.scrollLeft;

    setStyle({
      left: imgRect.left - editorRect.left + scrollLeft,
      top: imgRect.top - editorRect.top + scrollTop,
      width: imgRect.width,
      height: imgRect.height
    });
  };

  useEffect(() => {
    updatePosition();
    
    const editor = editorRef.current;
    if (editor) {
      editor.addEventListener('scroll', updatePosition);
    }
    window.addEventListener('resize', updatePosition);

    const observer = new MutationObserver(updatePosition);
    if (editor) {
      observer.observe(editor, { attributes: true, childList: true, subtree: true });
    }

    return () => {
      if (editor) {
        editor.removeEventListener('scroll', updatePosition);
      }
      window.removeEventListener('resize', updatePosition);
      observer.disconnect();
    };
  }, [selectedImg]);

  const handleMouseDown = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: selectedImg.offsetWidth,
      height: selectedImg.offsetHeight,
      direction
    };

    const handleMouseMove = (moveEvent) => {
      if (!isResizing.current) return;
      const deltaX = moveEvent.clientX - dragStart.current.x;
      const editorWidth = editorRef.current.clientWidth - 24; // 패딩 등 여백 고려

      let newWidth = dragStart.current.width;
      
      if (dragStart.current.direction.includes('right')) {
        newWidth = dragStart.current.width + deltaX;
      } else if (dragStart.current.direction.includes('left')) {
        newWidth = dragStart.current.width - deltaX;
      }

      // 최소 너비 40px, 최대 에디터 너비
      newWidth = Math.max(40, Math.min(newWidth, editorWidth));
      const pctWidth = Math.round((newWidth / editorWidth) * 100);
      
      selectedImg.style.width = `${pctWidth}%`;
      selectedImg.style.height = 'auto';
      
      if (onResize) {
        onResize(pctWidth);
      }
      
      updatePosition();
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (onResizeEnd) {
        onResizeEnd();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (!selectedImg) return null;

  const handleStyle = {
    position: 'absolute',
    width: '12px',
    height: '12px',
    background: '#3b82f6',
    border: '2px solid #ffffff',
    borderRadius: '50%',
    zIndex: 50,
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${style.left}px`,
        top: `${style.top}px`,
        width: `${style.width}px`,
        height: `${style.height}px`,
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          border: '2px dashed #3b82f6',
          boxSizing: 'border-box',
          position: 'absolute',
          left: 0,
          top: 0
        }}
      />
      {/* 우하단 */}
      <div
        style={{
          ...handleStyle,
          right: '-6px',
          bottom: '-6px',
          cursor: 'se-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'bottom-right')}
      />
      {/* 좌하단 */}
      <div
        style={{
          ...handleStyle,
          left: '-6px',
          bottom: '-6px',
          cursor: 'sw-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'bottom-left')}
      />
      {/* 우상단 */}
      <div
        style={{
          ...handleStyle,
          right: '-6px',
          top: '-6px',
          cursor: 'ne-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'top-right')}
      />
      {/* 좌상단 */}
      <div
        style={{
          ...handleStyle,
          left: '-6px',
          top: '-6px',
          cursor: 'nw-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'top-left')}
      />
    </div>
  );
}

export default function NoticeManagementApp({ onNavigateBack }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return window.localStorage.getItem('sungdong_admin_logged_in') === 'true';
    } catch (e) {
      return false;
    }
  });

  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdInput, setPwdInput] = useState("");
  const [pwdError, setPwdError] = useState(false);
  const pwdInputRef = useRef(null);

  const [notices, setNotices] = useState([]);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [supabaseTableMissing, setSupabaseTableMissing] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const editorRef = useRef(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [selectedImgWidth, setSelectedImgWidth] = useState(100);
  const prevSelectedImgRef = useRef(null);

  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.innerHTML = selectedNotice ? selectedNotice.content : "";
    }
  }, [isEditing, selectedNotice]);

  useEffect(() => {
    if (prevSelectedImgRef.current) {
      try {
        prevSelectedImgRef.current.style.outline = "";
        prevSelectedImgRef.current.style.boxShadow = "";
      } catch (e) {}
    }
    if (selectedImg) {
      try {
        selectedImg.style.outline = "3px solid #3b82f6";
        selectedImg.style.boxShadow = "0 0 12px rgba(59, 130, 246, 0.4)";
      } catch (e) {}
    }
    prevSelectedImgRef.current = selectedImg;
  }, [selectedImg]);

  const getTodayString = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  };

  useEffect(() => {
    if (showPwdModal && pwdInputRef.current) {
      pwdInputRef.current.focus();
    }
  }, [showPwdModal]);

  const loadNotices = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const { data, error } = await supabaseClient
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205' || (error.message && error.message.includes('notices'))) {
          setSupabaseTableMissing(true);
        } else {
          setErrorMsg("데이터 로드 실패: " + error.message);
        }
      } else {
        setNotices(data || []);
        setSupabaseTableMissing(false);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("오류 발생: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotices();
  }, []);

  const handleAdminClick = () => {
    if (isAdmin) {
      setIsAdmin(false);
      window.localStorage.removeItem('sungdong_admin_logged_in');
      setIsEditing(false);
      setSelectedNotice(null);
    } else {
      setShowPwdModal(true);
      setPwdInput("");
      setPwdError(false);
    }
  };

  const checkPassword = () => {
    if (pwdInput === import.meta.env.VITE_ADMIN_PASSWORD) {
      setIsAdmin(true);
      window.localStorage.setItem('sungdong_admin_logged_in', 'true');
      setShowPwdModal(false);
    } else {
      setPwdError(true);
    }
  };

  const handleSelectNotice = (notice) => {
    setSelectedNotice(notice);
    setTitle(notice.title);
    setContent(notice.content);
    setStartDate(notice.start_date ? notice.start_date.substring(5) : "");
    setEndDate(notice.end_date ? notice.end_date.substring(5) : "");
    setCreatedAt(notice.created_at ? notice.created_at.substring(5) : "");
    setSelectedImg(null);
    if (isAdmin) {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  };

  const handleNewNotice = () => {
    setSelectedNotice(null);
    setTitle("");
    setContent("");
    setStartDate(getTodayString());
    setEndDate("");
    setCreatedAt(getTodayString());
    setIsEditing(true);
    setSelectedImg(null);
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const safeName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `notice_${Date.now()}_${safeName}.${fileExt}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('signatures')
        .upload(fileName, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabaseClient.storage.from('signatures').getPublicUrl(fileName);
      const imageUrl = publicUrlData.publicUrl;

      const imgHtml = `<img src="${imageUrl}" alt="첨부 이미지" style="max-width: 100%; height: auto; display: block; margin: 12px 0; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />`;

      if (editorRef.current) {
        editorRef.current.focus();
        try {
          document.execCommand('insertHTML', false, imgHtml);
        } catch (execErr) {
          editorRef.current.innerHTML += imgHtml;
        }
        setContent(editorRef.current.innerHTML);
      } else {
        setContent(prev => prev + imgHtml);
      }
    } catch (err) {
      console.error(err);
      alert("이미지 업로드에 실패했습니다: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleEditorClick = (e) => {
    if (e.target.tagName === 'IMG') {
      setSelectedImg(e.target);
      const currentWidthStr = e.target.style.width || "";
      const matchPct = currentWidthStr.match(/(\d+)%/);
      if (matchPct) {
        setSelectedImgWidth(parseInt(matchPct[1]));
      } else {
        setSelectedImgWidth(100);
      }
    } else {
      setSelectedImg(null);
    }
  };

  const handleImageResize = (e) => {
    const val = parseInt(e.target.value);
    setSelectedImgWidth(val);
    if (selectedImg) {
      selectedImg.style.width = `${val}%`;
      if (editorRef.current) {
        setContent(editorRef.current.innerHTML);
      }
    }
  };

  const applyQuickResize = (pct) => {
    setSelectedImgWidth(pct);
    if (selectedImg) {
      selectedImg.style.width = `${pct}%`;
      if (editorRef.current) {
        setContent(editorRef.current.innerHTML);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해 주세요.");
      return;
    }
    if (!startDate || !endDate) {
      alert("게시시작일과 게시종료일을 입력해 주세요.");
      return;
    }
    if (!isValidMMDD(startDate) || !isValidMMDD(endDate)) {
      alert("올바른 날짜(MM-DD 형식, 예: 06-05)로 입력해 주세요.");
      return;
    }

    const currentYear = selectedNotice 
      ? selectedNotice.created_at.split('-')[0]
      : new Date().getFullYear().toString();

    const fullStartDate = `${currentYear}-${startDate}`;
    const fullEndDate = `${currentYear}-${endDate}`;
    const fullCreatedAt = selectedNotice 
      ? selectedNotice.created_at 
      : `${currentYear}-${createdAt}`;

    if (new Date(fullStartDate) > new Date(fullEndDate)) {
      alert("게시시작일은 게시종료일보다 빠르거나 같아야 합니다.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        created_at: fullCreatedAt,
        start_date: fullStartDate,
        end_date: fullEndDate,
        updated_at: new Date().toISOString()
      };

      if (selectedNotice) {
        payload.id = selectedNotice.id;
      }

      const { data, error } = await supabaseClient
        .from('notices')
        .upsert(payload, { onConflict: 'id' })
        .select();

      if (error) throw error;

      alert("공지사항이 성공적으로 저장되었습니다.");
      setIsEditing(false);
      setSelectedNotice(null);
      setSelectedImg(null);
      loadNotices();
    } catch (err) {
      console.error(err);
      alert("저장 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedNotice) return;
    if (!window.confirm("이 공지사항을 정말 삭제하시겠습니까?")) return;

    setSaving(true);
    try {
      const { error } = await supabaseClient
        .from('notices')
        .delete()
        .eq('id', selectedNotice.id);

      if (error) throw error;

      alert("공지사항이 삭제되었습니다.");
      setIsEditing(false);
      setSelectedNotice(null);
      loadNotices();
    } catch (err) {
      console.error(err);
      alert("삭제 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-6">
      <style>{`
        .rich-editor:empty:before {
          content: attr(placeholder);
          color: #9ca3af;
          font-weight: 500;
        }
        .rich-editor img, .prose img {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          transition: outline 0.15s ease, box-shadow 0.15s ease;
        }
        .rich-editor img:hover {
          outline: 2px solid #3b82f6;
        }
      `}</style>
      {/* 헤더 영역 */}
      <header className="bg-blue-600 text-white px-4 pt-4 pb-7 shadow-lg z-40 flex justify-between items-start relative shrink-0 min-h-[96px]">
        <div className="flex items-center">
          <div className="flex flex-col">
            <div className="flex items-center mb-1">
              <img src="Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-lg font-bold text-yellow-300">디지털교육 서포터즈</p>
            <p className="text-base opacity-95 flex items-center mt-1 font-bold">
              <LucideCalendar className="w-4 h-4 mr-1" /> 공지사항 관리
            </p>
          </div>
        </div>

        {/* 담당자 로그인 및 새로작성 버튼 영역 */}
        <div className="absolute left-1/2 bottom-1.5 transform -translate-x-1/2 z-50 flex items-center gap-3">
          <button
            onClick={handleAdminClick}
            className={`px-5 py-1.5 md:px-8 md:py-2 rounded-lg border border-blue-900 font-bold transition-all active:scale-95 text-xs md:text-sm touch-manipulation whitespace-nowrap ${isAdmin ? 'bg-white text-blue-800 shadow' : 'bg-blue-800 text-white hover:bg-blue-900 shadow-md'}`}
          >
            {isAdmin ? '담당자 모드 종료' : '담당자 로그인'}
          </button>
          {isAdmin && (
            <button
              onClick={handleNewNotice}
              className="px-5 py-1.5 md:px-8 md:py-2 rounded-lg border border-amber-600 font-bold transition-all active:scale-95 text-xs md:text-sm touch-manipulation whitespace-nowrap bg-amber-500 hover:bg-amber-600 text-white shadow-md"
            >
              새로 작성
            </button>
          )}
        </div>

        <button
          onClick={onNavigateBack}
          className="text-xs flex flex-col items-center font-bold p-2 rounded-lg shadow-md transition-all touch-manipulation bg-blue-800 text-white opacity-90 active:scale-95"
        >
          <Home className="w-5 h-5 mb-1" /> 처음으로
        </button>
      </header>

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 px-3 sm:px-6 md:px-8 pt-4 pb-12 w-full max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* Supabase 테이블 부재 경고 */}
        {supabaseTableMissing && (
          <div className="bg-amber-50 text-amber-900 rounded-xl border border-amber-300 shadow-sm p-4 text-xs sm:text-sm flex flex-col gap-2 text-left">
            <div className="flex items-center gap-2 font-bold text-amber-800 text-[14px] sm:text-base">
              ⚠️ 공지사항(notices) 테이블 생성이 필요합니다!
            </div>
            <p className="leading-relaxed">
              공지사항 관리 데이터를 활성화하려면 아래 SQL 쿼리를 복사하여 <b>Supabase Dashboard ➡️ SQL Editor</b>에 붙여넣고 실행(Run)해 주세요.
            </p>
            <pre className="bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto font-mono text-[10px] sm:text-xs max-h-40 border border-gray-800 select-all">
              {`CREATE TABLE IF NOT EXISTS public.notices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    content text NOT NULL,
    created_at date NOT NULL DEFAULT CURRENT_DATE,
    start_date date,
    end_date date,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.notices FOR SELECT USING (true);
CREATE POLICY "Allow public all access" ON public.notices FOR ALL USING (true) WITH CHECK (true);`}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`CREATE TABLE IF NOT EXISTS public.notices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    content text NOT NULL,
    created_at date NOT NULL DEFAULT CURRENT_DATE,
    start_date date,
    end_date date,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.notices FOR SELECT USING (true);
CREATE POLICY "Allow public all access" ON public.notices FOR ALL USING (true) WITH CHECK (true);`);
                alert("SQL 쿼리가 클립보드에 복사되었습니다!");
              }}
              className="bg-amber-600 text-white font-bold py-1.5 px-4 rounded-lg hover:bg-amber-700 active:scale-95 transition-all self-start text-xs shadow-sm"
            >
              SQL 쿼리 복사하기
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-red-100 text-red-700 font-bold rounded-lg border border-red-300 text-sm text-center">
            🚨 {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch flex-1">
          {/* 좌측: 공지사항 목록 */}
          <section className={`bg-white rounded-2xl shadow-md border border-gray-100 p-4 flex flex-col h-[500px] md:h-auto overflow-hidden transition-all duration-350 ${(selectedNotice || isEditing) ? 'md:col-span-5' : 'md:col-span-12'}`}>
            <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-3 pb-2 border-b">공지사항 목록</h2>
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 font-bold">
                로딩 중...
              </div>
            ) : notices.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 font-bold">
                등록된 공지사항이 없습니다.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1">
                <table className="w-full text-left" style={{ borderSpacing: 0 }}>
                  <thead>
                    <tr className="text-sm font-bold text-blue-900 uppercase tracking-wider">
                      <th className="py-2.5 px-3 bg-blue-300 border-b-2 border-blue-400 rounded-tl-lg">제목</th>
                      <th className="py-2.5 px-3 bg-blue-300 border-b-2 border-blue-400 text-right w-28 rounded-tr-lg">작성일자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notices.map((notice) => (
                      <tr
                        key={notice.id}
                        onClick={() => handleSelectNotice(notice)}
                        className={`border-b cursor-pointer transition-colors hover:bg-blue-50/50 ${selectedNotice?.id === notice.id ? 'bg-blue-50 font-semibold' : ''}`}
                      >
                        <td className="py-3 pr-2 text-sm sm:text-base text-gray-800 max-w-[150px] truncate">
                          {notice.title}
                        </td>
                        <td className="py-3 text-right text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                          {notice.created_at ? notice.created_at.substring(5) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 우측: 상세 조회 또는 편집 */}
          {(selectedNotice || isEditing) && (
            <section className="md:col-span-7 bg-white rounded-2xl shadow-md border border-gray-100 p-4 flex flex-col transition-all duration-350">
              {isEditing ? (
                /* 편집 및 작성 폼 */
                <form onSubmit={handleSave} className="flex flex-col gap-4 flex-1">
                  <div className="flex justify-between items-center border-b pb-2 mb-1">
                    <h2 className="text-base sm:text-lg font-bold text-blue-700">
                      {selectedNotice ? '공지사항 수정' : '공지사항 새로 작성'}
                    </h2>
                    {selectedNotice && (
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={saving}
                        className="px-3 py-1 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded font-bold text-xs transition-colors active:scale-95"
                      >
                        삭제
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-gray-600">제목</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={saving}
                      placeholder="공지사항 제목을 입력해 주세요"
                      className="p-2 border rounded-xl outline-none font-bold text-gray-800 focus:border-blue-500 text-sm sm:text-base bg-blue-200"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-bold text-gray-600">작성일자</label>
                      <input
                        type="text"
                        readOnly
                        placeholder="MM-DD"
                        value={createdAt}
                        className="p-2 border rounded-xl bg-blue-200 text-gray-600 font-bold outline-none text-xs sm:text-sm text-center"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-bold text-gray-600">게시시작일</label>
                      <input
                        type="text"
                        required
                        placeholder="MM-DD"
                        maxLength={5}
                        value={startDate}
                        onChange={(e) => setStartDate(formatMMDD(e.target.value))}
                        disabled={saving}
                        className="p-2 border rounded-xl outline-none font-bold text-gray-800 focus:border-blue-500 text-xs sm:text-sm text-center bg-blue-200"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-bold text-gray-600">게시종료일</label>
                      <input
                        type="text"
                        required
                        placeholder="MM-DD"
                        maxLength={5}
                        value={endDate}
                        onChange={(e) => setEndDate(formatMMDD(e.target.value))}
                        disabled={saving}
                        className="p-2 border rounded-xl outline-none font-bold text-gray-800 focus:border-blue-500 text-xs sm:text-sm text-center bg-blue-200"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-1 min-h-[200px]">
                    {selectedImg && (
                      <div className="bg-sky-50 border border-sky-200 rounded-xl p-2.5 flex flex-col sm:flex-row items-center gap-3 animate-fadeIn text-xs sm:text-sm">
                        <span className="font-bold text-sky-850 shrink-0">선택된 이미지 크기:</span>
                        <div className="flex items-center gap-2 flex-1 w-full">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={selectedImgWidth}
                            onChange={handleImageResize}
                            className="w-full h-1.5 bg-sky-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="font-bold text-sky-700 w-10 text-right">{selectedImgWidth}%</span>
                        </div>
                        <div className="flex gap-1 shrink-0 w-full sm:w-auto">
                          {[25, 50, 75, 100].map(pct => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => applyQuickResize(pct)}
                              className="flex-1 sm:flex-initial px-2.5 py-0.5 bg-white border border-sky-300 rounded text-xs font-bold hover:bg-sky-50 active:scale-95 transition-all text-sky-800"
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold text-gray-600">내용</label>
                      <div className="relative">
                        <input
                          type="file"
                          id="image-file-input"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploading || saving}
                          className="hidden"
                        />
                        <label
                          htmlFor="image-file-input"
                          className={`flex items-center gap-1.5 px-3 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded font-bold text-xs cursor-pointer select-none active:scale-95 transition-all ${(uploading || saving) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          {uploading ? '그림 올리는 중...' : '그림(이미지) 추가'}
                        </label>
                      </div>
                    </div>
                    <div className="relative flex-1 flex flex-col min-h-[200px]">
                      {selectedImg && isEditing && (
                        <ImageResizer
                          selectedImg={selectedImg}
                          editorRef={editorRef}
                          onResize={(pct) => setSelectedImgWidth(pct)}
                          onResizeEnd={() => {
                            if (editorRef.current) {
                              setContent(editorRef.current.innerHTML);
                            }
                          }}
                        />
                      )}
                      <div
                        ref={editorRef}
                        contentEditable
                        onInput={(e) => setContent(e.currentTarget.innerHTML)}
                        onClick={handleEditorClick}
                        placeholder="공지사항 내용을 작성해 주세요 (그림 추가 버튼으로 본문에 이미지를 삽입할 수 있습니다)"
                        className="p-3 border rounded-xl outline-none font-medium text-gray-800 focus:border-blue-500 text-sm sm:text-base overflow-y-auto flex-1 bg-white rich-editor max-h-[400px] md:max-h-none w-full"
                        style={{ minHeight: '200px' }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setSelectedNotice(null);
                        setSelectedImg(null);
                      }}
                      disabled={saving}
                      className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm sm:text-base transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-2"
                    >
                      {saving && <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                      {saving ? '저장 중...' : '작성 완료'}
                    </button>
                  </div>
                </form>
              ) : (
                /* 공지사항 상세 조회 */
                <div className="flex flex-col gap-4 flex-1 h-full overflow-hidden">
                  <div className="border-b pb-3 shrink-0">
                    <h2 className="text-lg sm:text-xl font-black text-gray-900 leading-tight">
                      {selectedNotice.title}
                    </h2>
                    <div className="flex justify-between items-center mt-2 flex-wrap gap-2 text-xs sm:text-sm text-gray-500 font-medium">
                      <span>작성일자: {selectedNotice.created_at ? selectedNotice.created_at.substring(5) : ''}</span>
                      <span className="bg-sky-50 border border-sky-100 text-sky-700 px-2 py-0.5 rounded-md font-semibold">
                        게시기간: {selectedNotice.start_date ? selectedNotice.start_date.substring(5) : ''} ~ {selectedNotice.end_date ? selectedNotice.end_date.substring(5) : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1">
                    <div 
                      className="prose max-w-none text-gray-800 leading-relaxed font-medium break-all text-sm sm:text-base"
                      dangerouslySetInnerHTML={{ __html: selectedNotice.content.replace(/\n/g, '<br />') }}
                    />
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* 담당자 암호 입력 모달 */}
      {showPwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] px-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">담당자 암호</h3>
            <input
              ref={pwdInputRef}
              autoFocus
              type="password"
              value={pwdInput}
              onChange={(e) => {
                const val = e.target.value;
                setPwdInput(val);
                if (val === import.meta.env.VITE_ADMIN_PASSWORD) {
                  setIsAdmin(true);
                  window.localStorage.setItem('sungdong_admin_logged_in', 'true');
                  setShowPwdModal(false);
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && checkPassword()}
              className="w-full border-2 p-3 rounded-lg mb-4 text-center text-2xl tracking-widest outline-none focus:border-blue-500"
              placeholder="••••"
            />
            {pwdError && <p className="text-red-500 text-xs text-center mb-4">비밀번호가 틀렸습니다.</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowPwdModal(false)}
                className="flex-1 py-3 bg-gray-100 rounded-lg font-bold touch-manipulation text-sm sm:text-base"
              >
                취소
              </button>
              <button
                onClick={checkPassword}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold touch-manipulation text-sm sm:text-base"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
