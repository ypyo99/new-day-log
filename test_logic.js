const scheduleData = {
  "2026-06-08": {
    "9:30~10:30": [
      {
        teacher: '표영',
        student: '보조강사컴기초1',
        location: '복지관',
        status: ''
      }
    ]
  }
};

const date = "2026-06-08";
const selectedTeam = "2팀";
const currentUser = "표영";
const shifts = ["9:30~10:30", "10:30~11:30", "11:30~12:30"];

const todaysData = scheduleData[date] || {};

shifts.forEach((shift, index) => {
  let list = todaysData[shift] || [];
  if (!Array.isArray(list)) list = [{ teacher: currentUser, ...list }];
  
  const myRecord = list.find(r => (r.teacher || "").trim() === currentUser.trim()) || {};
  
  let loadedStudent = (myRecord.student === undefined || myRecord.student === null) ? "" : myRecord.student;
  
  console.log(`Shift ${shift}: loadedStudent = "${loadedStudent}"`);
});
