const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'NoticeManagementApp.jsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Remove ImageResizer component
content = content.replace(/function ImageResizer.*?^}\n/ms, '');

// 2. Remove states
content = content.replace(/  const \[uploading, setUploading\] = useState\(false\);\n/, '');
content = content.replace(/  const \[selectedImg, setSelectedImg\] = useState\(null\);\n/, '');
content = content.replace(/  const \[selectedImgWidth, setSelectedImgWidth\] = useState\(100\);\n/, '');
content = content.replace(/  const prevSelectedImgRef = useRef\(null\);\n/, '');

// 3. Remove useEffect for selectedImg
content = content.replace(/  useEffect\(\(\) => \{\n    if \(prevSelectedImgRef\.current\) \{\n.*?\n  \}, \[selectedImg\]\);\n\n/s, '');

// 4. Remove setSelectedImg(null)
content = content.replace(/    setSelectedImg\(null\);\n/g, '');
content = content.replace(/                        setSelectedImg\(null\);\n/g, '');

// 5. Remove handleImageUpload
content = content.replace(/  const handleImageUpload = async \(e\) => \{.*?\n  \};\n\n/s, '');

// 6. Remove handleEditorClick, handleImageResize, applyQuickResize
content = content.replace(/  const handleEditorClick = \(e\) => \{.*?\n  \};\n\n/s, '');
content = content.replace(/  const handleImageResize = \(e\) => \{.*?\n  \};\n\n/s, '');
content = content.replace(/  const applyQuickResize = \(pct\) => \{.*?\n  \};\n\n/s, '');

// 7. Remove CSS styles for image
content = content.replace(/        \.rich-editor img, \.prose img \{.*?\n        \}\n/s, '');

// 8. Remove UI for image upload
content = content.replace(/                  <div className="flex flex-col gap-1\.5 flex-1 min-h-\[200px\]">.*?<div className="flex flex-col gap-2 bg-gray-50 p-2\.5 rounded-xl border border-gray-200">/s, '<div className="flex flex-col gap-1.5 flex-1 min-h-[200px]">\n                    <div className="flex flex-col gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200">');

content = content.replace(/                      <div className="flex justify-between items-center">\n                        <label className="text-sm font-bold text-gray-700">내용 및 서식 지정<\/label>\n                        <div className="relative">.*?<\/div>\n                      <\/div>/s, '                      <div className="flex justify-between items-center">\n                        <label className="text-sm font-bold text-gray-700">내용 및 서식 지정</label>\n                      </div>');

// 9. Remove ImageResizer call in JSX
content = content.replace(/                      \{selectedImg && isEditing && \(\n                        <ImageResizer.*?\n                        \/>\n                      \)\}\n/s, '');

// 10. Remove onClick={handleEditorClick}
content = content.replace(/                        onClick=\{handleEditorClick\}\n/g, '');

// 11. Remove extra placeholders mentions of image upload
content = content.replace(/ placeholder="공지사항 내용을 작성해 주세요 \(그림 추가 버튼으로 본문에 이미지를 삽입할 수 있습니다\)"/, ' placeholder="공지사항 내용을 작성해 주세요"');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Done!');
