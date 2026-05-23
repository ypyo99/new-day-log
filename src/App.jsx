import React, { useState, useEffect } from 'react';
import ClassroomApp from './components/ClassroomApp';
import DailyScheduleApp from './components/DailyScheduleApp';
import TeamScheduleApp from './components/TeamScheduleApp';
import MyWeeklyScheduleApp from './components/MyWeeklyScheduleApp';
import StudentSearchApp from './components/StudentSearchApp';
import TeacherManagementApp from './components/TeacherManagementApp';
import AutoScheduleApp from './components/AutoScheduleApp';
import HolidayManagementApp from './components/HolidayManagementApp';
import MainApp from './components/MainApp';
import {
  getSessionItem,
  setSessionItem,
  getSavedItem,
  setSavedItem,
  fetchAllTeachersFromDb
} from './utils/helpers';

export default function App() {
  const [currentView, setCurrentView] = useState(() => getSessionItem('sungdong_current_view', 'main'));
  const [selectedTeamForSchedule, setSelectedTeamForSchedule] = useState(() => getSavedItem('sungdong_schedule_team', ''));
  const [selectedTeacherForWeekly, setSelectedTeacherForWeekly] = useState(() => getSavedItem('sungdong_weekly_teacher', ''));

  useEffect(() => {
    setSessionItem('sungdong_current_view', currentView);
  }, [currentView]);

  useEffect(() => {
    setSavedItem('sungdong_schedule_team', selectedTeamForSchedule);
  }, [selectedTeamForSchedule]);

  useEffect(() => {
    setSavedItem('sungdong_weekly_teacher', selectedTeacherForWeekly);
  }, [selectedTeacherForWeekly]);

  useEffect(() => {
    fetchAllTeachersFromDb();
  }, []);

  if (currentView === 'classroom') {
    return <ClassroomApp onNavigateBack={() => setCurrentView('main')} />;
  }

  if (currentView === 'dailySchedule') {
    return (
      <DailyScheduleApp
        initialTeam={selectedTeamForSchedule}
        onNavigateBack={() => setCurrentView('main')}
        onTeamChange={(team) => setSelectedTeamForSchedule(team)}
      />
    );
  }

  if (currentView === 'teamSchedule') {
    return <TeamScheduleApp team={selectedTeamForSchedule} onNavigateBack={() => setCurrentView('main')} />;
  }

  if (currentView === 'myWeeklySchedule') {
    return (
      <MyWeeklyScheduleApp
        team={selectedTeamForSchedule}
        teacher={selectedTeacherForWeekly}
        onNavigateBack={() => setCurrentView('main')}
      />
    );
  }

  if (currentView === 'studentSearch') {
    return <StudentSearchApp onNavigateBack={() => setCurrentView('main')} />;
  }

  if (currentView === 'teacherManagement') {
    return <TeacherManagementApp onNavigateBack={() => setCurrentView('main')} />;
  }

  if (currentView === 'autoSchedule') {
    return <AutoScheduleApp onNavigateBack={() => setCurrentView('main')} />;
  }

  if (currentView === 'holidayManagement') {
    return <HolidayManagementApp onNavigateBack={() => setCurrentView('main')} />;
  }

  return (
    <MainApp
      onNavigateToClassroom={() => setCurrentView('classroom')}
      onNavigateToDailySchedule={(team) => {
        setSelectedTeamForSchedule(team);
        try {
          window.sessionStorage.removeItem('sungdong_daily_schedule_date');
        } catch (e) {}
        setCurrentView('dailySchedule');
      }}
      onNavigateToMyWeeklySchedule={() => {
        const t = getSavedItem('sungdong_team', '');
        const th = getSavedItem('sungdong_teacher', '');
        setSelectedTeamForSchedule(t);
        setSelectedTeacherForWeekly(th);
        setCurrentView('myWeeklySchedule');
      }}
      onNavigateToStudentSearch={() => setCurrentView('studentSearch')}
      onNavigateToTeamSchedule={(team) => {
        setSelectedTeamForSchedule(team);
        setCurrentView('teamSchedule');
      }}
      onNavigateToTeacherManagement={() => setCurrentView('teacherManagement')}
      onNavigateToAutoSchedule={() => setCurrentView('autoSchedule')}
      onNavigateToHolidayManagement={() => setCurrentView('holidayManagement')}
    />
  );
}
