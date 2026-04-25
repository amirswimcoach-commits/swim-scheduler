// This function receives incoming SMS replies from Twilio
// Set your Twilio webhook URL to: https://swimscheduling.netlify.app/api/sms-webhook

function buildICS(studentName, sessions) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const events = sessions.map(s => {
    const DAY_MAP = { Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA' };
    // Build a date for next occurrence of this day
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const today = new Date();
    const targetDay = days.indexOf(s.day);
    const diff = (targetDay - today.getDay() + 7) % 7 || 7;
    const sessionDate = new Date(today);
    sessionDate.setDate(today.getDate() + diff);

    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);

    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${sessionDate.getFullYear()}${pad(sessionDate.getMonth()+1)}${pad(sessionDate.getDate())}`;
    const startStr = `${dateStr}T${pad(sh)}${pad(sm)}00`;
    const endStr = `${dateStr}T${pad(eh)}${pad(em)}00`;
    const location = s.location === 'pool' ? 'Liv Aston Pool, Docklands, Melbourne' : 'Home Visit';

    return `BEGIN:VEVENT
DTSTART;TZID=Australia/Melbourne:${startStr}
DTEND;TZID=Australia/Melbourne:${endStr}
SUMMARY:Swimming with Amir
DESCRIPTION:Swim coaching session with Amir
LOCATION:${location}
END:VEVENT`;
  }).join('\n');

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Amir Swim Scheduler//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
${events}
END:VCALENDAR`;
}

export default async (request) => {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const fromNumber = params.get('From') || '';
    const messageBody = (params.get('Body') || '').trim();
    const isYes = /^yes$/i.test(messageBody.trim());

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
    const notificationEmail = process.env.NOTIFICATION_EMAIL;
    const resendKey = process.env.RESEND_API_KEY;

    if (isYes) {
      // Student confirmed — send them a confirmation SMS
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: fromNumber,
            From: twilioNumber,
            Body: `✅ Confirmed! See you at your session. A calendar invite will be sent to your email shortly. – Amir`
          }),
        }
      );

      // Notify Amir via SMS
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: twilioNumber,
            From: twilioNumber,
            Body: `✅ ${fromNumber} confirmed their session.`
          }),
        }
      );

      // Send calendar invite email via Resend
      // Note: in a full implementation you'd look up the student's email and sessions
      // from your database using the phone number. For now we send a notification to Amir.
      if (resendKey && notificationEmail) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Amir Swim Scheduler <onboarding@resend.dev>',
            to: [notificationEmail],
            subject: `✅ Session confirmed by ${fromNumber}`,
            html: `<p>A student (${fromNumber}) has confirmed their session via SMS.</p><p>Check your dashboard to see which sessions are confirmed.</p>`,
          }),
        });
      }

    } else {
      // Student requested a different time — notify Amir
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: fromNumber,
            From: twilioNumber,
            Body: `Got it! I'll check my schedule and get back to you shortly. – Amir`
          }),
        }
      );

      // Notify Amir
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: twilioNumber,
            From: twilioNumber,
            Body: `⚠️ ${fromNumber} replied: "${messageBody}" — check your dashboard to adjust their slot.`
          }),
        }
      );
    }

    // Return TwiML empty response
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' }
    });

  } catch (err) {
    console.error('SMS webhook error:', err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' }
    });
  }
};

export const config = { path: '/api/sms-webhook' };
