/**
 * Formato dos dados cifrados que o navegador envia: "v1.<iv base64>.<texto cifrado base64>".
 * A API só confere o formato; ela nunca tem a chave para abrir o conteúdo.
 * IV de 12 bytes = 16 caracteres base64; o texto cifrado inclui a tag de 16 bytes do AES-GCM.
 */
export const ENC_STRING_REGEX = /^v1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{22,}={0,2}$/;

/** Limite por item (o conteúdo cifrado de uma credencial com notas cabe com folga). */
export const MAX_ITEM_LENGTH = 65536;
