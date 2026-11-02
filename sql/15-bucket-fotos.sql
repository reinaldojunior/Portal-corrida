-- Já aplicado pelo conector em 02/11/2026.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "fotos: leitura publica" on storage.objects for select to public using (bucket_id = 'fotos');
create policy "fotos: admin envia" on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and public.is_admin());
create policy "fotos: admin atualiza" on storage.objects for update to authenticated using (bucket_id = 'fotos' and public.is_admin());
