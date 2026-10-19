require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// SETUP GOOGLE APIS & EMAIL (SMTP GMAIL)
// ==========================================
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// ==========================================
// SISTEM LOGIN SEDERHANA UNTUK ADMIN
// ==========================================
const ADMIN_USER = 'adminwyndstar';
const ADMIN_PASS = 'Wyndstar2026!'; 

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const username = auth[0];
    const password = auth[1];

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      return next(); 
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin Wyndstar"');
  res.status(401).send('Akses Ditolak. Anda harus login.');
};

// ==========================================
// FUNGSI BANTUAN FORMAT JAM
// ==========================================
function formatJamEmail(jam24) {
  let [hour, minute] = jam24.split(':');
  hour = parseInt(hour);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  const hourStr = String(hour).padStart(2, '0');
  return `${hourStr}:${minute} ${ampm}`;
}

// ==========================================
// API 1: CEK KUOTA JADWAL (Maksimal 5)
// ==========================================
app.get('/api/check-availability', async (req, res) => {
  const { tanggal, jam } = req.query;
  if (!tanggal || !jam) return res.status(400).json({ error: 'Tanggal & jam wajib diisi' });

  const startDateTime = `${tanggal}T${jam}:00+08:00`;
  const endJam = String(parseInt(jam) + 1).padStart(2, '0') + ':00';
  const endDateTime = `${tanggal}T${endJam}:00+08:00`;

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDateTime,
      timeMax: endDateTime,
      q: 'Konsultasi', 
      singleEvents: true,
    });

    const events = response.data.items || [];
    const totalBooked = events.length;
    
    res.json({ 
      available: totalBooked < 5, 
      booked: totalBooked 
    });

  } catch (err) {
    console.error('Error Check:', err.message);
    res.status(500).json({ error: 'Gagal cek jadwal' });
  }
});

