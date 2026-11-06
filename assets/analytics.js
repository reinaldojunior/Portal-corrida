// Medição (Google Tag Manager ou GA4 direto) só depois do aceite do visitante (LGPD). Sem ID, nada é carregado e o aviso não aparece.
(function () {
  const GTM_ID = ''; // contêiner do Tag Manager; o GA4 é configurado lá dentro
  const GA_ID = 'G-JM8P0BBFT1'; // alternativa sem Tag Manager: ID de métricas do GA4, ex.: G-XXXXXXXXXX
  if (!GTM_ID && !GA_ID) return;
  const CHAVE = 'mm_cookies';
  document.querySelectorAll('[data-cookies]').forEach((a) => { a.hidden = false; });
  const ler = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };
  const gravar = (v) => { try { localStorage.setItem(CHAVE, v); } catch { /* sem armazenamento: pergunta de novo na próxima visita */ } };

  function carregar() {
    if (window.__mmMedicao) return;
    window.__mmMedicao = true;
    window.dataLayer = window.dataLayer || [];
    const evento = (nome, dados) => window.dataLayer.push(Object.assign({ event: nome }, dados));
    const s = document.createElement('script');
    s.async = true;
    if (GTM_ID) {
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
    } else {
      window.gtag = function () { window.dataLayer.push(arguments); };
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
      window.gtag('js', new Date());
      window.gtag('config', GA_ID, { anonymize_ip: true });
    }
    document.head.appendChild(s);
    // a página inicial troca de tela sem recarregar: conta cada mudança de tela
    window.addEventListener('hashchange', () => evento('mm_page_view', { page_location: location.href, page_title: document.title }));
    // clique no botão de inscrição (prova de valor para os organizadores)
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a.ci-cta');
      if (!a) return;
      let destino = ''; try { destino = new URL(a.href).hostname; } catch { /* segue */ }
      if (window.gtag) window.gtag('event', 'inscricao_click', { destino, pagina: location.pathname + location.hash });
      else evento('inscricao_click', { destino, pagina: location.pathname + location.hash });
    });
  }

  function aviso() {
    const el = document.createElement('div');
    el.className = 'aviso-cookies'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Aviso de cookies');
    el.innerHTML = '<p>Usamos cookies de estatística (Google Analytics) para saber quais provas e páginas são mais vistas. Eles só são ativados se você aceitar. <a href="/privacidade.html">Política de privacidade</a></p>'
      + '<div class="aviso-cookies-bt"><button type="button" class="btn btn-linha" data-c="nao">Recusar</button><button type="button" class="btn btn-cone" data-c="sim">Aceitar</button></div>';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      gravar(b.dataset.c); el.remove(); if (b.dataset.c === 'sim') carregar();
    });
    document.body.appendChild(el);
  }

  const escolha = ler();
  if (escolha === 'sim') carregar();
  else if (escolha !== 'nao') aviso();
  // permite mudar de ideia pelo link "Cookies" do rodapé
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('[data-cookies]')) return;
    e.preventDefault(); try { localStorage.removeItem(CHAVE); } catch { /* segue */ }
    if (!document.querySelector('.aviso-cookies')) aviso();
  });
})();
