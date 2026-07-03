import React, { useState, useEffect, Suspense, lazy } from 'react';
import MainApp from './components/MainApp';
import {
  getSessionItem,
  setSessionItem,
  getSavedItem,
  setSavedItem,
  fetchAllTeachersFromDb
} from './utils/helpers';

const ClassroomApp = lazy(() => import('./components/ClassroomApp'));
const DailyScheduleApp = lazy(() => import('./components/DailyScheduleApp'));
const TeamScheduleApp = lazy(() => import('./components/TeamScheduleApp'));
const MyWeeklyScheduleApp = lazy(() => import('./components/MyWeeklyScheduleApp'));
const StudentSearchApp = lazy(() => import('./components/StudentSearchApp'));
const TeacherManagementApp = lazy(() => import('./components/TeacherManagementApp'));
const AutoScheduleApp = lazy(() => import('./components/AutoScheduleApp'));
const HolidayManagementApp = lazy(() => import('./components/HolidayManagementApp'));
const NangmanStudioApp = lazy(() => import('./components/NangmanStudioApp'));
const NoticeManagementApp = lazy(() => import('./components/NoticeManagementApp'));

const LoadingFallback = () => (
  <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gray-50">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-4 text-lg font-bold text-gray-600 animate-pulse">화면을 불러오는 중...</p>
  </div>
);

export default function App() {
  const [currentView, setCurrentView] = useState(() => getSessionItem('sungdong_current_view', 'main'));
  const [selectedTeamForSchedule, setSelectedTeamForSchedule] = useState(() => getSavedItem('sungdong_schedule_team', ''));
  const [selectedTeacherForWeekly, setSelectedTeacherForWeekly] = useState(() => getSavedItem('sungdong_weekly_teacher', ''));
  const [selectedNoticeForView, setSelectedNoticeForView] = useState(null);

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

  const renderView = () => {
    if (currentView === 'classroom') {
      return (
        <ClassroomApp
          onNavigateBack={() => setCurrentView('main')}
          onNavigateToNangmanStudio={() => setCurrentView('nangmanStudio')}
        />
      );
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

    if (currentView === 'nangmanStudio') {
      return (
        <NangmanStudioApp
          onNavigateBack={() => setCurrentView('main')}
          onNavigateToClassroom={() => setCurrentView('classroom')}
        />
      );
    }

    if (currentView === 'noticeManagement') {
      return <NoticeManagementApp onNavigateBack={() => setCurrentView('main')} initialNotice={selectedNoticeForView} />;
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
        onNavigateToNangmanStudio={() => setCurrentView('nangmanStudio')}
        onNavigateToNoticeManagement={(notice = null) => {
          setSelectedNoticeForView(notice);
          setCurrentView('noticeManagement');
        }}
      />
    );
  };

  return (
    <Suspense fallback={<LoadingFallback />}>
      {renderView()}
    </Suspense>
  );
}
