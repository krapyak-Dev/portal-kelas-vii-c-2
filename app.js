/* global supabase */
(() => {
  const $ = (s) => document.querySelector(s);
  const money = (n) => new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n || 0);
  const dateLocal = (d = new Date()) => {
    const x = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return x.toISOString().slice(0,10);
  };
  const monthLocal = () => dateLocal().slice(0,7) + "-01";
  const weekdayNames = ["","Senin","Selasa","Rabu","Kamis","Jumat"];
  let db, currentUser, profile, students = [], activePage = "overview";

  function escapeHtml(v="") {
    return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function toast(msg, bad=false) {
    const el=$("#toast"); el.textContent=msg; el.classList.remove("hidden","bad");
    if(bad) el.classList.add("bad");
    setTimeout(()=>el.classList.add("hidden"),4000);
  }
  function fail(err) { console.error(err); toast(err?.message || "Terjadi kesalahan.", true); }
  function isAdmin(){ return profile?.role === "admin"; }
  function setPage(page) {
    activePage=page;
    document.querySelectorAll(".nav-link[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    const titles={overview:"Ringkasan",announcements:"Pengumuman",attendance:"Presensi",duties:"Jadwal piket",cash:"Uang kas",notifications:"Notifikasi"};
    $("#pageTitle").textContent=titles[page] || "Portal Kelas";
    renderPage().catch(fail);
  }
  async function getStudents() {
    if(!isAdmin()) return [];
    const {data,error}=await db.from("profiles").select("id,full_name,role").eq("role","student").order("full_name");
    if(error) throw error; students=data||[]; return students;
  }
  async function loadNotifications() {
    const {data,error}=await db.from("notifications").select("id,title,body,kind,related_date,read_at,created_at").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(50);
    if(error) throw error;
    const unread=(data||[]).filter(n=>!n.read_at).length;
    $("#notificationCount").textContent=unread; $("#notificationCount").classList.toggle("hidden",unread===0);
    return data||[];
  }
  async function ensureDutyReminders() {
    if(isAdmin()) return;
    const {data,error}=await db.from("duty_schedules").select("weekday,notes").eq("student_id",currentUser.id);
    if(error) throw error;
    const tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    const jsDay=tomorrow.getDay(); const day=jsDay===0?7:jsDay;
    if(day<1 || day>5) return;
    const duty=(data||[]).filter(x=>x.weekday===day);
    if(!duty.length) return;
    const target=dateLocal(tomorrow);
    const {data:existing,error:e}=await db.from("notifications").select("id").eq("user_id",currentUser.id).eq("kind","duty").eq("related_date",target).limit(1);
    if(e) throw e;
    if(!existing?.length) {
      const {error:insertError}=await db.from("notifications").insert({user_id:currentUser.id,title:"Pengingat jadwal piket",body:`Besok (${weekdayNames[day]}) adalah jadwal piketmu. ${duty[0].notes||"Jangan lupa melaksanakan tugas piket."}`,kind:"duty",related_date:target});
      if(insertError) throw insertError;
    }
  }
  async function renderPage() {
    const el=$("#pageContent");
    if(activePage==="overview") return renderOverview(el);
    if(activePage==="announcements") return renderAnnouncements(el);
    if(activePage==="attendance") return renderAttendance(el);
    if(activePage==="duties") return renderDuties(el);
    if(activePage==="cash") return renderCash(el);
    if(activePage==="notifications") return renderNotifications(el);
  }
  async function renderOverview(el) {
    const [{data:ann,error:a},{data:cash,error:c},{data:att,error:t}] = await Promise.all([
      db.from("announcements").select("id,title,body,created_at").order("created_at",{ascending:false}).limit(3),
      db.from("cash_payments").select("id,amount").eq("payment_month",monthLocal()),
      db.from("attendance").select("id,status,attendance_date").eq("attendance_date",dateLocal())
    ]);
    if(a||c||t) throw a||c||t;
    let studentCount=28;
    if(isAdmin()){await getStudents();studentCount=students.length;}
    const paid=cash?.length||0, attendanceCount=att?.filter(x=>x.status==="present").length||0;
    el.innerHTML=`
      <div class="grid">
        <div class="stat"><div class="stat-label">Jumlah siswa</div><div class="stat-value">${isAdmin()?studentCount: "28"}</div><div class="stat-note">Target kelas</div></div>
        <div class="stat"><div class="stat-label">Target kas bulanan</div><div class="stat-value">${money(280000)}</div><div class="stat-note">28 siswa × Rp10.000</div></div>
        <div class="stat"><div class="stat-label">Pembayaran bulan ini</div><div class="stat-value">${isAdmin()?paid+"/28": "Lihat kas"}</div><div class="stat-note">${isAdmin()?money(paid*10000)+" terkumpul":"Status pembayaran pribadi"}</div></div>
        <div class="stat"><div class="stat-label">Hadir hari ini</div><div class="stat-value">${isAdmin()?attendanceCount+"/28":"Presensi"}</div><div class="stat-note">Senin–Jumat</div></div>
      </div>
      <div class="section-head"><h2>Pengumuman terbaru</h2><button class="secondary" data-go="announcements">Lihat semua</button></div>
      <div class="list">${(ann||[]).length?(ann||[]).map(a=>`<article class="list-item"><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.body)}</p><div class="meta">${new Date(a.created_at).toLocaleString("id-ID")}</div></article>`).join(""):`<div class="empty">Belum ada pengumuman.</div>`}</div>
      <div class="panel"><h3>Selamat datang, ${escapeHtml(profile.full_name)}!</h3><p class="muted">Gunakan menu di samping untuk melihat informasi kelas VIIC.</p></div>`;
    el.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>setPage(b.dataset.go));
  }
  async function renderAnnouncements(el) {
    const {data,error}=await db.from("announcements").select("*").order("created_at",{ascending:false});
    if(error) throw error;
    el.innerHTML=`${isAdmin()?`<div class="panel"><h2>Buat pengumuman</h2><form id="announcementForm" class="form-grid"><label class="field full-span">Judul<input name="title" required maxlength="120"></label><label class="field full-span">Isi pengumuman<textarea name="body" required></textarea></label><div><button class="primary">Publikasikan</button></div></form></div>`:""}
      <div class="section-head"><h2>Semua pengumuman</h2></div><div class="list">${data?.length?data.map(a=>`<article class="list-item"><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.body)}</p><div class="meta">${new Date(a.created_at).toLocaleString("id-ID")}</div>${isAdmin()?`<div class="actions" style="margin-top:10px"><button class="danger" data-delete-ann="${a.id}">Hapus</button></div>`:""}</article>`).join(""):`<div class="empty">Belum ada pengumuman.</div>`}</div>`;
    $("#announcementForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.from("announcements").insert({title:f.get("title"),body:f.get("body"),created_by:currentUser.id});if(error)return fail(error);toast("Pengumuman berhasil diterbitkan.");renderPage();});
    el.querySelectorAll("[data-delete-ann]").forEach(b=>b.onclick=async()=>{if(!confirm("Hapus pengumuman ini?"))return;const {error}=await db.from("announcements").delete().eq("id",b.dataset.deleteAnn);if(error)return fail(error);toast("Pengumuman dihapus.");renderPage();});
  }
  async function renderAttendance(el) {
    const today=dateLocal();
    if(isAdmin()) {
      await getStudents();
      el.innerHTML=`<div class="panel"><h2>Catat presensi</h2><div class="toolbar"><label class="field">Tanggal<input id="attendanceDate" type="date" value="${today}" max="${today}"></label><button class="secondary" id="loadAttendance">Muat data</button></div><p class="notice">Presensi hanya untuk hari Senin–Jumat. Pilih status setiap siswa, lalu simpan.</p><div id="attendanceTable"></div></div>`;
      $("#loadAttendance").onclick=loadAttendanceTable; await loadAttendanceTable();
    } else {
      const {data,error}=await db.from("attendance").select("attendance_date,status,note").eq("student_id",currentUser.id).order("attendance_date",{ascending:false}).limit(60);
      if(error) throw error;
      el.innerHTML=`<div class="panel"><h2>Riwayat presensi saya</h2>${data?.length?`<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Status</th><th>Catatan</th></tr></thead><tbody>${data.map(x=>`<tr><td>${new Date(x.attendance_date+"T00:00:00").toLocaleDateString("id-ID",{dateStyle:"long"})}</td><td><span class="badge ${x.status==="present"?"success":"danger"}">${x.status==="present"?"Hadir":"Tidak hadir"}</span></td><td>${escapeHtml(x.note||"-")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Belum ada data presensi.</div>`}</div>`;
    }
    async function loadAttendanceTable(){
      const date=$("#attendanceDate").value, d=new Date(date+"T00:00:00"), day=d.getDay();
      if(day===0||day===6){$("#attendanceTable").innerHTML='<div class="notice">Tanggal harus Senin–Jumat.</div>';return;}
      const {data,error}=await db.from("attendance").select("student_id,status,note").eq("attendance_date",date);if(error)throw error;
      const map=new Map((data||[]).map(x=>[x.student_id,x]));
      $("#attendanceTable").innerHTML=`<div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Nama siswa</th><th>Status</th><th>Catatan</th></tr></thead><tbody>${students.map(s=>{const x=map.get(s.id);return `<tr data-student="${s.id}"><td>${escapeHtml(s.full_name)}</td><td><select class="attendance-status"><option value="present" ${x?.status!=="absent"?"selected":""}>Hadir</option><option value="absent" ${x?.status==="absent"?"selected":""}>Tidak hadir</option></select></td><td><input class="attendance-note" value="${escapeHtml(x?.note||"")}" placeholder="Opsional"></td></tr>`}).join("")}</tbody></table></div><button id="saveAttendance" class="primary" style="margin-top:14px">Simpan presensi</button>`;
      $("#saveAttendance").onclick=async()=>{const rows=[...$("#attendanceTable").querySelectorAll("tbody tr")];const payload=rows.map(r=>({student_id:r.dataset.student,attendance_date:date,status:r.querySelector("select").value,note:r.querySelector("input").value,recorded_by:currentUser.id}));const {error}=await db.from("attendance").upsert(payload,{onConflict:"student_id,attendance_date"});if(error)return fail(error);toast("Presensi berhasil disimpan.");};
    }
  }
  async function renderDuties(el) {
    const {data,error}=await db.from("duty_schedules").select("id,student_id,weekday,notes,student:profiles!duty_schedules_student_id_fkey(full_name)").order("weekday");
    if(error) throw error;
    if(isAdmin()) {
      await getStudents();
      el.innerHTML=`<div class="panel"><h2>Tambah jadwal piket</h2><form id="dutyForm" class="form-grid"><label class="field">Siswa<select name="student_id" required>${students.map(s=>`<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join("")}</select></label><label class="field">Hari<select name="weekday"><option value="1">Senin</option><option value="2">Selasa</option><option value="3">Rabu</option><option value="4">Kamis</option><option value="5">Jumat</option></select></label><label class="field full-span">Catatan<input name="notes" placeholder="Contoh: menyapu dan merapikan meja"></label><div><button class="primary">Tambah jadwal</button></div></form></div>`;
    } else el.innerHTML=`<div class="notice">Pengingat piket untuk besok akan muncul di notifikasi website saat kamu membuka portal.</div>`;
    el.innerHTML+=`<div class="section-head"><h2>Jadwal piket kelas</h2></div><div class="grid">${[1,2,3,4,5].map(day=>`<div class="panel"><h3>${weekdayNames[day]}</h3><div class="list">${(data||[]).filter(x=>x.weekday===day).map(x=>`<div class="list-item"><b>${escapeHtml(x.student?.full_name||"Siswa")}</b><div class="meta">${escapeHtml(x.notes||"Tugas piket")}</div>${isAdmin()?`<button class="danger" style="margin-top:8px" data-delete-duty="${x.id}">Hapus</button>`:""}</div>`).join("")||'<div class="empty">Belum ada jadwal.</div>'}</div></div>`).join("")}</div>`;
    $("#dutyForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.from("duty_schedules").insert({student_id:f.get("student_id"),weekday:Number(f.get("weekday")),notes:f.get("notes")});if(error)return fail(error);toast("Jadwal piket ditambahkan.");renderPage();});
    el.querySelectorAll("[data-delete-duty]").forEach(b=>b.onclick=async()=>{if(!confirm("Hapus jadwal ini?"))return;const {error}=await db.from("duty_schedules").delete().eq("id",b.dataset.deleteDuty);if(error)return fail(error);toast("Jadwal dihapus.");renderPage();});
  }
  async function renderCash(el) {
    const month=$("#cashMonth")?.value || monthLocal();
    const {data:payments,error}=await db.from("cash_payments").select("id,student_id,payment_month,amount,paid_at,student:profiles!duty_schedules_student_id_fkey(full_name)").eq("payment_month",month).order("paid_at",{ascending:false});
    if(error) throw error;
    if(isAdmin()) {
      await getStudents();
      const paid=new Set((payments||[]).map(x=>x.student_id));
      el.innerHTML=`<div class="grid"><div class="stat"><div class="stat-label">Target bulan ini</div><div class="stat-value">${money(280000)}</div></div><div class="stat"><div class="stat-label">Sudah bayar</div><div class="stat-value">${paid.size}/28</div></div><div class="stat"><div class="stat-label">Terkumpul</div><div class="stat-value">${money(paid.size*10000)}</div></div><div class="stat"><div class="stat-label">Belum bayar</div><div class="stat-value">${Math.max(0,28-paid.size)}</div></div></div><div class="panel"><div class="section-head"><h2>Catat pembayaran</h2><label class="field">Bulan<input id="cashMonth" type="month" value="${month.slice(0,7)}"></label></div><form id="cashForm" class="toolbar"><select name="student_id" required>${students.filter(s=>!paid.has(s.id)).map(s=>`<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join("")}</select><button class="primary" ${students.filter(s=>!paid.has(s.id)).length?"":"disabled"}>Tandai sudah bayar · Rp10.000</button></form><p class="notice">Pencatatan dilakukan langsung oleh admin setelah menerima uang kas. Siswa akan mendapat notifikasi konfirmasi di website.</p></div><div class="panel"><h2>Status pembayaran</h2><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Status</th><th>Waktu bayar</th></tr></thead><tbody>${students.map(s=>{const p=(payments||[]).find(x=>x.student_id===s.id);return `<tr><td>${escapeHtml(s.full_name)}</td><td><span class="badge ${p?"success":"warning"}">${p?"Lunas":"Belum bayar"}</span></td><td>${p?new Date(p.paid_at).toLocaleString("id-ID"):"-"}</td></tr>`}).join("")}</tbody></table></div></div>`;
      $("#cashMonth").onchange=()=>renderPage();
      $("#cashForm").onsubmit=async e=>{e.preventDefault();const studentId=new FormData(e.target).get("student_id");if(!studentId)return;const {error:payErr}=await db.from("cash_payments").insert({student_id:studentId,payment_month:month,amount:10000,recorded_by:currentUser.id});if(payErr)return fail(payErr);const {error:notifErr}=await db.from("notifications").insert({user_id:studentId,title:"Pembayaran uang kas dikonfirmasi",body:`Admin telah mencatat pembayaran uang kas ${month.slice(0,7)} sebesar Rp10.000. Status kamu: LUNAS.`,kind:"cash",related_date:month});if(notifErr)return fail(notifErr);toast("Pembayaran dicatat dan notifikasi dikirim.");renderPage();};
    } else {
      const own=payments?.[0];
      const {data:history,error:histErr}=await db.from("cash_payments").select("payment_month,amount,paid_at").eq("student_id",currentUser.id).order("payment_month",{ascending:false}).limit(12);
      if(histErr)throw histErr;
      const {data:ownCurrent,error:ownErr}=await db.from("cash_payments").select("id").eq("student_id",currentUser.id).eq("payment_month",month).maybeSingle();
      if(ownErr)throw ownErr;
      el.innerHTML=`<div class="grid"><div class="stat"><div class="stat-label">Iuran per bulan</div><div class="stat-value">${money(10000)}</div></div><div class="stat"><div class="stat-label">Status bulan ini</div><div class="stat-value" style="font-size:20px">${ownCurrent?"Lunas":"Belum bayar"}</div><div class="stat-note">${ownCurrent?"Pembayaran dikonfirmasi admin":"Menunggu pencatatan admin"}</div></div></div><div class="panel"><h2>Riwayat pembayaran</h2>${history?.length?`<div class="table-wrap"><table><thead><tr><th>Bulan</th><th>Jumlah</th><th>Status</th></tr></thead><tbody>${history.map(x=>`<tr><td>${x.payment_month.slice(0,7)}</td><td>${money(x.amount)}</td><td><span class="badge success">Lunas</span></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Belum ada pembayaran yang dicatat.</div>`}</div>`;
    }
  }
  async function renderNotifications(el) {
    const data=await loadNotifications();
    el.innerHTML=`<div class="section-head"><h2>Notifikasi kamu</h2><button id="markAllRead" class="secondary">Tandai semua dibaca</button></div><div class="list">${data.length?data.map(n=>`<article class="list-item"><div class="actions" style="justify-content:space-between"><h3>${escapeHtml(n.title)}</h3><span class="badge ${n.read_at?"":"warning"}">${n.read_at?"Dibaca":"Baru"}</span></div><p>${escapeHtml(n.body)}</p><div class="meta">${new Date(n.created_at).toLocaleString("id-ID")}</div>${!n.read_at?`<button class="secondary" style="margin-top:10px" data-read="${n.id}">Tandai dibaca</button>`:""}</article>`).join(""):`<div class="empty">Belum ada notifikasi.</div>`}</div>`;
    el.querySelectorAll("[data-read]").forEach(b=>b.onclick=async()=>{const {error}=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",b.dataset.read);if(error)return fail(error);renderPage();});
    $("#markAllRead").onclick=async()=>{const {error}=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",currentUser.id).is("read_at",null);if(error)return fail(error);toast("Semua notifikasi ditandai dibaca.");renderPage();};
  }
  async function enterApp(session) {
    currentUser=session.user;
    const {data,error}=await db.from("profiles").select("id,full_name,role").eq("id",currentUser.id).single();
    if(error) throw error;
    profile=data;
    $("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");
    $("#userName").textContent=profile.full_name;$("#userRole").textContent=isAdmin()?"Admin":"Siswa";$("#userInitial").textContent=(profile.full_name||"U").charAt(0).toUpperCase();
    await ensureDutyReminders(); await loadNotifications(); setPage("overview");
  }
  async function init() {
    if(!window.APP_CONFIG?.SUPABASE_URL || !window.APP_CONFIG?.SUPABASE_ANON_KEY || !window.supabase?.createClient) {
      $("#loginError").textContent="Konfigurasi Supabase belum diisi. Salin config.example.js menjadi config.js dan isi URL serta key.";
      return;
    }
    db=window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL,window.APP_CONFIG.SUPABASE_ANON_KEY);
    const {data:{session},error}=await db.auth.getSession();if(error)throw error;
    if(session) await enterApp(session);
    db.auth.onAuthStateChange(async(event,session)=>{if(event==="SIGNED_IN"&&session){try{await enterApp(session)}catch(e){fail(e)}}if(event==="SIGNED_OUT"){profile=null;currentUser=null;$("#appView").classList.add("hidden");$("#loginView").classList.remove("hidden");}});
  }
  $("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginError").textContent="";if(!db){$("#loginError").textContent="Konfigurasi Supabase belum siap.";return;}const {error}=await db.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)$("#loginError").textContent=error.message;});
  $("#logoutBtn").onclick=async()=>{const {error}=await db.auth.signOut();if(error)fail(error);};
  $("#refreshBtn").onclick=()=>renderPage().catch(fail);
  document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.page)));
  init().catch(e=>{console.error(e);$("#loginError").textContent=e.message||"Gagal memuat aplikasi.";});
})();