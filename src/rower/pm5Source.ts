import { clock } from '../clock';
import { connect, pickDevice } from '../pm5/connect';
import { paceToWatts, parseAdditionalStatus1, parseGeneralStatus } from '../pm5/parse';
import { Emitter, type RowerSample, type RowerSource, type SourceStatus } from './types';

/** PM5 연결을 공통 샘플 형식으로 감싼다. 0x0031이 올 때마다 샘플 1개를 낸다. */
export class Pm5Source implements RowerSource {
  kind = 'pm5' as const;
  label: string;
  status: SourceStatus = 'connected';
  last: RowerSample | null = null;

  private samples = new Emitter<RowerSample>();
  private statuses = new Emitter<SourceStatus>();
  private paceSec = 0;
  private spm = 0;
  private disconnectFn: () => void = () => {};

  private constructor(private device: BluetoothDevice) {
    this.label = device.name ?? 'PM5';
  }

  /** 사용자 클릭 이벤트 안에서 호출 */
  static async pick(showAll = false): Promise<Pm5Source> {
    const device = await pickDevice(showAll);
    const src = new Pm5Source(device);
    await src.attach();
    return src;
  }

  /** 끊긴 뒤 같은 기기로 다시 연결 */
  async reconnect() {
    await this.attach();
  }

  private async attach() {
    const conn = await connect(this.device, {
      onDisconnect: () => this.setStatus('disconnected'),
      onPacket: (ch, data) => {
        if (ch === '0032') {
          const a = parseAdditionalStatus1(data);
          this.paceSec = a.currentPaceSec;
          this.spm = a.strokeRate;
        } else if (ch === '0031') {
          const g = parseGeneralStatus(data);
          const moving = g.rowingState === 1;
          const pace = moving ? this.paceSec : 0;
          const s: RowerSample = {
            at: clock.now(),
            distanceM: g.distanceM,
            paceSec: pace,
            spm: moving ? this.spm : 0,
            watts: Math.round(paceToWatts(pace)),
          };
          this.last = s;
          this.samples.emit(s);
        }
      },
    });
    this.disconnectFn = conn.disconnect;
    this.setStatus('connected');
  }

  private setStatus(s: SourceStatus) {
    this.status = s;
    this.statuses.emit(s);
  }

  onSample(cb: (s: RowerSample) => void) {
    return this.samples.on(cb);
  }
  onStatus(cb: (s: SourceStatus) => void) {
    return this.statuses.on(cb);
  }
  stroke() {}
  close() {
    this.disconnectFn();
    this.setStatus('disconnected');
  }
}
