/**
 * Lector del flujo de texto que emite /api/copilot: una línea por fragmento, con el formato
 *   0:"texto"            -> fragmento de la respuesta
 *   3:"mensaje de error" -> error durante la respuesta
 *   d:{...}              -> fin (se ignora)
 * Un fragmento de red puede cortar una línea por la mitad, por eso se guarda el resto hasta recibir el salto de línea.
 */
export function createCopilotStreamParser() {
  let rest = '';
  return {
    /** Recibe un trozo de texto y devuelve lo que contenía: texto de la respuesta y/o un error */
    feed(chunk: string): { text: string; error?: string } {
      rest += chunk;
      const lines = rest.split('\n');
      rest = lines.pop() ?? '';
      let text = '';
      let error: string | undefined;
      for (const line of lines) {
        const i = line.indexOf(':');
        if (i < 1) continue;
        const code = line.slice(0, i);
        let value: unknown;
        try { value = JSON.parse(line.slice(i + 1)); } catch { continue; }
        if (code === '0' && typeof value === 'string') text += value;
        else if (code === '3') error = typeof value === 'string' ? value : 'Error en la respuesta';
      }
      return { text, error };
    },
  };
}
