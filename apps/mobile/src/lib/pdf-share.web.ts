// No navegador não existe um menu de compartilhamento nativo real:
// expo-sharing depende de navigator.share (só HTTPS + gesto do usuário, sem
// suporte em boa parte dos navegadores desktop) e expo-print, no target web,
// ignora o HTML recebido e só chama window.print() na página atual (e abrir
// uma nova aba com window.open esbarra no bloqueio de pop-up de vários
// navegadores). Por isso aqui baixamos o HTML do orçamento como arquivo -
// o prestador abre o arquivo baixado e usa "Imprimir > Salvar como PDF" do
// próprio navegador. É uma alternativa só para o alvo web; no app nativo
// (Android/iOS) o compartilhamento usa o menu nativo de verdade.
export async function shareQuotePdf(html: string): Promise<void> {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'orcamento.html';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
