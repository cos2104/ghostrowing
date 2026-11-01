// 0단계 착수 전 배포 확인용 자리표시 화면.
const app = document.querySelector<HTMLElement>('#app')!;
const hasBluetooth = 'bluetooth' in navigator;

app.innerHTML = `
  <h1>Ghost Rowing</h1>
  <p>배포 확인용 화면입니다. 0단계(PM5 연결 검증) 작업 예정.</p>
  <p>Web Bluetooth: <strong>${hasBluetooth ? '지원됨' : '지원 안 됨'}</strong></p>
  <p>HTTPS: <strong>${window.isSecureContext ? '예' : '아니오'}</strong></p>
`;
