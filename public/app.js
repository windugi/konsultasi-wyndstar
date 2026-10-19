/* ============================================
   KONSULTASI WYNDSTAR - Logic Utama (Final)
   ============================================ */

const slotWaktuTemplate = ['11:00', '12:00', '14:00', '15:00'];
const MAX_SLOT = 5;

// Fungsi mengubah format 24 jam ke AM/PM
function formatJam(jam24) {
  let [hour, minute] = jam24.split(':');
  hour = parseInt(hour);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12; 
  const hourStr = String(hour).padStart(2, '0');
  return `${hourStr}:${minute} ${ampm}`;
}

function formatTanggal(tglStr) {
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const [y, m, d] = tglStr.split('-');
  return `${parseInt(d)} ${bulan[parseInt(m)-1]} ${y}`;
}

const path = window.location.pathname.split('/').pop() || 'index.html';

/* ============================================
   HALAMAN 1: index.html
   ============================================ */
if (path === 'index.html' || path === '') {
  const form = document.getElementById('formBooking');
  
  // Selalu hapus data lama saat halaman dibuka agar form kosong
  localStorage.removeItem('bookingData');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {
        nama: document.getElementById('nama').value.trim(),
        email: document.getElementById('email').value.trim(),
        topik: document.getElementById('topik').value.trim()
      };
      localStorage.setItem('bookingData', JSON.stringify(data));
      window.location.href = 'jadwal.html';
    });
  }
}

/* ============================================
   HALAMAN 2: jadwal.html
   ============================================ */
