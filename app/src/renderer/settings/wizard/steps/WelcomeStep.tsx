/** Step 1: a short, friendly introduction for a non-technical grad student. */
export function WelcomeStep(): JSX.Element {
  return (
    <section className="wizard-welcome">
      <h1>논문 작성 서포터에 오신 것을 환영해요</h1>
      <p>
        이 프로그램은 자료 조사부터 초안 작성까지 함께해 드리는 나만의 연구 비서예요. 어려운 설정 없이
        몇 단계만 거치면 바로 사용하실 수 있어요.
      </p>
      <p>먼저 AI 도우미를 어떤 방식으로 사용할지 함께 정해볼게요. 아래 버튼을 눌러 시작해 주세요.</p>
    </section>
  );
}
