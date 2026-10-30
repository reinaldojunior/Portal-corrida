# PaceClub

Portal de corridas de rua de Indaiatuba e região: mapa e agenda de provas, notícias, ferramentas para corredores (pace, zonas de FC, ritmos de treino, pulseira de pace, conversor de esteira), simulador da prova pelo percurso (GPX) e ranking "Onde bater meu recorde".

## Estrutura

- `index.html` — a página (site público e área do administrador)
- `assets/estilo.css` — visual
- `assets/app.js` — funcionamento (Supabase, mapas com Leaflet, ferramentas, admin)
- `sql/` — scripts do banco no Supabase, na ordem em que foram rodados

## Serviços usados

- Banco e login: Supabase
- Mapas: Leaflet com camadas da Esri (gratuitas, sem chave)
- Clima: Open-Meteo (gratuito, sem chave)

Site estático: qualquer hospedagem de arquivos (Vercel, Netlify) publica a pasta como está, sem build.
