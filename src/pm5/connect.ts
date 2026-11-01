import { PM5, SAMPLE_RATE_250MS } from './uuids';

export type Channel = '0031' | '0032' | '0033';

export interface Pm5Handlers {
  onPacket: (channel: Channel, data: DataView, receivedAt: number) => void;
  onDisconnect: () => void;
}

export interface Pm5Connection {
  name: string;
  disconnect: () => void;
}

/**
 * 반드시 사용자 클릭 이벤트 안에서 호출해야 한다.
 * showAll=true면 필터 없이 주변 BLE 기기를 모두 보여 준다 (PM5가 목록에 안 뜰 때 진단용).
 */
export async function pickDevice(showAll = false): Promise<BluetoothDevice> {
  if (!('bluetooth' in navigator)) {
    throw new Error('이 브라우저는 Web Bluetooth를 지원하지 않습니다. 안드로이드·PC 크롬을 사용하세요.');
  }
  const optionalServices = [PM5.deviceInfoService, PM5.rowingService];
  if (showAll) {
    return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
  }
  return navigator.bluetooth.requestDevice({
    // 이름 또는 PM5 검색 서비스 UUID 둘 중 하나만 맞아도 표시
    filters: [{ namePrefix: 'PM5' }, { services: [PM5.discoveryService] }],
    optionalServices,
  });
}

export async function connect(device: BluetoothDevice, h: Pm5Handlers): Promise<Pm5Connection> {
  const onGone = () => h.onDisconnect();
  device.addEventListener('gattserverdisconnected', onGone);

  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(PM5.rowingService);

  // 알림 주기를 250ms로. 실패해도 기본 주기로 계속 진행.
  try {
    const rate = await service.getCharacteristic(PM5.sampleRate);
    await rate.writeValue(new Uint8Array([SAMPLE_RATE_250MS]));
  } catch (e) {
    console.warn('샘플 주기 설정 실패', e);
  }

  const subs: [Channel, string][] = [
    ['0031', PM5.generalStatus],
    ['0032', PM5.additionalStatus1],
    ['0033', PM5.additionalStatus2],
  ];
  for (const [channel, id] of subs) {
    const ch = await service.getCharacteristic(id);
    ch.addEventListener('characteristicvaluechanged', () => {
      if (ch.value) h.onPacket(channel, ch.value, performance.now());
    });
    await ch.startNotifications();
  }

  return {
    name: device.name ?? 'PM5',
    disconnect: () => {
      device.removeEventListener('gattserverdisconnected', onGone);
      device.gatt?.disconnect();
    },
  };
}
