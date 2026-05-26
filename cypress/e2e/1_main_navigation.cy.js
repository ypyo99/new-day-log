describe('Main App Navigation', () => {
  beforeEach(() => {
    // Vite 개발 서버 주소로 접근 (필요 시 포트 수정)
    cy.visit('/')
    // 세션 스토리지를 비워 메인 화면부터 시작하도록 함
    cy.window().then((win) => {
      win.sessionStorage.clear()
    })
  })

  it('메인 화면이 정상적으로 로드되어야 한다', () => {
    cy.contains('성동장애인종합복지관').should('be.visible')
    cy.contains('업무 관리 시스템').should('be.visible') // 또는 화면에 존재하는 고유 텍스트
  })

  it('각 앱 메뉴 버튼을 클릭하여 화면 전환이 되는지 확인한다', () => {
    // 1. 반별 업무일지
    cy.contains(/반별 일지|반별 업무일지/).click()
    cy.contains(/반 선택|날짜/).should('be.visible')
    cy.contains(/뒤로가기|메인/).click()

    // 2. 일일 스케줄
    cy.contains('일일 스케줄').click()
    cy.contains(/날짜|스케줄 추가/).should('be.visible')
    cy.contains(/뒤로가기|메인/).click()

    // 3. 나의 주간 스케줄
    cy.contains(/나의 주간 스케줄|주간 스케줄/).click()
    cy.contains(/교사 선택|주간/).should('be.visible')
    cy.contains(/뒤로가기|메인/).click()

    // 4. 연차 및 휴가 관리
    cy.contains(/연차|휴가/).click()
    cy.contains(/휴가 등록|신청/).should('be.visible')
    cy.contains(/뒤로가기|메인/).click()
  })
})
