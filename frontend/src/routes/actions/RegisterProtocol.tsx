import { useState } from "react";
import { WriteAction } from "../../components/WriteAction";
import { useWalletContext } from "../../walletContext";
import { getProtocol } from "../../lib/contract";

/**
 * Every action component follows the same shape: build the write, and supply a
 * verifier that re-reads authoritative contract state. The verifier is what
 * turns a committed transaction into a reported success.
 */
export function RegisterProtocol({ onDone }: { onDone?: () => void }) {
  const wallet = useWalletContext();
  const [protocolId, setProtocolId] = useState("");
  const [name, setName] = useState("");
  const [homepage, setHomepage] = useState("");
  const [docs, setDocs] = useState("");

  const normalized = protocolId.trim().toLowerCase();
  const valid = /^[a-z0-9_-]{2,64}$/.test(normalized) && name.trim().length > 0;

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <label>
        Namespace
        <input
          value={protocolId}
          onChange={(e) => setProtocolId(e.target.value)}
          placeholder="aave-v3"
        />
        <span className="hint">Lowercase a-z, 0-9, hyphen and underscore. 2-64 characters.</span>
      </label>
      <label>
        Display name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aave V3" />
      </label>
      <label>
        Homepage (optional)
        <input value={homepage} onChange={(e) => setHomepage(e.target.value)} placeholder="https://aave.com" />
        <span className="hint">Stored as an unverified submitter assertion.</span>
      </label>
      <label>
        Docs root (optional)
        <input value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="https://docs.aave.com" />
      </label>

      <WriteAction
        label="Register namespace"
        walletAddress={wallet.address}
        disabled={!valid}
        onConfirmed={onDone}
        build={() => ({
          functionName: "register_protocol",
          args: [normalized, name.trim(), homepage.trim(), docs.trim()],
          verify: async () => {
            const created = await getProtocol(normalized);
            return {
              ok: created.protocol_id === normalized,
              detail: "The namespace does not appear in the registry.",
              value: created,
            };
          },
        })}
      />
    </form>
  );
}
