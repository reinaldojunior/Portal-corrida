# Fontes de coleta — Radar Mapmove

Última atualização: novembro/2026

## Status por fonte

| Emoji | Significado |
|-------|-------------|
| ✅ | Integrado |
| 🔍 | A investigar (DevTools test) |
| ⏳ | Em desenvolvimento |
| ❌ | Descartado |

---

## Nacionais — Ticketeiras / Inscrições

| Site | URL | Status | Notas |
|------|-----|--------|-------|
| **Corridas BR** | corridasbr.com.br | ✅ | Fonte atual, HTML por estado |
| **Ticket Sports** | ticketsports.com.br | 🔍 | Maior volume do Brasil |
| **Minhas Inscrições** | minhasinscricoes.com.br | 🔍 | Citado no DF junto com Ticket |
| **Ativo.com** | ativo.com | 🔍 | Plataforma nacional |
| **Central da Corrida** | centraldacorrida.com.br | 🔍 | Reclamações no RA, mas tem volume |
| **O2 Corre** | o2corre.com.br | 🔍 | Inscrições |
| **Foco Radical** | focoradical.com.br | 🔍 | Esportes de aventura + corrida |
| **Sympla (Esportes)** | sympla.com.br/eventos/esportivo | 🔍 | API privada (autenticação) |
| **Doity (Esportes)** | doity.com.br/eventos/esporte-lazer | 🔍 | Pode ter JSON público |

## Nacionais — Calendários / Mídia

| Site | URL | Status | Notas |
|------|-----|--------|-------|
| **Webrun** | webrun.com.br | 🔍 | Mídia + calendário |
| **Corridinhas** | corridinhas.com.br | 🔍 | Calendário |
| **Corrida 360** | corrida360.com.br | 🔍 | Blog + calendário, foco Recife/NE |

## Regionais

| Site | URL | Região | Status | Notas |
|------|-----|--------|--------|-------|
| **Runner Brasil** | runnerbrasil.com.br | SP | 🔍 | |
| **Portal das Corridas** | portaldascorridas.com.br | MG | 🔍 | |
| **TBH Esportes** | tbhesportes.com.br | MG | 🔍 | Cronometragem/organização |
| **Road Runners** | roadrunners.run | ES/Nacional | 🔍 | Bom para o Sul |
| **Sou Corredor** | soucorredor.com.br | SC | 🔍 | Filtro por estado |
| **Corre Brasil** | correbrasil.com.br | SC | 🔍 | |
| **Circuito SESC-RS** | sesc-rs.com.br/circuitodecorridas | RS | 🔍 | Circuito anual |
| **PE Running** | perunning.com.br | PE/PB | 🔍 | Nordeste |
| **ForChip** | forchip.com.br | CE | 🔍 | Cronometragem Ceará |
| **Zenite Esportes** | zeniteesportes.com | PB | 🔍 | |
| **HC Sports** | hcsports.com.br | RN | 🔍 | |
| **Contime** | contime.com.br | AL | 🔍 | Cronometragem AL |
| **Brasil Corrida** | brasilcorrida.com.br | DF/GO | 🔍 | |
| **Sport Timer** | sporttimer.com.br | GO | 🔍 | Cronometragem GO |
| **ChipBelém** | chipbelem.com.br | PA | 🔍 | Cronometragem PA |

---

## Como investigar cada fonte

Para cada site, fazer o teste no navegador:
1. Abrir o site → F12 → aba **Network → Fetch/XHR**
2. Recarregar a página
3. Anotar a URL do request que carrega os eventos

**Resultados possíveis:**
- JSON com lista de eventos → API interna (mais fácil de integrar)
- `{"message":"Missing Authentication Token"}` → API privada (como Ahotu)
- Sem requests JSON → HTML estático (scraping)

---

## Prioridade de integração sugerida

### Alta prioridade
1. **Ticket Sports** — maior volume nacional
2. **Sou Corredor** — parece estruturado, filtro por estado
3. **Doity** — plataforma de eventos com possível JSON público
4. **Road Runners** — boa cobertura Sul/ES

### Média prioridade
5. **Minhas Inscrições** — complementar ao Ticket
6. **Portal das Corridas** — MG (estado com muitas corridas)
7. **Corrida 360** — NE
8. **Webrun** — mídia mas tem calendário

### Cronometragem regional (baixa prioridade inicial)
- ForChip (CE), ChipBelém (PA), Sport Timer (GO), Contime (AL), HC Sports (RN)
- Esses têm calendários das provas que cronometram — menor volume mas alta precisão
