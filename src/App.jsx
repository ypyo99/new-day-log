import React, { useState, useEffect, Suspense, lazy } from 'react';
import MainApp from './components/MainApp';
import {
  getSessionItem,
  setSessionItem,
  getSavedItem,
  setSavedItem,
  fetchAllTeachersFromDb
} from './utils/helpers';

const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
    );
    try {
      const component = await componentImport();
      window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
        window.location.reload(true);
        return new Promise(() => {});
      }
      throw error;
    }
  });

const ClassroomApp = lazyWithRetry(() => import('./components/ClassroomApp'));
const DailyScheduleApp = lazyWithRetry(() => import('./components/DailyScheduleApp'));
const TeamScheduleApp = lazyWithRetry(() => import('./components/TeamScheduleApp'));
const MyWeeklyScheduleApp = lazyWithRetry(() => import('./components/MyWeeklyScheduleApp'));
const StudentSearchApp = lazyWithRetry(() => import('./components/StudentSearchApp'));
const TeacherManagementApp = lazyWithRetry(() => import('./components/TeacherManagementApp'));
const AutoScheduleApp = lazyWithRetry(() => import('./components/AutoScheduleApp'));
const HolidayManagementApp = lazyWithRetry(() => import('./components/HolidayManagementApp'));
const NangmanStudioApp = lazyWithRetry(() => import('./components/NangmanStudioApp'));
const NoticeManagementApp = lazyWithRetry(() => import('./components/NoticeManagementApp'));

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
    // 메뉴(화면) 전환 시 구글 애널리틱스로 페이지 뷰 이벤트 전송
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'page_view', {
        page_title: currentView,
        page_path: '/' + currentView
      });
    }
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
