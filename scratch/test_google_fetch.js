const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

async function run() {
  const url = `${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent("1팀")}&teacher=${encodeURIComponent("권오삼")}`;
  console.log("Fetching URL:", url);
  const res = await fetch(url);
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response text:", text);
}
run();
