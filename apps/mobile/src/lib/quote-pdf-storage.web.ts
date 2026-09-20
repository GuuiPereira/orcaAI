import type { IssuedQuoteTarget } from './quote-pdf-storage';

// No navegador, expo-print só abre o diálogo de impressão do sistema - não
// gera um arquivo/base64 de verdade pra subir pro Storage (mesma limitação
// já documentada em lib/pdf-share.web.ts). A emissão em si (numeração,
// versão, totais) continua funcionando normalmente; só este passo extra
// (guardar o PDF gerado) fica de fora até rodar num app nativo de verdade -
// ver docs/AMBIENTE_LOCAL.md.
export async function saveIssuedQuotePdf(_html: string, _target: IssuedQuoteTarget): Promise<void> {
  // no-op no navegador (ver comentário acima).
}