if (path === 'jadwal.html') {
  const kalender = document.getElementById('kalender');
  const slotContainer = document.getElementById('slotContainer');
  const btnKonfirmasi = document.getElementById('btnKonfirmasi');

  let tanggalDipilih = null;
  let slotDipilih = null;

  const dataCek = JSON.parse(localStorage.getItem('bookingData') || '{}');
  if (!dataCek.nama) window.location.href = 'index.html';

  const hariNama = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  hariNama.forEach(h => {
    const el = document.createElement('div');
    el.className = 'hari header-day';
    el.textContent = h;
    kalender.appendChild(el);
  });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); 
  
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1; 
  const totalHari = new Date(currentYear, currentMonth + 1, 0).getDate();

  const bulanNama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  document.getElementById('judulBulan').textContent = `${bulanNama[currentMonth]} ${currentYear}`;

  for (let i = 0; i < offset; i++) {
    const kosong = document.createElement('div');
    kosong.className = 'hari disabled';
    kalender.appendChild(kosong);
  }

  for (let tgl = 1; tgl <= totalHari; tgl++) {
    const el = document.createElement('div');
    const tglStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(tgl).padStart(2, '0')}`;
    el.textContent = tgl;
    el.className = 'hari';

    const dateObj = new Date(currentYear, currentMonth, tgl);
    const dayOfWeek = dateObj.getDay(); 
    
    // Hanya Senin(1), Selasa(2), Kamis(4), Jumat(5)
    const isValidDay = [1, 2, 4, 5].includes(dayOfWeek);
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const isPast = dateObj < today;

    if (isValidDay && !isPast) {
      el.classList.add('tersedia');
      el.addEventListener('click', () => pilihTanggal(tglStr, el));
    } else {
      el.classList.add('disabled');
    }

    kalender.appendChild(el);
  }

  function pilihTanggal(tglStr, el) {
    document.querySelectorAll('.hari').forEach(h => h.classList.remove('dipilih'));
    el.classList.add('dipilih');
    tanggalDipilih = tglStr;
    slotDipilih = null;
    btnKonfirmasi.disabled = true;
    renderSlot(tglStr);
  }

  async function renderSlot(tglStr) {
    slotContainer.innerHTML = '<p class="hint">Memuat ketersediaan jadwal...</p>';
    
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = (tglStr === todayStr);

    slotContainer.innerHTML = ''; 

    for (const jam of slotWaktuTemplate) {
      const el = document.createElement('div');
      el.className = 'slot';
      
      const endJam24 = String(parseInt(jam) + 1).padStart(2, '0') + ':00';
      const startTampil = formatJam(jam);
      const endTampil = formatJam(endJam24);
      
      el.textContent = `${startTampil} - ${endTampil} (GMT+8)`;

      let isTimePast = false;
      if (isToday) {
        const [jamStr, menitStr] = jam.split(':');
        const slotTime = new Date();
        slotTime.setHours(parseInt(jamStr), parseInt(menitStr), 0, 0);
        if (now > slotTime) isTimePast = true;
      }

      if (isTimePast) {
        // Waktu sudah lewat (Hari ini)
        el.style.background = '#f1f3f4';
        el.style.color = '#c8c6c4';
        el.style.borderColor = '#dadce0';
        el.style.cursor = 'not-allowed';
      } else {
        try {
          // Coba cek ke API
          const res = await fetch(`/api/check-availability?tanggal=${tglStr}&jam=${jam}`);
          const data = await res.json();

          if (data.available === false) {
            // Kuota Penuh (sudah 5 orang)
            el.style.background = '#f1f3f4';
            el.style.color = '#c8c6c4';
            el.style.borderColor = '#dadce0';
            el.style.cursor = 'not-allowed';
          } else {
            // Tersedia
            el.addEventListener('click', () => {
              document.querySelectorAll('.slot').forEach(s => s.classList.remove('dipilih'));
              el.classList.add('dipilih');
              slotDipilih = jam;
              btnKonfirmasi.disabled = false;
            });
          }
        } catch (error) {
           // JIKA API GAGAL (Server mati / error): Biarkan tombol tetap menyala
           console.error("Gagal cek API, tombol diaktifkan.", error);
           el.addEventListener('click', () => {
              document.querySelectorAll('.slot').forEach(s => s.classList.remove('dipilih'));
              el.classList.add('dipilih');
              slotDipilih = jam;
              btnKonfirmasi.disabled = false;
            });
        }
      }
      slotContainer.appendChild(el);
    }
  }

  if (btnKonfirmasi) {
    btnKonfirmasi.addEventListener('click', () => {
      if (!tanggalDipilih || !slotDipilih) return;
      
      const data = JSON.parse(localStorage.getItem('bookingData') || '{}');
      data.tanggal = tanggalDipilih;
      data.jam = slotDipilih;
      localStorage.setItem('bookingData', JSON.stringify(data));
      
      window.location.href = 'konfirmasi.html';
    });
  }
}

/* ============================================
   HALAMAN 3: konfirmasi.html
   ============================================ */
if (path === 'konfirmasi.html') {
  const data = JSON.parse(localStorage.getItem('bookingData') || '{}');
  if (!data.nama || !data.tanggal) window.location.href = 'index.html';

  document.getElementById('rNama').textContent = data.nama || '-';
  document.getElementById('rEmail').textContent = data.email || '-';
  document.getElementById('rTopik').textContent = data.topik || '-';
  document.getElementById('rTanggal').textContent = formatTanggal(data.tanggal);
  
  const endJam24 = String(parseInt(data.jam) + 1).padStart(2, '0') + ':00';
  document.getElementById('rJam').textContent = `${formatJam(data.jam)} - ${formatJam(endJam24)} (GMT+8)`;

  const setuju = document.getElementById('setuju');
  const btnSubmit = document.getElementById('btnSubmit');

  setuju.addEventListener('change', () => { btnSubmit.disabled = !setuju.checked; });

  btnSubmit.addEventListener('click', async () => {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Memproses meeting...';

    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Gagal memproses booking');

      data.joinUrl = result.joinUrl;
      localStorage.setItem('bookingData', JSON.stringify(data));
      window.location.href = 'sukses.html';
    } catch (err) {
      alert(err.message);
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Konfirmasi Sekarang';
    }
  });
}

/* ============================================
   HALAMAN 4: sukses.html
   ============================================ */
if (path === 'sukses.html') {
  const data = JSON.parse(localStorage.getItem('bookingData') || '{}');
  if (!data.joinUrl) window.location.href = 'index.html';

  document.getElementById('sEmail').textContent = data.email || '-';
  document.getElementById('sTanggal').textContent = formatTanggal(data.tanggal);
  
  const endJam24 = String(parseInt(data.jam) + 1).padStart(2, '0') + ':00';
  document.getElementById('sJam').textContent = `${formatJam(data.jam)} - ${formatJam(endJam24)} (GMT+8)`;
  
  document.getElementById('btnJoin').href = data.joinUrl;
}