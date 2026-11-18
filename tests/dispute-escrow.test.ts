import { disputeEscrow } from '../src/escrow/dispute';
import { buildDisputeArgs } from '../src/contract/build';
import { invokeContract } from '../src/contract/invoke';
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { TrustFlowClient } from '../src/client';
import { TrustFlowError } from '../src/errors';
import { Keypair } from '@stellar/stellar-sdk';

jest.mock('../src/contract/invoke', () => ({ invokeContract: jest.fn() }));

const mockInvoke = invokeContract as jest.Mock;
const CALLER = Keypair.random().publicKey();
const TX_HASH = 'a'.repeat(64);

describe('disputeEscrow', () => {
  const client = new TrustFlowClient({ contractId: 'CONTRACT123', network: 'TESTNET' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits the encoded args via invokeContract and returns the real transaction hash', async () => {
    mockInvoke.mockResolvedValue({ success: true, txHash: TX_HASH });

    const txHash = await disputeEscrow(client, {
      escrowId: 'esc-1',
      caller: CALLER,
      reason: 'Goods not delivered as described.',
    });

    expect(txHash).toBe(TX_HASH);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [calledClient, method, args, caller] = mockInvoke.mock.calls[0];
    expect(calledClient).toBe(client);
    expect(method).toBe('dispute_escrow');
    expect(args).toEqual(buildDisputeArgs('esc-1', CALLER, 'Goods not delivered as described.'));
    expect(caller).toBe(CALLER);
  });

  it('rejects when the contract invocation fails', async () => {
    mockInvoke.mockResolvedValue({
      success: false,
      error: 'simulation failed',
      code: 'CONTRACT_ERROR',
    });

    await expect(
      disputeEscrow(client, { escrowId: 'esc-1', caller: CALLER, reason: 'reason text' }),
    ).rejects.toMatchObject({ code: 'CONTRACT_ERROR' });
  });

  it('rejects when the invocation throws', async () => {
    const error = new Error('network failed');
    mockInvoke.mockRejectedValue(error);

    await expect(
      disputeEscrow(client, { escrowId: 'esc-1', caller: CALLER, reason: 'reason text' }),
    ).rejects.toBe(error);
  });

  it('rejects when the invocation succeeds without a transaction hash', async () => {
    mockInvoke.mockResolvedValue({ success: true });

    await expect(
      disputeEscrow(client, { escrowId: 'esc-1', caller: CALLER, reason: 'reason text' }),
    ).rejects.toBeInstanceOf(TrustFlowError);
  });

  it('throws when escrowId is missing', async () => {
    await expect(
      disputeEscrow(client, { escrowId: '', caller: CALLER, reason: 'reason' }),
    ).rejects.toThrow(/escrowId/);
  });

  it('throws when caller is missing', async () => {
    await expect(
      disputeEscrow(client, { escrowId: 'esc-1', caller: '', reason: 'reason' }),
    ).rejects.toThrow(/dispute/);
  });

  it('throws when reason is missing', async () => {
    await expect(
      disputeEscrow(client, { escrowId: 'esc-1', caller: CALLER, reason: '  ' }),
    ).rejects.toThrow(/reason/);
  });

  it('encodes escrowId, caller, and reason into contract call arguments', () => {
    const args = buildDisputeArgs('esc-1', CALLER, 'Goods not delivered');
    expect(args).toHaveLength(3);
    expect(args[0]).toEqual(nativeToScVal('esc-1', { type: 'string' }));
    expect(args[1]).toEqual(new Address(CALLER).toScVal());
    expect(args[2]).toEqual(nativeToScVal('Goods not delivered', { type: 'string' }));
  });
});
