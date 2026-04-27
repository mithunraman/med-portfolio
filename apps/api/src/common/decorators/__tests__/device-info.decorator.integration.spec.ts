import { Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  DeviceInfo,
  DeviceInfoHeaders,
} from '../device-info.decorator';

@Controller()
class EchoController {
  @Post('echo')
  echo(@DeviceInfoHeaders() info: DeviceInfo): DeviceInfo {
    return info;
  }
}

describe('DeviceInfoHeaders (real decorator)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EchoController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('extracts all four headers when present', async () => {
    const res = await request(app.getHttpServer())
      .post('/echo')
      .set('x-device-id', 'dev-abc')
      .set('x-device-name', 'Apple iPhone 15')
      .set('x-app-version', '1.4.0')
      .set('x-os', 'iOS 17.2')
      .expect(201);

    expect(res.body).toEqual({
      deviceId: 'dev-abc',
      deviceName: 'Apple iPhone 15',
      appVersion: '1.4.0',
      os: 'iOS 17.2',
    });
  });

  it('defaults deviceName to "Unknown device" when absent', async () => {
    const res = await request(app.getHttpServer())
      .post('/echo')
      .set('x-device-id', 'dev-abc')
      .expect(201);

    expect(res.body.deviceId).toBe('dev-abc');
    expect(res.body.deviceName).toBe('Unknown device');
    expect(res.body.appVersion).toBeUndefined();
    expect(res.body.os).toBeUndefined();
  });

  it('returns an empty deviceId when the header is missing', async () => {
    const res = await request(app.getHttpServer()).post('/echo').expect(201);

    expect(res.body.deviceId).toBe('');
    expect(res.body.deviceName).toBe('Unknown device');
  });

  it('trims whitespace around header values', async () => {
    const res = await request(app.getHttpServer())
      .post('/echo')
      .set('x-device-id', '  trimmed  ')
      .set('x-device-name', '  iOS  ')
      .expect(201);

    expect(res.body.deviceId).toBe('trimmed');
    expect(res.body.deviceName).toBe('iOS');
  });

  it('treats whitespace-only headers as missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/echo')
      .set('x-device-id', '   ')
      .expect(201);

    expect(res.body.deviceId).toBe('');
  });
});
