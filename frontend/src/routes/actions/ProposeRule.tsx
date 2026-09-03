import { useState } from "react";
import { WriteAction } from "../../components/WriteAction";
import { useWalletContext } from "../../walletContext";
import { getVocabularies, listRules } from "../../lib/contract";
import { useRead } from "../../hooks/useRead";
import { humanCategory } from "../../lib/format";

export function ProposeRule({
  protocolId,
  onDone,
}: {
  protocolId: string;
  onDone?: () => void;
}) {
  const wallet = useWalletContext();
  const vocab = useRead(() => getVocabularies(), []);
  const [category, setCategory] = useState("EMERGENCY_CONTROLS");
  const [title, setTitle] = useState("");

  const valid = title.trim().length >= 4 && title.trim().length <= 120;

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <label>
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {(vocab.data?.rule_categories ?? [category]).map((c) => (
            <option key={c} value={c}>
              {humanCategory(c)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Emergency Withdrawals"
        />
        <span className="hint">
          A topic, not a commitment. The rule text comes later, from adjudication.
        </span>
      </label>

      <WriteAction
        label="Propose topic"
        walletAddress={wallet.address}
        disabled={!valid}
        onConfirmed={onDone}
        build={() => ({
          functionName: "propose_rule",
          args: [protocolId, category, title.trim()],
          verify: async () => {
            const rows = await listRules(protocolId, 0, 50);
            const found = rows.some(
              (r) => r.title.toLowerCase() === title.trim().toLowerCase(),
            );
            return { ok: found, detail: "The topic does not appear on the protocol." };
          },
        })}
      />
    </form>
  );
}
