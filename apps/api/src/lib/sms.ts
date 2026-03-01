import { env } from '../env.js';

function buildTwilioAuthHeader(accountSid: string, authToken: string): string {
  const raw = `${accountSid}:${authToken}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

export async function sendSms(params: { to: string; message: string }): Promise<void> {
  if (env.SMS_PROVIDER === 'twilio') {
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;
    const from = env.TWILIO_FROM_NUMBER;

    if (!sid || !token || !from) {
      throw new Error('TWILIO_CONFIG_MISSING');
    }

    const body = new URLSearchParams({
      To: params.to,
      From: from,
      Body: params.message,
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: buildTwilioAuthHeader(sid, token),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error('TWILIO_SEND_FAILED');
    }

    return;
  }

  // console provider for local dev only; no sensitive content in server logs.
  void params;
}
