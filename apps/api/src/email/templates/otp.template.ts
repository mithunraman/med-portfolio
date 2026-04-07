interface OtpEmailParams {
  code: string;
  expiryMinutes: number;
}

interface EmailContent {
  html: string;
  text: string;
}

export function buildOtpEmail({ code, expiryMinutes }: OtpEmailParams): EmailContent {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f7fa;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background-color:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header accent bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#2563eb,#4f46e5);border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 36px 32px;">

              <!-- Icon -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="width:48px;height:48px;background-color:#eff6ff;border-radius:50%;text-align:center;vertical-align:middle;font-size:24px;">
                    &#128274;
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a2332;text-align:center;line-height:1.3;">
                Verification code
              </h1>

              <p style="margin:0 0 28px;font-size:15px;color:#5a6778;text-align:center;line-height:1.5;">
                Enter this code to sign in to your account.
              </p>

              <!-- OTP code — single selectable element with wide letter-spacing -->
              <div style="margin:0 auto 28px;text-align:center;">
                <span style="display:inline-block;background-color:#f0f4f8;border:1px solid #d0d9e4;border-radius:8px;padding:14px 24px;font-family:'SF Mono','Roboto Mono','Fira Code',monospace;font-size:32px;font-weight:700;color:#1a2332;letter-spacing:12px;text-indent:12px;">${code}</span>
              </div>

              <!-- Expiry notice -->
              <p style="margin:0 0 4px;font-size:13px;color:#8896a6;text-align:center;line-height:1.5;">
                This code expires in <strong style="color:#5a6778;">${expiryMinutes} minutes</strong>.
              </p>
              <p style="margin:0;font-size:13px;color:#8896a6;text-align:center;line-height:1.5;">
                If you didn't request this code, you can safely ignore this email.
              </p>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 36px;">
              <hr style="border:none;border-top:1px solid #edf0f4;margin:0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px 28px;">
              <p style="margin:0;font-size:12px;color:#a0aab4;text-align:center;line-height:1.5;">
                PLAB Consultant &middot; Sent automatically &middot; Please do not reply
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Your verification code',
    '',
    `Code: ${code}`,
    '',
    `This code expires in ${expiryMinutes} minutes.`,
    '',
    "If you didn't request this code, you can safely ignore this email.",
    '',
    '— PLAB Consultant',
  ].join('\n');

  return { html, text };
}
