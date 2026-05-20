const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  // 1. 임시 로컬 폴더 생성 (구글 드라이브 외부에 생성하여 파일 락 에러 방지)
  const tempDir = path.join(os.tmpdir(), 'new-day-log-verify');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 2. package.json 작성
  const tempPkgJson = path.join(tempDir, 'package.json');
  fs.writeFileSync(tempPkgJson, JSON.stringify({
    dependencies: {
      "xlsx": "^0.18.5"
    }
  }));

  // 3. 임시 폴더에서 npm install 실행 (C: 드라이브 로컬이므로 파일 락 없이 초고속 설치 완료)
  const nodeModulesPath = path.join(tempDir, 'node_modules');
  if (!fs.existsSync(path.join(nodeModulesPath, 'xlsx'))) {
    console.log("📦 [최초 1회] 필수 라이브러리(xlsx)를 로컬 안전 영역에 구성하는 중...");
    try {
      execSync('npm install --no-audit --no-fund', { cwd: tempDir, stdio: 'inherit' });
    } catch (err) {
      console.error("❌ 라이브러리 구성 실패:", err.message);
      process.exit(1);
    }
  }

  // 4. 입력받은 엑셀 파일 경로 파악
  const args = process.argv.slice(2);
  let excelFile = args[0];

  if (!excelFile) {
    const files = fs.readdirSync('.').filter(f => f.startsWith('통합_시간표') && f.endsWith('.xlsx'));
    if (files.length === 0) {
      console.error("❌ 검증할 엑셀 파일을 찾을 수 없습니다. 파일명을 입력해주세요.");
      console.error("예: node verify.js C:\\Users\\ypyo9\\Downloads\\통합_시간표-2026-05-20.xlsx");
      process.exit(1);
    }
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    excelFile = files[0];
  }

  const absoluteExcelPath = path.resolve(excelFile);
  if (!fs.existsSync(absoluteExcelPath)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${absoluteExcelPath}`);
    process.exit(1);
  }

  // 5. 임시 폴더의 node_modules 경로를 Node 모듈 검색 경로에 주입
  process.env.NODE_PATH = nodeModulesPath + (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : '');
  require('module').Module._initPaths();

  // 6. 대상 파일 인자를 절대경로로 갱신 후 메인 검증 스크립트 실행
  process.argv[2] = absoluteExcelPath;
  console.log(`🚀 검증 스크립트 실행 시작: ${absoluteExcelPath}`);
  require('./verify_excel_vs_sheets.js');
}

run().catch(console.error);
