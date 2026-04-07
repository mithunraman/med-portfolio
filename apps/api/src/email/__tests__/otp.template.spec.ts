import { buildOtpEmail } from '../templates/otp.template';

describe('buildOtpEmail', () => {
  const params = { code: '482916', expiryMinutes: 5 };

  it('should include the full code as a single selectable element in the HTML', () => {
    const { html } = buildOtpEmail(params);
    expect(html).toContain(`>${params.code}</span>`);
  });

  it('should include expiry time in the HTML', () => {
    const { html } = buildOtpEmail(params);
    expect(html).toContain('5 minutes');
  });

  it('should include the code in the plain text fallback', () => {
    const { text } = buildOtpEmail(params);
    expect(text).toContain('Code: 482916');
  });

  it('should include expiry in the plain text fallback', () => {
    const { text } = buildOtpEmail(params);
    expect(text).toContain('expires in 5 minutes');
  });

  it('should include PLAB Consultant branding', () => {
    const { html, text } = buildOtpEmail(params);
    expect(html).toContain('PLAB Consultant');
    expect(text).toContain('PLAB Consultant');
  });

  it('should produce valid HTML structure', () => {
    const { html } = buildOtpEmail(params);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });
});
