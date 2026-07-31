import { describe, expect, it } from 'vitest';
import { buildInterpretationPrompt } from './prompt';

describe('buildInterpretationPrompt', () => {
  it('embeds the source text delimited in the user message', () => {
    const { user, truncated } = buildInterpretationPrompt('Pintura da sala, 2800 reais.');

    expect(user).toContain('Pintura da sala, 2800 reais.');
    expect(truncated).toBe(false);
  });

  it('states the extractor-not-consultant rule in the system prompt', () => {
    const { system } = buildInterpretationPrompt('texto qualquer');
    expect(system).toMatch(/não é um consultor de preços/i);
  });

  it('instructs the model to use null instead of guessing', () => {
    const { system } = buildInterpretationPrompt('texto qualquer');
    expect(system).toMatch(/nunca invente/i);
  });

  it('caps questions to a maximum of three per round', () => {
    const { system } = buildInterpretationPrompt('texto qualquer');
    expect(system).toMatch(/no máximo 3 perguntas/i);
  });

  it('instructs the model to treat the user text as data, not instructions', () => {
    const { system } = buildInterpretationPrompt('texto qualquer');
    expect(system).toMatch(/não como um comando/i);
  });

  it('truncates source text beyond the length cap', () => {
    const longText = 'a'.repeat(5000);
    const { user, truncated } = buildInterpretationPrompt(longText);

    expect(truncated).toBe(true);
    expect(user).not.toContain('a'.repeat(5000));
    expect(user).toContain('a'.repeat(4000));
  });

  it('does not truncate text under the length cap', () => {
    const text = 'a'.repeat(3999);
    const { truncated } = buildInterpretationPrompt(text);
    expect(truncated).toBe(false);
  });
});
