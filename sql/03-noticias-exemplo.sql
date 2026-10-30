-- =========================================================
-- PaceClub · Ativa notícias e cadastra exemplos
-- Cole no SQL Editor do Supabase e clique em Run.
-- Para apagar depois: delete from noticias where autor = 'Redação PaceClub (exemplo)';
-- =========================================================

update modulos set ativo = true where chave = 'noticias';

insert into noticias (slug, titulo, resumo, conteudo, editoria, destaque, autor, status, publicado_em) values
  (
    'indaiatuba-regiao-sete-corridas-fim-de-ano',
    'Indaiatuba e região terão sete corridas de rua até o fim do ano',
    'Do 5K noturno em Salto à meia maratona de Itu: veja datas, distâncias e onde fazer a inscrição de cada prova.',
    'A agenda de corridas de rua na região de Indaiatuba está movimentada até dezembro. Além da tradicional Corrida do Parque Ecológico, a temporada traz a Night Run Salto, com largada noturna, a Meia de Itu, que devolve a distância de 21K ao calendário local, e provas menores em Elias Fausto e Monte Mor.

A organização recomenda inscrição antecipada, já que os lotes com menor preço costumam esgotar semanas antes da prova. Kits variam entre camiseta, medalha e chip de cronometragem, conforme cada organizador.',
    'regiao', true, 'Redação PaceClub (exemplo)', 'publicado', now() - interval '1 hour'
  ),
  (
    'como-montar-treino-primeira-meia',
    'Como montar o treino para a sua primeira meia maratona',
    'Um guia simples para quem sai dos 10K e quer completar os 21K com segurança.',
    'Passar dos 10K para os 21K exige paciência com o volume de treino. A recomendação geral é aumentar a distância semanal em no máximo 10% e incluir ao menos um treino longo por semana, elevando aos poucos até chegar perto dos 18K antes da prova.

Fortalecimento muscular duas vezes por semana ajuda a reduzir o risco de lesão, e a prova em si deve ser encarada com um ritmo mais conservador que o treino, especialmente nos primeiros quilômetros.',
    'treino', false, 'Redação PaceClub (exemplo)', 'publicado', now() - interval '2 days'
  ),
  (
    'altimetria-por-que-olhar-antes-de-inscrever',
    'Altimetria: por que olhar as subidas antes de se inscrever',
    'O perfil de elevação de uma prova muda completamente a estratégia de corrida.',
    'Duas corridas de mesma distância podem exigir esforços bem diferentes dependendo da altimetria. Percursos com subidas concentradas no início tendem a puxar o ritmo para baixo logo cedo, enquanto subidas no fim costumam pesar mais no cansaço acumulado.

Antes de se inscrever, vale a pena olhar o mapa de elevação divulgado pela organização e ajustar a expectativa de tempo, em vez de comparar diretamente com uma prova plana.',
    'percurso', false, 'Redação PaceClub (exemplo)', 'publicado', now() - interval '3 days'
  ),
  (
    'tenis-treino-tenis-prova-quando-vale-ter-os-dois',
    'Tênis de treino e tênis de prova: quando vale ter os dois',
    'Nem todo corredor precisa de dois pares, mas alguns perfis se beneficiam bastante.',
    'Tênis de prova costumam priorizar leveza e resposta, enquanto os de treino trazem mais amortecimento para suportar o volume semanal. Para quem treina pouco ou está começando, um único par equilibrado resolve bem.

Já quem já corre provas de 21K ou 42K com regularidade tende a notar diferença ao reservar um par mais leve só para o dia da corrida, preservando o tênis de treino do desgaste diário.',
    'equipamento', false, 'Redação PaceClub (exemplo)', 'publicado', now() - interval '4 days'
  ),
  (
    'calendario-maratonas-brasil-primeiro-semestre',
    'Calendário de maratonas do primeiro semestre no Brasil',
    'As principais provas de 42K programadas para os próximos meses pelo país.',
    'O primeiro semestre costuma concentrar boa parte das grandes maratonas brasileiras, aproveitando o clima mais ameno em várias regiões. A procura por vagas cresce a cada edição, e provas com maior tradição costumam esgotar as inscrições com meses de antecedência.

Para quem mira uma dessas provas, o planejamento de treino geralmente começa dezesseis a vinte semanas antes da data escolhida.',
    'brasil', false, 'Redação PaceClub (exemplo)', 'publicado', now() - interval '5 days'
  ),
  (
    'grandes-maratonas-internacionais-2027',
    'As grandes maratonas internacionais de 2027',
    'Boston, Londres, Berlim, Chicago, Nova York e Tóquio formam o circuito mais disputado do mundo.',
    'O conjunto das seis maratonas World Marathon Majors segue sendo o objetivo de boa parte dos corredores amadores que buscam uma experiência internacional. Cada prova tem seu próprio processo de inscrição, por sorteio, tempo qualificador ou pacotes com agências de viagem.

Berlim e Chicago são historicamente as mais rápidas do circuito, por terem percursos planos, enquanto Boston exige tempo qualificador e é considerada a mais desafiadora entre as seis.',
    'mundo', false, 'Redação PaceClub (exemplo)', 'publicado', now() - interval '6 days'
  )
on conflict (slug) do nothing;
