import { Difficulty } from '../../types';

/**
 * RockBrazil Economy - RockCoins Manager
 *
 * FASE 2 — Regras Oficiais de Balanceamento por Dificuldade (V13):
 *
 * TABELA OFICIAL:
 * - FÁCIL (EASY): 1 RockCoin (mesmo com 100% de precisão)
 * - MÉDIO (MEDIUM): 2 RockCoins (mesmo com 100% de precisão)
 * - DIFÍCIL (HARD): 3 RockCoins (mesmo com 100% de precisão)
 * - EXPERT:
 *     - Concluir com um ou mais erros: 3 RockCoins
 *     - Concluir sem nenhum erro: 5 RockCoins
 *
 * REGRAS OBRIGATÓRIAS:
 * 1. As 5 RockCoins do Expert perfeito são o TOTAL da recompensa (não 3 + 5).
 * 2. O bônus de 5 RockCoins só existe no EXPERT.
 * 3. A quantidade de estrelas NÃO influencia a recompensa.
 * 4. Julgamento Bom, Ótimo ou Perfeito NÃO altera a recompensa.
 * 5. Partida abandonada, incompleta ou Game Over: 0 RockCoins.
 * 6. Chart sem notas jogáveis: 0 RockCoins.
 * 7. Teto máximo estrito: 5 RockCoins por conclusão.
 */
export class RockCoinsManager {
  /**
   * Calcula a recompensa em RockCoins para uma partida concluída.
   *
   * @param difficulty Dificuldade efetivamente jogada ('EASY' | 'MEDIUM' | 'HARD' | 'EXPERT').
   * @param missCount Total de notas perdidas/erros cometidos.
   * @param playableNotesCount Total de notas jogáveis do chart.
   * @param completed Se a música foi concluída normalmente.
   * @returns Total de RockCoins concedidas (0 a 5).
   */
  public static calculateReward(
    difficulty: Difficulty,
    missCount = 0,
    playableNotesCount = 1,
    completed = true
  ): number {
    if (!completed || playableNotesCount <= 0) {
      return 0;
    }

    switch (difficulty) {
      case 'EASY':
        return 1;
      case 'MEDIUM':
        return 2;
      case 'HARD':
        return 3;
      case 'EXPERT':
        return missCount === 0 ? 5 : 3;
      default:
        return 1;
    }
  }
}
