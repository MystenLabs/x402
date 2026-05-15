import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { toFacilitatorSuiSigner } from "@x402/sui";
import { ExactSuiScheme } from "@x402/sui/exact/facilitator";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const PORT = process.env.PORT || "4023";
const NETWORK = (process.env.SUI_NETWORK || "sui:testnet") as "sui:mainnet" | "sui:testnet";

if (!process.env.SUI_PRIVATE_KEY) {
  console.error("SUI_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

const { schema, secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY);
if (schema !== "ED25519") {
  console.error(`Unsupported key schema: ${schema}`);
  process.exit(1);
}
const sponsorKeypair = Ed25519Keypair.fromSecretKey(secretKey);
console.info(`Sui Facilitator account: ${sponsorKeypair.toSuiAddress()}`);

const suiSigner = toFacilitatorSuiSigner(sponsorKeypair);

const facilitator = new x402Facilitator()
  .onBeforeVerify(async ctx => console.log("verify:before", ctx))
  .onAfterVerify(async ctx => console.log("verify:after", ctx))
  .onVerifyFailure(async ctx => console.log("verify:failure", ctx))
  .onBeforeSettle(async ctx => console.log("settle:before", ctx))
  .onAfterSettle(async ctx => console.log("settle:after", ctx))
  .onSettleFailure(async ctx => console.log("settle:failure", ctx));

facilitator.register(NETWORK, new ExactSuiScheme(suiSigner));

const app = express();
app.use(express.json());

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    }
    const response: VerifyResponse = await facilitator.verify(paymentPayload, paymentRequirements);
    res.json(response);
  } catch (error) {
    console.error("verify error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    }
    const response: SettleResponse = await facilitator.settle(paymentPayload, paymentRequirements);
    res.json(response);
  } catch (error) {
    console.error("settle error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.listen(Number(PORT), () => {
  console.info(`Sui x402 facilitator listening on :${PORT} for ${NETWORK}`);
});
