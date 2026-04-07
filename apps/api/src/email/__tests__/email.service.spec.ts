import { EmailService } from '../email.service';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockVerify = jest.fn().mockResolvedValue(true);

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
    verify: mockVerify,
  })),
}));

function createConfigService(overrides: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {
    'app.smtp.host': 'smtp.gmail.com',
    'app.smtp.port': 587,
    'app.smtp.user': 'test@example.com',
    'app.smtp.pass': 'app-password',
    'app.smtp.from': 'Test <test@example.com>',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => config[key] ?? defaultValue),
  };
}

describe('EmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when SMTP is configured', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService(createConfigService() as any);
    });

    it('should verify SMTP connection on init', async () => {
      await service.onModuleInit();
      expect(mockVerify).toHaveBeenCalled();
    });

    it('should send OTP email with correct params', async () => {
      await service.sendOtp('user@example.com', '123456', 5);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Test <test@example.com>',
          to: 'user@example.com',
          subject: '123456 is your verification code',
          html: expect.stringContaining('123456'.split('')[0]),
          text: expect.stringContaining('Code: 123456'),
        })
      );
    });
  });

  describe('when SMTP is not configured', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService(
        createConfigService({
          'app.smtp.host': undefined,
          'app.smtp.user': undefined,
          'app.smtp.pass': undefined,
        }) as any
      );
    });

    it('should not verify on init', async () => {
      await service.onModuleInit();
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('should not throw when sending OTP', async () => {
      await expect(service.sendOtp('user@example.com', '123456', 5)).resolves.not.toThrow();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });
});
