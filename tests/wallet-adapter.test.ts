import { createFreighterAdapter } from '../src/wallet/adapter';
import type { WalletAdapter } from '../src/wallet/types';
import { MockWalletAdapter } from '../src/testing';
import { TrustFlowError } from '../src/errors';

const PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

function installFreighter(provider: Record<string, unknown>): void {
  (globalThis as any).window = { freighter: provider };
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe('createFreighterAdapter (#435)', () => {
  it('satisfies the WalletAdapter interface', () => {
    const adapter: WalletAdapter = createFreighterAdapter();
    expect(adapter.type).toBe('freighter');
  });

  it('reports unavailable and throws UNAUTHORIZED when Freighter is not installed', async () => {
    const adapter = createFreighterAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(false);
    await expect(adapter.sign('xdr', 'TESTNET')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(adapter.signMessage('hello')).rejects.toBeInstanceOf(TrustFlowError);
  });

  it('delegates connect, sign and signMessage to the injected extension', async () => {
    const signTransaction = jest.fn().mockResolvedValue({ signedXDR: 'signed_xdr' });
    installFreighter({
      getPublicKey: jest.fn().mockResolvedValue(PUBLIC_KEY),
      getNetwork: jest.fn().mockResolvedValue('TESTNET'),
      signTransaction,
      signMessage: jest.fn().mockResolvedValue('sig'),
    });
    const adapter = createFreighterAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(true);
    await expect(adapter.connect()).resolves.toEqual({
      type: 'freighter',
      publicKey: PUBLIC_KEY,
      network: 'TESTNET',
    });
    await expect(adapter.sign('xdr', 'TESTNET')).resolves.toBe('signed_xdr');
    expect(signTransaction).toHaveBeenCalledWith('xdr', { network: 'TESTNET' });
    await expect(adapter.signMessage('hello')).resolves.toBe('sig');
  });

  it('wraps a rejected signTransaction/signMessage as a TrustFlowError with code USER_REJECTED', async () => {
    const rejection = { code: 4001, message: 'User declined access' };
    installFreighter({
      getPublicKey: jest.fn().mockResolvedValue(PUBLIC_KEY),
      getNetwork: jest.fn().mockResolvedValue('TESTNET'),
      signTransaction: jest.fn().mockRejectedValue(rejection),
      signMessage: jest.fn().mockRejectedValue(rejection),
    });
    const adapter = createFreighterAdapter();

    const signPromise = adapter.sign('xdr', 'TESTNET');
    await expect(signPromise).rejects.toBeInstanceOf(TrustFlowError);
    await expect(signPromise).rejects.toMatchObject({ code: 'USER_REJECTED' });

    const signMessagePromise = adapter.signMessage('hello');
    await expect(signMessagePromise).rejects.toBeInstanceOf(TrustFlowError);
    await expect(signMessagePromise).rejects.toMatchObject({ code: 'USER_REJECTED' });
  });

  it('wraps a non-rejection signTransaction/signMessage failure as a TrustFlowError with code SIGNING_ERROR', async () => {
    const failure = new Error('extension crashed');
    installFreighter({
      getPublicKey: jest.fn().mockResolvedValue(PUBLIC_KEY),
      getNetwork: jest.fn().mockResolvedValue('TESTNET'),
      signTransaction: jest.fn().mockRejectedValue(failure),
      signMessage: jest.fn().mockRejectedValue(failure),
    });
    const adapter = createFreighterAdapter();

    const signPromise = adapter.sign('xdr', 'TESTNET');
    await expect(signPromise).rejects.toBeInstanceOf(TrustFlowError);
    await expect(signPromise).rejects.toMatchObject({ code: 'SIGNING_ERROR' });

    const signMessagePromise = adapter.signMessage('hello');
    await expect(signMessagePromise).rejects.toBeInstanceOf(TrustFlowError);
    await expect(signMessagePromise).rejects.toMatchObject({ code: 'SIGNING_ERROR' });
  });
});

describe('MockWalletAdapter.asWalletAdapter (#435)', () => {
  it('exposes the mock through the WalletAdapter interface and shares its state', async () => {
    const mock = new MockWalletAdapter(PUBLIC_KEY);
    const adapter: WalletAdapter = mock.asWalletAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(true);
    await expect(adapter.connect()).resolves.toEqual({
      type: 'freighter',
      publicKey: PUBLIC_KEY,
      network: 'TESTNET',
    });
    await expect(adapter.sign('xdr', 'TESTNET')).resolves.toBe('xdr');
    await expect(adapter.signMessage('hi')).resolves.toBe('mock_sig_hi');

    await adapter.disconnect();
    await expect(adapter.isAvailable()).resolves.toBe(false);
    expect(mock.connected).toBe(false);
  });
});
