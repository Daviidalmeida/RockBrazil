/**
 * ROCKBRAZIL — CLOUD / SERVERLESS ECONOMY ENDPOINTS
 * 
 * Endpoints autoritativos para execução em Cloud Functions (Blaze) ou Cloudflare Worker / Vercel (Spark Gratuito).
 * 
 * Estes manipuladores executam no ambiente seguro do servidor e possuem permissões
 * de Admin SDK para atualizar atomicamente o perfil do usuário e o livro-razão (Ledger).
 */

import { ServerEconomyService, MatchProof } from './serverEconomyService';

export interface EconomyApiRequest {
  action: 'CLAIM_REWARD' | 'PURCHASE_UNLOCK';
  uid: string;
  payload: any;
}

export interface EconomyApiResponse {
  statusCode: number;
  success: boolean;
  data?: any;
  error?: string;
}

export class EconomyEndpointHandler {
  /**
   * Processador central de requisições econômicas do servidor.
   */
  public static async handleRequest(
    req: EconomyApiRequest,
    callerUid: string,
    customDb?: any
  ): Promise<EconomyApiResponse> {
    // 1. Verificação de autenticidade: o usuário autenticado deve ser o dono da requisição
    if (!callerUid || callerUid !== req.uid) {
      return {
        statusCode: 403,
        success: false,
        error: 'FORBIDDEN: O solicitante não corresponde ao UID da conta.'
      };
    }

    try {
      if (req.action === 'CLAIM_REWARD') {
        const proof: MatchProof = {
          ...req.payload,
          uid: req.uid
        };

        const result = await ServerEconomyService.claimMatchReward(proof, customDb);
        if (!result.success && result.error) {
          return {
            statusCode: 400,
            success: false,
            error: result.error
          };
        }

        return {
          statusCode: 200,
          success: true,
          data: result
        };
      }

      if (req.action === 'PURCHASE_UNLOCK') {
        const { songId, songTitle, cost } = req.payload || {};
        if (!songId) {
          return {
            statusCode: 400,
            success: false,
            error: 'MISSING_SONG_ID: O identificador da música é obrigatório.'
          };
        }

        const result = await ServerEconomyService.purchaseSongUnlock(
          req.uid,
          songId,
          songTitle,
          cost,
          customDb
        );

        if (!result.success) {
          return {
            statusCode: result.error === 'ROCKCOINS_INSUFFICIENT' ? 402 : 400,
            success: false,
            error: result.error
          };
        }

        return {
          statusCode: 200,
          success: true,
          data: result
        };
      }

      return {
        statusCode: 400,
        success: false,
        error: `INVALID_ACTION: Ação econômica desconhecida '${req.action}'.`
      };
    } catch (err: any) {
      console.error('[EconomyEndpointHandler] Erro interno:', err);
      return {
        statusCode: 500,
        success: false,
        error: 'INTERNAL_ERROR: Falha no processador econômico do servidor.'
      };
    }
  }
}
