describe('Classroom App', () => {
  beforeEach(() => {
    cy.visit('/')
    // 메인 화면에서 반별 일지로 진입
    cy.contains(/반별 일지|반별 업무일지/).click()
  })

  it('반을 선택하고 출석 데이터를 확인할 수 있어야 한다', () => {
    // 반 선택 (예시로 select 요소를 찾거나 텍스트 클릭)
    // 앱 구현 방식에 따라 select/button 요소를 선택합니다.
    cy.get('select').first().select('햇살반') // 반 이름이 '햇살반'이라고 가정
    
    // 학생 목록이 렌더링되는지 확인
    cy.get('table').should('be.visible')
    cy.contains('출석').should('be.visible')
  })

  it('출결 상태를 변경하고 특이사항을 작성할 수 있어야 한다', () => {
    // 임의의 학생 출석 상태를 클릭
    cy.contains('결석').click()
    
    // 텍스트 영역에 일지(특이사항) 입력
    cy.get('textarea').type('테스트 특이사항 내용입니다.')
    
    // 저장 버튼 클릭
    cy.contains('저장').click()
    
    // 성공 알림 확인 (구현 방식에 따라 다름)
    // cy.contains('저장되었습니다').should('be.visible')
  })
})
