import { router } from 'expo-router';
import type { Href } from 'expo-router';

// expo-router lança "GO_BACK was not handled by any navigator" se a tela foi
// aberta sem histórico de navegação (deep link, refresh do navegador na
// própria rota, ou o teste automatizado navegando direto pra cá) - cai num
// destino fixo nesse caso em vez de deixar o warning/erro estourar.
export function goBackOr(fallbackHref: Href) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallbackHref);
  }
}
