import { Linking } from 'react-native';

import { supabase } from './supabase';

// Contato de suporte configurado no painel admin (support_settings). Qualquer
// usuário logado lê - inclusive conta suspensa ou com exclusão agendada.

export type SupportContact = { whatsapp: string | null; email: string | null };

export async function getSupportContact(): Promise<SupportContact> {
  const { data, error } = await supabase.rpc('get_support_contact');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return { whatsapp: row?.whatsapp ?? null, email: row?.email ?? null };
}

export function hasSupportContact(contact: SupportContact | null): boolean {
  return Boolean(contact?.whatsapp || contact?.email);
}

// wa.me abre o WhatsApp (app ou web) já na conversa, com a mensagem pronta.
export function whatsappUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

export function emailUrl(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

export function openSupportUrl(url: string): Promise<void> {
  return Linking.openURL(url);
}

// 5511999998888 -> +55 (11) 99999-8888 (só pra exibir; o link usa os dígitos).
export function formatWhatsapp(digits: string): string {
  const match = /^(\d{2})(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return match ? `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}` : `+${digits}`;
}
