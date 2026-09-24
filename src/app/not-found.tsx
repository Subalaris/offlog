import Link from "next/link";

export default function NotFound() {
  return (
    <div className="notfound">
      <div className="nf-icon">✈</div>
      <h1>This trip has left the log</h1>
      <p>The page you&rsquo;re looking for doesn&rsquo;t exist &mdash; maybe the trip was deleted.</p>
      <Link href="/" className="btn btn-primary">Back to dashboard</Link>
    </div>
  );
}
