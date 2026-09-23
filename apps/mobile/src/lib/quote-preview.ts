import { buildQuoteHtml, type PdfItem } from '@orcaai/shared';

import { formatOrganizationAddress, type OrganizationProfileInput } from './organizations';

// Itens e cliente de exemplo - só existem pra mostrar como o documento fica
// com os dados do prestador (PRD §4, "Primeiro acesso"). O aviso "EXEMPLO"
// no topo deixa claro que nada disso é de um orçamento real.
const SAMPLE_ITEMS: PdfItem[] = [
  {
    type: 'service',
    description: 'Pintura de paredes internas',
    category: null,
    quantity: null,
    unit: null,
    total_price_cents: 120000,
  },
  {
    type: 'material',
    description: 'Tinta acrílica',
    category: null,
    quantity: '2',
    unit: 'latas',
    total_price_cents: null,
  },
];

export function buildProfilePreviewHtml(profile: OrganizationProfileInput, logoDataUri: string | null): string {
  return buildQuoteHtml({
    mode: 'completo',
    organization: {
      tradeName: profile.tradeName.trim() || 'Seu nome comercial',
      legalName: profile.legalName,
      taxId: profile.taxId,
      contactPhone: profile.contactPhone,
      contactEmail: profile.contactEmail,
      address: formatOrganizationAddress(profile.address),
      logoDataUri,
    },
    customer: { name: 'Cliente de exemplo', phone: null, address: null },
    items: SAMPLE_ITEMS,
    discount: null,
    commercialTerms: {
      paymentTerms: profile.preferences.default_payment_terms,
      estimatedDurationDays: null,
      validityDays: profile.preferences.default_validity_days,
    },
    issuedAt: new Date(),
    notice: 'EXEMPLO - prévia com os dados do seu perfil. Os itens e o cliente abaixo são fictícios.',
  });
}
