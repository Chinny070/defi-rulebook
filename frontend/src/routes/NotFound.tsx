import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="page">
      <h1>Not found</h1>
      <p className="muted">
        That page does not exist. <Link to="/protocols">Browse protocols</Link>.
      </p>
    </div>
  );
}
