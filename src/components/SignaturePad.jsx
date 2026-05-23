import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getDirectImageUrl } from '../utils/helpers';
import { RotateCcw } from './Icons';

export default function SignaturePad({ onSave, disabled, currentUrl, onTriggerSave, onRefresh, isDoubleHeight, forceSign }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showSavedImg, setShowSavedImg] = useState(false);
  const [isImgLoading, setIsImgLoading] = useState(false);
  const [lastBase64, setLastBase64] = useState("");
  const [isSigning, setIsSigningState] = useState(false);
  const isSigningRef = useRef(false);
  const isChangedRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const originalUrlRef = useRef("");

  const setIsSigningWithRef = (val) => {
    isSigningRef.current = val;
    setIsSigningState(val);
  };

  useEffect(() => {
    if (forceSign && !isSigningRef.current) {
      toggleSignMode();
    }
  }, [forceSign]);

  useEffect(() => {
    if (isSigningRef.current) return;
    const hasUrl = currentUrl && (currentUrl.startsWith('http') || currentUrl.startsWith('data:') || currentUrl.startsWith('=') || currentUrl.includes('drive.google.com'));
    if (hasUrl) {
      setShowSavedImg(true);
      if (currentUrl.startsWith('http') && !isImgLoading) {
        setIsImgLoading(true);
      } else {
        setLastBase64(currentUrl);
        setIsImgLoading(false);
      }
    } else {
      setShowSavedImg(false);
      setIsImgLoading(false);
    }
  }, [currentUrl, isSigning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [isDoubleHeight]);

  const clearCanvasInternal = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const tempWidth = canvas.width;
      canvas.width = 0;
      canvas.width = tempWidth;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  };

  useEffect(() => {
    if (currentUrl === "") {
      clearCanvasInternal();
      setLastBase64("");
    }
  }, [currentUrl]);

  const getCoordinates = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (disabled || !isSigningRef.current) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1.0;
    ctx.filter = 'none';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    isChangedRef.current = true;
  };

  const draw = (e) => {
    if (!isDrawing || disabled || !isSigningRef.current) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing || disabled || !isSigningRef.current) return;
    setIsDrawing(false);
    hasDrawnRef.current = true;
    if (canvasRef.current) {
      const base64 = canvasRef.current.toDataURL('image/png');
      setLastBase64(base64);
      onSave(base64);
    }
  };

  const loadSignatureToCanvas = useCallback(() => {
    const hasUrl = currentUrl && (currentUrl.startsWith('http') || currentUrl.startsWith('data:') || currentUrl.startsWith('=') || currentUrl.includes('drive.google.com'));
    if (!hasUrl) {
      setShowSavedImg(false);
      return;
    }

    const img = new Image();
    if (!currentUrl.startsWith('data:')) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 1.0;
      ctx.filter = 'contrast(1.3) brightness(0.95)';

      for (let i = 0; i < 4; i++) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }

      ctx.filter = 'none';
      hasDrawnRef.current = true;
      setShowSavedImg(false);
    };

    img.onerror = () => {
      console.error("Signature image load failed to canvas.");
      setShowSavedImg(true);
      setIsImgLoading(false);
    };

    const targetUrl = getDirectImageUrl(currentUrl);
    if (targetUrl.startsWith('data:')) {
      img.src = targetUrl;
    } else {
      const connector = targetUrl.includes('?') ? '&' : '?';
      img.src = `${targetUrl}${connector}t=${Date.now()}`;
    }
  }, [currentUrl]);

  const toggleSignMode = () => {
    if (disabled) return;
    if (!isSigningRef.current) {
      originalUrlRef.current = currentUrl;
      isChangedRef.current = false;
      hasDrawnRef.current = false;
      loadSignatureToCanvas();
      setIsSigningWithRef(true);
    } else {
      if (!isChangedRef.current) {
        setIsSigningWithRef(false);
        return;
      }

      setIsSigningWithRef(false);
      if (hasDrawnRef.current && canvasRef.current) {
        const base64 = canvasRef.current.toDataURL('image/png');
        setLastBase64(base64);
        setShowSavedImg(true);
        onSave(base64);
        if (onTriggerSave) {
          setTimeout(() => onTriggerSave(base64), 100);
        }
      } else {
        setLastBase64("");
        setShowSavedImg(false);
        clearCanvasInternal();
        onSave("");
        if (onTriggerSave) {
          setTimeout(() => onTriggerSave("__DELETE__"), 100);
        }
      }
    }
  };

  const restartSign = () => {
    if (disabled) return;
    clearCanvasInternal();
    hasDrawnRef.current = false;
    isChangedRef.current = true;
    setShowSavedImg(false);
    onSave("");
  };

  const restoreOriginal = (e, skipRefresh = false, overrideUrl = null) => {
    if (e && e.stopPropagation) e.stopPropagation();

    if (!skipRefresh && typeof onRefresh === 'function') {
      onRefresh();
    }

    setIsSigningState(false);
    isSigningRef.current = false;
    clearCanvasInternal();
    hasDrawnRef.current = false;

    const targetUrl = overrideUrl !== null ? overrideUrl : currentUrl;

    const hasUrl = targetUrl && (targetUrl.startsWith('http') || targetUrl.startsWith('data:') || targetUrl.startsWith('=') || targetUrl.includes('drive.google.com'));
    if (hasUrl) {
      setShowSavedImg(true);
      setIsImgLoading(false);
      if (targetUrl.startsWith('data:')) {
        setLastBase64(targetUrl);
      } else {
        setLastBase64("");
      }
    } else {
      setShowSavedImg(false);
      setLastBase64("");
    }
  };

  const cancelSign = () => {
    if (!isChangedRef.current) {
      setIsSigningState(false);
      isSigningRef.current = false;
      return;
    }
    const originalUrl = originalUrlRef.current;
    onSave(originalUrl);
    restoreOriginal(null, true, originalUrl);
  };

  const handleImgLoad = () => {
    setIsImgLoading(false);
    if (!isSigning) clearCanvasInternal();
  };

  const displayImgUrl = (currentUrl && (currentUrl.startsWith('http') || currentUrl.startsWith('=') || currentUrl.includes('drive.google.com')))
    ? getDirectImageUrl(currentUrl)
    : (currentUrl && currentUrl.startsWith('data:') ? currentUrl : lastBase64);

  return (
    <div className="flex flex-col items-center border border-blue-300 p-3 bg-sky-50 rounded-2xl mt-3 shadow-sm">
      <div className="flex justify-between w-full mb-2 px-1 gap-2 items-center">
        <span className={`text-blue-700 font-bold text-sm flex items-center gap-1 ${disabled ? 'opacity-30' : ''}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          싸인
        </span>
        <div className="flex gap-1 items-center">
          {!isSigning && (
            <button
              type="button"
              onClick={restoreOriginal}
              disabled={disabled}
              title="원본 싸인 불러오기"
              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleSignMode}
            disabled={disabled}
            className={`text-sm sm:text-[15px] font-black px-3 py-1.5 rounded-md shadow-md transition-all active:scale-95 border disabled:opacity-50 disabled:cursor-not-allowed ${isSigning ? 'bg-green-500 hover:bg-green-600 text-white border-green-600 ring-4 ring-green-100' : 'bg-blue-500 hover:bg-blue-600 text-white border-blue-600'}`}
          >
            {isSigning ? '저장' : '싸인하기'}
          </button>
          {isSigning && (
            <>
              <button type="button" onClick={restartSign} disabled={disabled} className="text-sm sm:text-[15px] font-black text-red-600 hover:text-red-700 px-3 py-1.5 bg-white border-2 border-red-200 rounded-md shadow-sm disabled:opacity-50 transition-all active:scale-95">지우기</button>
              <button type="button" onClick={cancelSign} className="text-sm sm:text-[15px] font-black text-gray-600 hover:text-gray-800 px-3 py-1.5 bg-white border-2 border-gray-200 rounded-md shadow-sm transition-all active:scale-95">나가기</button>
            </>
          )}
        </div>
      </div>
      <div
        className={`relative w-full max-w-[400px] group`}
        style={{ aspectRatio: isDoubleHeight ? '400 / 404' : '400 / 218' }}
      >
        <canvas
          ref={canvasRef}
          width={400}
          height={isDoubleHeight ? 404 : 218}
          className={`absolute inset-0 border ${isSigning ? 'border-blue-300 ring-4 ring-blue-50' : 'border-gray-200'} bg-sky-100 touch-none w-full h-full rounded-xl shadow-inner z-0 transition-all ${isSigning ? 'pointer-events-auto' : 'pointer-events-none'}`}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {isSigning && isDoubleHeight && (
          <div className="absolute top-1/2 left-0 w-full border-t-2 border-dashed border-blue-400/40 pointer-events-none z-10"></div>
        )}

        {showSavedImg && displayImgUrl && (
          <div
            key={`restore-${displayImgUrl}`}
            className={`absolute inset-0 z-10 flex items-center justify-center bg-sky-100 border border-blue-300 rounded-xl shadow-inner overflow-hidden ${isSigning ? 'pointer-events-none' : ''}`}
          >
            {isImgLoading && lastBase64 && (
              <img
                src={lastBase64}
                alt="Background"
                className="absolute inset-0 w-full h-full object-contain opacity-50 blur-[0.5px]"
              />
            )}
            <img
              src={displayImgUrl}
              alt="Signature"
              onLoad={handleImgLoad}
              className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${isImgLoading ? 'opacity-0' : 'opacity-100'}`}
              style={{ filter: 'contrast(1.3) brightness(0.95)' }}
            />
            {isImgLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-sky-50/70">
                <span className="text-blue-600 font-bold text-xs sm:text-sm animate-pulse">싸인 로딩 중...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
