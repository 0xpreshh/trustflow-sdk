import type { WalletAdapter } from './types';
import { isWalletRejection } from './types';
import { getFreighter } from './freighter';
import { connectWallet, disconnectWallet } from './connect';
import { TrustFlowError } from '../errors';

/**
 * Wraps the injected Freighter extension in the {@link WalletAdapter} interface (#435).
 *
 * The extension is looked up on every call rather than once up front, because
 * it can inject `window.freighter` after the adapter has been created.
 *
 * @returns A `WalletAdapter` for Freighter. Methods that need the extension throw
 *   `UNAUTHORIZED` when it is not installed; `isAvailable()` resolves `false` instead.
 *
 * @example
 * ```typescript
 * import { createFreighterAdapter } from '@trustflow/sdk/wallet';
 *
 * const adapter = createFreighterAdapter();
 * if (await adapter.isAvailable()) {
 *   const { publicKey } = await adapter.connect();
 * }
 * ```
 */
export function createFreighterAdapter(): WalletAdapter {
  const requireFreighter = () => {
    const freighter = getFreighter();
    if (!freighter) {
      throw new TrustFlowError('Freighter not installed', 'UNAUTHORIZED');
    }
    return freighter;
  };

  return {
    type: 'freighter',
    isAvailable: async () => getFreighter() !== null,
    connect: () => connectWallet('freighter'),
    sign: async (xdr, network) => {
      try {
        const { signedXDR } = await requireFreighter().signTransaction(xdr, { network });
        return signedXDR;
      } catch (e: unknown) {
        if (e instanceof TrustFlowError) throw e;
        if (isWalletRejection(e)) {
          throw TrustFlowError.userRejected(
            e instanceof Error ? e.message : 'User rejected Freighter signing',
            e,
          );
        }
        throw TrustFlowError.signingFailed(e instanceof Error ? e.message : String(e), e);
      }
    },
    signMessage: async (message) => {
      try {
        return await requireFreighter().signMessage(message);
      } catch (e: unknown) {
        if (e instanceof TrustFlowError) throw e;
        if (isWalletRejection(e)) {
          throw TrustFlowError.userRejected(
            e instanceof Error ? e.message : 'User rejected Freighter signing',
            e,
          );
        }
        throw TrustFlowError.signingFailed(e instanceof Error ? e.message : String(e), e);
      }
    },
    disconnect: () => disconnectWallet(),
  };
}
