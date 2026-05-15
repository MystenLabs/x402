/**
 * Exact Sui payment payload structure.
 *
 * Both fields are base64 encoded as defined by the
 * [exact Sui scheme spec](../../../../../specs/schemes/exact/scheme_exact_sui.md):
 *
 * - `transaction` is the base64 encoded Sui `TransactionData` BCS bytes.
 * - `signature` is the base64 encoded user signature over those bytes.
 *   When sponsorship is used the value may be a base64 encoded multi-signature
 *   bundle that already includes the sponsor's signature, or may carry only
 *   the user signature with the facilitator co-signing at settlement time.
 */
export type ExactSuiPayload = {
  /** Base64 encoded Sui `TransactionData` BCS bytes. */
  transaction: string;
  /** Base64 encoded user signature over the transaction bytes. */
  signature: string;
};