// ==========================================
// API 2: BUAT BOOKING & KIRIM EMAIL
// ==========================================
app.post('/api/booking', async (req, res) => {
  const { nama, email, topik, tanggal, jam } = req.body;

  if (!nama || !email || !topik || !tanggal || !jam) {
    return res.status(400).json({ error: 'Semua field wajib diisi.' });
  }

  const startDateTime = `${tanggal}T${jam}:00+08:00`;
  const endJam = String(parseInt(jam) + 1).padStart(2, '0') + ':00';
  const endDateTime = `${tanggal}T${endJam}:00+08:00`;

  try {
    const check = await calendar.events.list({
      calendarId: 'primary', timeMin: startDateTime, timeMax: endDateTime, q: 'Konsultasi'
    });
    if (check.data.items.length >= 5) {
      return res.status(400).json({ error: 'Maaf, kuota untuk jam ini sudah penuh.' });
    }

    const event = {
      summary: `Konsultasi: ${topik} - ${nama}`,
      description: `Konsultasi Wyndstar Training Center.\nPeserta: ${nama} (${email})`,
      start: { dateTime: startDateTime, timeZone: 'Asia/Makassar' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Makassar' },
      attendees: [{ email: email }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 24 * 60 }, 
          { method: 'popup', minutes: 30 }       
        ]
      },
      conferenceData: {
        createRequest: {
          requestId: `wyndstar-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      resource: event,
    });

    const joinUrl = response.data.hangoutLink;
    const jamTampil = formatJamEmail(jam);
    const endJamTampil = formatJamEmail(endJam);

    const emailBody = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#1a73e8;">Konfirmasi Konsultasi</h2>
        <p>Halo <strong>${nama}</strong>,</p>
        <p>Konsultasi Anda di Wyndstar Training Center sudah dijadwalkan:</p>
        <table style="border-collapse:collapse;width:100%;margin:20px 0;">
          <tr><td style="padding:8px;border:1px solid #dadce0;"><strong>Topik</strong></td>
              <td style="padding:8px;border:1px solid #dadce0;">${topik}</td></tr>
          <tr><td style="padding:8px;border:1px solid #dadce0;"><strong>Tanggal</strong></td>
              <td style="padding:8px;border:1px solid #dadce0;">${tanggal}</td></tr>
          <tr><td style="padding:8px;border:1px solid #dadce0;"><strong>Waktu</strong></td>
              <td style="padding:8px;border:1px solid #dadce0;">${jamTampil} - ${endJamTampil} (GMT+8)</td></tr>
        </table>
        <p style="margin:30px 0;">
          <a href="${joinUrl}" style="background:#1a73e8;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;">
            Gabung via Google Meet
          </a>
        </p>
        <p style="color:#5f6368;font-size:13px;">
          <strong>Catatan:</strong> Anda akan menerima notifikasi pengingat otomatis melalui aplikasi Google Calendar Anda pada H-1 dan 30 menit sebelum jadwal konsultasi dimulai.
        </p>
      </div>`;

    await transporter.sendMail({
      from: `"Wyndstar Training Center" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Konfirmasi Konsultasi - ${tanggal} ${jamTampil} (GMT+8)`,
      html: emailBody
    });

    res.json({ success: true, joinUrl });

  } catch (err) {
    console.error('API Error:', err.message);
    res.status(500).json({ error: 'Gagal membuat meeting.', detail: err.message });
  }
});

// ==========================================
// API 3: AMBIL DATA KANDIDAT (ADMIN)
// ==========================================
app.get('/api/admin/data', authMiddleware, async (req, res) => {
  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      q: 'Konsultasi',
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    const dataKandidat = events.map(ev => ({
      nama: ev.summary.split(' - ').pop() || 'Tidak diketahui',
      topik: ev.summary.replace('Konsultasi: ', '').split(' - ')[0],
      email: ev.attendees ? ev.attendees[0].email : '-',
      tanggal: ev.start.dateTime ? ev.start.dateTime.split('T')[0] : '-',
      jam: ev.start.dateTime ? ev.start.dateTime.split('T')[1].substring(0, 5) : '-',
      linkMeet: ev.hangoutLink || '-'
    }));

    res.json({ success: true, data: dataKandidat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API 4: DOWNLOAD LAPORAN PDF
// ==========================================
app.get('/api/admin/download-pdf', authMiddleware, async (req, res) => {
  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      q: 'Konsultasi',
      singleEvents: true,
      orderBy: 'startTime',
    });
    const events = response.data.items || [];

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Data_Konsultasi_Wyndstar.pdf"');
    doc.pipe(res);

    // Menggunakan Times-Bold dan Times-Roman (Font standar PDF yang aman untuk Vercel)
    doc.fontSize(18).font('Times-Bold').text('Laporan Konsultasi Wyndstar Training Center', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Times-Roman').text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
    doc.moveDown(2);

    events.forEach((ev, index) => {
      const nama = ev.summary.split(' - ').pop() || 'Tidak diketahui';
      const topik = ev.summary.replace('Konsultasi: ', '').split(' - ')[0];
      const email = ev.attendees ? ev.attendees[0].email : '-';
      const tanggal = ev.start.dateTime ? ev.start.dateTime.split('T')[0] : '-';
      const jam = ev.start.dateTime ? ev.start.dateTime.split('T')[1].substring(0, 5) : '-';

      doc.fontSize(12).font('Times-Bold').text(`${index + 1}. ${nama}`);
      doc.fontSize(10).font('Times-Roman').text(`Topik   : ${topik}`);
      doc.text(`Email   : ${email}`);
      doc.text(`Jadwal  : ${tanggal} pukul ${jam} (WITA)`);
      doc.text(`Link    : ${ev.hangoutLink || '-'}`);
      doc.moveDown();
      doc.moveTo(30, doc.y).lineTo(565, doc.y).stroke(); 
      doc.moveDown();
    });

    doc.end();

  } catch (err) {
    res.status(500).send('Gagal membuat PDF: ' + err.message);
  }
});

// ==========================================
// FALLBACK & EXPORT (WAJIB UNTUK VERCEL)
// ==========================================
// Vercel tidak bisa menggunakan express.static() untuk folder public,
// jadi kita arahkan langsung ke file HTML.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// JANGAN gunakan app.listen() di Vercel! Gunakan module.exports.
module.exports = app;