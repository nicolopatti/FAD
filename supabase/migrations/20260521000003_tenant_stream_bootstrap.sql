-- Fase 1 — Bootstrap del tenant unico e del suo stream di audit.
-- In Fase 1 c'è un solo tenant e un solo stream per tenant (D11/D19).
-- L'ID del tenant è fissato perché serve a runtime al client (.env.example).

insert into public.tenant (id, nome)
values ('00000000-0000-0000-0000-000000000001', 'Tenant Demo Fase 1')
on conflict (id) do nothing;

insert into public.stream_audit (tenant_id, scope)
select id, 'tenant' from public.tenant
where id = '00000000-0000-0000-0000-000000000001'
on conflict do nothing;
