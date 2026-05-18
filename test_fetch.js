const url = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

async function run() {
  console.log("Fetching teachers for 1팀...");
  const res = await fetch(url + "?action=getTeachers&team=" + encodeURIComponent("1팀"));
  const json = await res.json();
  console.log("Teachers in 1팀:", json.teachers);
}
run();
