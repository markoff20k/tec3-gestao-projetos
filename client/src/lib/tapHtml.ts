export const TAP_PUBLIC_LOGO_URL =
  'https://www.tec3engenharia.com.br/wp-content/uploads/2025/09/tec3-LogoTagline-Cor.svg';

/**
 * O HTML do TAP fica gravado no banco, e ao longo do tempo foi gerado com três
 * estratégias de logo diferentes: data URI, URL pública e — em parte dos casos —
 * o endereço interno do servidor (ex.: https://192.168.1.21/branding/...), que o
 * navegador do usuário não alcança e aparece como imagem quebrada.
 *
 * Como o documento já está persistido, a normalização acontece na exibição:
 * qualquer referência ao logo que não seja data URI passa a apontar para a URL
 * pública. data URI é preservado porque sempre funciona, inclusive offline.
 */
export function normalizeTapLogo(htmlContent: string | null | undefined): string {
  if (!htmlContent) return '';

  return htmlContent.replace(
    /(<img\b[^>]*\bsrc=)(["'])((?!data:)[^"']*tec3[-_]?logo[^"']*)\2/gi,
    `$1$2${TAP_PUBLIC_LOGO_URL}$2`
  );
}
