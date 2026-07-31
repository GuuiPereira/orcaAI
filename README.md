# OrçaAI

Aplicativo mobile para transformar descrições informais de serviços em
orçamentos profissionais, revisáveis e compartilháveis.

## Problema

Prestadores de serviço recebem ou registram informações de um trabalho de forma
livre, normalmente por mensagem. Para criar um orçamento, alguém precisa
interpretar o texto, corrigir a escrita, organizar os itens, calcular os valores,
montar um documento e exportá-lo para PDF.

O OrçaAI reduz esse trabalho sem retirar o controle do profissional:

1. O prestador escreve ou dita como já está acostumado.
2. A IA organiza a informação e aponta o que está faltando.
3. O usuário revisa e confirma os dados.
4. O aplicativo calcula os totais e gera o PDF.
5. O orçamento pode ser compartilhado pelo WhatsApp, e-mail ou outros apps.

## Princípios do produto

- Simples antes de completo.
- Revisão humana obrigatória antes da emissão.
- IA interpreta texto; regras determinísticas calculam dinheiro.
- Nenhum dado ausente deve ser inventado.
- O usuário sempre pode editar manualmente.
- A experiência principal precisa funcionar bem em celulares Android simples.

## Escopo inicial

O MVP atende prestadores autônomos de pintura e serviços gerais no Brasil.
Inclui:

- cadastro do prestador e identidade visual básica;
- cadastro rápido de clientes;
- criação de orçamento por texto livre;
- interpretação estruturada por IA;
- perguntas sobre informações ausentes ou ambíguas;
- edição e confirmação;
- cálculo de subtotal, desconto e total;
- geração de PDF;
- histórico, busca, duplicação e compartilhamento;
- estados rascunho, enviado, aprovado, recusado e expirado.

Áudio, assinatura eletrônica, cobrança, catálogo inteligente e equipes são
evoluções planejadas, não dependências para validar o produto.

## Stack recomendada

- App: React Native com Expo e TypeScript.
- Backend: Supabase (Postgres, Auth, Storage e Edge Functions).
- IA: OpenAI Responses API com Structured Outputs.
- PDF: template HTML/CSS renderizado no backend e armazenado no Supabase.
- Monitoramento: Sentry.
- Analytics de produto: PostHog, somente após consentimento e com dados
  pessoais removidos.

As decisões completas estão em:

- [PRD](docs/PRD.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## Métrica principal

Tempo mediano entre iniciar a descrição e compartilhar um orçamento confirmado.

Meta inicial: menos de 3 minutos, com pelo menos 80% dos orçamentos exigindo
apenas pequenos ajustes após a interpretação.

