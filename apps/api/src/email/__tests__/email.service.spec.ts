import { EmailSendError, EmailService } from '../email.service';

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn(() => ({
    emails: { send: mockSend },
  })),
}));

const mockCaptureException = jest.fn();
jest.mock('@sentry/nestjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

function createConfigService(overrides: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {
    'app.resend.apiKey': 're_test_key',
    'app.resend.from': 'logdit <no-reply@logdit.app>',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => config[key] ?? defaultValue),
  };
}

describe('EmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });
  });

  describe('when Resend is configured', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService(createConfigService() as any);
    });

    it('should send OTP email with correct params', async () => {
      await service.sendOtp('user@example.com', '123456', 5);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'logdit <no-reply@logdit.app>',
          to: 'user@example.com',
          subject: '123456 is your verification code',
          html: expect.stringContaining('123456'.split('')[0]),
          text: expect.stringContaining('Code: 123456'),
        })
      );
    });

    it('should throw EmailSendError and report to Sentry, tagging the Resend error name', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { name: 'validation_error', message: 'Invalid from address' },
      });

      await expect(service.sendOtp('user@example.com', '123456', 5)).rejects.toThrow(
        EmailSendError
      );
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [, context] = mockCaptureException.mock.calls[0];
      expect(context.tags).toMatchObject({ component: 'email', resend_error: 'validation_error' });
    });

    it('does not leak the recipient address (PII) into the Sentry payload', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { name: 'validation_error', message: 'Invalid from address' },
      });

      await expect(service.sendOtp('user@example.com', '123456', 5)).rejects.toThrow(
        EmailSendError
      );
      // The recipient must never reach the third-party error sink — not in extra, tags,
      // or the captured cause. Guards against a future re-add of `extra: { to }`.
      const [cause, context] = mockCaptureException.mock.calls[0];
      expect(JSON.stringify({ cause, context })).not.toContain('user@example.com');
    });

    it('should throw EmailSendError and report to Sentry when the send throws', async () => {
      mockSend.mockRejectedValue(new Error('network down'));

      await expect(service.sendOtp('user@example.com', '123456', 5)).rejects.toThrow(
        EmailSendError
      );
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('when Resend is not configured', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService(createConfigService({ 'app.resend.apiKey': undefined }) as any);
    });

    it('should not send and should not throw', async () => {
      await expect(service.sendOtp('user@example.com', '123456', 5)).resolves.not.toThrow();
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});
