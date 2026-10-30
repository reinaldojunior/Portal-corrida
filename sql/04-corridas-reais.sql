-- =========================================================
-- PaceClub · Pré-cadastro de corridas reais (pesquisa de 28/09/2026)
-- Fontes: calendário de cupons do Correria Campinas, calendário do blog
-- Corrida Nossa do Dia a Dia e páginas das provas no Ticket Sports.
-- Cole no SQL Editor do Supabase e clique em Run.
--
-- A posição no mapa é o centro de cada cidade (ajuste no admin quando
-- souber o local exato da largada). Distâncias e preços só foram
-- preenchidos quando a fonte informava.
-- =========================================================

-- 1) Remove as 5 corridas fictícias de exemplo
delete from corridas where origem = 'exemplo';

-- 2) Cadastra as corridas reais
with novas as (
  insert into corridas (slug, nome, cidade, local_largada, lat, lng, data, horario, link_inscricao, status, origem) values
    -- Indaiatuba, Itu e Elias Fausto
    ('outubro-rosa-indaiatuba-2026',        'Corrida Outubro Rosa',                              'Indaiatuba',   null,                                       -23.0903, -47.2181, '2026-10-03', null,    'https://www.ticketsports.com.br/e/corrida-outubro-rosa-88063', 'publicado', 'manual'),
    ('anjos-que-correm-itu-2026',           'Anjos que Correm',                                  'Itu',          null,                                       -23.2642, -47.2993, '2026-10-11', null,    'https://www.ticketsports.com.br/e/anjos-que-correm-88154', 'publicado', 'manual'),
    ('tf-corre-delas-indaiatuba-2026',      'Track&Field Experience Corre Delas Outubro Rosa',   'Indaiatuba',   null,                                       -23.0950, -47.2100, '2026-10-18', null,    'https://www.tfsports.com.br/app/', 'publicado', 'manual'),
    ('fb-run-elias-fausto-2026',            '2ª Corrida FB Run Circuito Panamericano',           'Elias Fausto', null,                                       -23.0428, -47.3736, '2026-10-31', null,    'https://www.ticketsports.com.br/e/2a-fbrun-circuito-panamericano-by-pirelli-88386', 'publicado', 'manual'),
    ('meia-maratona-indaiatuba-2026',       '1ª Meia Maratona de Indaiatuba',                    'Indaiatuba',   'Complexo Rei Pelé, Estrada General Motors, 249', -23.0840, -47.2250, '2026-12-13', null, 'https://www.ticketsports.com.br/e/1a-meia-maratona-de-indaiatuba-87022', 'publicado', 'manual'),
    ('ultramaratona-indaiatuba-2027',       'Ultramaratona de Indaiatuba',                       'Indaiatuba',   null,                                       -23.1000, -47.2250, '2027-02-20', null,    'https://www.ticketsports.com.br/e/ultramaratona-indaiatuba-87586', 'publicado', 'manual'),
    -- Campinas (dentro do raio de 30 km)
    ('corrida-vera-cruz-campinas-2026',     'Corrida Vera Cruz',                                 'Campinas',     null,                                       -22.9000, -47.0700, '2026-10-11', null,    'https://www.ticketsports.com.br/e/corrida-vera-cruz-2026-86556', 'publicado', 'manual'),
    ('live-run-xp-campinas-2026',           'Live Run XP',                                       'Campinas',     null,                                       -22.9100, -47.0500, '2026-10-18', null,    'https://www.liverun.com.br/etapa/live21k-campinas-2026', 'publicado', 'manual'),
    ('corrida-oab-campinas-2026',           '3ª Corrida OAB SP',                                 'Campinas',     null,                                       -22.8950, -47.0550, '2026-10-18', null,    'https://site.ticketsports.com.br/Inscricao/categoria.aspx?__idEvento=87762&origem=novo-site&lang=pt-BR', 'publicado', 'manual'),
    ('aero-night-run-campinas-2026',        'Aero Night Run',                                    'Campinas',     null,                                       -22.9150, -47.0650, '2026-10-24', '19:00', 'https://www.ticketsports.com.br/e/aero-night-run-gwm-dahruj-etapa-campinas-2026-87364', 'publicado', 'manual'),
    ('ems-running-music-campinas-2026',     'EMS Running Music Festival',                        'Campinas',     null,                                       -22.9050, -47.0450, '2026-10-31', null,    'https://www.ticketsports.com.br/e/EMS-RUNNING-MUSIC-FESTIVAL-88248', 'publicado', 'manual'),
    ('corrida-historica-campinas-2026',     'Corrida Histórica de Campinas',                     'Campinas',     null,                                       -22.9056, -47.0608, '2026-11-01', null,    'https://www.ticketsports.com.br/e/corrida-historica-de-campinas-2026-87940', 'publicado', 'manual'),
    ('circuito-estacoes-verao-campinas-2026','Circuito das Estações Verão',                      'Campinas',     null,                                       -22.8900, -47.0750, '2026-11-15', null,    'https://www.o2corre.com.br/calendario/circuito-da-estacoes-2026-ver-o-campinas/', 'publicado', 'manual'),
    ('blue-run-campinas-2026',              'Blue Run',                                          'Campinas',     null,                                       -22.9200, -47.0550, '2026-11-24', null,    'https://www.o2corre.com.br/calendario/blue-run-2026-campinas/', 'publicado', 'manual'),
    ('corrida-catedral-campinas-2026',      '3ª Corrida Catedral Metropolitana de Campinas',     'Campinas',     'Catedral Metropolitana de Campinas',       -22.9030, -47.0590, '2026-12-06', null,    'https://www.ticketsports.com.br/e/3a-corrida-catedral-metropolitana-de-campinas-88282', 'publicado', 'manual'),
    ('corrida-6k-do-rosa-campinas-2026',    'Corrida 6K do Rosa',                                'Campinas',     null,                                       -22.8980, -47.0480, '2026-12-13', '07:00', 'https://www.ticketsports.com.br/e/corrida-6k-do-rosa-2026-86153', 'publicado', 'manual'),
    ('nashville-rock-n-run-campinas-2026',  'Nashville Rock N''Run',                             'Campinas',     null,                                       -22.9120, -47.0720, '2026-12-20', '07:00', 'https://minhasinscricoes.com.br/Evento/NashvilleRockNRun2026', 'publicado', 'manual')
  on conflict (slug) do nothing
  returning id, slug
)
insert into corrida_distancias (corrida_id, km, rotulo, preco)
select n.id, d.km, d.rotulo, d.preco
from novas n
join (values
  ('meia-maratona-indaiatuba-2026',      21.0975, '21K', null::numeric),
  ('aero-night-run-campinas-2026',        6,      '6K',  129.90),
  ('corrida-6k-do-rosa-campinas-2026',    6,      '6K',  210.00),
  ('nashville-rock-n-run-campinas-2026',  5,      '5K',  120.00),
  ('nashville-rock-n-run-campinas-2026', 10,      '10K', 120.00),
  ('nashville-rock-n-run-campinas-2026', 16.09,   '10 milhas', null)
) as d(slug, km, rotulo, preco) on d.slug = n.slug;
