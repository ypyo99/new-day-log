describe('사용자 매뉴얼 스크린샷 캡처', () => {
  before(() => {
    cy.clearLocalStorage();
  });

  it('매뉴얼용 스크린샷을 순서대로 캡처합니다', () => {
    // 1. 앱 접속
    cy.visit('http://localhost:3000');
    cy.contains('성동노인종합복지관', { timeout: 10000 }).should('be.visible');
    
    // 첫 화면 스크린샷
    cy.screenshot('01_login_screen');

    // 2. 팀 및 선생님 선택
    cy.get('select').eq(0).select('1팀');
    cy.get('select').eq(1).find('option').should('have.length.greaterThan', 1);
    cy.get('select').eq(1).select(1); 

    cy.wait(500);
    cy.screenshot('02_team_teacher_selected');

    // 3. 일지 작성하기 버튼 클릭
    cy.contains('button', '일지 작성하기').click();
    cy.contains('근무기록 입력', { timeout: 10000 }).should('be.visible');
    cy.wait(2000); 
    cy.screenshot('03_daily_log_main');

    // 4. 일반 데이터 입력 (대상자 이름, 장소, 출석 태그, 메모)
    cy.get('input[placeholder="대상자 이름"]').first().type('매뉴얼테스트일반학생');
    cy.get('input[placeholder="장소"]').first().type('테스트장소1');
    cy.contains('button', '출석').first().click();
    cy.get('textarea[placeholder="메모"]').first().type('일반 대상자 입력 테스트입니다.');

    cy.screenshot('04_data_input_regular');

    // 다른 줄에 보조강사 데이터 입력 (대상자 이름, 장소, 인원, 메모)
    cy.get('input[placeholder="대상자 이름"]').eq(1).type('매뉴얼테스트보조강사');
    cy.get('input[placeholder="장소"]').eq(1).type('테스트장소2');
    cy.get('input[placeholder="인원"]').first().type('2');
    cy.get('textarea[placeholder="메모"]').eq(1).type('보조강사(인원) 입력 테스트입니다.');

    cy.screenshot('05_data_input_assistant');

    // 5. 저장하기
    cy.contains('button', '데이터베이스에 저장').click();

    cy.contains('데이터 저장 완료', { timeout: 15000 }).should('be.visible');
    cy.screenshot('06_save_complete');

    cy.contains('button', '확인').click();

    // 6. 저장 후 조회 화면 스크린샷
    cy.wait(1000);
    cy.screenshot('08_view_after_save');
    
    // 7. 데이터 수정
    cy.get('input[placeholder="대상자 이름"]').first().clear().type('수정된일반학생');
    cy.get('input[placeholder="장소"]').first().clear().type('수정된장소');
    cy.get('textarea[placeholder="메모"]').first().clear().type('메모가 수정되었습니다.');
    
    cy.screenshot('09_data_modify');
    
    // 빈 데이터로 다시 저장하여 원상 복구 (테스트 후처리)
    cy.get('input[placeholder="대상자 이름"]').first().clear();
    cy.get('input[placeholder="장소"]').first().clear();
    cy.contains('button', '출석').first().click(); // 토글 해제
    cy.get('textarea[placeholder="메모"]').first().clear();

    cy.get('input[placeholder="대상자 이름"]').eq(1).clear();
    cy.get('input[placeholder="장소"]').eq(1).clear();
    cy.get('input[placeholder="인원"]').first().clear();
    cy.get('textarea[placeholder="메모"]').eq(1).clear();

    cy.contains('button', '데이터베이스에 저장').click();
    cy.contains('데이터 저장 완료', { timeout: 15000 }).should('be.visible');
    cy.contains('button', '확인').click();
  });
});
