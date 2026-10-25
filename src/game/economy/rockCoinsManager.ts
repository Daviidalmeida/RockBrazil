/**
 * RockBrazil Economy - RockCoins Manager
 *
 * FASE 4 — Regras Oficiais de Balanceamento V12:
 *
 * Recompensa por conclusão válida:
 * - 1 estrela: 1 RockCoin
 * - 2 estrelas: 2 RockCoins
 * - 3 estrelas: 3 RockCoins
 * - 4 estrelas: 4 RockCoins
 * - 5 estrelas: 5 RockCoins
 *
 * BÔNUS DE PRECISÃO:
 * - 100% de acertos: +2 RockCoins
 *
 * LIMITE MÁXIMO:
 * - 7 RockCoins por conclusão de música.
 *
 * Se a partida não for concluída (falha ou saída):
 * - 0 RockCoins concedidas.
 */

export class RockCoinsManager {
  /**
   * Calcula a recompensa em RockCoins para uma partida concluída.
   *
   * @param stars Quantidade de estrelas obtidas (1 a 5).
   * @param accuracy Precisão percentual (0 a 100).
   * @param completed Se a partida foi finalizada com sucesso.
   * @returns Total de RockCoins concedidas (0 a 7).
   */
  public static calculateReward(stars: number, accuracy: number, completed = true): number {
    if (!completed) {
      return 0;
    }

    const safeStars = Math.max(1, Math.min(5, Math.floor(stars || 1)));
    let reward = safeStars;

    // Bônus de precisão absoluta (100% de acertos)
    if (accuracy >= 100) {
      reward += 2;
    }

    // Teto máximo estrito: 7 RockCoins
    return Math.min(7, Math.max(0, reward));
  }
}
