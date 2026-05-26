describe('Daily Schedule App', () => {
  beforeEach(() => {
    cy.visit('/')
    // 일일 스케줄 화면으로 이동
    cy.contains('일일 스케줄').click()
  })

  it('팀을 선택하여 스케줄 목록을 필터링할 수 있어야 한다', () => {
    // 팀 선택 셀렉트박스 조작
    cy.get('select').first().select('1팀') // 가상의 팀 이름 '1팀'
    // 화면에 시간표 UI가 표시되는지 확인
    cy.get('.grid').should('be.visible') // 시간표 그리드 요소 확인
  })

  it('신규 스케줄을 추가할 수 있어야 한다', () => {
    // 스케줄 추가 버튼 클릭
    cy.contains('스케줄 추가').click()
    
    // 모달창이나 입력 폼이 뜬다고 가정
    cy.get('select[name="teacher"]').select('홍길동') // 교사 선택
    cy.get('input[name="startTime"]').type('09:00') // 시작 시간
    cy.get('input[name="endTime"]').type('10:00') // 종료 시간
    cy.get('input[name="student"]').type('김철수') // 학생 이름
    
    // 모달의 저장 버튼 클릭
    cy.contains('저장').click()
    
    // 화면에 새로 추가된 스케줄이 보이는지 확인
    cy.contains('김철수').should('be.visible')
  })
})
