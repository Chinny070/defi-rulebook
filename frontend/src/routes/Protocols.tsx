import { useState } from "react";
import { Link } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import { listProtocols } from "../lib/contract";
import { PAGE_SIZE } from "../lib/config";
import { relative } from "../lib/format";
import {
  CommunityDisclaimer,
  Pagination,
  Panel,
  ReadView,
  StatusBadge,
} from "../components/ui";
import { RegisterProtocol } from "./actions/RegisterProtocol";

export default function Protocols() {
  const [offset, setOffset] = useState(0);
  const protocols = useRead(() => listProtocols(offset, PAGE_SIZE), [offset]);

  return (
    <div className="page">
      <h1>Protocols</h1>
      <CommunityDisclaimer />

      <Panel>
        <ReadView
          state={protocols}
          what="protocols"
          empty="No protocols have been registered yet."
        >
          {(rows) => (
            <>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Protocol</th>
                    <th>Namespace</th>
                    <th>Identity</th>
                    <th>Rules</th>
                    <th>Open cases</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.protocol_id}>
                      <td>
                        <Link to={`/protocol/${p.protocol_id}`}>{p.display_name}</Link>
                      </td>
                      <td className="mono">{p.protocol_id}</td>
                      <td>
                        <StatusBadge
                          status={p.officially_verified ? "VERIFIED" : "UNVERIFIED"}
                        />
                      </td>
                      <td>{p.rule_count}</td>
                      <td>{p.open_case_count}</td>
                      <td className="muted small">{relative(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                offset={offset}
                size={PAGE_SIZE}
                count={rows.length}
                onChange={setOffset}
              />
            </>
          )}
        </ReadView>
      </Panel>

      <Panel title="Register a namespace">
        <p className="muted small">
          Registration reserves a name and nothing else. It grants no protocol ownership,
          no verified identity, no governance authority, and no ability to edit rules,
          block cases or censor evidence.
        </p>
        <RegisterProtocol onDone={protocols.reload} />
      </Panel>
    </div>
  );
}
