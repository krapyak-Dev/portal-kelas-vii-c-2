-- PORTAL KELAS VIIC
-- Jalankan seluruh SQL ini di Supabase > SQL Editor pada project baru.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Siswa',
  role text not null default 'student' check (role in ('admin','student')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
drop policy if exists "profile read own or admin" on public.profiles;
create policy "profile read own or admin" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles" on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Akun baru otomatis mendapat profil siswa. Role admin harus diubah manual oleh pemilik project.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "signed in read announcements" on public.announcements;
create policy "signed in read announcements" on public.announcements
for select to authenticated using (true);
drop policy if exists "admin manage announcements" on public.announcements;
create policy "admin manage announcements" on public.announcements
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present','absent')),
  note text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(student_id, attendance_date)
);
alter table public.attendance enable row level security;
drop policy if exists "student read own attendance" on public.attendance;
create policy "student read own attendance" on public.attendance
for select to authenticated using (student_id = auth.uid() or public.is_admin());
drop policy if exists "admin manage attendance" on public.attendance;
create policy "admin manage attendance" on public.attendance
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.duty_schedules (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);
alter table public.duty_schedules enable row level security;
drop policy if exists "signed in read duty" on public.duty_schedules;
create policy "signed in read duty" on public.duty_schedules
for select to authenticated using (true);
drop policy if exists "admin manage duty" on public.duty_schedules;
create policy "admin manage duty" on public.duty_schedules
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.cash_payments (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  payment_month date not null,
  amount integer not null default 10000 check (amount = 10000),
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id),
  unique(student_id, payment_month)
);
alter table public.cash_payments enable row level security;
drop policy if exists "student read own cash" on public.cash_payments;
create policy "student read own cash" on public.cash_payments
for select to authenticated using (student_id = auth.uid() or public.is_admin());
drop policy if exists "admin manage cash" on public.cash_payments;
create policy "admin manage cash" on public.cash_payments
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'info',
  related_date date,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "user read own notifications" on public.notifications;
create policy "user read own notifications" on public.notifications
for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "user mark own notifications read" on public.notifications;
create policy "user mark own notifications read" on public.notifications
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "admin create notifications" on public.notifications;
create policy "admin create notifications" on public.notifications
for insert to authenticated with check (public.is_admin());
drop policy if exists "admin delete notifications" on public.notifications;
create policy "admin delete notifications" on public.notifications
for delete to authenticated using (public.is_admin());

-- Catatan: hari piket otomatis diingatkan saat siswa membuka portal.
-- Untuk notifikasi terjadwal meskipun siswa tidak membuka web, perlu Edge Function + scheduler.
