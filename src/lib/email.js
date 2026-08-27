// Sends transactional emails via Resend (https://resend.com) using plain
// fetch — no SDK needed, and it works fine inside the Workers runtime.
//
// If RESEND_API_KEY isn't set, every function here just logs and returns
// without throwing — bookings and status updates still work normally,
// they simply won't trigger an email until the key is configured.

async function sendEmail({ to, subject, html }, env) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email skipped — no RESEND_API_KEY] would send "${subject}" to ${to}`);
    return { skipped: true };
  }
  if (!env.FROM_EMAIL) {
    console.log('[email skipped — no FROM_EMAIL configured]');
    return { skipped: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      console.error('Resend API error:', response.status, await response.text());
      return { success: false };
    }
    return { success: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { success: false };
  }
}

function wrapTemplate(title, bodyHtml) {
  return `
  <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
    <div style="background: #0a0a0a; padding: 24px; text-align: center;">
      <span style="color: #06b6d4; font-size: 20px; letter-spacing: 2px;">AURELIA</span>
      <div style="color: #c9a15c; font-size: 10px; letter-spacing: 3px; margin-top: 4px;">DENTAL CONCIERGE</div>
    </div>
    <div style="padding: 28px 24px; background: #ffffff;">
      <h2 style="font-weight: 500; margin-top: 0;">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="padding: 16px 24px; background: #f4f4f4; font-size: 11px; color: #888; text-align: center;">
      Aurelia Dental Concierge — this is an automated message.
    </div>
  </div>`;
}

export async function notifyAdminNewBooking(booking, env) {
  if (!env.ADMIN_EMAIL) {
    console.log('[email skipped — no ADMIN_EMAIL configured]');
    return;
  }
  const html = wrapTemplate(
    'New Reservation Request',
    `<p><strong>${booking.name}</strong> just requested an appointment.</p>
     <table style="font-size: 14px; line-height: 1.8;">
       <tr><td style="color:#888; padding-right:12px;">Treatment</td><td>${booking.treatment}</td></tr>
       <tr><td style="color:#888; padding-right:12px;">Preferred date</td><td>${booking.date}</td></tr>
       <tr><td style="color:#888; padding-right:12px;">Phone</td><td>${booking.phone}</td></tr>
       <tr><td style="color:#888; padding-right:12px;">Email</td><td>${booking.email || '—'}</td></tr>
       <tr><td style="color:#888; padding-right:12px;">Notes</td><td>${booking.notes || '—'}</td></tr>
     </table>
     <p style="margin-top:20px;">Open the admin portal to confirm or decline this request.</p>`
  );
  await sendEmail({ to: env.ADMIN_EMAIL, subject: `New reservation — ${booking.name}`, html }, env);
}

export async function notifyCustomerBookingReceived(booking, env) {
  if (!booking.email) return; // customer didn't leave an email — nothing to send
  const html = wrapTemplate(
    'Your Reservation Request Was Received',
    `<p>Dear ${booking.name},</p>
     <p>Thank you for requesting an appointment with Aurelia Dental. Here's what we received:</p>
     <table style="font-size: 14px; line-height: 1.8;">
       <tr><td style="color:#888; padding-right:12px;">Treatment</td><td>${booking.treatment}</td></tr>
       <tr><td style="color:#888; padding-right:12px;">Preferred date</td><td>${booking.date}</td></tr>
     </table>
     <p style="margin-top:20px;">Our concierge team will confirm your appointment shortly. We'll email you again once it's confirmed.</p>`
  );
  await sendEmail({ to: booking.email, subject: 'Aurelia Dental — Reservation Received', html }, env);
}

export async function notifyCustomerStatusUpdate(booking, env) {
  if (!booking.email) return;
  const statusCopy = {
    confirmed: {
      subject: 'Your Appointment Is Confirmed',
      message: `<p>Great news — your appointment for <strong>${booking.treatment}</strong> on <strong>${booking.date}</strong> is now confirmed. We look forward to welcoming you.</p>`,
    },
    cancelled: {
      subject: 'Your Appointment Request Was Cancelled',
      message: `<p>Your reservation request for <strong>${booking.treatment}</strong> on <strong>${booking.date}</strong> has been cancelled. If this wasn't expected, please contact us directly.</p>`,
    },
  };
  const copy = statusCopy[booking.status];
  if (!copy) return; // e.g. back to "pending" — no email for that

  const html = wrapTemplate(copy.subject, `<p>Dear ${booking.name},</p>${copy.message}`);
  await sendEmail({ to: booking.email, subject: `Aurelia Dental — ${copy.subject}`, html }, env);
}
